type Mode = 'new' | 'full'

type Progress = {
  mode: Mode | null
  status: 'idle' | 'running' | 'rate-limited' | 'complete'
  cooldownUntil: string | null
  lastError: string | null
  active?: boolean
  stopping?: boolean
}

/** Advances persisted acquisition blocks without tying a scan to the open renderer view. */
export class TournamentSyncJob<T extends Progress> {
  private running = false
  private timer: ReturnType<typeof setTimeout> | null = null
  private stopRequested = false
  private closed = false
  private runtimeError: string | null = null
  private nextAllowedAt = 0

  constructor(
    private readonly read: () => T,
    private readonly block: (mode: Mode, shouldStop: () => boolean) => Promise<T>,
    private readonly gapMs: number | (() => number),
    private readonly afterBlock?: (progress: T) => void
  ) {}

  status(): T {
    const progress = this.read()
    return { ...progress, active: this.running || this.timer !== null,
      stopping: this.running && this.stopRequested,
      lastError: this.runtimeError ?? progress.lastError }
  }

  start(mode: Mode): T {
    if (this.closed) throw new Error('Aggiornamento tornei non disponibile.')
    if (this.running || this.timer) return this.status()
    const progress = this.read()
    if (progress.mode && progress.mode !== mode &&
      progress.status !== 'idle' && progress.status !== 'complete')
      throw new Error('Completa la scansione in corso prima di cambiare modalità.')
    this.stopRequested = false
    this.runtimeError = null
    const cooldown = progress.status === 'rate-limited' && progress.cooldownUntil
      ? Date.parse(progress.cooldownUntil) : 0
    this.schedule(mode, Math.max(0, cooldown - Date.now(), this.nextAllowedAt - Date.now()))
    return this.status()
  }

  pause(): T {
    this.stopRequested = true
    if (this.timer) { clearTimeout(this.timer); this.timer = null }
    return this.status()
  }

  shutdown(): void {
    this.closed = true
    this.pause()
  }

  private schedule(mode: Mode, delayMs: number): void {
    this.timer = setTimeout(() => {
      this.timer = null
      if (!this.stopRequested && !this.closed) void this.run(mode)
    }, Math.min(Math.max(0, delayMs), 3_600_000))
  }

  private async run(mode: Mode): Promise<void> {
    this.running = true
    try {
      const progress = await this.block(mode, () => this.stopRequested || this.closed)
      if (!this.closed) this.afterBlock?.(progress)
      this.nextAllowedAt = Date.now() + (typeof this.gapMs === 'function' ? this.gapMs() : this.gapMs)
      if (this.stopRequested || this.closed || progress.status === 'complete') return
      const wait = progress.status === 'rate-limited' && progress.cooldownUntil
        ? Math.max(0, Date.parse(progress.cooldownUntil) - Date.now(), this.nextAllowedAt - Date.now())
        : Math.max(0, this.nextAllowedAt - Date.now())
      this.schedule(mode, wait)
    } catch (error) {
      this.runtimeError = error instanceof Error ? error.message : 'Aggiornamento tornei non riuscito.'
    } finally {
      this.running = false
    }
  }
}
