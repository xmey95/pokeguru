import { aiCallKinds, readAiCallMetrics, type AiCallKind, type AiCallMetrics } from './ai-call-metrics'

export const aiFailureCodes = ['unknown', 'cancelled', 'paused', 'timeout', 'auth', 'network',
  'storage', 'invalid-plan', 'invalid-response', 'evidence-incomplete', 'draft-limit',
  'batch-too-large', 'query-limit', 'cli-unavailable', 'context-limit', 'quota', 'storage-full', 'no-progress'] as const
export type AiFailureCode = typeof aiFailureCodes[number]

export interface AiCollectionDiagnostics {
  operation: 'catalog' | 'events' | 'dependencies'
  stage: 'reading' | 'saving' | 'cards' | 'page' | 'complete' | 'interrupted'
  startedAt: string
  updatedAt: string
  pages: number
  items?: number
  total?: number
  remaining?: number
  queryMs: number
  persistMs: number
  dependencyMs: number
  maxPageMs: number
}

export interface AiDiagnostics {
  metrics?: AiCallMetrics
  collection?: AiCollectionDiagnostics
  failureCode?: AiFailureCode
  model?: string | null
  reasoningEffort?: string | null
  resumable?: boolean
  workflow?: boolean
  planningRounds?: number
  queryCount?: number
  rejectedQueries?: number
  evidenceBytes?: number
  evidenceExhausted?: boolean
  targets?: number
  supplied?: number
  missingGameplay?: number
  notSupplied?: number
  batchesCompleted?: number
  batchesTotal?: number
  cacheHits?: number
  retryAttempt?: number
  nextRetryAt?: string
  automaticWait?: boolean
  suspensionReason?: 'user' | 'shutdown' | 'failure' | 'legacy'
  calls?: { kind: AiCallKind; startedAt: string;
    endedAt: string | null; status: 'running' | 'succeeded' | 'failed'; inputBytes: number;
    failureCode?: AiFailureCode }[]
}

/** Used at persistence and export: no arbitrary properties or free text. */
export function readAiDiagnostics(value: unknown): AiDiagnostics {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const data = value as Record<string, unknown>
  const result: AiDiagnostics = {}
  const metrics = readAiCallMetrics(data.metrics)
  if (metrics) result.metrics = metrics
  if (['user', 'shutdown', 'failure', 'legacy'].includes(data.suspensionReason as string))
    result.suspensionReason = data.suspensionReason as AiDiagnostics['suspensionReason']
  if (aiFailureCodes.includes(data.failureCode as AiFailureCode)) result.failureCode = data.failureCode as AiFailureCode
  for (const key of ['resumable', 'workflow', 'evidenceExhausted', 'automaticWait'] as const)
    if (typeof data[key] === 'boolean') result[key] = data[key]
  for (const key of ['planningRounds', 'queryCount', 'rejectedQueries', 'evidenceBytes', 'targets',
    'supplied', 'missingGameplay', 'notSupplied', 'batchesCompleted', 'batchesTotal', 'cacheHits', 'retryAttempt'] as const)
    if (Number.isSafeInteger(data[key]) && Number(data[key]) >= 0) result[key] = Number(data[key])
  if (data.model === null || typeof data.model === 'string' && /^gpt-[a-z0-9.-]{1,80}$/.test(data.model))
    result.model = data.model as string | null
  if (data.reasoningEffort === null || ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'ultra'].includes(data.reasoningEffort as string))
    result.reasoningEffort = data.reasoningEffort as string | null
  const timestamp = (input: unknown): input is string => typeof input === 'string' &&
    /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(input) && Number.isFinite(Date.parse(input))
  const collection = data.collection as Record<string, unknown> | undefined
  if (collection && ['catalog', 'events', 'dependencies'].includes(collection.operation as string) &&
    ['reading', 'saving', 'cards', 'page', 'complete', 'interrupted'].includes(collection.stage as string) &&
    timestamp(collection.startedAt) && timestamp(collection.updatedAt) &&
    ['pages', 'queryMs', 'persistMs', 'dependencyMs', 'maxPageMs'].every((key) =>
      Number.isSafeInteger(collection[key]) && Number(collection[key]) >= 0)) {
    result.collection = { operation: collection.operation as AiCollectionDiagnostics['operation'],
      stage: collection.stage as AiCollectionDiagnostics['stage'], startedAt: collection.startedAt,
      updatedAt: collection.updatedAt, pages: Number(collection.pages), queryMs: Number(collection.queryMs),
      persistMs: Number(collection.persistMs), dependencyMs: Number(collection.dependencyMs), maxPageMs: Number(collection.maxPageMs) }
    for (const key of ['items', 'total', 'remaining'] as const)
      if (Number.isSafeInteger(collection[key]) && Number(collection[key]) >= 0) result.collection[key] = Number(collection[key])
  }
  if (timestamp(data.nextRetryAt)) result.nextRetryAt = data.nextRetryAt
  if (Array.isArray(data.calls)) result.calls = data.calls.slice(-40).flatMap((entry) => {
    if (!entry || typeof entry !== 'object' ||
      !aiCallKinds.includes(entry.kind) ||
      !timestamp(entry.startedAt) || !(entry.endedAt === null || timestamp(entry.endedAt)) ||
      !['running', 'succeeded', 'failed'].includes(entry.status) ||
      !Number.isSafeInteger(entry.inputBytes) || entry.inputBytes < 0) return []
    return [{ kind: entry.kind, startedAt: entry.startedAt, endedAt: entry.endedAt,
      status: entry.status, inputBytes: entry.inputBytes,
      ...(aiFailureCodes.includes(entry.failureCode) ? { failureCode: entry.failureCode } : {}) }]
  })
  return result
}
