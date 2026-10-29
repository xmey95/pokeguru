import type { AiEvidenceQueryTrace } from '../shared/ai-evidence'
import type { CatalogEvidenceMatch } from './catalog-evidence-search'
import { AiEvidenceArchive, evidenceHash, type EvidenceSearch } from './ai-evidence-archive'

const archives = new WeakMap<AiEvidenceQueryTrace, AiEvidenceArchive>()
export function bindEvidenceArchive(trace: AiEvidenceQueryTrace, archive: AiEvidenceArchive): void {
  archives.set(trace, archive)
  refreshEvidenceArchive(trace)
}
export const evidenceArchive = (trace: AiEvidenceQueryTrace) => archives.get(trace)
export function refreshEvidenceArchive(trace: AiEvidenceQueryTrace, changed?: EvidenceSearch): void {
  const archive = archives.get(trace)
  if (!archive) return
  trace.archive = { version: 1, jobId: archive.id, projectId: archive.projectId,
    resourceId: archive.resourceId, ...archive.counts() }
  trace.responseBytes = trace.archive.responseBytes
  if (changed) {
    const summary = archive.searchSummary(changed)
    const index = trace.requests.findIndex((entry) => entry.fingerprint === changed.key)
    if (index < 0) trace.requests.push(summary)
    else trace.requests[index] = summary
  } else trace.requests = [...archive.searches()].map((search) => archive.searchSummary(search))
}
export function* evidenceCards(trace: AiEvidenceQueryTrace): Generator<CatalogEvidenceMatch> {
  const archive = archives.get(trace)
  if (archive) {
    for (const record of archive.records('card')) yield record.data as CatalogEvidenceMatch
  } else {
    for (const result of trace.requests) if (result.status === 'ok')
      yield* (result.data as { matches?: CatalogEvidenceMatch[] }).matches ?? []
  }
}
/** Select only the references used by the current prompt. The complete provenance
 * remains reachable in the archive, without growing every historical message. */
export function archiveReferences(trace: AiEvidenceQueryTrace): NonNullable<AiEvidenceQueryTrace['references']> {
  const archive = archives.get(trace)
  if (!archive) return []
  const selected = trace.analysis ? new Set([...trace.analysis.sourceIds,
    ...(trace.focusedPrintIds ?? []).map((id) => `card:${id}`)]) : null
  const references = new Map<string, NonNullable<AiEvidenceQueryTrace['references']>[number]>()
  for (const record of archive.records(undefined, selected ? [...selected] : undefined)) {
    if (selected && !selected.has(record.sourceId) || references.has(record.sourceId)) continue
    const data = record.data as { name?: string; printId?: string; sourceUrl?: string;
      deck?: string; date?: string; listUrl?: string }
    if (record.kind === 'card' && data.printId) references.set(record.sourceId, { id: record.sourceId,
      label: data.name ?? data.printId, url: data.sourceUrl ?? null, fingerprint: evidenceHash(record.data) })
    if (record.kind === 'occurrence') references.set(record.sourceId, { id: record.sourceId,
      label: `${data.deck} · ${data.name} · ${data.date}`, url: data.listUrl ?? null, fingerprint: evidenceHash(record.data) })
  }
  trace.references = [...references.values()]
  return trace.references
}
