import { createHash } from 'node:crypto'
import { AiFailure } from './ai-failure'

export interface EvidenceRecord { key?: string; sourceIds: string[]; data: unknown }
interface Fragment {
  kind: 'evidence-fragment'; recordKey: string; encoding: 'json-string';
  start: number; end: number; total: number; text: string
}
const bytes = (value: unknown) => Buffer.byteLength(JSON.stringify(value), 'utf8')

/** Exact JSON text, including every field and Unicode character, remains recoverable.
 * Offsets count UTF-16 code units; boundaries never split a surrogate pair. Fragments
 * share their original key and are not independent observations or participants. */
export function* partitionEvidenceRecord(record: EvidenceRecord, budget: number): Generator<EvidenceRecord> {
  if (bytes(record) <= budget) { yield record; return }
  const fragment = record.data as Partial<Fragment> | null
  const prior = fragment?.kind === 'evidence-fragment' && fragment.encoding === 'json-string'
    ? fragment as Fragment : undefined
  const serialized = prior?.text ?? JSON.stringify(record.data)
  const recordKey = prior?.recordKey ?? record.key ?? createHash('sha256').update(serialized).digest('hex')
  const base = prior?.start ?? 0
  const total = prior?.total ?? serialized.length
  const make = (start: number, end: number): EvidenceRecord => ({
    key: `${recordKey}:fragment:${base + start}:${base + end}`, sourceIds: record.sourceIds,
    data: { kind: 'evidence-fragment', recordKey, encoding: 'json-string', start: base + start,
      end: base + end, total, text: serialized.slice(start, end) } satisfies Fragment
  })
  let start = 0
  while (start < serialized.length) {
    let low = start + 1, high = Math.min(serialized.length, start + budget), best = start
    while (low <= high) {
      const end = Math.floor((low + high) / 2)
      if (bytes(make(start, end)) <= budget) { best = end; low = end + 1 } else high = end - 1
    }
    if (best < serialized.length && /[\uD800-\uDBFF]/.test(serialized[best - 1]) &&
      /[\uDC00-\uDFFF]/.test(serialized[best])) best--
    if (best <= start) throw new AiFailure('context-limit',
      'I riferimenti di un record superano il contesto disponibile. Gli originali e i lotti completati sono conservati.')
    yield make(start, best)
    start = best
  }
}

export function* evidenceBatches(records: Iterable<EvidenceRecord>, budget: number): Generator<EvidenceRecord[]> {
  let current: EvidenceRecord[] = [], size = 2
  for (const record of records) for (const part of partitionEvidenceRecord(record, budget - 2)) {
    const length = bytes(part) + (current.length ? 1 : 0)
    if (size + length > budget && current.length) { yield current; current = []; size = 2 }
    current.push(part); size += bytes(part) + (current.length > 1 ? 1 : 0)
  }
  if (current.length) yield current
}
