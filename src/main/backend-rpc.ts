import { Worker } from 'node:worker_threads'

export interface BackendContext {
  userData: string
  temp: string
  downloads: string
  version: string
  packaged: boolean
  electron: string
  chrome: string
}

export type HostAction = 'open-external' | 'copy-text' | 'save-dialog' | 'runtime-metrics'
export type RpcReply = { type: 'reply'; id: number; value?: unknown; error?: string }

/** The window process only transports messages. All stores and AI preparation
 * live in one worker, with a single owner for caches and background jobs. */
export class BackendClient {
  private nextId = 0
  private pending = new Map<number, { resolve(value: unknown): void; reject(error: Error): void }>()
  private failure: Error | null = null
  private stopping = false
  private worker: Worker
  readonly ready: Promise<string[]>

  constructor(path: string, context: BackendContext,
    host: (action: HostAction, value: unknown) => Promise<unknown>) {
    this.worker = new Worker(path, { workerData: context })
    this.ready = new Promise((resolve, reject) => {
      this.worker.on('message', (message) => {
        if (message.type === 'ready') resolve(message.channels)
        else if (message.type === 'reply') {
          const request = this.pending.get(message.id)
          this.pending.delete(message.id)
          if (message.error) request?.reject(new Error(message.error))
          else request?.resolve(message.value)
        } else if (message.type === 'host') {
          void host(message.action, message.value).then(
            (value) => this.worker.postMessage({ type: 'host-reply', id: message.id, value }),
            () => this.worker.postMessage({ type: 'host-reply', id: message.id, error: 'Operazione desktop non riuscita.' }))
        }
      })
      const fail = (cause: unknown) => {
        if (!this.stopping) console.error('Servizio locale interrotto:', cause)
        this.failure = new Error('Il servizio locale si è interrotto. Riapri Pokéguru per riprendere il lavoro salvato.')
        reject(this.failure)
        for (const request of this.pending.values()) request.reject(this.failure)
        this.pending.clear()
      }
      this.worker.on('error', fail)
      this.worker.on('exit', fail)
    })
  }

  invoke(channel: string, args: unknown[] = []): Promise<unknown> {
    if (this.failure) return Promise.reject(this.failure)
    const id = ++this.nextId
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      try { this.worker.postMessage({ type: 'invoke', id, channel, args }) }
      catch (error) { this.pending.delete(id); reject(error) }
    })
  }

  async stop(): Promise<void> {
    this.stopping = true
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      await Promise.race([this.invoke('$shutdown'), new Promise((resolve) => { timer = setTimeout(resolve, 5000) })])
    } catch { /* An interrupted worker is recovered from its committed checkpoints. */ }
    finally { clearTimeout(timer); await this.worker.terminate() }
  }
}
