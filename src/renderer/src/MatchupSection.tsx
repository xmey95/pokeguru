import { useEffect, useState } from 'react'
import type { DeckBaseline } from '../../shared/deck-import'
import type { AiConnection, AiPreferences } from '../../shared/ai'
import type { CatalogView } from '../../shared/catalog'
import type { MatchupDiscussion, MatchupReport, MetaDeck, MetaSnapshot } from '../../shared/meta-matchups'
import { matchupDeckContext, type DeckReconciliation } from '../../shared/reconciliation'

function date(value: string): string {
  return new Intl.DateTimeFormat('it-IT', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

export function MatchupSection({ projectId, baseline, onOpenAiSettings }: {
  projectId: string
  baseline: DeckBaseline | null
  onOpenAiSettings(): void
}) {
  const hasBaseline = baseline !== null
  const baselineKey = baseline?.rawText ?? null
  const [snapshot, setSnapshot] = useState<MetaSnapshot | null>(null)
  const [reports, setReports] = useState<MatchupReport[]>([])
  const [historicalOpponents, setHistoricalOpponents] = useState<MetaDeck[]>([])
  const [discussions, setDiscussions] = useState<MatchupDiscussion[]>([])
  const [discussionsKey, setDiscussionsKey] = useState<string | null>(null)
  const [activeDiscussionId, setActiveDiscussionId] = useState<string | null>(null)
  const [feedback, setFeedback] = useState('')
  const [reportsKey, setReportsKey] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [connection, setConnection] = useState<AiConnection | null>(null)
  const [reconciliation, setReconciliation] = useState<DeckReconciliation | null>(null)
  const [catalog, setCatalog] = useState<CatalogView | null>(null)
  const [overrideModel, setOverrideModel] = useState('')
  const [overrideEffort, setOverrideEffort] = useState('')

  useEffect(() => {
    let active = true
    void window.projectsApi.getAiConnection().then((result) => {
      if (active && result.ok) setConnection(result.value)
    })
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!baseline) { setReconciliation(null); return }
    let active = true
    setReconciliation(null)
    void Promise.all([window.projectsApi.getReconciliation(projectId), window.projectsApi.getCatalog()]).then(([result, catalogResult]) => {
      if (!active) return
      if (result.ok) setReconciliation(result.value)
      else setError(result.error)
      if (catalogResult.ok) setCatalog(catalogResult.value)
    }).catch(() => { if (active) setError('Impossibile leggere le corrispondenze della lista.') })
    return () => { active = false }
  }, [projectId, baseline?.importedAt])

  async function refresh(): Promise<void> {
    setLoading(true)
    setError(null)
    try {
      const result = await window.projectsApi.getMeta()
      if (!result.ok) throw new Error(result.error)
      setSnapshot(result.value)
      setSelectedId((id) => id && result.value.decks.some((deck) => deck.id === id) ? id : result.value.decks[0]?.id ?? null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Metagame non disponibile.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void refresh() }, [projectId])
  useEffect(() => {
    let active = true
    void window.projectsApi.listHistoricalMatchupOpponents(projectId).then((result) => {
      if (active && result.ok) setHistoricalOpponents(result.value)
    })
    return () => { active = false }
  }, [projectId, snapshot?.id])
  useEffect(() => {
    if (!snapshot || !hasBaseline) { setReports([]); setReportsKey(null); return }
    let active = true
    const key = `${projectId}:${snapshot.id}:${baselineKey}`
    void window.projectsApi.listMatchupReports(projectId, snapshot.id).then((result) => {
      if (!active) return
      if (result.ok) { setReports(result.value); setReportsKey(key) }
      else setError(result.error)
    }).catch(() => { if (active) setError('Impossibile leggere le analisi salvate.') })
    return () => { active = false }
  }, [projectId, snapshot?.id, baselineKey, hasBaseline])

  async function reloadDiscussions(opponentId: string): Promise<void> {
    const result = await window.projectsApi.listMatchupDiscussions(projectId, opponentId)
    if (!result.ok) throw new Error(result.error)
    setDiscussions(result.value)
    setDiscussionsKey(`${projectId}:${opponentId}:${snapshot?.id}:${baselineKey}`)
    setActiveDiscussionId((old) => result.value.some((item) => item.id === old)
      ? old : result.value.find((item) => item.current)?.id ?? result.value[0]?.id ?? null)
    const historical = await window.projectsApi.listHistoricalMatchupOpponents(projectId)
    if (historical.ok) setHistoricalOpponents(historical.value)
  }

  useEffect(() => {
    if (!selectedId || !snapshot) { setDiscussions([]); setDiscussionsKey(null); return }
    let active = true
    const key = `${projectId}:${selectedId}:${snapshot.id}:${baselineKey}`
    void window.projectsApi.listMatchupDiscussions(projectId, selectedId).then((result) => {
      if (!active) return
      if (result.ok) {
        setDiscussions(result.value)
        setDiscussionsKey(key)
        setActiveDiscussionId(result.value.find((item) => item.current)?.id ?? result.value[0]?.id ?? null)
      } else setError(result.error)
    }).catch(() => { if (active) setError('Impossibile leggere le discussioni Matchup.') })
    return () => { active = false }
  }, [projectId, selectedId, snapshot?.id, baselineKey])

  async function generate(): Promise<void> {
    if (!snapshot || !selectedId || !hasBaseline || !reconciliation || generating) return
    setGenerating(true)
    setError(null)
    try {
      const override: AiPreferences | null = overrideModel
        ? { model: overrideModel, reasoningEffort: overrideEffort || null } : null
      const result = await window.projectsApi.generateMatchup(projectId, snapshot.id, selectedId, override)
      if (!result.ok) throw new Error(result.error)
      setReports((current) => [...current.filter((report) => report.opponentId !== selectedId), result.value])
      setReportsKey(`${projectId}:${snapshot.id}:${baselineKey}`)
      await reloadDiscussions(selectedId)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Analisi non completata.')
    } finally {
      setGenerating(false)
    }
  }

  function selectedOverride(): AiPreferences | null {
    return overrideModel ? { model: overrideModel, reasoningEffort: overrideEffort || null } : null
  }

  async function submitFeedback(retryTurnId?: string): Promise<void> {
    if (!discussion || !reconciliation || generating) return
    setGenerating(true)
    setError(null)
    try {
      const result = retryTurnId
        ? await window.projectsApi.retryMatchupTurn(discussion.id, retryTurnId, selectedOverride())
        : await window.projectsApi.reviseMatchup(discussion.id, feedback, selectedOverride())
      if (!result.ok) throw new Error(result.error)
      setFeedback('')
      setDiscussions((current) => current.map((item) => item.id === result.value.id ? result.value : item))
      const latest = [...result.value.turns].reverse().find((turn) => turn.report)?.report
      if (latest && snapshot) setReports((current) => [...current.filter((item) => item.opponentId !== latest.opponentId), latest])
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Revisione non completata.')
      if (selectedId) await reloadDiscussions(selectedId).catch(() => undefined)
    } finally {
      setGenerating(false)
    }
  }

  async function continueOnCurrentBase(): Promise<void> {
    if (!discussion || !snapshot || !reconciliation || generating) return
    setGenerating(true)
    setError(null)
    try {
      const result = await window.projectsApi.continueMatchup(discussion.id, snapshot.id, selectedOverride())
      if (!result.ok) throw new Error(result.error)
      await reloadDiscussions(discussion.opponentId)
      setActiveDiscussionId(result.value.id)
      const latest = result.value.turns.at(-1)?.report
      if (latest) {
        setReports((current) => [...current.filter((item) => item.opponentId !== latest.opponentId), latest])
        setReportsKey(`${projectId}:${snapshot.id}:${baselineKey}`)
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Continuazione non completata.')
    } finally {
      setGenerating(false)
    }
  }

  const otherOpponents = historicalOpponents.filter((deck) => !snapshot?.decks.some((current) => current.id === deck.id))
  const allOpponents = [...(snapshot?.decks ?? []), ...otherOpponents]
  const selected = allOpponents.find((deck) => deck.id === selectedId)
  const selectedInCurrentMeta = !!snapshot?.decks.some((deck) => deck.id === selectedId)
  const currentReports = reportsKey === `${projectId}:${snapshot?.id}:${baselineKey}` ? reports : []
  const visibleDiscussions = discussionsKey === `${projectId}:${selectedId}:${snapshot?.id}:${baselineKey}` ? discussions : []
  const currentDiscussion = visibleDiscussions.find((item) => item.current)
  const discussion = visibleDiscussions.find((item) => item.id === activeDiscussionId) ?? currentDiscussion ?? visibleDiscussions[0]
  const report = discussion ? [...discussion.turns].reverse().find((turn) => turn.report)?.report :
    currentReports.find((item) => item.opponentId === selectedId)
  const pendingTurn = discussion?.turns.find((turn) => !turn.report)
  const model = connection?.models.find((item) => item.id === overrideModel)
  const deckContext = baseline && reconciliation ? matchupDeckContext(baseline, reconciliation, catalog) : null

  return <section className="matchup-section" aria-label="Matchup del progetto">
    <div className="panel-heading">
      <div><span className="eyebrow">Metagame e analisi AI</span><h2>Matchup</h2></div>
      <button type="button" className="secondary-button" onClick={() => void refresh()} disabled={loading || generating}>Aggiorna Limitless</button>
    </div>
    <p className="content-note">Gli archetipi arrivano dal Metagame Limitless: Standard, ultimo mese, Europa, Nord America, America Latina e Oceania. Scegli un mazzo per generare con Codex punti forti, debolezze, carte chiave e piano di gioco sulla tua lista.</p>
    {error && <div className="error-banner" role="alert">{error}</div>}
    {loading && !snapshot ? <p className="content-note">Caricamento del metagame Limitless…</p> : snapshot && <>
      <div className="meta-provenance">
        <strong>{snapshot.decks.length} archetipi presenti nella tabella Limitless</strong>
        <span>Acquisito {date(snapshot.fetchedAt)} · {snapshot.period} · {snapshot.cached ? 'Copia locale: aggiornamento online non riuscito' : 'Aggiornato online'}</span>
        <button type="button" className="text-button" onClick={() => void window.projectsApi.openLimitless(snapshot.sourceUrl)}>Apri fonte Limitless ↗</button>
      </div>
      <div className="meta-layout">
        <div className="meta-deck-list" aria-label="Archetipi Limitless">
          {allOpponents.map((deck) => <button type="button" key={deck.id}
            className={`meta-deck ${selectedId === deck.id ? 'active' : ''}`}
            onClick={() => setSelectedId(deck.id)}>
            <strong>{deck.name}</strong><span>{snapshot.decks.some((current) => current.id === deck.id)
              ? `${deck.share.toFixed(2)}% quota · ${deck.points} punti${currentReports.some((item) => item.opponentId === deck.id) ? ' · Analisi AI' : ''}`
              : 'Solo nello storico · Analisi AI'}</span>
          </button>)}
        </div>
        <div className="meta-analysis">
          {selected && <>
            <div className="matchup-card-head"><div><h3>{selected.name}</h3><span className="note-source">{selectedInCurrentMeta ? 'Metagame Limitless · quota nel periodo, non percentuale di vittoria' : 'Archetipo presente in uno snapshot precedente'}</span></div></div>
            <button type="button" className="text-button" onClick={() => void window.projectsApi.openLimitless(selected.url)}>Apri archetipo su Limitless ↗</button>
            {visibleDiscussions.length > 0 && <div className="discussion-switcher" aria-label="Discussioni Matchup">
              {visibleDiscussions.map((item, index) => <button type="button" key={item.id}
                className={`secondary-button ${discussion?.id === item.id ? 'selected' : ''}`}
                onClick={() => setActiveDiscussionId(item.id)}>
                {item.current ? 'Base attuale' : `Storico ${index + 1}`}{item.parentId ? ' · collegata' : ''}
              </button>)}
            </div>}
            {!hasBaseline ? <p className="matchup-empty">Importa una lista nel progetto per generare l’analisi di questo matchup.</p> : report ? <>
              {discussion && !discussion.current && <p className="stale-discussion">Questa discussione riguarda una lista o uno snapshot precedente. La guida resta consultabile come storico.</p>}
              <p className="content-note">Analisi Codex generata il {date(report.generatedAt)} per questa lista e questo snapshot del meta. {report.ai ? `Modello: ${report.ai.model ?? 'automatico'} · ragionamento: ${report.ai.reasoningEffort ?? 'predefinito'} · ${report.ai.source === 'override' ? 'scelta per questa analisi' : 'preferenze globali'}.` : 'Configurazione non registrata per questa analisi precedente.'}</p>
              <div className="matchup-fields">
                <div><strong>Punti forti del nostro mazzo</strong><p>{report.strengths}</p></div>
                <div><strong>Debolezze del nostro mazzo</strong><p>{report.weaknesses}</p></div>
                <div><strong>Le nostre carte chiave</strong><p>{report.ourKeyCards}</p></div>
                <div><strong>Le loro carte chiave</strong><p>{report.theirKeyCards}</p></div>
                <div className="strategy-field"><strong>Come giocare il matchup</strong><p>{report.strategy}</p></div>
                <div className="strategy-field"><strong>Limiti dell’analisi</strong><p>{report.limitations}</p></div>
              </div>
              {report.sampleDeckUrl && <button type="button" className="text-button" onClick={() => void window.projectsApi.openLimitless(report.sampleDeckUrl!)}>Apri la lista avversaria usata ↗</button>}
              {discussion && <div className="matchup-discussion">
                <h4>Discussione dell’analisi</h4>
                <p className="content-note">Ogni risposta crea una nuova versione della guida. Le tue osservazioni restano distinte dai dati Limitless e dalle conclusioni AI.</p>
                <div className="discussion-timeline">
                  {discussion.turns.map((turn, index) => <details key={turn.id} open={index === discussion.turns.length - 1}>
                    <summary>{index === 0 ? 'Analisi iniziale' : `Revisione ${index}`} · {date(turn.createdAt)}{turn.report ? '' : ' · in attesa'}</summary>
                    {turn.feedback && <p><strong>La tua osservazione:</strong> {turn.feedback}</p>}
                    {turn.changeSummary && <p><strong>Cosa è cambiato:</strong> {turn.changeSummary}</p>}
                    {turn.report && <div className="discussion-version">
                      <p><strong>Punti forti:</strong> {turn.report.strengths}</p>
                      <p><strong>Debolezze:</strong> {turn.report.weaknesses}</p>
                      <p><strong>Le nostre carte chiave:</strong> {turn.report.ourKeyCards}</p>
                      <p><strong>Le carte chiave avversarie:</strong> {turn.report.theirKeyCards}</p>
                      <p><strong>Piano di gioco:</strong> {turn.report.strategy}</p>
                      <p><strong>Limiti:</strong> {turn.report.limitations}</p>
                    </div>}
                  </details>)}
                </div>
                {discussion.current ? pendingTurn ? <div className="pending-feedback">
                  <p>Commento in attesa: {pendingTurn.feedback}</p>
                  <button type="button" className="secondary-button" onClick={() => void submitFeedback(pendingTurn.id)} disabled={generating || !reconciliation}>Riprova la revisione</button>
                </div> : <div className="feedback-form">
                  <label htmlFor="matchup-feedback">Rispondi a questa analisi</label>
                  <textarea id="matchup-feedback" value={feedback} maxLength={5000}
                    onChange={(event) => setFeedback(event.target.value)}
                    placeholder="Per esempio: secondo me conviene andare secondi perché…" disabled={generating} />
                  <button type="button" className="primary-button" onClick={() => void submitFeedback()}
                    disabled={!feedback.trim() || generating || snapshot.cached || !reconciliation}>{generating ? 'Codex sta rivedendo…' : 'Rivedi analisi con Codex'}</button>
                </div> : !currentDiscussion && selectedInCurrentMeta ? <button type="button" className="primary-button"
                  onClick={() => void continueOnCurrentBase()} disabled={generating || snapshot.cached || !hasBaseline || !reconciliation}>
                  {generating ? 'Codex sta rivalutando…' : 'Continua sulla nuova base'}
                </button> : !selectedInCurrentMeta && <p className="content-note">Questo archetipo non compare nello snapshot attuale. Puoi consultare lo storico; per continuare, seleziona uno snapshot in cui è presente quando sarà disponibile questa scelta.</p>}
              </div>}
            </> : <p className="matchup-empty">Analisi AI non ancora generata per questo archetipo e questa lista.</p>}
            {hasBaseline && <div className="matchup-ai-options">
              <div className="matchup-ai-heading"><strong>AI per questa analisi</strong><button type="button" className="text-button" onClick={onOpenAiSettings}>Impostazioni AI</button></div>
              <div className="settings-grid">
                <div className="settings-field"><label htmlFor="matchup-model">Modello</label>
                  <select id="matchup-model" value={overrideModel} onChange={(event) => { setOverrideModel(event.target.value); setOverrideEffort('') }} disabled={generating}>
                    <option value="">Usa preferenze globali</option>
                    {connection?.models.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                  </select>
                </div>
                <div className="settings-field"><label htmlFor="matchup-effort">Ragionamento</label>
                  <select id="matchup-effort" value={overrideEffort} onChange={(event) => setOverrideEffort(event.target.value)} disabled={generating || !model}>
                    <option value="">Predefinito</option>
                    {model?.reasoningEfforts.map((effort) => <option key={effort.id} value={effort.id}>{effort.id}</option>)}
                  </select>
                </div>
              </div>
              <details className="ai-data-preview"><summary>Dati inviati a Codex per questa analisi</summary>
                <p>La richiesta include le righe interpretate e, se presenti, le stampe scelte e i totali per identità di gioco:</p>
                <pre>{deckContext ?? 'Caricamento corrispondenze…'}</pre>
                <p>Include l’archetipo {selected.name}, la quota e i punti del metagame, il periodo {snapshot.period} e le fonti Limitless {snapshot.sourceUrl} e {selected.url}. Pokéguru cercherà una lista avversaria pubblica di esempio su Limitless e, se la trova, ne invierà i nomi e le quantità delle carte. Per una revisione invia anche il nuovo commento, la guida precedente e un contesto delle revisioni passate; per «Continua sulla nuova base» invia il contesto della discussione collegata. Non invia il testo grezzo dell’import né altri progetti.</p>
              </details>
            </div>}
            {selectedInCurrentMeta && (!discussion || discussion.current) && <button type="button" className="primary-button" onClick={() => void generate()} disabled={!hasBaseline || !reconciliation || generating || snapshot.cached || !!pendingTurn}>
              {generating ? 'Codex sta analizzando…' : report ? 'Rigenera analisi' : 'Genera analisi con Codex'}
            </button>}
            {snapshot.cached && <p className="content-note">Per generare una nuova analisi, aggiorna prima il metagame online.</p>}
          </>}
        </div>
      </div>
    </>}
  </section>
}
