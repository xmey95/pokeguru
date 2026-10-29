import { codexErrorEvent, codexFailure } from './codex-failure'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { createInterface, type Interface } from 'node:readline'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { AiConnection, AiLoginProgress, AiLoginStart, AiModel, AiRunConfig } from '../shared/ai'
import { readAiTokenUsage, type AiTokenUsage } from '../shared/ai-evidence'
import { CODEX_ISOLATION_ARGS } from './codex-isolation'
import { codexLauncher } from './codex-setup'
import { codexReasoningSummary } from './codex-progress'

type RpcResponse = { id?: number; result?: unknown; error?: { message?: string }; method?: string;
  params?: { loginId?: string; success?: boolean; error?: string | null } }

export class CodexControl {
  constructor(private readonly dataDir: () => string = () => '') {}
  private child: ChildProcessWithoutNullStreams | null = null
  private lines: Interface | null = null
  private starting: Promise<void> | null = null
  private nextId = 1
  private readonly pending = new Map<number, { resolve(value: unknown): void; reject(error: Error): void; timer: NodeJS.Timeout }>()
  private readonly cliTurns = new Map<string, ChildProcessWithoutNullStreams>()
  private login: { id: string; progress: AiLoginProgress } | null = null
  private lastLoginCompletion: { id: string; progress: AiLoginProgress } | null = null

  private fail(error: Error): void {
    for (const [id, entry] of this.pending) {
      clearTimeout(entry.timer)
      entry.reject(error)
      this.pending.delete(id)
    }
    this.child = null
    this.starting = null
    this.lines?.close()
    this.lines = null
  }

