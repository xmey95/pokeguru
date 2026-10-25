import { useEffect, useMemo, useState } from 'react'
import type { MainTournamentSnapshot, MainTournamentSummary, MainTournamentSyncProgress } from '../../shared/main-tournament'
import { useNavigation, useViewState, useBusyState, useBusyStartedAt, useDraftState } from './Navigation'
import { useProgressPoll } from './useProgressPoll'
import { eventDateTime, TournamentCoverage, TournamentWorkspace } from './TournamentWorkspace'
import { TournamentDeck } from './TournamentDeck'
import { SearchEmpty } from './SearchEmpty'

const date = (value: string): string => new Intl.DateTimeFormat('it-IT', { dateStyle: 'medium' }).format(new Date(value))

export function MainTournamentSection() {
  const nav = useNavigation()
  const [loading, setLoading] = useState(true)
  const [events, setEvents] = useState<MainTournamentSummary[]>([])
  const [snapshot, setSnapshot] = useState<MainTournamentSnapshot | null>(null)
  const [progress, setProgress] = useState<MainTournamentSyncProgress | null>(null)
  const [selectedEventId, setSelectedEventId] = useViewState<string | null>('events.main.event', null)
  const [selectedPlace, setSelectedPlace] = useViewState<number | null>('events.main.place', null)
  const [query, setQuery] = useViewState('events.main.query', '')
  const [busy, setBusy] = useBusyState('events.main.sync')
  const startedAt = useBusyStartedAt('events.main.sync')
  const [error, setError] = useDraftState<string | null>('events.main.error', null)
  const progressError = useProgressPoll(busy || Boolean(progress?.active), window.projectsApi.getMainTournamentSync, setProgress)
  const unavailableEvents = progress?.unavailableEvents ?? []
  const unavailableLists = progress?.unavailableLists ?? []

  useEffect(() => {
    let active = true
    void Promise.all([window.projectsApi.listMainTournaments(), window.projectsApi.getMainTournamentSync()])
      .then(async ([listed, synced]) => {
        if (!active) return
        if (!listed.ok) throw new Error(listed.error)
        if (!synced.ok) throw new Error(synced.error)
        setEvents(listed.value)
        setProgress(synced.value)
        const chosen = selectedEventId ? listed.value.find((item) => item.eventId === selectedEventId) : listed.value[0]
        if (selectedEventId && !chosen) setError('Questo Regional non è più disponibile. Scegli un altro evento oppure torna indietro.')
        if (chosen) {
          const result = await window.projectsApi.getMainTournament(chosen.eventId)
          if (active) {
            if (!result.ok) throw new Error(result.error)
            setSnapshot(result.value); setSelectedEventId(chosen.eventId)
          }
        } else { setSnapshot(null); setSelectedEventId(null); setSelectedPlace(null) }
      }).catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : 'Archivio Regional non leggibile.') }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [busy, progress?.inspectedEvents, Math.floor((progress?.fetchedLists ?? 0) / 8), progress?.status])

  async function choose(eventId: string): Promise<void> {
    const result = await window.projectsApi.getMainTournament(eventId)
    if (!nav.isCurrent()) return
    if (!result.ok) { setError(result.error); return }
    setSnapshot(result.value)
    setSelectedEventId(eventId)
    setSelectedPlace(null)
  }

  async function sync(mode: 'new' | 'full'): Promise<void> {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const result = await window.projectsApi.syncMainTournaments(mode)
      if (!nav.isCurrent()) return
      if (!result.ok) throw new Error(result.error)
      setProgress(result.value)
      const listed = await window.projectsApi.listMainTournaments()
      if (!nav.isCurrent()) return
      if (!listed.ok) throw new Error(listed.error)
      setEvents(listed.value)
      const chosen = listed.value.find((item) => item.eventId === selectedEventId) ?? listed.value[0]
      if (chosen) await choose(chosen.eventId)
      else { setSnapshot(null); setSelectedEventId(null); setSelectedPlace(null) }
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Aggiornamento Regional non riuscito.') }
    finally { setBusy(false) }
  }

  async function pause(): Promise<void> {
    const result = await window.projectsApi.pauseMainTournamentSync()
    if (!nav.isCurrent()) return
    if (result.ok) setProgress(result.value)
    else setError(result.error)
  }

  async function openSource(url: string): Promise<void> {
    const result = await window.projectsApi.openMainTournament(url)
    if (!result.ok) setError(result.error)
  }

  const sorted = useMemo(() => [...(snapshot?.participants ?? [])].sort((a, b) => a.placing - b.placing), [snapshot])
  const distinctLists = useMemo(() => new Set(snapshot?.participants.filter((item) =>
    item.cards && item.listId).map((item) => item.listId) ?? []).size, [snapshot])
  const filtered = sorted.filter((item) => `${item.playerName} ${item.deckName ?? ''}`.toLowerCase().includes(query.toLowerCase()))
  const selected = filtered.find((item) => item.placing === selectedPlace && selectedPlace !== null) ??
    filtered.find((item) => item.cards && item.cardTotal === 60) ?? filtered[0]

  return <TournamentWorkspace source="main" count={events.length} loading={loading} busy={busy} progress={progress} error={error}
    startedAt={startedAt} progressError={progressError} progressDetail={progress ?
      `${progress.scannedPages ?? 0}/${progress.maxPages ?? '…'} pagine · ${progress.inspectedEvents} tornei acquisiti · ${progress.fetchedLists} liste scaricate` : undefined}
    onRefresh={sync} onPause={pause} management={<>
      {progress && progress.status !== 'idle' && <div className="content-note" role="status">
        <p>Rotazione Standard occidentale dal {progress.rotationStart ? date(progress.rotationStart) : 'periodo non noto'} · indice {progress.scannedPages ?? 0}/{progress.maxPages ?? '…'} pagine lette.</p>
        <p>Righe esaminate: {progress.indexedRows ?? 0} · Tornei eleggibili nel periodo: {progress.eligibleEvents ?? 0} · Non eleggibili: {progress.ineligibleEvents ?? 0} · Fuori rotazione: {progress.outsideRotationEvents ?? 0} · Righe non leggibili: {progress.unavailableIndexRows ?? 0}.</p>
        <p>Tornei acquisiti: {progress.inspectedEvents} · Già archiviati: {progress.alreadyAcquiredEvents ?? 0} · Tornei non disponibili: {unavailableEvents.length} · In coda: {progress.pendingEvents.length} tornei e {progress.pendingLists.length} liste · Liste non disponibili: {unavailableLists.length}.</p>
        {unavailableEvents.length > 0 && <details><summary>Tornei non disponibili ({unavailableEvents.length})</summary><ul>
          {unavailableEvents.map((item) => <li key={item.eventId}>{item.name} · {date(item.date)} · <button type="button" className="text-button" onClick={() => void openSource(item.url)}>Apri fonte ↗</button></li>)}
        </ul></details>}
        {progress.status === 'complete' && <p>{unavailableEvents.length || unavailableLists.length || progress.unavailableIndexRows
          ? 'Scansione terminata con lacune: Aggiorna nuovi ritenta i tornei, Scansione completa ritenta anche le liste.'
          : 'Scansione del periodo completata per l’indice consultato.'}</p>}
      </div>}
      <p className="content-note">La scansione avanza automaticamente fino alla fine dell’indice nella rotazione corrente, in blocchi di 7 richieste. Restano almeno 1,2 secondi fra richieste reali e un massimo di 16 liste rappresentative per torneo. Scansione completa ricontrolla anche i tornei già archiviati.</p>
    </>}>
    {events.length > 0 && <div className="catalog-filters event-filters"><label>Evento archiviato
        <select value={selectedEventId ?? ''} onChange={(event) => nav.visit({ 'events.main.event': event.target.value, 'events.main.place': null }, `Eventi · ${events.find((item) => item.eventId === event.target.value)?.name ?? 'Regional'}`)}>
          {!events.some((item) => item.eventId === selectedEventId) && <option value={selectedEventId ?? ''} disabled>Scegli un evento</option>}
          {events.map((item) => <option value={item.eventId} key={item.eventId}>{date(item.date)} · {item.name}</option>)}
        </select></label><label>Filtra giocatore o mazzo<input id="event-main-query" value={query}
        onChange={(event) => setQuery(event.target.value)} placeholder="Es. Hydrapple" /></label></div>}
    {!loading && !snapshot ? <div className="matchup-empty">{events.length ? 'Seleziona un evento disponibile.' : 'Nessun Regional archiviato. Aggiorna nuovi Regional per iniziare.'}</div> : snapshot && <>
      <TournamentCoverage participants={snapshot.coverage.returnedParticipants} reported={snapshot.players} lists={snapshot.coverage.complete60Lists}
        partial={snapshot.coverage.returnedParticipants < snapshot.players || snapshot.coverage.complete60Lists < snapshot.coverage.returnedParticipants}>
        <div className="meta-provenance"><strong>{snapshot.name}</strong>
          <span>{date(snapshot.date)} · {snapshot.country} · Standard occidentale</span>
          <span>Acquisito {eventDateTime(snapshot.fetchedAt)} · Limitless tournament database</span>
          <button type="button" className="text-button" onClick={() => void openSource(snapshot.url)}>Apri evento ↗</button></div>
        <p className="content-note">{snapshot.coverage.returnedParticipants}/{snapshot.players} partecipanti dichiarati appaiono nella pagina risultati; {snapshot.coverage.listedDecks} righe con un mazzo, {distinctLists} liste distinte acquisite per {snapshot.coverage.fetchedLists} partecipazioni, {snapshot.coverage.noListLink} righe senza collegamento lista. I link delle altre liste restano disponibili nella fonte.</p>
        <p className="content-note">La pagina non fornisce abbinamenti. I piazzamenti non misurano la percentuale di vittoria di un matchup.</p>
      </TournamentCoverage>
      <div className="tournament-layout">
      {!filtered.length ? <SearchEmpty focusId="event-main-query" onReset={query ? () => setQuery('') : undefined}>Nessun giocatore o mazzo corrisponde al filtro.</SearchEmpty> : <>
      <div className="tournament-players" aria-label="Piazzamenti Regional">
        {filtered.map((item) => <button type="button" key={`${item.placing}:${item.playerName}`}
          className={selected === item ? 'active' : ''} aria-pressed={selected === item} onClick={() => nav.visit({ 'events.main.place': item.placing }, `Eventi · ${snapshot.name} · ${item.playerName}`)}>
          <strong>{item.placing}° · {item.playerName}</strong><span>{item.deckName ?? 'Archetipo non indicato'} · {item.cards ? `${item.cardTotal} carte${item.cardTotal !== 60 ? ' · incompleta' : ''}${item.listUnavailable ? ' · fonte non disponibile' : ''}` : item.listUnavailable ? 'Lista non disponibile' : item.listUrl ? 'Lista da acquisire' : 'Nessuna lista'}</span>
        </button>)}
      </div><div className="tournament-detail">{selected ? <>
        <h2>{selected.playerName}</h2><p className="content-note">{selected.placing}° · {selected.deckName ?? 'Archetipo non indicato'}</p>
        {selected.listUrl && <button type="button" className="text-button" onClick={() => void openSource(selected.listUrl!)}>Apri lista originale ↗</button>}
        {selected.cards ? <>{selected.listUnavailable && <p className="content-note">Lista conservata in cache; la fonte non era disponibile all’ultima scansione.</p>}<TournamentDeck cards={selected.cards} source="main" /></> : <p className="content-note">{selected.listUnavailable ? 'Lista non disponibile alla scansione. Puoi riprovare con Scansione completa o consultare la fonte.' : selected.listUrl ? 'Lista da acquisire. Puoi consultare la lista originale online.' : 'Lista non pubblicata dalla fonte.'}</p>}
      </> : null}</div></>}
      </div>
    </>}
  </TournamentWorkspace>
}
