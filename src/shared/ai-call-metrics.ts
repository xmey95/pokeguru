import { readAiTokenUsage, type AiTokenUsage } from './ai-evidence'

export const aiCallKinds = ['planning', 'batch', 'synthesis', 'analysis', 'history'] as const
export type AiCallKind = typeof aiCallKinds[number]

/** Totals cover recorded invocations only. Null totals explicitly mark missing observations. */
export interface AiCallTotals {
  attempts: number
  running: number
  succeeded: number
  failed: number
  interrupted: number
  cacheHits: number
  inputBytes: number
  executionMs: number | null
  observedExecutionMs: number
  incompleteTimingAttempts: number
  waitingMs: number
  usage: AiTokenUsage | null
  observedUsage: AiTokenUsage | null
  usageKnownAttempts: number
}
export interface AiCallMetrics {
  schemaVersion: 1
  coverage: 'recorded-attempts'
  totals: AiCallTotals
  phases: Partial<Record<AiCallKind, AiCallTotals>>
}

export function emptyAiCallTotals(): AiCallTotals {
  return { attempts: 0, running: 0, succeeded: 0, failed: 0, interrupted: 0, cacheHits: 0,
    inputBytes: 0, executionMs: null, observedExecutionMs: 0, incompleteTimingAttempts: 0,
    waitingMs: 0, usage: null, observedUsage: null, usageKnownAttempts: 0 }
}

/** Export allowlist: never accept arbitrary phase names, IDs, prompts or provider metadata. */
export function readAiCallMetrics(value: unknown): AiCallMetrics | undefined {
  if (!value || typeof value !== 'object') return undefined
  const data = value as Record<string, unknown>
  if (data.schemaVersion !== 1) return undefined
  const read = (input: unknown): AiCallTotals | undefined => {
    if (!input || typeof input !== 'object') return undefined
    const row = input as Record<string, unknown>
    const result = emptyAiCallTotals()
    for (const key of ['attempts', 'running', 'succeeded', 'failed', 'interrupted', 'cacheHits', 'inputBytes',
      'observedExecutionMs', 'incompleteTimingAttempts', 'waitingMs', 'usageKnownAttempts'] as const) {
      if (!Number.isSafeInteger(row[key]) || Number(row[key]) < 0) return undefined
      result[key] = Number(row[key])
    }
    if (result.running + result.succeeded + result.failed + result.interrupted !== result.attempts ||
      result.usageKnownAttempts > result.attempts || result.incompleteTimingAttempts > result.attempts) return undefined
    const observed = readAiTokenUsage(row.observedUsage)
    result.observedUsage = observed && Object.values(observed).every(Number.isSafeInteger) ? observed : null
    result.usage = result.attempts > 0 && result.usageKnownAttempts === result.attempts
      ? result.observedUsage : null
    result.executionMs = result.attempts > 0 && !result.running && !result.incompleteTimingAttempts
      ? result.observedExecutionMs : null
    return result
  }
  const totals = read(data.totals)
  if (!totals) return undefined
  const phases: AiCallMetrics['phases'] = {}
  if (data.phases && typeof data.phases === 'object') for (const kind of aiCallKinds) {
    const phase = read((data.phases as Record<string, unknown>)[kind])
    if (phase) phases[kind] = phase
  }
  return { schemaVersion: 1, coverage: 'recorded-attempts', totals, phases }
}
