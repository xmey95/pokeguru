export const aiFailureCodes = ['unknown', 'cancelled', 'paused', 'timeout', 'auth', 'network',
  'storage', 'invalid-plan', 'invalid-response', 'evidence-incomplete', 'draft-limit',
  'batch-too-large', 'query-limit', 'cli-unavailable'] as const
export type AiFailureCode = typeof aiFailureCodes[number]

export interface AiDiagnostics {
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
  calls?: { kind: 'planning' | 'batch' | 'synthesis' | 'analysis'; startedAt: string;
    endedAt: string | null; status: 'running' | 'succeeded' | 'failed'; inputBytes: number;
    failureCode?: AiFailureCode }[]
}

/** Used at persistence and export: no arbitrary properties or free text. */
export function readAiDiagnostics(value: unknown): AiDiagnostics {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const data = value as Record<string, unknown>
  const result: AiDiagnostics = {}
  if (aiFailureCodes.includes(data.failureCode as AiFailureCode)) result.failureCode = data.failureCode as AiFailureCode
  for (const key of ['resumable', 'workflow', 'evidenceExhausted'] as const)
    if (typeof data[key] === 'boolean') result[key] = data[key]
  for (const key of ['planningRounds', 'queryCount', 'rejectedQueries', 'evidenceBytes', 'targets',
    'supplied', 'missingGameplay', 'notSupplied', 'batchesCompleted', 'batchesTotal', 'cacheHits'] as const)
    if (Number.isSafeInteger(data[key]) && Number(data[key]) >= 0) result[key] = Number(data[key])
  if (data.model === null || typeof data.model === 'string' && /^gpt-[a-z0-9.-]{1,80}$/.test(data.model))
    result.model = data.model as string | null
  if (data.reasoningEffort === null || ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'ultra'].includes(data.reasoningEffort as string))
    result.reasoningEffort = data.reasoningEffort as string | null
  const timestamp = (input: unknown): input is string => typeof input === 'string' &&
    /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(input) && Number.isFinite(Date.parse(input))
  if (Array.isArray(data.calls)) result.calls = data.calls.slice(-40).flatMap((entry) => {
    if (!entry || typeof entry !== 'object' ||
      !['planning', 'batch', 'synthesis', 'analysis'].includes(entry.kind) ||
      !timestamp(entry.startedAt) || !(entry.endedAt === null || timestamp(entry.endedAt)) ||
      !['running', 'succeeded', 'failed'].includes(entry.status) ||
      !Number.isSafeInteger(entry.inputBytes) || entry.inputBytes < 0) return []
    return [{ kind: entry.kind, startedAt: entry.startedAt, endedAt: entry.endedAt,
      status: entry.status, inputBytes: entry.inputBytes,
      ...(aiFailureCodes.includes(entry.failureCode) ? { failureCode: entry.failureCode } : {}) }]
  })
  return result
}
