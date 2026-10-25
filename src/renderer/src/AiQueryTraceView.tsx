import type { AiEvidenceQueryTrace } from '../../shared/ai-evidence'

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
    return `${value.totalMatches} stampe corrispondenti; ${scope?.indexed ?? '?'} nell’inventario locale su ${scope?.expected ?? '?'} attese, ${scope?.withGameplay ?? '?'} con testo confrontabile.`
  }
  const scope = value.scope as { matchingLists?: number; listsInspected?: number } | undefined
  return `${scope?.matchingLists ?? '?'} liste corrispondenti su ${scope?.listsInspected ?? '?'} liste complete locali esaminate.`
}

export function AiQueryTraceView({ trace }: { trace: AiEvidenceQueryTrace }) {
  return <details className="ai-query-trace"><summary>Query automatiche al motore · {trace.requests.length}</summary>
    <p>{trace.planningRounds} {trace.planningRounds === 1 ? 'passaggio' : 'passaggi'} di scelta · {trace.responseBytes.toLocaleString('it-IT')} byte di risultati · {Math.round(trace.durationMs / 1000)} s.
      {trace.exhausted ? ' Limite di query o di risposta raggiunto.' : ''}</p>
    {trace.plannerUsage && <p>Token per scegliere le query: {trace.plannerUsage.inputTokens} input ({trace.plannerUsage.cachedInputTokens} dalla cache), {trace.plannerUsage.outputTokens} output.</p>}
    <p>Le ricerche sono state eseguite sui dati locali. Una corrispondenza testuale non dimostra che tutte le carte pertinenti siano state trovate.</p>
    <ol>{trace.requests.map((item, index) => <li key={`${item.fingerprint}:${index}`}>
      <strong>{queryLabel(item.query)}</strong> · {item.status === 'rejected' ? 'rifiutata' : 'eseguita'}.
      <span> {resultLabel(item.data)}</span>
      {item.sourceIds.length > 0 && <small> Fonti ricevute: {item.sourceIds.join(', ')}.</small>}
    </li>)}</ol>
  </details>
}
