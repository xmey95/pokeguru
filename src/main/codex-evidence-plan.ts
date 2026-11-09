import { codexErrorEvent, codexErrorMetadata, codexFailure } from './codex-failure'
import { spawn } from 'node:child_process'
import {createHash} from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AiRunConfig } from '../shared/ai'
import { readAiTokenUsage, type AiTokenUsage } from '../shared/ai-evidence'
import { CODEX_ISOLATION_ARGS } from './codex-isolation'
import { codexLauncher } from './codex-setup'
import { AI_QUERY_PLAN_SCHEMA, AI_DECISION_PLAN_SCHEMA } from './ai-evidence-queries'
import { codexReasoningSummary } from './codex-progress'
import { AiFailure } from './ai-failure'
import {startCodexUsageCapture,type CodexRequestUsage} from './codex-usage-capture'

export interface StructuredUsageEvidence {scope:'codex-turn';completedTurns:number;completedItems:number;requestInputTokens:number|null;requestUsage?:CodexRequestUsage}
export function readStructuredCodexOutput(raw:string,usage:AiTokenUsage|null=null,evidence?:StructuredUsageEvidence):unknown{
  if(raw.length>100000)throw new AiFailure('request-limit','La risposta Codex supera il limite locale di 100.000 caratteri. Nessun contenuto parziale è stato applicato.')
  let value:unknown
  try{value=JSON.parse(raw)}catch{throw new AiFailure('invalid-response','Codex ha restituito un JSON non valido. Nessun contenuto è stato applicato.')}
  return value&&typeof value==='object'&&!Array.isArray(value)?{...value,__usage:usage,__responseCharacters:raw.length,...evidence?{__usageEvidence:evidence}:{}}:value
}

