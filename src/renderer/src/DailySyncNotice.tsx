import type { DailySyncState } from '../../shared/daily-sync'

const when = (value: string) => new Intl.DateTimeFormat('it-IT', {
  dateStyle: 'medium', timeStyle: 'short'
}).format(new Date(value))

export function DailySyncNotice({ state, active = false }: { state?: DailySyncState; active?: boolean }) {
  if (!state || state.outcome === 'idle') return null
  const last = state.lastSuccessAt ? `Ultimo aggiornamento riuscito: ${when(state.lastSuccessAt)}.`
    : 'Nessun aggiornamento completo salvato.'
  const automatic = state.trigger === 'automatic'
  const message = state.outcome === 'running'
    ? !active ? 'Ultimo tentativo interrotto alla chiusura.'
      : automatic ? 'Aggiornamento giornaliero in background in corso.' : 'Aggiornamento manuale in corso.'
    : state.outcome === 'success'
      ? automatic ? 'Aggiornamento giornaliero in background completato.'
        : state.trigger === 'manual' ? 'Aggiornamento manuale completato.' : 'Ultimo aggiornamento completato.'
      : state.outcome === 'paused' ? 'Aggiornamento in pausa su richiesta.'
        : state.outcome === 'rate-limited' ? 'La fonte ha limitato l’aggiornamento in background.'
        : automatic ? 'Aggiornamento giornaliero in background non riuscito.' : 'Aggiornamento non riuscito.'
  return <p className="content-note" role="status">{message} {last}
    {state.error && (state.outcome === 'failed' || state.outcome === 'rate-limited') ? ` ${state.error}` : ''}
    {state.nextAttemptAt && !active ? ` Nuovo tentativo automatico non prima del ${when(state.nextAttemptAt)}.` : ''}
  </p>
}
