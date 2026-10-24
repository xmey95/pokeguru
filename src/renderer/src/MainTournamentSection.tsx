import { useEffect, useMemo, useState } from 'react'
import type { MainTournamentSnapshot, MainTournamentSummary, MainTournamentSyncProgress } from '../../shared/main-tournament'
import { useNavigation, useViewState } from './Navigation'

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
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
          if (active && result.ok) { setSnapshot(result.value); setSelectedEventId(chosen.eventId) }
        }
      }).catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : 'Archivio Regional non leggibile.') }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  async function choose(eventId: string): Promise<void> {
    const result = await window.projectsApi.getMainTournament(eventId)
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
      if (!result.ok) throw new Error(result.error)
      setProgress(result.value)
      const listed = await window.projectsApi.listMainTournaments()
      if (!listed.ok) throw new Error(listed.error)
      setEvents(listed.value)
      const chosen = listed.value.find((item) => item.eventId === selectedEventId) ?? listed.value[0]
      if (chosen) await choose(chosen.eventId)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Aggiornamento Regional non riuscito.') }
    finally { setBusy(false) }
  }

  const sorted = useMemo(() => [...(snapshot?.participants ?? [])].sort((a, b) => a.placing - b.placing), [snapshot])
  const filtered = sorted.filter((item) => `${item.playerName} ${item.deckName ?? ''}`.toLowerCase().includes(query.toLowerCase()))
  const selected = sorted.find((item) => item.placing === selectedPlace && selectedPlace !== null) ??
    sorted.find((item) => item.cards && item.cardTotal === 60) ?? sorted[0]

  return <section className="tournament-section" aria-label="Regional Limitless" data-nav-loading={loading}>
    <div className="panel-heading"><div><span className="eyebrow">Database principale · Standard occidentale</span><h1>Regional e grandi eventi</h1></div>
      <div className="panel-actions">{progress?.status === 'running' || progress?.status === 'rate-limited'
        ? <button type="button" className="primary-button" onClick={() => void sync(progress.mode ?? 'new')}
          disabled={busy || (progress.status === 'rate-limited' && !!progress.cooldownUntil && Date.parse(progress.cooldownUntil) > Date.now())}>
          {busy ? 'Acquisizione…' : 'Continua blocco Regional'}</button>
        : <><button type="button" className="primary-button" onClick={() => void sync('new')} disabled={busy}>
          {busy ? 'Acquisizione…' : 'Aggiorna nuovi Regional'}</button>
          <button type="button" className="secondary-button" onClick={() => void sync('full')} disabled={busy}>Scansione completa</button></>}</div>
    </div>
    <p className="content-note">Risultati e liste pubblicate da Limitless. Un evento mostra solo le righe disponibili nella fonte; nessuna percentuale di vittoria è dedotta dai piazzamenti.</p>
    {progress && progress.status !== 'idle' && <p className="content-note" role="status">
      {progress.status === 'complete' ? 'Scansione completata' : progress.status === 'rate-limited'
        ? `Limite raggiunto; riprendi dopo ${progress.cooldownUntil ? date(progress.cooldownUntil) : 'la pausa'}`
        : 'Scansione da continuare'} · {progress.inspectedEvents} eventi controllati, {progress.fetchedLists} liste scaricate,
      {progress.pendingLists.length} liste e {progress.pendingEvents.length} eventi in coda.
      {progress.lastError ? ` Ultimo problema: ${progress.lastError}` : ''}</p>}
    {error && <div className="error-banner" role="alert">{error}</div>}
    {!snapshot ? <div className="matchup-empty">Nessun Regional archiviato.</div> : <>
      <div className="catalog-filters"><label>Evento archiviato
        <select value={selectedEventId ?? snapshot.eventId} onChange={(event) => nav.visit({ 'events.main.event': event.target.value, 'events.main.place': null }, `Eventi · ${events.find((item) => item.eventId === event.target.value)?.name ?? 'Regional'}`)}>
          {events.map((item) => <option value={item.eventId} key={item.eventId}>{date(item.date)} · {item.name}</option>)}
        </select></label><label>Filtra giocatore o mazzo<input value={query}
        onChange={(event) => setQuery(event.target.value)} placeholder="Es. Hydrapple" /></label></div><p className="content-note">{events.length} {events.length === 1 ? 'evento disponibile offline' : 'eventi disponibili offline'}</p>
      <div className="meta-provenance"><strong>{snapshot.name}</strong>
        <span>{date(snapshot.date)} · {snapshot.country} · {snapshot.players} partecipanti dichiarati · Standard occidentale</span>
        <span>Acquisito {date(snapshot.fetchedAt)} · Limitless tournament database</span>
        <button type="button" className="text-button" onClick={() => void window.projectsApi.openMainTournament(snapshot.url)}>Apri evento ↗</button></div>
      <div className="catalog-metrics">
        <div><strong>{snapshot.coverage.returnedParticipants}</strong><span>Piazzamenti pubblicati</span></div>
        <div><strong>{snapshot.coverage.listedDecks}</strong><span>Archetipi indicati</span></div>
        <div><strong>{snapshot.coverage.complete60Lists}</strong><span>Liste da 60 acquisite</span></div>
      </div>
      <div className="tournament-layout"><div className="tournament-players" aria-label="Piazzamenti Regional">
        {filtered.map((item) => <button type="button" key={`${item.placing}:${item.playerName}`}
          className={selected === item ? 'active' : ''} aria-pressed={selected === item} onClick={() => nav.visit({ 'events.main.place': item.placing }, `Eventi · ${snapshot.name} · ${item.playerName}`)}>
          <strong>{item.placing}° · {item.playerName}</strong><span>{item.deckName ?? 'Archetipo non indicato'} · {item.cardTotal === 60 ? '60 carte' : item.listUrl ? 'Lista da acquisire' : 'Nessuna lista'}</span>
        </button>)}
        {!filtered.length && <p className="content-note">Nessun piazzamento corrisponde al filtro.</p>}
      </div><div className="tournament-detail">{selected ? <>
        <h2>{selected.playerName}</h2><p className="content-note">{selected.placing}° · {selected.deckName ?? 'Archetipo non indicato'}</p>
        {selected.listUrl && <button type="button" className="text-button" onClick={() => void window.projectsApi.openMainTournament(selected.listUrl!)}>Apri lista originale ↗</button>}
        {selected.cards ? <div className="tournament-cards">{(['pokemon', 'trainer', 'energy'] as const).map((category) => <div key={category}>
          <h3>{category === 'pokemon' ? 'Pokémon' : category === 'trainer' ? 'Allenatori' : 'Energie'}</h3>
          <ul>{selected.cards!.filter((card) => card.category === category).map((card, index) =>
            <li key={`${card.set}:${card.number}:${index}`}><strong>{card.count}× {card.name}</strong><span>{card.set} {card.number}</span></li>)}</ul>
        </div>)}</div> : <p className="content-note">Lista non ancora acquisita in questo archivio.</p>}
      </> : <p className="content-note">Seleziona un piazzamento.</p>}</div></div>
      <details className="catalog-set-coverage"><summary>Copertura e metodo</summary>
        <p className="content-note">{snapshot.coverage.returnedParticipants}/{snapshot.players} partecipanti dichiarati appaiono nella pagina risultati; {snapshot.coverage.fetchedLists} liste acquisite, {snapshot.coverage.noListLink} righe senza collegamento lista. Ogni blocco acquisisce fino a 7 pagine, con massimo 16 liste rappresentative per evento; i link delle altre liste restano disponibili nella fonte.</p>
        <p className="content-note">La fonte principale non pubblica abbinamenti in questa pagina. Statistiche di matchup basate sui match richiedono la fonte Play con risultati espliciti.</p>
      </details>
    </>}
  </section>
}
