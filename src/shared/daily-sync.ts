export type DailySyncSource = 'catalog' | 'play' | 'main'

export interface DailySyncState {
  lastAttemptAt: string | null
  lastSuccessAt: string | null
  trigger: 'automatic' | 'manual' | null
  outcome: 'idle' | 'running' | 'success' | 'failed' | 'rate-limited' | 'paused' | 'cancelled'
  nextAttemptAt: string | null
  error: string | null
}
