export interface AiTokenUsage {
  inputTokens: number
  cachedInputTokens: number
  outputTokens: number
}

export function readAiTokenUsage(value: unknown): AiTokenUsage | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const item = value as Record<string, unknown>
  const inputTokens = item.input_tokens ?? item.inputTokens
  const cachedInputTokens = item.cached_input_tokens ?? item.cachedInputTokens ?? 0
  const outputTokens = item.output_tokens ?? item.outputTokens
  if (![inputTokens, cachedInputTokens, outputTokens].every((part) =>
    Number.isInteger(part) && Number(part) >= 0)) return null
  return { inputTokens: inputTokens as number,
    cachedInputTokens: cachedInputTokens as number,
    outputTokens: outputTokens as number }
}

export interface AiPromptAudit {
  text: string
  sha256: string
  utf8Bytes: number
  durationMs: number | null
  usage: AiTokenUsage | null
}

export interface AiEvidenceQueryResult {
  query: unknown
  status: 'ok' | 'rejected'
  data: unknown
  sourceIds: string[]
  fingerprint: string
}

export interface AiEvidenceQueryTrace {
  /** Originals are in the owning job's SQLite archive; requests is a compact index. */
  archive?: { version: 1; jobId: string; projectId: string; resourceId: string; searches: number; completedSearches: number;
    pages: number; responseBytes: number; cards: number; decks: number; occurrences: number; pairings: number }
  references?: { id: string; label: string; url: string | null; fingerprint: string }[]
  analysis?: { schemaVersion: 1; generation?: string; records: number; batches: number; sourceCount: number;
    summary: string; limitations: string; sourceIds: string[] }
  focusedPrintIds?: string[]
  /** Exact originals included by the most recent prompt serialization. */
  deliveredCards?: { printId: string; fingerprint: string }[]
  schemaVersion: 1
  engine: { operations: string[]; catalog: { syncedAt: string | null;
    expected: number; indexed: number; gameplay: number };
    eventWindow: { from: string; to: string }; eventQueryMode?: 'decision-profiles' }
  requests: AiEvidenceQueryResult[]
  durationMs: number
  responseBytes: number
  planningRounds: number
  plannerUsage?: AiTokenUsage | null
  exhausted: boolean
  /** Exact names recognized in the local catalog, including names introduced by a draft. */
  cardTargets?: { name: string; printIds: string[];
    status: 'supplied' | 'missing-gameplay' | 'not-supplied' }[]
}