/** An isolated, ephemeral structured call. The app validates the result before using it. */
export async function runStructuredCodex(prompt: string, config: AiRunConfig,
  schema: unknown, signal?: AbortSignal, onSummary?: (summary: string) => void, executionOrUsage?:{timeoutMs:number;measureRequests?:boolean}|((usage:AiTokenUsage|null)=>void)): Promise<unknown> {
  const execution=typeof executionOrUsage==='function'?undefined:executionOrUsage,onUsage=typeof executionOrUsage==='function'?executionOrUsage:undefined
  if (signal?.aborted) throw new Error('Operazione Codex annullata.')
  const timeoutMs=execution?.timeoutMs??600_000
  if(!Number.isSafeInteger(timeoutMs)||timeoutMs<600_000||timeoutMs>1_200_000)throw new Error('Timeout Codex fuori dai limiti verificati.')
  const directory = mkdtempSync(join(tmpdir(), 'pokeguru-query-plan-'))
  const schemaPath = join(directory, 'schema.json')
  const resultPath = join(directory, 'result.json')
  writeFileSync(schemaPath, JSON.stringify(schema), 'utf8')
  const launcher = codexLauncher('')
  let capture:Awaited<ReturnType<typeof startCodexUsageCapture>>|undefined
  try{capture=execution?.measureRequests?await startCodexUsageCapture():undefined}catch(error){rmSync(directory,{recursive:true,force:true});throw error}
  const args = ['exec', '--ephemeral', '--json', ...CODEX_ISOLATION_ARGS,
    '--config', 'approval_policy="never"', '--config', 'model_reasoning_summary="concise"', '--skip-git-repo-check',
    '--color', 'never', '-C', directory,...capture?.args??[],
    ...(config.model ? ['--model', config.model] : []),
    ...(config.reasoningEffort ? ['--config',
      `model_reasoning_effort=${JSON.stringify(config.reasoningEffort)}`] : []),
    '--output-schema', schemaPath, '--output-last-message', resultPath, '-']
  try {
    return await new Promise<unknown>((resolve, reject) => {
      const child = spawn(launcher.command, [...launcher.prefix, ...args], { cwd: directory, windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe'],...capture?{env:Object.fromEntries(Object.entries(process.env).filter(([key])=>!key.startsWith('OTEL_')))}:{} })
      const abort = () => child.kill()
      signal?.addEventListener('abort', abort, { once: true })
      let timedOut = false
      const started=performance.now()
      let stdoutBytes=0,lastEventType:string|null=null,lastEventAt:string|null=null
      const timer = setTimeout(() => { timedOut = true; child.kill() }, timeoutMs)
      let stderr = ''
      let providerError = ''
      let stdout = ''
      let usage: AiTokenUsage | null = null
      const evidence:StructuredUsageEvidence={scope:'codex-turn',completedTurns:0,completedItems:0,requestInputTokens:null}
      let stderrBytes=0,providerErrorEvents=0,providerErrorCharacters=0,unparsedStdoutEvents=0,finalStdoutEventWithoutNewline=false
      const providerErrorCodes=new Set<string>(),providerErrorParameters=new Set<string>()
      const eventTypes=new Set(['thread.started','turn.started','turn.completed','turn.failed','item.started','item.updated','item.completed','error'])
      const readEvent=(line:string)=>{
        try{
          const event=JSON.parse(line) as {type?:string;usage?:unknown}
          const error=codexErrorEvent(line)
          const metadata=codexErrorMetadata(line);metadata.codes.forEach(c=>providerErrorCodes.add(c));metadata.parameters.forEach(p=>providerErrorParameters.add(p))
          if(error){providerErrorEvents++;providerErrorCharacters+=error.length;providerError=(providerError+error).slice(-16000)}
          const summary=codexReasoningSummary(line);if(summary)onSummary?.(summary)
          lastEventType=typeof event.type==='string'&&eventTypes.has(event.type)?event.type:'unknown-event';lastEventAt=new Date().toISOString()
          if(event.type==='turn.completed'){usage=readAiTokenUsage(event.usage);evidence.completedTurns++}
          if(event.type==='item.completed')evidence.completedItems++
        }catch{unparsedStdoutEvents++}
      }
      const executionDetails=()=>({timeoutMs,elapsedMs:Math.round(performance.now()-started),stdoutBytes,lastEventType,lastEventAt,completedTurns:evidence.completedTurns,completedItems:evidence.completedItems,resultFilePresent:existsSync(resultPath),stderrBytes,providerErrorEvents,providerErrorCharacters,unparsedStdoutEvents,finalStdoutEventWithoutNewline,...providerErrorCodes.size?{providerErrorCodes:[...providerErrorCodes]}:{},...providerErrorParameters.size?{providerErrorParameters:[...providerErrorParameters]}:{},...providerError||stderr?{providerErrorHash:createHash('sha256').update(providerError).update('\n').update(stderr).digest('hex')}:{}})
      child.stdout.setEncoding('utf8')
      child.stdout.on('data', (chunk: string) => {
        stdoutBytes+=Buffer.byteLength(chunk)
        stdout += chunk
        const lines = stdout.split('\n')
        stdout = lines.pop() ?? ''
        for(const line of lines)readEvent(line)
        if (stdout.length > 1_000_000) child.kill()
      })
      child.stderr.on('data', (chunk: Buffer) => {stderrBytes+=chunk.length;stderr = (stderr + chunk.toString()).slice(-4000) })
      child.stdin.on('error', () => undefined)
      child.stdin.end(prompt)
      child.on('error', (error) => {
        clearTimeout(timer)
        signal?.removeEventListener('abort', abort)
        reject(new Error(error.message.includes('ENOENT')
          ? 'Codex non disponibile. Verifica l’installazione di Pokéguru.'
          : 'Impossibile avviare Codex.'))
      })
      child.on('close', (code) => {
        clearTimeout(timer)
        signal?.removeEventListener('abort', abort)
        // A completed provider turn can still fail exit/output validation below.
        try { onUsage?.(usage) } catch (error) { reject(error); return }
        // A final JSON event is valid even if the child exits without a newline.
        // Keep only safe counters/types/hash, never the raw provider error.
        if(stdout.trim()){finalStdoutEventWithoutNewline=true;readEvent(stdout);stdout=''}
        if (signal?.aborted) return reject(new Error('Operazione Codex annullata.'))
        if (timedOut) return reject(new AiFailure('timeout', `Questa chiamata Codex ha superato il limite di ${Math.round(timeoutMs/1000)} secondi. Il lavoro completato è conservato.`,undefined,undefined,undefined,
          executionDetails()))
        if(code!==0){const failure=codexFailure(`${providerError}\n${stderr}`,code);return reject(new AiFailure(failure.code,failure.message,failure.retryAfterMs,failure.providerDetails,undefined,executionDetails()))}
        let raw:string
        try{raw=readFileSync(resultPath,'utf8')}catch{return reject(new AiFailure('invalid-response','Codex non ha prodotto il file di risposta previsto. Nessun contenuto è stato applicato.'))}
        if(capture){evidence.requestUsage=capture.snapshot(usage);evidence.requestInputTokens=evidence.requestUsage.maximumInputTokens}
        try{resolve(readStructuredCodexOutput(raw,usage,evidence))}catch(error){reject(error)}
      })
    })
  } finally { if(capture)await capture.close();rmSync(directory, { recursive: true, force: true }) }
}

/** Legacy jobs retain their schema; decision jobs also explain the research uncertainty. */
export function planEvidenceQueriesWithCodex(prompt: string, config: AiRunConfig,
  signal?: AbortSignal, onSummary?: (summary: string) => void,
  onUsage?: (usage: AiTokenUsage | null) => void, decisionFlow = false): Promise<unknown> {
  return runStructuredCodex(prompt, config, decisionFlow ? AI_DECISION_PLAN_SCHEMA : AI_QUERY_PLAN_SCHEMA, signal, onSummary, onUsage)
}
