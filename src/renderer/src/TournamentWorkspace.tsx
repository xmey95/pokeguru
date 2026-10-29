import { useEffect, useState, type ReactNode } from 'react'
import type { TournamentSyncProgress } from '../../shared/tournament'
import { useNavigation, useViewState } from './Navigation'
import { ActivityStatus, LoadingSkeleton, Spinner } from './Loading'
import { DailySyncNotice } from './DailySyncNotice'

type Progress = Pick<TournamentSyncProgress, 'status' | 'mode' | 'cooldownUntil' | 'lastError' | 'active' | 'stopping' | 'rotationCleanup' | 'daily'>
export const eventDateTime = (value: string) => new Intl.DateTimeFormat('it-IT', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))

export function TournamentWorkspace({ source, loading, count, busy, progress, error, startedAt, progressDetail, progressError, onRefresh, onPause, management, children }: {
  source: 'play' | 'main'; loading: boolean; count: number; busy: boolean; progress: Progress | null; error: string | null
  startedAt: number | null; progressDetail?: string; progressError: string | null
  onRefresh(mode: 'new' | 'full'): Promise<void>; onPause(): Promise<void>; management: ReactNode; children: ReactNode
}) {
  const nav = useNavigation()
  const [open, setOpen] = useViewState(`events.${source}.management`, false)
  const [now, setNow] = useState(Date.now)
  const pending = progress?.status === 'running' || progress?.status === 'rate-limited'
  const active = Boolean(progress?.active)
  const cooldown = progress?.status === 'rate-limited' && progress.cooldownUntil ? Date.parse(progress.cooldownUntil) : 0
  useEffect(() => {
    if (!cooldown || cooldown <= now) return
    const timer = window.setTimeout(() => setNow(Date.now()), Math.max(0, Math.min(cooldown - Date.now() + 100, 2_147_483_647)))
    return () => window.clearTimeout(timer)
  }, [cooldown, now])
  const id = `events-${source}-management`
  function close() {
    setOpen(false)
    document.getElementById(`${id}-trigger`)?.focus()
  }
  return <section className="tournament-section" aria-label={source === 'play' ? 'Evento Limitless Play' : 'Regional Limitless'} data-nav-loading={loading}>
    <div className="panel-heading">
      <div><h1>Eventi</h1><p className="content-note">{loading ? 'Archivio locale' : `${count} ${count === 1 ? 'evento disponibile' : 'eventi disponibili'} offline`}</p></div>
      <div className="catalog-actions">
        <button type="button" className="primary-button" disabled={loading || busy || active}
          onClick={() => void onRefresh(pending ? progress?.mode ?? 'new' : 'new')}>
          {(busy || active) && <Spinner />}{active && cooldown > now ? 'In attesa della fonte…' : busy || active ? 'Acquisizione automatica…' : pending ? 'Riprendi scansione'
            : source === 'play' ? 'Aggiorna nuovi tornei' : 'Aggiorna nuovi Regional'}</button>
        {active && <button type="button" className="secondary-button" disabled={busy || progress?.stopping}
          onClick={() => void onPause()}>{progress?.stopping ? 'Pausa in corso…' : 'Pausa'}</button>}
        <button type="button" id={`${id}-trigger`} className="secondary-button event-management-trigger"
          aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>Gestisci eventi</button>
      </div>
    </div>
    <div className="event-source-bar">
      <div className="discussion-switcher" role="group" aria-label="Fonte tornei">
        <button type="button" className={`secondary-button ${source === 'play' ? 'selected' : ''}`} aria-pressed={source === 'play'}
          onClick={() => nav.visit({ 'events.source': 'play' }, 'Eventi · Play')}>Play online</button>
        <button type="button" className={`secondary-button ${source === 'main' ? 'selected' : ''}`} aria-pressed={source === 'main'}
          onClick={() => nav.visit({ 'events.source': 'main' }, 'Eventi · Regional')}>Regional</button>
      </div>
      <span className="content-note">{source === 'play' ? 'Liste e abbinamenti · Limitless Play' : 'Piazzamenti e liste · Limitless'}</span>
    </div>
    <DailySyncNotice state={progress?.daily} active={progress?.active} />
    {(busy || (progress && progress.status !== 'idle' && (!error || progress.status !== 'complete'))) && <ActivityStatus
      title={progress?.stopping ? 'Pausa al termine della richiesta in corso…' : active && cooldown > now ? 'Limite della fonte raggiunto'
        : busy || active ? 'Acquisizione automatica in corso…' : progress?.status === 'complete' ? 'Scansione completata.'
          : 'Scansione in pausa'}
      state={busy || active ? 'working' : progress?.status === 'complete' ? 'complete' : 'paused'}
      startedAt={startedAt}
      detail={active && cooldown > now ? `Ripresa automatica dopo ${eventDateTime(progress!.cooldownUntil!)}.`
        : busy || active ? 'I blocchi avanzano automaticamente. Gli eventi già archiviati restano consultabili.'
          : progress?.status === 'complete' ? 'Gli eventi acquisiti sono disponibili offline.'
            : 'Premi Riprendi scansione per proseguire dal punto salvato.'}>
      {progressDetail && <p className="activity-detail">{progressDetail}</p>}
    </ActivityStatus>}
    {progressError && <p className="warning-banner" role="status">{progressError}</p>}
    {progress?.lastError && progress.lastError !== error && <p className="diagnostics" role="status">{progress.lastError}</p>}
    {progress?.rotationCleanup && <p className="content-note" role="status">
      Nuova rotazione: {progress.rotationCleanup.removedPlay} snapshot Play e {progress.rotationCleanup.removedMain} Regional eliminati dall’archivio globale; le evidenze già salvate in Strategie e guide restano storiche.
    </p>}
    {error && <div className="error-banner" role="alert">{error}</div>}
    <section id={id} className="catalog-management" aria-labelledby={`${id}-heading`} hidden={!open}
      onKeyDown={(event) => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close() } }}>
      <div className="panel-heading"><h2 id={`${id}-heading`}>Gestione {source === 'play' ? 'Play online' : 'Regional'}</h2>
        <button type="button" className="text-button" onClick={close}>Chiudi gestione</button></div>
      <button type="button" className="secondary-button" onClick={() => void onRefresh('full')} disabled={loading || busy || active || pending}>Scansione completa</button>
      <p className="content-note">{pending ? 'Completa la scansione in corso prima di avviarne un’altra.' : source === 'play'
        ? 'Ricontrolla anche gli eventi Play già acquisiti negli ultimi 90 giorni, con almeno 50 partecipanti.'
        : 'Ricontrolla anche gli eventi già acquisiti con avanzamento automatico.'}</p>
      {management}
    </section>
    {loading ? <LoadingSkeleton label="Caricamento archivio…" /> : children}
  </section>
}

export function TournamentCoverage({ participants, reported, lists, partial, children }: {
  participants: number; reported: number; lists: number; partial: boolean; children: ReactNode
}) {
  return <details className="event-coverage">
    <summary><span className="event-coverage-counts">{participants}/{reported} partecipanti · {lists} {lists === 1 ? 'lista' : 'liste'} da 60</span>
      {partial && <span className="event-partial">Copertura parziale</span>}<span className="event-coverage-label">Copertura e fonti</span></summary>
    {children}
  </details>
}
