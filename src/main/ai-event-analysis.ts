import { AiEvidenceArchive, evidenceHash, type EvidenceAnalysisInventory } from './ai-evidence-archive'
import { aggregateEventRecords, eventPlayerIndex, EVENT_TABLE_SCHEMAS } from './ai-event-aggregates'
import type { EvidenceEventRow } from './ai-evidence-engine'
import type { EvidenceRecord } from './ai-evidence-partition'
import { readEvidenceBatch, type EvidenceAnalysisManifest } from './ai-evidence-manifest'
import { evidenceMetricKinds, type AiEvidencePlanMetrics } from '../shared/ai-diagnostics'

/** Pure construction also used by the opt-in private-snapshot benchmark. */
export function buildEventAnalysisRecords(archive: AiEvidenceArchive, check: () => void = () => {}): EvidenceRecord[] {
  const players = archive.counts().pairings ? eventPlayerIndex(archive.eventRows<EvidenceEventRow>(), check) : new Map()
  const records = aggregateEventRecords(archive.records('occurrence'), archive.records('pairing'), players, check)
  const detailed = new Map<string, EvidenceRecord>()
  for (const search of archive.searches()) if ((search.query as { operation?: string }).operation === 'events.details') {
    for (const page of archive.pages(search.key)) {
      for (const row of (page.data as { records?: { key: string; sourceId: string; data: unknown; kind: string; deckKey: string | null }[] }).records ?? [])
        detailed.set(row.key, { key: `detail:${row.key}`, sourceIds: [row.sourceId],
          data: { kind: row.kind, deckKey: row.deckKey, original: row.data } })
    }
  }
  return [...records, ...[...detailed].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([, row]) => row)]
}

export function eventAnalysisOriginalInputs(original: EvidenceAnalysisInventory): EvidenceAnalysisInventory['inputs'] {
  return original.inputs.filter((input) => input.type !== 'statistics' &&
    !(input.type === 'record' && (input.recordKind === 'pairing' || input.recordKind === 'occurrence' && input.deckKey)))
}

export function prepareEventAnalysisInventory(archive: AiEvidenceArchive, check: () => void = () => {}): EvidenceAnalysisInventory {
  const original = archive.analysisInventory()
  const key = evidenceHash(['event-aggregates-v1', original])
  const saved = archive.value<EvidenceAnalysisInventory>('event-aggregate-inventory:v1', key)
  if (saved) return saved
  const originals = eventAnalysisOriginalInputs(original)
  const aggregates = archive.saveAggregateInputs(buildEventAnalysisRecords(archive, check))
  const inventory = { snapshotHash: original.snapshotHash,
    inputs: [...originals.filter((input) => input.type !== 'search'), ...aggregates, ...originals.filter((input) => input.type === 'search')] }
  archive.saveValue('event-aggregate-inventory:v1', key, inventory)
  return inventory
}

export function eventAnalysisContext(archive: AiEvidenceArchive): unknown {
  const base = archive.value<{ rawText?: string } | null>('input', 'base')
  const selection = archive.value<{ asOf?: string }>('input', 'matchup-selection')
  return { format: 'Standard occidentale', referenceDate: archive.value('input', 'reference-date') ?? selection?.asOf ?? null,
    baseList: base?.rawText ?? null, matchupDeckContext: base?.rawText ? undefined : archive.value('input', 'deck-context') ?? null,
    constraints: archive.value('input', 'constraints') ?? [], tableSchemas: EVENT_TABLE_SCHEMAS,
    note: 'I risultati Evento sono osservazioni dei campioni, non una simulazione del mazzo base. events.details recupera gli originali di una lista esatta.' }
}

export function eventPlanMetrics(archive: AiEvidenceArchive, manifest: EvidenceAnalysisManifest): AiEvidencePlanMetrics {
  const saved = archive.value<AiEvidencePlanMetrics>('event-plan-metrics:v1', manifest.fingerprint)
  if (saved) return saved
  const types = new Map<AiEvidencePlanMetrics['byType'][number]['kind'], AiEvidencePlanMetrics['byType'][number]>()
  const inputKind = new Map<string, AiEvidencePlanMetrics['byType'][number]['kind']>()
  for (const input of manifest.inputs) {
    const prefix = input.key.split(':')[0]
    const kind = evidenceMetricKinds.find(k => k === prefix) ?? 'other'
    inputKind.set(input.key, kind)
    const metric = types.get(kind) ?? { kind, records: 0, recordBytes: 0, batchesTouched: 0 }
    metric.records++; types.set(kind, metric)
  }
  for (const batch of manifest.batches) {
    const touched = new Set<AiEvidencePlanMetrics['byType'][number]['kind']>()
    for (const record of readEvidenceBatch(archive, batch)) {
      const fragment = record.data as { kind?: string; recordKey?: string }
      const kind = inputKind.get(fragment.kind === 'evidence-fragment' ? fragment.recordKey! : record.key!) ?? 'other'
      types.get(kind)!.recordBytes += Buffer.byteLength(JSON.stringify(record)); touched.add(kind)
    }
    for (const kind of touched) types.get(kind)!.batchesTouched++
  }
  const result: AiEvidencePlanMetrics = { representation: 'event-aggregates-v1', originalAnalysisRecords: archive.analysisInventory().inputs.length,
    analysisRecords: manifest.inputs.length, leafBatches: manifest.batches.length,
    batchBytes: manifest.batches.reduce((n, b) => n + b.bytes, 0), byType: [...types.values()],
    queries: archive.queryMetrics().map(row => ({ ...row,
      operation: ['catalog.search', 'events.search', 'events.overview', 'events.details'].includes(row.operation)
        ? row.operation as AiEvidencePlanMetrics['queries'][number]['operation'] : 'unknown' })) }
  archive.saveValue('event-plan-metrics:v1', manifest.fingerprint, result)
  return result
}
