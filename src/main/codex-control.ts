import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { createInterface, type Interface } from 'node:readline'
import type { AiConnection, AiModel } from '../shared/ai'

type RpcResponse = { id?: number; result?: unknown; error?: { message?: string } }

export class CodexControl {
  private child: ChildProcessWithoutNullStreams | null = null
  private lines: Interface | null = null
  private starting: Promise<void> | null = null
  private nextId = 1
  private readonly pending = new Map<number, { resolve(value: unknown): void; reject(error: Error): void; timer: NodeJS.Timeout }>()

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
      const child = spawn(command, ['app-server', '--stdio'], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] })
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
      await this.send('initialize', { clientInfo: { name: 'pokeguru', title: 'Pokéguru', version: '0.1.0' } })
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

  stop(): void {
    this.child?.kill()
    this.fail(new Error('Codex App Server arrestato.'))
  }
}
