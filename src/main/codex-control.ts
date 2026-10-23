import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { createInterface, type Interface } from 'node:readline'
import type { AiConnection, AiModel, AiRunConfig } from '../shared/ai'

type RpcResponse = { id?: number; result?: unknown; error?: { message?: string } }
type AgentMessage = { type?: string; text?: string; phase?: string | null }
type TurnNotification = { method?: string; params?: {
  threadId?: string; item?: AgentMessage; turn?: {
    id?: string; status?: string; error?: { message?: string } | null; items?: AgentMessage[]
  }
} }
type ActiveTurn = {
  finalText: string | null; latestText: string | null
  resolve(value: { turnId: string; text: string }): void; reject(error: Error): void
  timer: NodeJS.Timeout
}

export class CodexControl {
  private child: ChildProcessWithoutNullStreams | null = null
  private lines: Interface | null = null
  private starting: Promise<void> | null = null
  private nextId = 1
  private readonly pending = new Map<number, { resolve(value: unknown): void; reject(error: Error): void; timer: NodeJS.Timeout }>()
  private readonly activeTurns = new Map<string, ActiveTurn>()

  private fail(error: Error): void {
    for (const [id, entry] of this.pending) {
      clearTimeout(entry.timer)
      entry.reject(error)
      this.pending.delete(id)
    }
    for (const [threadId, entry] of this.activeTurns) {
      clearTimeout(entry.timer)
      entry.reject(error)
      this.activeTurns.delete(threadId)
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
        let message: RpcResponse & TurnNotification
        try { message = JSON.parse(line) as RpcResponse & TurnNotification } catch { return }
        if (typeof message.id !== 'number') {
          this.receiveNotification(message)
          return
        }
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

  private receiveNotification(message: TurnNotification): void {
    const threadId = message.params?.threadId
    if (!threadId) return
    const active = this.activeTurns.get(threadId)
    if (!active) return
    if (message.method === 'item/completed' && message.params?.item?.type === 'agentMessage') {
      const item = message.params.item
      if (typeof item.text === 'string') {
        active.latestText = item.text
        if (item.phase === 'final_answer') active.finalText = item.text
      }
    }
    if (message.method !== 'turn/completed') return
    clearTimeout(active.timer)
    this.activeTurns.delete(threadId)
    const turn = message.params?.turn
    if (turn?.status !== 'completed') {
      active.reject(new Error(turn?.error?.message ||
        (turn?.status === 'interrupted' ? 'La risposta Codex è stata interrotta.' : 'Codex non ha completato la risposta.')))
      return
    }
    const fromTurn = [...(turn.items ?? [])].reverse().find((item) =>
      item.type === 'agentMessage' && item.phase === 'final_answer' && typeof item.text === 'string')?.text
    const text = active.finalText ?? fromTurn ?? active.latestText
    if (!turn.id || !text) active.reject(new Error('Codex non ha restituito una risposta completa.'))
    else active.resolve({ turnId: turn.id, text })
  }

  async startThread(cwd: string, config: AiRunConfig): Promise<string> {
    const response = await this.request('thread/start', {
      cwd, approvalPolicy: 'never', sandbox: 'read-only', ephemeral: false,
      ...(config.model ? { model: config.model } : {}), serviceName: 'pokeguru'
    }) as { thread?: { id?: string } }
    if (!response.thread?.id) throw new Error('Codex non ha creato una sessione.')
    return response.thread.id
  }

  async resumeThread(threadId: string, cwd: string): Promise<void> {
    const response = await this.request('thread/resume', {
      threadId, cwd, approvalPolicy: 'never', sandbox: 'read-only', excludeTurns: true
    }) as { thread?: { id?: string } }
    if (response.thread?.id !== threadId) throw new Error('La sessione Codex salvata non è disponibile.')
  }

  async jsonTurn(threadId: string, cwd: string, prompt: string, config: AiRunConfig,
    outputSchema: Record<string, unknown>): Promise<{ turnId: string; value: unknown }> {
    if (this.activeTurns.has(threadId)) throw new Error('Questo thread Codex è già in elaborazione.')
    let resolveTurn!: ActiveTurn['resolve']
    let rejectTurn!: ActiveTurn['reject']
    const completed = new Promise<{ turnId: string; text: string }>((resolve, reject) => {
      resolveTurn = resolve; rejectTurn = reject
    })
    void completed.catch(() => undefined)
    const timer = setTimeout(() => {
      this.activeTurns.delete(threadId)
      rejectTurn(new Error('Codex non ha completato il turno entro quattro minuti.'))
    }, 240_000)
    this.activeTurns.set(threadId, { finalText: null, latestText: null, resolve: resolveTurn, reject: rejectTurn, timer })
    try {
      const response = await this.request('turn/start', {
        threadId, input: [{ type: 'text', text: prompt }], cwd,
        approvalPolicy: 'never', sandboxPolicy: { type: 'readOnly', networkAccess: false },
        ...(config.model ? { model: config.model } : {}),
        ...(config.reasoningEffort ? { effort: config.reasoningEffort } : {}), outputSchema
      }) as { turn?: { id?: string } }
      if (!response.turn?.id) throw new Error('Codex non ha avviato il turno.')
      const done = await completed
      if (done.turnId !== response.turn.id) throw new Error('Risposta Codex associata a un turno diverso.')
      if (done.text.length > 100_000) throw new Error('Risposta Codex troppo lunga.')
      try { return { turnId: done.turnId, value: JSON.parse(done.text) as unknown } }
      catch { throw new Error('Codex ha restituito una risposta JSON non valida.') }
    } catch (error) {
      // A request failure can occur before turn/completed; release its waiter.
      const active = this.activeTurns.get(threadId)
      if (active) {
        clearTimeout(active.timer)
        this.activeTurns.delete(threadId)
        active.reject(error instanceof Error ? error : new Error('Turno Codex non riuscito.'))
      }
      throw error
    }
  }

  stop(): Promise<void> {
    const child = this.child
    const closed = child ? new Promise<void>((resolve) => child.once('close', () => resolve())) : Promise.resolve()
    child?.kill()
    this.fail(new Error('Codex App Server arrestato.'))
    return closed
  }
}
