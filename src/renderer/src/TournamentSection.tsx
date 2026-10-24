import { useEffect, useMemo, useState } from 'react'
import type { TournamentParticipation, TournamentSnapshot } from '../../shared/tournament'

function dateTime(value: string): string {
  return new Intl.DateTimeFormat('it-IT', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

export function TournamentSection() {
  const [snapshot, setSnapshot] = useState<TournamentSnapshot | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    void window.projectsApi.getTournament().then((result) => {
      if (!active) return
      if (result.ok) setSnapshot(result.value)
      else setError(result.error)
    }).catch(() => { if (active) setError('Evento salvato non leggibile.') })
    return () => { active = false }
  }, [])

  async function refresh(): Promise<void> {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const result = await window.projectsApi.refreshTournament()
      if (!result.ok) throw new Error(result.error)
      setSnapshot(result.value)
      setSelectedId(null)
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

  return <section className="tournament-section" aria-label="Evento Limitless Play">
    <div className="panel-heading">
      <div><span className="eyebrow">Tornei · circuito occidentale</span><h1>Evento Standard</h1></div>
      <button type="button" className="primary-button" onClick={() => void refresh()} disabled={busy}>
        {busy ? 'Acquisizione…' : snapshot ? 'Aggiorna evento' : 'Acquisisci evento'}
      </button>
    </div>
    <p className="content-note">Un evento online non rappresenta i Regional in presenza.</p>
    {error && <div className="error-banner" role="alert">{error}</div>}
    {!snapshot ? <div className="matchup-empty">Nessun evento salvato.</div> : <>
      <div className="meta-provenance">
        <strong>{snapshot.name}</strong>
        <span>{dateTime(snapshot.date)} · PTCGL online · Standard occidentale · {snapshot.source}</span>
        <span>{snapshot.cached ? 'Snapshot locale' : 'Acquisito ora'}: {dateTime(snapshot.fetchedAt)}</span>
        <button type="button" className="text-button" onClick={() => void openSource()}>Apri fonte ↗</button>
      </div>
      <div className="catalog-metrics">
        <div><strong>{snapshot.reportedPlayers}</strong><span>Partecipanti dichiarati</span></div>
        <div><strong>{snapshot.coverage.availableLists}</strong><span>Liste leggibili</span></div>
        <div><strong>{snapshot.coverage.complete60Lists}</strong><span>Liste da 60 carte</span></div>
      </div>
      <details className="catalog-set-coverage"><summary>Copertura e metodo</summary>
        <p className="content-note" data-testid="tournament-coverage">{snapshot.coverage.availableLists}/{snapshot.coverage.returnedParticipants} liste leggibili; {snapshot.coverage.missingLists} assenti, {snapshot.coverage.invalidLists} non interpretabili. Partecipazioni e liste identiche restano record separati; le carte conservano codice e numero della fonte.</p>
        <p className="content-note">Fasi: {snapshot.phases.map((phase) => `${phase.type} ${phase.rounds} round ${phase.mode}`).join(' · ') || 'non indicate'}. I risultati sono dei partecipanti; nessun winrate del tuo mazzo è inferito.</p>
        <p className="content-note">La selezione cerca, tra 50 tornei recenti, un evento pubblico PTCGL Standard con almeno 100 partecipanti, piazzamenti e liste disponibili.</p>
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
  </section>
}
