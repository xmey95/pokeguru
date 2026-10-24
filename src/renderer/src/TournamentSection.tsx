import { useEffect, useMemo, useState } from 'react'
import type { TournamentParticipation, TournamentSnapshot, TournamentSummary, TournamentSyncProgress } from '../../shared/tournament'
import { MainTournamentSection } from './MainTournamentSection'

function dateTime(value: string): string {
  return new Intl.DateTimeFormat('it-IT', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

export function TournamentSection() {
  const [sourceTab, setSourceTab] = useState<'play' | 'main'>('play')
  const [snapshot, setSnapshot] = useState<TournamentSnapshot | null>(null)
  const [events, setEvents] = useState<TournamentSummary[]>([])
  const [progress, setProgress] = useState<TournamentSyncProgress | null>(null)
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    void Promise.all([window.projectsApi.listTournaments(), window.projectsApi.getTournamentSync()])
      .then(async ([listed, synced]) => {
        if (!active) return
        if (!listed.ok) throw new Error(listed.error)
        if (!synced.ok) throw new Error(synced.error)
        setEvents(listed.value)
        setProgress(synced.value)
        const first = listed.value[0]
        if (first) {
          const result = await window.projectsApi.getTournamentEvent(first.eventId)
          if (active && result.ok) { setSnapshot(result.value); setSelectedEventId(first.eventId) }
        }
      }).catch(() => { if (active) setError('Archivio tornei non leggibile.') })
    return () => { active = false }
  }, [])

  async function selectEvent(eventId: string): Promise<void> {
    setError(null)
    const result = await window.projectsApi.getTournamentEvent(eventId)
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
      if (!result.ok) throw new Error(result.error)
      setProgress(result.value)
      const listed = await window.projectsApi.listTournaments()
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
  const selected: TournamentParticipation | null = sorted.find((entry) => entry.playerId === selectedId) ??
    sorted.find((entry) => entry.listStatus === 'available') ?? sorted[0] ?? null

  return <><div className="discussion-switcher" aria-label="Fonte tornei">
    <button type="button" className={`secondary-button ${sourceTab === 'play' ? 'selected' : ''}`}
      onClick={() => setSourceTab('play')}>Tornei Play</button>
    <button type="button" className={`secondary-button ${sourceTab === 'main' ? 'selected' : ''}`}
      onClick={() => setSourceTab('main')}>Regional</button>
  </div>{sourceTab === 'main' ? <MainTournamentSection /> : <section className="tournament-section" aria-label="Evento Limitless Play">
    <div className="panel-heading">
      <div><span className="eyebrow">Tornei · archivio globale</span><h1>Eventi Standard</h1></div>
      <div className="panel-actions">{progress?.status === 'running' || progress?.status === 'rate-limited'
        ? <button type="button" className="primary-button" onClick={() => void refresh(progress.mode ?? 'new')}
          disabled={busy || (progress.status === 'rate-limited' && !!progress.cooldownUntil && Date.parse(progress.cooldownUntil) > Date.now())}>
          {busy ? 'Acquisizione…' : 'Continua blocco'}</button>
        : <><button type="button" className="primary-button" onClick={() => void refresh('new')} disabled={busy}>
          {busy ? 'Acquisizione…' : 'Aggiorna nuovi tornei'}</button>
          <button type="button" className="secondary-button" onClick={() => void refresh('full')} disabled={busy}>Scansione completa</button></>}</div>
    </div>
    <p className="content-note">I tornei Limitless Play sono archiviati per l'app. I Regional del database principale sono nella scheda accanto.</p>
    {progress && progress.status !== 'idle' && <p className="content-note" role="status">
      {progress.status === 'complete' ? 'Scansione completata' : progress.status === 'rate-limited'
        ? `Limite API raggiunto; riprendi dopo ${progress.cooldownUntil ? dateTime(progress.cooldownUntil) : 'la pausa'}`
        : 'Scansione da continuare'} · {progress.inspected} eventi controllati, {progress.saved} archiviati,
      {progress.skipped} fuori perimetro · prossima pagina {progress.page}.
      {progress.lastError ? ` Ultimo problema: ${progress.lastError}` : ''}</p>}
    {error && <div className="error-banner" role="alert">{error}</div>}
    {!snapshot ? <div className="matchup-empty">Nessun evento salvato.</div> : <>
      <div className="catalog-filters"><label>Evento archiviato
        <select value={selectedEventId ?? snapshot.eventId} onChange={(event) => void selectEvent(event.target.value)}>
          {events.map((item) => <option key={item.eventId} value={item.eventId}>
            {new Date(item.date).toLocaleDateString('it-IT')} · {item.name} · {item.isOnline ? 'online' : 'in presenza'}
          </option>)}
        </select></label><span className="content-note">{events.length} eventi disponibili offline</span></div>
      <div className="meta-provenance">
        <strong>{snapshot.name}</strong>
        <span>{dateTime(snapshot.date)} · {snapshot.isOnline ? 'PTCGL online' : 'in presenza'} · {snapshot.circuit === 'WESTERN' ? 'Standard occidentale' : 'circuito da verificare'} · {snapshot.source}</span>
        <span>{snapshot.cached ? 'Snapshot locale' : 'Acquisito ora'}: {dateTime(snapshot.fetchedAt)}</span>
        <button type="button" className="text-button" onClick={() => void openSource()}>Apri fonte ↗</button>
      </div>
      <div className="catalog-metrics">
        <div><strong>{snapshot.reportedPlayers}</strong><span>Partecipanti dichiarati</span></div>
        <div><strong>{snapshot.coverage.availableLists}</strong><span>Liste leggibili</span></div>
        <div><strong>{snapshot.coverage.complete60Lists}</strong><span>Liste da 60 carte</span></div>
        <div><strong>{snapshot.pairingCoverage?.decided ?? 0}</strong><span>Partite con vincitore noto</span></div>
      </div>
      <details className="catalog-set-coverage"><summary>Copertura e metodo</summary>
        <p className="content-note" data-testid="tournament-coverage">{snapshot.coverage.availableLists}/{snapshot.coverage.returnedParticipants} liste leggibili; {snapshot.coverage.missingLists} assenti, {snapshot.coverage.invalidLists} non interpretabili. Partecipazioni e liste identiche restano record separati; le carte conservano codice e numero della fonte.</p>
        <p className="content-note">Fasi: {snapshot.phases.map((phase) => `${phase.type} ${phase.rounds} round ${phase.mode}`).join(' · ') || 'non indicate'}. I risultati sono dei partecipanti; nessun winrate del tuo mazzo è inferito.</p>
        <p className="content-note">Abbinamenti: {snapshot.pairingCoverage?.decided ?? 0} vittorie attribuibili e {snapshot.pairingCoverage?.tied ?? 0} pareggi su {snapshot.pairingCoverage?.betweenParticipants ?? 0} partite fra partecipanti identificati; {snapshot.pairingCoverage?.byes ?? 0} bye e {snapshot.pairingCoverage?.invalid ?? 0} righe non interpretabili. I record dei partecipanti non sono usati per inventare abbinamenti.</p>
        <p className="content-note">Ogni blocco acquisisce fino a tre eventi pubblici Standard senza regole speciali. «Aggiorna nuovi» esamina il periodo successivo all'ultima scansione; al primo avvio, gli ultimi 90 giorni. La scansione completa percorre anche le pagine precedenti e può essere ripresa.</p>
      </details>
      <div className="catalog-filters"><label>Filtra giocatore o mazzo<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Es. Dragapult" /></label></div>
      <div className="tournament-layout">
        <div className="tournament-players" aria-label="Partecipazioni evento">
          {filtered.map((entry) => <button type="button" key={entry.playerId}
            className={selected?.playerId === entry.playerId ? 'active' : ''}
            onClick={() => setSelectedId(entry.playerId)}>
            <strong>{entry.placing ? `${entry.placing}° · ` : ''}{entry.playerName}</strong>
            <span>{entry.deck?.name ?? 'Archetipo non indicato'} · {entry.listStatus === 'available' ? `${entry.cardTotal} carte` : 'Lista non disponibile'}</span>
          </button>)}
          {!filtered.length && <p className="content-note">Nessuna partecipazione corrisponde al filtro.</p>}
        </div>
        <div className="tournament-detail">
          {selected ? <>
            <h2>{selected.playerName}</h2>
            <p className="content-note">{selected.deck?.name ?? 'Archetipo non indicato'} · {selected.placing ? `${selected.placing}° posto` : 'Piazzamento non indicato'} · {selected.record ? `${selected.record.wins}V / ${selected.record.losses}S / ${selected.record.ties}P` : 'Record non indicato'}</p>
            {selected.listStatus !== 'available' ? <p className="content-note">Lista {selected.listStatus === 'missing' ? 'assente' : 'non interpretabile'} nella risposta pubblica.</p> :
              <div className="tournament-cards">{(['pokemon', 'trainer', 'energy'] as const).map((category) => <div key={category}>
                <h3>{category === 'pokemon' ? 'Pokémon' : category === 'trainer' ? 'Allenatori' : 'Energie'}</h3>
                <ul>{selected.cards.filter((card) => card.category === category).map((card, index) =>
                  <li key={`${card.set}:${card.number}:${index}`}><strong>{card.count}× {card.name}</strong><span>{card.set} {card.number}</span></li>)}</ul>
              </div>)}</div>}
          </> : <p className="content-note">Seleziona una partecipazione.</p>}
        </div>
      </div>
    </>}
  </section>}</>
}
