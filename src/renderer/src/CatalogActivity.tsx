import type { CatalogSyncStatus } from '../../shared/catalog'
import { ActivityStatus } from './Loading'

export function CatalogActivity({ status, requesting, controlling, startedAt, onResume, onPause, onCancel }: {
  status: CatalogSyncStatus | null; requesting: boolean; controlling: boolean; startedAt: number | null
  onResume(): void; onPause(): void; onCancel(): void
}) {
  if (!requesting && (!status || status.state === 'idle')) return null
  const pending = requesting && !status?.running
  const recoverable = status?.state === 'paused' || status?.state === 'interrupted' ||
    (status?.state === 'rate-limited' && !status.running)
  const waiting = status?.state === 'rate-limited'
  const complete = !pending && status?.state === 'done'
  const operation = status?.mode === 'full' ? 'Scansione completa' : 'Aggiornamento'
  const feminine = status?.mode === 'full'
  const cooldown = status?.cooldownUntil && Number.isFinite(Date.parse(status.cooldownUntil))
    ? new Date(status.cooldownUntil).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' }) : null
  const title = pending ? 'Avvio aggiornamento…'
    : status?.state === 'cancelled' ? `${operation} ${feminine ? 'annullata' : 'annullato'}`
      : status?.state === 'interrupted' ? `${operation} ${feminine ? 'interrotta' : 'interrotto'}`
        : status?.state === 'paused' ? `${operation} in pausa`
          : waiting ? status.running ? `${status.phase} · ripresa automatica` : `${operation} in attesa`
            : complete ? `${operation} ${feminine ? 'completata' : 'completato'}` : `${operation} in corso`
  const detail = waiting ? `${cooldown ? `Nuovo tentativo dalle ${cooldown}. ` : ''}${status.running
    ? 'La scansione riprenderà automaticamente in questa sessione.' : 'Premi Riprendi per proseguire dal punto salvato.'}`
    : recoverable ? 'I dettagli acquisiti sono salvati. Premi Riprendi per proseguire.'
      : status?.state === 'cancelled' ? 'I dettagli acquisiti restano nel catalogo. Puoi avviare un nuovo aggiornamento.'
        : complete ? 'Le carte acquisite sono disponibili nel catalogo.'
          : status?.phase.startsWith('Ultimo blocco:') ? status.phase
            : status?.expected ? 'Le carte già disponibili restano consultabili.' : 'Ricerca delle carte da aggiornare…'
  return <ActivityStatus className="catalog-sync-status" startedAt={startedAt}
    state={recoverable || status?.state === 'cancelled' ? 'paused' : complete ? 'complete' : 'working'}
    title={title} detail={detail}
    progress={!pending && status?.expected ? { value: status.acquired, total: status.expected, label: 'dettagli acquisiti' } : undefined}>
    {(recoverable || status?.running) && <div className="catalog-sync-controls">
      {recoverable && <button type="button" className="text-button" onClick={onResume} disabled={requesting || controlling}>
        {status?.mode === 'full' ? 'Riprendi scansione' : 'Riprendi'}
      </button>}
      {status?.running && <button type="button" className="text-button" onClick={onPause} disabled={requesting || controlling}>Metti in pausa</button>}
      <button type="button" className="text-button" onClick={onCancel} disabled={requesting || controlling}>Annulla aggiornamento</button>
    </div>}
  </ActivityStatus>
}
