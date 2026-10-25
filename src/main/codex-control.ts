import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { createInterface, type Interface } from 'node:readline'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { AiConnection, AiModel, AiRunConfig } from '../shared/ai'
import { CODEX_ISOLATION_ARGS } from './codex-isolation'

type RpcResponse = { id?: number; result?: unknown; error?: { message?: string } }

export class CodexControl {
  private child: ChildProcessWithoutNullStreams | null = null
  private lines: Interface | null = null
  private starting: Promise<void> | null = null
  private nextId = 1
  private readonly pending = new Map<number, { resolve(value: unknown): void; reject(error: Error): void; timer: NodeJS.Timeout }>()
  private readonly cliTurns = new Map<string, ChildProcessWithoutNullStreams>()

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
      const command = process.env.POKEGURU_CODEX_BIN || 'codex'
      const child = spawn(command, ['app-server', '--stdio', '--disable', 'apps', '--disable', 'plugins',
        '--config', 'web_search="disabled"', '--config', 'mcp_servers.node_repl.enabled=false',
        '--config', 'mcp_servers.penpot.enabled=false'],
      { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] })
      this.child = child
      child.stderr.resume()
      child.on('error', (error) => {
        if (this.child === child) this.fail(new Error(error.message.includes('ENOENT')
          ? 'Codex CLI non trovato. Installa Codex o rendilo disponibile nel PATH.'
          : 'Impossibile avviare Codex App Server.'))
      })
      child.on('close', () => {
        if (this.child === child) this.fail(new Error('La connessione con Codex si è interrotta. Riprova.'))
      })
      this.lines = createInterface({ input: child.stdout })
      this.lines.on('line', (line) => {
        let message: RpcResponse
        try { message = JSON.parse(line) as RpcResponse } catch { return }
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

  async startLogin(): Promise<string> {
    const result = await this.request('account/login/start', {
      type: 'chatgpt', useHostedLoginSuccessPage: true, appBrand: 'codex'
    }) as { authUrl?: string }
    if (!result?.authUrl) throw new Error('Codex non ha restituito un collegamento di accesso.')
    const url = new URL(result.authUrl)
    if (url.protocol !== 'https:' || !(url.hostname === 'openai.com' || url.hostname.endsWith('.openai.com') ||
      url.hostname === 'chatgpt.com' || url.hostname.endsWith('.chatgpt.com'))) {
      throw new Error('Il collegamento di accesso restituito da Codex non è riconosciuto.')
    }
    return url.toString()
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
      signal?: AbortSignal } = {}): Promise<{ sessionId: string; turnId: string; value: unknown }> {
    const key = options.jobId ?? sessionId ?? `new:${randomUUID()}`
    if (this.cliTurns.has(key)) throw new Error('Questo thread Codex è già in elaborazione.')
    if (options.signal?.aborted) throw new Error('Operazione Codex annullata.')
    const directory = options.jobDirectory ?? mkdtempSync(join(tmpdir(), 'pokeguru-codex-turn-'))
    mkdirSync(directory, { recursive: true })
    const schemaPath = join(directory, 'schema.json')
    const resultPath = join(directory, 'result.json')
    try {
      if (sessionId) writeFileSync(join(directory, 'session-id.txt'), sessionId, 'utf8')
      writeFileSync(schemaPath, JSON.stringify(outputSchema), 'utf8')
      const command = process.env.POKEGURU_CODEX_BIN || 'codex'
      const args = ['-C', cwd, 'exec', '--json', ...(sessionId ? ['resume'] : []), ...CODEX_ISOLATION_ARGS,
        '--config', 'approval_policy="never"', '--skip-git-repo-check',
        ...(config.model ? ['--model', config.model] : []),
        ...(config.reasoningEffort ? ['--config', `model_reasoning_effort=${JSON.stringify(config.reasoningEffort)}`] : []),
        '--output-schema', schemaPath, '--output-last-message', resultPath,
        ...(sessionId ? [sessionId] : []), '-']
      const done = await new Promise<{ sessionId: string; text: string }>((resolve, reject) => {
        const child = spawn(command, args, { cwd, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] })
        this.cliTurns.set(key, child)
        const abort = () => child.kill()
        options.signal?.addEventListener('abort', abort, { once: true })
        let observedSessionId: string | null = null
        let stdout = ''
        let stderr = ''
        let timedOut = false
        let captureError = false
        const timer = setTimeout(() => { timedOut = true; child.kill() }, 240_000)
        child.stdout.on('data', (chunk: Buffer) => {
          stdout += chunk.toString()
          const lines = stdout.split('\n')
          stdout = lines.pop() ?? ''
          for (const line of lines) {
            try {
              const event = JSON.parse(line) as { type?: string; thread_id?: string }
              if (event.type === 'thread.started') {
                observedSessionId = event.thread_id ?? null
                if (observedSessionId) {
                  try { writeFileSync(join(directory, 'session-id.txt'), observedSessionId, 'utf8') }
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
            ? 'Codex CLI non trovato. Installa Codex o rendilo disponibile nel PATH.'
            : 'Impossibile avviare Codex.'))
        })
        child.on('close', (code) => {
          clearTimeout(timer)
          options.signal?.removeEventListener('abort', abort)
          if (captureError) return reject(new Error('Impossibile conservare la sessione Codex.'))
          if (options.signal?.aborted) return reject(new Error('Operazione Codex annullata.'))
          if (timedOut) return reject(new Error('Codex non ha completato il turno entro quattro minuti.'))
          if (code !== 0) return reject(new Error(stderr.includes('Not logged in')
            ? 'Accedi a Codex prima di generare le analisi.'
            : 'Codex non ha completato la risposta nel profilo isolato. Controlla supporto sandbox, connessione e modello.'))
          if (!(observedSessionId ?? sessionId) ||
            (sessionId && observedSessionId && sessionId !== observedSessionId)) {
            return reject(new Error('Codex non ha restituito l’identificativo atteso della sessione.'))
          }
          try { resolve({ sessionId: observedSessionId ?? sessionId!,
            text: readFileSync(resultPath, 'utf8') }) }
          catch { reject(new Error('Codex non ha restituito una risposta completa.')) }
        })
      })
      if (done.text.length > 100_000) throw new Error('Risposta Codex troppo lunga.')
      const turnId = await this.latestTurnId(done.sessionId)
      try { return { sessionId: done.sessionId, turnId,
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
