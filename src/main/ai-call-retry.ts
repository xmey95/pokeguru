import { setTimeout as sleep } from 'node:timers/promises'
import type { AiFailureCode } from '../shared/ai-diagnostics'
import { AiFailure, aiFailureCode } from './ai-failure'

export interface AiCallState {
  failures: number
  status: 'running' | 'waiting' | 'blocked' | 'complete'
  code?: AiFailureCode
  message?: string
  nextAttemptAt?: number
}
export interface AiCallJournal {
  read(): AiCallState | undefined
  write(state: AiCallState): void
}

/** The failed-attempt count and deadline precede the wait. Reopening cannot
 * reset the budget, and structural failures never replay the identical input. */
export async function runRecoverableAiCall<T>(execute: () => Promise<T>, journal: AiCallJournal,
  options: { signal: AbortSignal; now?: () => number; wait?: (ms: number, signal: AbortSignal) => Promise<void>;
    onWaiting?: (state: AiCallState) => void; onRunning?: () => void;
    onWaitElapsed?: (milliseconds: number) => void }): Promise<T> {
  const now = options.now ?? Date.now
  const wait = options.wait ?? ((ms, signal) => sleep(ms, undefined, { signal }))
  const check = () => {
    if (options.signal.aborted) throw new AiFailure(options.signal.reason === 'pause' ? 'paused' : 'cancelled',
      options.signal.reason === 'pause' ? 'Analisi in pausa. Il lavoro completato è conservato.' : 'Analisi annullata.')
  }
  let state = journal.read() ?? { failures: 0, status: 'running' as const }
  if (state.status === 'complete') state = { failures: 0, status: 'running' }
  while (true) {
    check()
    if (state.status === 'blocked') throw new AiFailure(state.code ?? 'unknown', state.message ?? 'Chiamata non completata.')
    if (state.status === 'waiting' && state.nextAttemptAt) {
      options.onWaiting?.(state)
      while (now() < state.nextAttemptAt) {
        const started = performance.now()
        try { await wait(Math.min(30_000, state.nextAttemptAt - now()), options.signal) }
        catch (error) { check(); throw error }
        finally { options.onWaitElapsed?.(performance.now() - started) }
        check()
      }
    }
    state = { failures: state.failures, status: 'running' }
    journal.write(state)
    options.onRunning?.()
    try {
      const value = await execute()
      check()
      journal.write({ ...state, status: 'complete' })
      return value
    } catch (error) {
      // A user pause or shutdown is not a failed retry and must not consume its budget.
      check()
      const code = aiFailureCode(error)
      const failures = state.failures + 1
      const maximum = code === 'invalid-response' ? 2 : ['network', 'timeout', 'quota'].includes(code) ? 3 : 1
      const message = error instanceof Error ? error.message : 'Chiamata AI non completata.'
      if (failures >= maximum) {
        state = { status: 'blocked', failures, code, message }
        journal.write(state)
        throw error
      }
      const hint = error instanceof AiFailure ? error.retryAfterMs : undefined
      const delay = hint !== undefined && Number.isFinite(hint) && hint >= 0
        ? Math.min(hint, 24 * 60 * 60_000) : (code === 'quota' ? 30_000 : 1000) * 2 ** (failures - 1)
      state = { status: 'waiting', failures, code, message, nextAttemptAt: now() + delay }
      journal.write(state)
    }
  }
}
