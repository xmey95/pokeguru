import { codexErrorEvent, codexFailure } from './codex-failure'
import { spawn } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AiRunConfig } from '../shared/ai'
import { readAiTokenUsage, type AiTokenUsage } from '../shared/ai-evidence'
import { CODEX_ISOLATION_ARGS } from './codex-isolation'
import { codexLauncher } from './codex-setup'
import { AI_QUERY_PLAN_SCHEMA } from './ai-evidence-queries'
import { codexReasoningSummary } from './codex-progress'
import { AiFailure } from './ai-failure'

/** An isolated, ephemeral structured call. The app validates the result before using it. */
export async function runStructuredCodex(prompt: string, config: AiRunConfig,
  schema: unknown, signal?: AbortSignal, onSummary?: (summary: string) => void): Promise<unknown> {
  if (signal?.aborted) throw new Error('Operazione Codex annullata.')
  const directory = mkdtempSync(join(tmpdir(), 'pokeguru-query-plan-'))
  const schemaPath = join(directory, 'schema.json')
  const resultPath = join(directory, 'result.json')
  writeFileSync(schemaPath, JSON.stringify(schema), 'utf8')
  const launcher = codexLauncher('')
  const args = ['exec', '--ephemeral', '--json', ...CODEX_ISOLATION_ARGS,
    '--config', 'approval_policy="never"', '--config', 'model_reasoning_summary="concise"', '--skip-git-repo-check',
    '--color', 'never', '-C', directory,
    ...(config.model ? ['--model', config.model] : []),
    ...(config.reasoningEffort ? ['--config',
      `model_reasoning_effort=${JSON.stringify(config.reasoningEffort)}`] : []),
    '--output-schema', schemaPath, '--output-last-message', resultPath, '-']
  try {
    return await new Promise<unknown>((resolve, reject) => {
      const child = spawn(launcher.command, [...launcher.prefix, ...args], { cwd: directory, windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe'] })
      const abort = () => child.kill()
      signal?.addEventListener('abort', abort, { once: true })
      let timedOut = false
      const timer = setTimeout(() => { timedOut = true; child.kill() }, 600_000)
      let stderr = ''
      let stdout = ''
      let usage: AiTokenUsage | null = null
      child.stdout.setEncoding('utf8')
      child.stdout.on('data', (chunk: string) => {
        stdout += chunk
        const lines = stdout.split('\n')
        stdout = lines.pop() ?? ''
        for (const line of lines) {
          try {
            stderr = (stderr + codexErrorEvent(line)).slice(-4000)
              const summary = codexReasoningSummary(line)
            if (summary) onSummary?.(summary)
            const event = JSON.parse(line) as { type?: string; usage?: unknown }
            if (event.type === 'turn.completed') usage = readAiTokenUsage(event.usage)
          } catch { /* Ignore non-event output. */ }
        }
        if (stdout.length > 1_000_000) child.kill()
      })
      child.stderr.on('data', (chunk: Buffer) => { stderr = (stderr + chunk.toString()).slice(-4000) })
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
        if (signal?.aborted) return reject(new Error('Operazione Codex annullata.'))
        if (timedOut) return reject(new AiFailure('timeout', 'Questa chiamata Codex ha superato dieci minuti. Puoi riprendere dai lotti salvati.'))
        if (code !== 0) return reject(codexFailure(stderr))
        try {
          const raw = readFileSync(resultPath, 'utf8')
          if (raw.length > 100_000) throw new Error('Risposta Codex troppo lunga.')
          const value = JSON.parse(raw) as unknown
          resolve(value && typeof value === 'object' && !Array.isArray(value)
            ? { ...value, __usage: usage } : value)
        } catch { reject(new Error('Codex ha restituito una risposta non valida.')) }
      })
    })
  } finally { rmSync(directory, { recursive: true, force: true }) }
}

/** The existing Matchup/Thread query planner keeps its fixed schema. */
export function planEvidenceQueriesWithCodex(prompt: string, config: AiRunConfig,
  signal?: AbortSignal, onSummary?: (summary: string) => void): Promise<unknown> {
  return runStructuredCodex(prompt, config, AI_QUERY_PLAN_SCHEMA, signal, onSummary)
}
