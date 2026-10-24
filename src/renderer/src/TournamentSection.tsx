import { useEffect, useMemo, useState } from 'react'
import type { TournamentParticipation, TournamentSnapshot, TournamentSummary, TournamentSyncProgress } from '../../shared/tournament'
import { MainTournamentSection } from './MainTournamentSection'
import { useNavigation, useViewState } from './Navigation'
import { TournamentCoverage, TournamentWorkspace } from './TournamentWorkspace'
import { TournamentDeck } from './TournamentDeck'
import { SearchEmpty } from './SearchEmpty'

function dateTime(value: string): string {
  return new Intl.DateTimeFormat('it-IT', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

export function TournamentSection() {
  const nav = useNavigation()
  const [sourceTab] = useViewState<'play' | 'main'>('events.source', 'play')
  const [loading, setLoading] = useState(true)
  const [snapshot, setSnapshot] = useState<TournamentSnapshot | null>(null)
  const [events, setEvents] = useState<TournamentSummary[]>([])
  const [progress, setProgress] = useState<TournamentSyncProgress | null>(null)
  const [selectedEventId, setSelectedEventId] = useViewState<string | null>('events.play.event', null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useViewState('events.play.query', '')
  const [selectedId, setSelectedId] = useViewState<string | null>('events.play.player', null)

  useEffect(() => {
    let active = true
    void Promise.all([window.projectsApi.listTournaments(), window.projectsApi.getTournamentSync()])
      .then(async ([listed, synced]) => {
        if (!active) return
        if (!listed.ok) throw new Error(listed.error)
        if (!synced.ok) throw new Error(synced.error)
        setEvents(listed.value)
        setProgress(synced.value)
        const first = selectedEventId ? listed.value.find((item) => item.eventId === selectedEventId) : listed.value[0]
        if (selectedEventId && !first) setError('Questo evento non è più disponibile. Scegli un altro evento oppure torna indietro.')
        if (first) {
          const result = await window.projectsApi.getTournamentEvent(first.eventId)
          if (active) {
            if (!result.ok) throw new Error(result.error)
            setSnapshot(result.value); setSelectedEventId(first.eventId)
          }
        }
      }).catch(() => { if (active) setError('Archivio tornei non leggibile.') }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  async function selectEvent(eventId: string): Promise<void> {
    setError(null)
    const result = await window.projectsApi.getTournamentEvent(eventId)
    if (!nav.isCurrent()) return
    if (!result.ok) { setError(result.error); return }
    setSnapshot(result.value)
    setSelectedEventId(eventId)
    setSelectedId(null)
  }

  async function refresh(mode: 'new' | 'full'): Promise<void> {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const result = await window.projectsApi.syncTournaments(mode)
      if (!nav.isCurrent()) return
      if (!result.ok) throw new Error(result.error)
      setProgress(result.value)
      const listed = await window.projectsApi.listTournaments()
      if (!nav.isCurrent()) return
      if (!listed.ok) throw new Error(listed.error)
      setEvents(listed.value)
      const next = listed.value.find((item) => item.eventId === selectedEventId) ?? listed.value[0]
      if (next) await selectEvent(next.eventId)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Aggiornamento evento non riuscito.')
    } finally { setBusy(false) }
  }

  async function openSource(): Promise<void> {
    if (!snapshot) return
    const result = await window.projectsApi.openTournament(snapshot.publicUrl)
    if (!result.ok) setError(result.error)
  }

  const sorted = useMemo(() => [...(snapshot?.participations ?? [])].sort((a, b) =>
    (a.placing ?? Number.MAX_SAFE_INTEGER) - (b.placing ?? Number.MAX_SAFE_INTEGER) ||
    a.playerName.localeCompare(b.playerName)), [snapshot])
  const filtered = sorted.filter((entry) => `${entry.playerName} ${entry.deck?.name ?? ''}`.toLocaleLowerCase()
    .includes(query.toLocaleLowerCase()))
  const selected: TournamentParticipation | null = filtered.find((entry) => entry.playerId === selectedId) ??
    filtered.find((entry) => entry.listStatus === 'available') ?? filtered[0] ?? null

  if (sourceTab === 'main') return <MainTournamentSection />
  return <TournamentWorkspace source="play" count={events.length} loading={loading} busy={busy} progress={progress} error={error}
    onRefresh={refresh} management={<>
      {progress && progress.status !== 'idle' && <p className="content-note">{progress.inspected} eventi controllati · {progress.saved} archiviati · {progress.skipped} fuori perimetro · prossima pagina {progress.page}.</p>}
      <p className="content-note">Ogni blocco acquisisce fino a tre eventi pubblici Standard senza regole speciali. L’aggiornamento cerca nuovi tornei dall’ultima scansione; al primo avvio, negli ultimi 90 giorni. La scansione completa percorre anche le pagine precedenti.</p>
    </>}>
    {events.length > 0 && <div className="catalog-filters event-filters"><label>Evento archiviato
        <select value={selectedEventId ?? ''} onChange={(event) => nav.visit({ 'events.play.event': event.target.value, 'events.play.player': null }, `Eventi · ${events.find((item) => item.eventId === event.target.value)?.name ?? 'Play'}`)}>
          {!events.some((item) => item.eventId === selectedEventId) && <option value={selectedEventId ?? ''} disabled>Scegli un evento</option>}
          {events.map((item) => <option key={item.eventId} value={item.eventId}>
            {new Date(item.date).toLocaleDateString('it-IT')} · {item.name} · {item.isOnline ? 'online' : 'in presenza'}
          </option>)}
        </select></label><label>Filtra giocatore o mazzo<input id="event-play-query" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Es. Dragapult" /></label></div>}
    {!loading && !snapshot ? <div className="matchup-empty">{events.length ? 'Seleziona un evento disponibile.' : 'Nessun evento salvato. Aggiorna nuovi tornei per iniziare.'}</div> : snapshot && <>
      {snapshot.circuit !== 'WESTERN' && <p className="diagnostics" role="status">Evento in presenza · circuito da verificare.</p>}
      <TournamentCoverage participants={snapshot.coverage.returnedParticipants} reported={snapshot.reportedPlayers} lists={snapshot.coverage.complete60Lists}
        partial={snapshot.coverage.returnedParticipants < snapshot.reportedPlayers || snapshot.coverage.complete60Lists < snapshot.coverage.returnedParticipants}>
        <div className="meta-provenance">
          <strong>{snapshot.name}</strong>
          <span>{dateTime(snapshot.date)} · {snapshot.isOnline ? 'PTCGL online' : 'in presenza'} · {snapshot.circuit === 'WESTERN' ? 'Standard occidentale' : 'circuito da verificare'} · {snapshot.source}</span>
          <span>{snapshot.cached ? 'Snapshot locale' : 'Acquisito ora'}: {dateTime(snapshot.fetchedAt)}</span>
          <button type="button" className="text-button" onClick={() => void openSource()}>Apri fonte ↗</button>
        </div>
        <p className="content-note" data-testid="tournament-coverage">{snapshot.coverage.availableLists}/{snapshot.coverage.returnedParticipants} liste leggibili; {snapshot.coverage.missingLists} assenti, {snapshot.coverage.invalidLists} non interpretabili. Partecipazioni e liste identiche restano record separati; le carte conservano codice e numero della fonte.</p>
        <p className="content-note">Fasi: {snapshot.phases.map((phase) => `${phase.type} ${phase.rounds} round ${phase.mode}`).join(' · ') || 'non indicate'}. I risultati sono dei partecipanti; nessun winrate del tuo mazzo è inferito.</p>
        <p className="content-note">{snapshot.pairingCoverage ? `Abbinamenti: ${snapshot.pairingCoverage.decided} vittorie attribuibili e ${snapshot.pairingCoverage.tied} pareggi su ${snapshot.pairingCoverage.betweenParticipants} partite fra partecipanti identificati; ${snapshot.pairingCoverage.byes} bye e ${snapshot.pairingCoverage.invalid} righe non interpretabili.` : 'Abbinamenti non acquisiti.'} I record dei partecipanti non sono usati per inventare abbinamenti.</p>
      </TournamentCoverage>
      <div className="tournament-layout">
        {!filtered.length ? <SearchEmpty focusId="event-play-query" onReset={query ? () => setQuery('') : undefined}>Nessun giocatore o mazzo corrisponde al filtro.</SearchEmpty> : <>
        <div className="tournament-players" aria-label="Partecipazioni evento">
          {filtered.map((entry) => <button type="button" key={entry.playerId}
            className={selected?.playerId === entry.playerId ? 'active' : ''}
            onClick={() => nav.visit({ 'events.play.player': entry.playerId }, `Eventi · ${snapshot.name} · ${entry.playerName}`)} aria-pressed={selected?.playerId === entry.playerId}>
            <strong>{entry.placing ? `${entry.placing}° · ` : ''}{entry.playerName}</strong>
            <span>{entry.deck?.name ?? 'Archetipo non indicato'} · {entry.listStatus === 'available' ? `${entry.cardTotal} carte` : 'Lista non disponibile'}</span>
          </button>)}
        </div>
        <div className="tournament-detail">
          {selected ? <>
            <h2>{selected.playerName}</h2>
            <p className="content-note">{selected.deck?.name ?? 'Archetipo non indicato'} · {selected.placing ? `${selected.placing}° posto` : 'Piazzamento non indicato'} · {selected.record ? `${selected.record.wins}V / ${selected.record.losses}S / ${selected.record.ties}P` : 'Record non indicato'}</p>
            {selected.listStatus !== 'available' ? <p className="content-note">Lista {selected.listStatus === 'missing' ? 'assente' : 'non interpretabile'} nella risposta pubblica.</p> : <TournamentDeck cards={selected.cards} />}
          </> : null}
        </div></>}
      </div>
    </>}
  </TournamentWorkspace>
}