  private async start(): Promise<void> {
    if (this.starting) return this.starting
    this.starting = (async () => {
      const launcher = codexLauncher(this.dataDir())
      const child = spawn(launcher.command, [...launcher.prefix, 'app-server', '--stdio', '--disable', 'apps', '--disable', 'plugins',
        '--config', 'web_search="disabled"', '--config', 'mcp_servers={}'],
      { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] })
      this.child = child
      child.stderr.resume()
      child.on('error', (error) => {
        if (this.child === child) this.fail(new Error(error.message.includes('ENOENT')
          ? 'Codex non disponibile. Verifica l’installazione di Pokéguru.'
          : 'Impossibile avviare Codex App Server.'))
      })
      child.on('close', () => {
        if (this.child === child) this.fail(new Error('La connessione con Codex si è interrotta. Riprova.'))
      })
      this.lines = createInterface({ input: child.stdout })
      this.lines.on('line', (line) => {
        let message: RpcResponse
        try { message = JSON.parse(line) as RpcResponse } catch { return }
        if (message.method === 'account/login/completed' && message.params?.loginId) {
          const progress: AiLoginProgress = message.params.success
            ? { state: 'success', error: null }
            : { state: 'error', error: message.params.error || 'Accesso Codex non riuscito. Riprova.' }
          this.lastLoginCompletion = { id: message.params.loginId, progress }
          if (this.login?.id === message.params.loginId) this.login.progress = progress
        }
        if (typeof message.id !== 'number') return
        const entry = this.pending.get(message.id)
        if (!entry) return
        clearTimeout(entry.timer)
        this.pending.delete(message.id)
        if (message.error) entry.reject(new Error(message.error.message ?? 'Risposta Codex non valida.'))
        else entry.resolve(message.result)
      })
      await this.send('initialize', { clientInfo: { name: 'pokeguru', title: 'Pokéguru', version: '0.1.0' },
        capabilities: { experimentalApi: true } })
      child.stdin.write(`${JSON.stringify({ method: 'initialized', params: {} })}\n`)
    })().catch((error: unknown) => {
      this.child?.kill()
      this.fail(error instanceof Error ? error : new Error('Codex App Server non disponibile.'))
      throw error
    })
    return this.starting
  }

  private send(method: string, params?: unknown): Promise<unknown> {
    const child = this.child
    if (!child || child.stdin.destroyed) return Promise.reject(new Error('Codex App Server non disponibile.'))
    const id = this.nextId++
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error('Codex non risponde. Riprova.'))
      }, 15_000)
      this.pending.set(id, { resolve, reject, timer })
      child.stdin.write(`${JSON.stringify({ method, id, params: params ?? {} })}\n`, (error) => {
        if (error) {
          const entry = this.pending.get(id)
          if (entry) {
            clearTimeout(entry.timer)
            this.pending.delete(id)
            reject(new Error('Impossibile comunicare con Codex.'))
          }
        }
      })
    })
  }

  async request(method: string, params?: unknown): Promise<unknown> {
    await this.start()
    return this.send(method, params)
  }

  async connection(): Promise<AiConnection> {
    const response = await this.request('account/read', { refreshToken: false }) as {
      account?: { type?: string; planType?: string | null } | null
    }
    const account = response?.account?.type
    return {
      account: account === 'chatgpt' ? 'chatgpt' : account === 'apiKey' ? 'apiKey' : account ? 'other' : null,
      plan: typeof response?.account?.planType === 'string' ? response.account.planType : null,
      models: account ? await this.models() : []
    }
  }

  async models(): Promise<AiModel[]> {
    const result: AiModel[] = []
    let cursor: string | null = null
    for (let page = 0; page < 10; page++) {
      const response = await this.request('model/list', { limit: 100, includeHidden: false, ...(cursor ? { cursor } : {}) }) as {
        data?: Array<{ model?: string; id?: string; displayName?: string; hidden?: boolean;
          defaultReasoningEffort?: string; isDefault?: boolean;
          supportedReasoningEfforts?: Array<{ reasoningEffort?: string; description?: string }> }>
        nextCursor?: string | null
      }
      for (const entry of response.data ?? []) {
        const id = entry.model ?? entry.id
        if (!id || entry.hidden || result.some((model) => model.id === id)) continue
        result.push({ id, name: entry.displayName ?? id,
          defaultReasoningEffort: entry.defaultReasoningEffort ?? null,
          reasoningEfforts: (entry.supportedReasoningEfforts ?? [])
            .filter((effort) => typeof effort.reasoningEffort === 'string')
            .map((effort) => ({ id: effort.reasoningEffort!, description: effort.description ?? '' })),
          isDefault: entry.isDefault === true })
      }
      cursor = response.nextCursor ?? null
      if (!cursor) break
    }
    return result
  }

  async startLogin(mode: 'browser' | 'device' = 'browser'): Promise<AiLoginStart & { url: string }> {
    const result = await this.request('account/login/start', mode === 'browser'
      ? { type: 'chatgpt', useHostedLoginSuccessPage: true, appBrand: 'codex' }
      : { type: 'chatgptDeviceCode' }) as { loginId?: string; authUrl?: string; verificationUrl?: string; userCode?: string }
    const rawUrl = mode === 'browser' ? result?.authUrl : result?.verificationUrl
    if (!rawUrl) throw new Error('Codex non ha restituito un collegamento di accesso.')
    const url = new URL(rawUrl)
    if (url.protocol !== 'https:' || !(url.hostname === 'openai.com' || url.hostname.endsWith('.openai.com') ||
      url.hostname === 'chatgpt.com' || url.hostname.endsWith('.chatgpt.com'))) {
      throw new Error('Il collegamento di accesso restituito da Codex non è riconosciuto.')
    }
    if (!result.loginId) throw new Error('Codex non ha restituito un identificativo di accesso.')
    this.login = { id: result.loginId,
      progress: this.lastLoginCompletion?.id === result.loginId
        ? this.lastLoginCompletion.progress : { state: 'pending', error: null } }
    if (mode === 'device') {
      if (!result.userCode || !/^[A-Z0-9-]{4,20}$/.test(result.userCode)) {
        throw new Error('Codex non ha restituito un codice dispositivo valido.')
      }
      return { mode: 'device', url: url.toString(), verificationUrl: url.toString(), userCode: result.userCode }
    }
    return { mode: 'browser', url: url.toString() }
  }

  loginProgress(): AiLoginProgress { return this.login?.progress ?? { state: 'idle', error: null } }

  async cancelLogin(): Promise<void> {
    const login = this.login
    this.login = null
    if (login?.progress.state === 'pending') await this.request('account/login/cancel', { loginId: login.id })
  }

  async logout(): Promise<void> {
    await this.request('account/logout')
  }

  async latestTurnId(sessionId: string): Promise<string> {
    const turns = await this.request('thread/turns/list', { threadId: sessionId,
      limit: 1, sortDirection: 'desc', itemsView: 'notLoaded' }) as {
        data?: Array<{ id?: string; status?: string }>
      }
    const turnId = turns.data?.[0]?.id
    if (!turnId) throw new Error('Codex non ha restituito l’identificativo del turno salvato.')
    return turnId
  }

  async jsonTurn(sessionId: string | null, cwd: string, prompt: string, config: AiRunConfig,
    outputSchema: Record<string, unknown>, options: { jobId?: string; jobDirectory?: string;
      signal?: AbortSignal; onSessionStarted?: (sessionId: string) => void;
      onUsage?: (usage: AiTokenUsage | null) => void;
      onSummary?: (summary: string) => void } = {}): Promise<{ sessionId: string; turnId: string; value: unknown; usage: AiTokenUsage | null }> {
    const key = options.jobId ?? sessionId ?? `new:${randomUUID()}`
    if (this.cliTurns.has(key)) throw new Error('Questa sessione Codex è già in elaborazione.')
    if (options.signal?.aborted) throw new Error('Operazione Codex annullata.')
    const directory = options.jobDirectory ?? mkdtempSync(join(tmpdir(), 'pokeguru-codex-turn-'))
    mkdirSync(directory, { recursive: true })
    const schemaPath = join(directory, 'schema.json')
    const resultPath = join(directory, 'result.json')
    try {
      if (sessionId) writeFileSync(join(directory, 'session-id.txt'), sessionId, 'utf8')
      writeFileSync(schemaPath, JSON.stringify(outputSchema), 'utf8')
      const launcher = codexLauncher(this.dataDir())
      const args = ['-C', cwd, 'exec', '--json', ...(sessionId ? ['resume'] : []), ...CODEX_ISOLATION_ARGS,
        '--config', 'approval_policy="never"', '--config', 'model_reasoning_summary="concise"', '--skip-git-repo-check',
        ...(config.model ? ['--model', config.model] : []),
        ...(config.reasoningEffort ? ['--config', `model_reasoning_effort=${JSON.stringify(config.reasoningEffort)}`] : []),
        '--output-schema', schemaPath, '--output-last-message', resultPath,
        ...(sessionId ? [sessionId] : []), '-']
      const done = await new Promise<{ sessionId: string; text: string; usage: AiTokenUsage | null }>((resolve, reject) => {
        const child = spawn(launcher.command, [...launcher.prefix, ...args],
          { cwd, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] })
        this.cliTurns.set(key, child)
        const abort = () => child.kill()
        options.signal?.addEventListener('abort', abort, { once: true })
        let observedSessionId: string | null = null
        let usage: AiTokenUsage | null = null
        let stdout = ''
        let stderr = ''
        let timedOut = false
        let captureError = false
        const timer = setTimeout(() => { timedOut = true; child.kill() }, 600_000)
        child.stdout.setEncoding('utf8')
        child.stdout.on('data', (chunk: string) => {
          stdout += chunk
          const lines = stdout.split('\n')
          stdout = lines.pop() ?? ''
          for (const line of lines) {
            try {
              stderr = (stderr + codexErrorEvent(line)).slice(-4000)
              const summary = codexReasoningSummary(line)
              if (summary) options.onSummary?.(summary)
              const event = JSON.parse(line) as { type?: string; thread_id?: string; usage?: unknown }
              if (event.type === 'turn.completed') usage = readAiTokenUsage(event.usage)
              if (event.type === 'thread.started') {
                observedSessionId = event.thread_id ?? null
                if (observedSessionId) {
                  try {
                    writeFileSync(join(directory, 'session-id.txt'), observedSessionId, 'utf8')
                    options.onSessionStarted?.(observedSessionId)
                  }
                  catch { captureError = true; child.kill() }
                }
              }
            } catch { /* Ignore non-event output. */ }
          }
          if (stdout.length > 1_000_000) child.kill()
        })
        child.stderr.on('data', (chunk: Buffer) => { stderr = (stderr + chunk.toString()).slice(-2000) })
        child.stdin.on('error', () => undefined)
        child.stdin.end(prompt)
        child.on('error', (error) => {
          clearTimeout(timer)
          options.signal?.removeEventListener('abort', abort)
          if (captureError) return reject(new Error('Impossibile conservare la sessione Codex.'))
          reject(new Error(error.message.includes('ENOENT')
            ? 'Codex non disponibile. Verifica l’installazione di Pokéguru.'
            : 'Impossibile avviare Codex.'))
        })
        child.on('close', (code) => {
          clearTimeout(timer)
          options.signal?.removeEventListener('abort', abort)
          try { options.onUsage?.(usage) } catch (error) { reject(error); return }
          if (captureError) return reject(new Error('Impossibile conservare la sessione Codex.'))
          if (options.signal?.aborted) return reject(new Error('Operazione Codex annullata.'))
          if (timedOut) return reject(new Error('Codex ha superato il tempo massimo di dieci minuti per questa chiamata. Puoi riprendere l’analisi.'))
          if (code !== 0) return reject(codexFailure(stderr))
          if (!(observedSessionId ?? sessionId) ||
            (sessionId && observedSessionId && sessionId !== observedSessionId)) {
            return reject(new Error('Codex non ha restituito l’identificativo atteso della sessione.'))
          }
          try { resolve({ sessionId: observedSessionId ?? sessionId!,
            text: readFileSync(resultPath, 'utf8'), usage }) }
          catch { reject(new Error('Codex non ha restituito una risposta completa.')) }
        })
      })
      if (done.text.length > 100_000) throw new Error('Risposta Codex troppo lunga.')
      const turnId = await this.latestTurnId(done.sessionId)
      try { return { sessionId: done.sessionId, turnId, usage: done.usage,
        value: JSON.parse(done.text) as unknown } }
      catch { throw new Error('Codex ha restituito una risposta JSON non valida.') }
    } finally {
      this.cliTurns.delete(key)
      if (!options.jobDirectory) rmSync(directory, { recursive: true, force: true })
    }
  }

  cancelTurn(jobId: string): void { this.cliTurns.get(jobId)?.kill() }

  stop(): Promise<void> {
    for (const child of this.cliTurns.values()) child.kill()
    const child = this.child
    const closed = child ? new Promise<void>((resolve) => child.once('close', () => resolve())) : Promise.resolve()
    child?.kill()
    this.fail(new Error('Codex App Server arrestato.'))
    return closed
  }
}
