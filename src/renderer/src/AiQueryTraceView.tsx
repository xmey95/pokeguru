import { useState } from 'react'
import type { AiEvidenceQueryResult, AiEvidenceQueryTrace } from '../../shared/ai-evidence'

function ArchivedQuery({ trace, query }: { trace: AiEvidenceQueryTrace; query: AiEvidenceQueryResult }) {
  const [page, setPage] = useState<number | null>(null)
  const [content, setContent] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const count = (query.data as { pages?: number }).pages ?? 0
  async function load(sequence: number) {
    if (!trace.archive || loading) return
    setLoading(true); setError('')
    try {
      const { projectId, resourceId, jobId } = trace.archive
      const result = await window.projectsApi.getAiEvidencePage(projectId, resourceId, jobId, query.fingerprint, sequence)
      if (!result.ok) throw new Error(result.error)
      if (!result.value) throw new Error('Pagina delle prove non trovata.')
      setContent(JSON.stringify(result.value, null, 2)); setPage(sequence)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Prove non disponibili.') }
    finally { setLoading(false) }
  }
  if (!count) return null
  return <details><summary>Dati originali archiviati · {count} pagine</summary>
    {page === null ? <button type="button" disabled={loading} onClick={() => void load(0)}>
      {loading ? 'Caricamento…' : 'Apri la prima pagina'}</button> : <>
      <p>Pagina {page + 1} di {count} · dati conservati al momento della ricerca.</p>
      <button type="button" disabled={loading || page === 0} onClick={() => void load(page - 1)}>Pagina precedente</button>
      <button type="button" disabled={loading || page + 1 >= count} onClick={() => void load(page + 1)}>Pagina successiva</button>
      <textarea aria-label="Dati originali della ricerca" readOnly rows={12} value={content} />
    </>}
    {error && <p role="alert">{error}</p>}
  </details>
}

function queryLabel(value: unknown): string {
  if (!value || typeof value !== 'object') return String(value)
  const query = value as Record<string, unknown>
  if (query.operation === 'catalog.search') return `Catalogo · ${[
    ...(Array.isArray(query.terms) ? query.terms : []),
    ...(Array.isArray(query.printIds) ? query.printIds : []),
    ...(Array.isArray(query.identityIds) ? query.identityIds : [])].join(', ')}`
  if (query.operation === 'events.search') return `Liste Eventi · ${[
    query.deckName, query.cardName].filter(Boolean).join(' / ')}`
  return 'Query rifiutata'
}

function resultLabel(data: unknown): string {
  if (!data || typeof data !== 'object') return 'Risultato non leggibile.'
  const value = data as Record<string, unknown>
  if (typeof value.error === 'string') return value.error
  if (typeof value.totalMatches === 'number') {
    const scope = value.scope as { indexed?: number; expected?: number;
      withGameplay?: number } | undefined
    return `${value.totalMatches} stampe corrispondenti; ${value.remaining ?? '?'} ancora nella ricerca. ${scope?.indexed ?? '?'} nell’inventario locale su ${scope?.expected ?? '?'} attese, ${scope?.withGameplay ?? '?'} con testo confrontabile.`
  }
  const scope = value.scope as { matchingLists?: number; listsInspected?: number } | undefined
  return `${scope?.matchingLists ?? '?'} liste corrispondenti su ${scope?.listsInspected ?? '?'} liste complete locali esaminate; ${value.remaining ?? '?'} ancora nella ricerca.`
}

export function AiQueryTraceView({ trace }: { trace: AiEvidenceQueryTrace }) {
  const targets = trace.cardTargets ?? []
  const supplied = targets.filter((item) => item.status === 'supplied').length
  return <details className="ai-query-trace"><summary>Query automatiche al motore · {trace.requests.length}</summary>
    <p>{trace.planningRounds} {trace.planningRounds === 1 ? 'passaggio' : 'passaggi'} di scelta · {trace.responseBytes.toLocaleString('it-IT')} byte di risultati · {Math.round(trace.durationMs / 1000)} s.
      {trace.exhausted ? ' Limite di query o di risposta raggiunto.' : ''}</p>
    {trace.plannerUsage && <p>Token per scegliere le query: {trace.plannerUsage.inputTokens} input ({trace.plannerUsage.cachedInputTokens} dalla cache), {trace.plannerUsage.outputTokens} output.</p>}
    <p>Le ricerche sono state eseguite sui dati locali. Una corrispondenza testuale non dimostra che tutte le carte pertinenti siano state trovate.</p>
    {targets.length > 0 && <details><summary>Schede nominate riconosciute nel Catalogo · {supplied}/{targets.length} consegnate con testo confrontabile</summary>
      <ul>{targets.map((item) => <li key={item.name}>{item.name}: {item.status === 'supplied'
        ? 'testo consegnato' : item.status === 'missing-gameplay'
          ? 'scheda acquisita, testo di gioco incompleto' : 'testo non consegnato'}</li>)}</ul>
    </details>}
    <ol>{trace.requests.map((item, index) => <li key={`${item.fingerprint}:${index}`}>
      <strong>{queryLabel(item.query)}</strong> · {item.status === 'rejected' ? 'rifiutata' : 'eseguita'}.
      <span> {resultLabel(item.data)}</span>
      {item.sourceIds.length > 0 && <small> Fonti ricevute: {item.sourceIds.join(', ')}.</small>}
      {trace.archive && <ArchivedQuery trace={trace} query={item} />}
    </li>)}</ol>
  </details>
}
