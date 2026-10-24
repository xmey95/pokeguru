import type { CatalogSyncStatus } from '../../shared/catalog'
import { ActivityStatus } from './Loading'

export function CatalogActivity({ status, requesting, startedAt, onResume }: {
  status: CatalogSyncStatus | null; requesting: boolean; startedAt: number | null; onResume(): void
}) {
  if (!requesting && (!status || status.state === 'idle')) return null
  const pending = requesting && !status?.running
  const paused = !pending && status?.state === 'paused'
  const complete = !pending && status?.state === 'done'
  const operation = status?.mode === 'full' ? 'Scansione completa' : 'Aggiornamento'
  return <ActivityStatus className="catalog-sync-status" startedAt={startedAt}
    state={paused ? 'paused' : complete ? 'complete' : 'working'}
    title={pending ? 'Avvio aggiornamento…' : `${operation}${paused ? ' in pausa' : complete ? status?.mode === 'full' ? ' completata' : ' completato' : ' in corso'}`}
    detail={paused ? 'I dettagli acquisiti sono salvati.' : complete ? 'Le carte acquisite sono disponibili nel catalogo.'
      : status?.expected ? 'Le carte già disponibili restano consultabili.' : 'Ricerca delle carte da aggiornare…'}
    progress={!pending && status?.expected ? { value: status.acquired, total: status.expected, label: 'dettagli acquisiti' } : undefined}>
    {paused && <button type="button" className="text-button" onClick={onResume}>{status?.mode === 'full' ? 'Riprendi scansione' : 'Riprendi'}</button>}
  </ActivityStatus>
}
