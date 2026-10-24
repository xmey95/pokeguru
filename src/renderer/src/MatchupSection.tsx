import { useEffect, useState } from 'react'
import type { DeckBaseline } from '../../shared/deck-import'
import type { AiConnection, AiPreferences } from '../../shared/ai'
import type { CatalogView } from '../../shared/catalog'
import type { MatchupDiscussion, MatchupReport, MatchupTournamentEvidence, MetaDeck, MetaSnapshot } from '../../shared/meta-matchups'
import type { StandardRuleAudit } from '../../shared/standard-rule-audit'
import { evaluateStandardDeck } from '../../shared/standard-deck'
import { buildDeckCards, matchupDeckContext, type DeckReconciliation } from '../../shared/reconciliation'
import { MatchupSwitcher } from './MatchupSwitcher'
import { GuideText } from './GuideText'
import { reportGuideReferences, type GuideReference } from './guide-links'
import { useNavigation, useViewState, useDraftState, useBusyState } from './Navigation'

function date(value: string): string {
  return new Intl.DateTimeFormat('it-IT', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

export function MatchupSection({ projectId, baseline, onOpenAiSettings, onOpenCatalogCard }: {
  projectId: string
  baseline: DeckBaseline | null
  onOpenAiSettings(): void
  onOpenCatalogCard(identityId: string): void
}) {
  const nav = useNavigation()
  const hasBaseline = baseline !== null
  const baselineKey = baseline?.rawText ?? null
  const [snapshot, setSnapshot] = useState<MetaSnapshot | null>(null)
  const [reports, setReports] = useState<MatchupReport[]>([])
  const [historicalOpponents, setHistoricalOpponents] = useState<MetaDeck[]>([])
  const [historyKey, setHistoryKey] = useState<string | null>(null)
  const [discussions, setDiscussions] = useState<MatchupDiscussion[]>([])
  const [discussionsKey, setDiscussionsKey] = useState<string | null>(null)
  const [activeDiscussionId, setActiveDiscussionId] = useViewState<string | null>('matchup.discussion', null)
  const [reportsKey, setReportsKey] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useViewState<string | null>('matchup.selected', null)
  const [feedback, setFeedback] = useDraftState(`matchup.feedback:${projectId}:${selectedId}:${activeDiscussionId}`, '')
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useBusyState(`matchup:${projectId}:${selectedId}`)
  const [error, setError] = useDraftState<string | null>(`matchup.error:${projectId}:${selectedId}`, null)
  const [connection, setConnection] = useState<AiConnection | null>(null)
  const [reconciliation, setReconciliation] = useState<DeckReconciliation | null>(null)
  const [catalog, setCatalog] = useState<CatalogView | null>(null)
  const [ruleAudit, setRuleAudit] = useState<StandardRuleAudit | null>(null)
  const [previewEvidence, setPreviewEvidence] = useState<MatchupTournamentEvidence | null>(null)
  const [overrideModel, setOverrideModel] = useDraftState(`matchup.model:${projectId}:${selectedId}`, '')
  const [overrideEffort, setOverrideEffort] = useDraftState(`matchup.effort:${projectId}:${selectedId}`, '')

  useEffect(() => {
    let active = true
    void window.projectsApi.getAiConnection().then((result) => {
      if (active && result.ok) setConnection(result.value)
    })
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!snapshot || !selectedId) { setPreviewEvidence(null); return }
    let active = true
    void window.projectsApi.getMatchupEvidence(snapshot.id, selectedId).then((result) => {
      if (active) setPreviewEvidence(result.ok ? result.value : null)
    }).catch(() => { if (active) setPreviewEvidence(null) })
    return () => { active = false }
  }, [snapshot?.id, selectedId, catalog])

  useEffect(() => {
    let active = true
    void window.projectsApi.getStandardRuleAudit().then((result) => {
      if (active && result.ok) setRuleAudit(result.value)
    }).catch(() => undefined)
    return () => { active = false }
  }, [projectId])

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
      setSelectedId((id) => id ?? result.value.decks[0]?.id ?? null)
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
      if (!active) return
      if (result.ok) { setHistoricalOpponents(result.value); setHistoryKey(`${projectId}:${snapshot?.id}`) }
      else setError(result.error)
    }).catch(() => { if (active) setError('Impossibile leggere lo storico Matchup.') })
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
  }, [projectId, snapshot?.id, baselineKey, hasBaseline, generating])

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
        setActiveDiscussionId((old) => old ?? result.value.find((item) => item.current)?.id ?? result.value[0]?.id ?? null)
        if (activeDiscussionId && !result.value.some((item) => item.id === activeDiscussionId)) setError('Questa discussione non è più disponibile. Scegli una base disponibile oppure torna indietro.')
      } else setError(result.error)
    }).catch(() => { if (active) setError('Impossibile leggere le discussioni Matchup.') })
    return () => { active = false }
  }, [projectId, selectedId, snapshot?.id, baselineKey, generating])

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
      const updatedCatalog = await window.projectsApi.getCatalog()
      if (updatedCatalog.ok) setCatalog(updatedCatalog.value)
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

  const historyLoaded = historyKey === `${projectId}:${snapshot?.id}`
  const knownHistory = historyLoaded ? historicalOpponents : []
  const otherOpponents = knownHistory.filter((deck) => !snapshot?.decks.some((current) => current.id === deck.id))
  const allOpponents = [...(snapshot?.decks ?? []), ...otherOpponents]
  const selected = allOpponents.find((deck) => deck.id === selectedId)
  useEffect(() => { if (selected) nav.entry.label = `Matchup · ${selected.name}` }, [selected?.id])
  const selectedInCurrentMeta = !!snapshot?.decks.some((deck) => deck.id === selectedId)
  const currentReports = reportsKey === `${projectId}:${snapshot?.id}:${baselineKey}` ? reports : []
  const reportsLoaded = !hasBaseline || reportsKey === `${projectId}:${snapshot?.id}:${baselineKey}`
  const visibleDiscussions = discussionsKey === `${projectId}:${selectedId}:${snapshot?.id}:${baselineKey}` ? discussions : []
  const currentDiscussion = visibleDiscussions.find((item) => item.current)
  const discussion = visibleDiscussions.find((item) => item.id === activeDiscussionId) ?? currentDiscussion ?? visibleDiscussions[0]
  const report = discussion ? [...discussion.turns].reverse().find((turn) => turn.report)?.report :
    currentReports.find((item) => item.opponentId === selectedId)
  const pendingTurn = discussion?.turns.find((turn) => !turn.report)
  const model = connection?.models.find((item) => item.id === overrideModel)
  const standard = baseline ? evaluateStandardDeck(baseline, catalog,
    new Date().toISOString().slice(0, 10), ruleAudit) : null
  const deckContext = baseline && reconciliation ? matchupDeckContext(baseline, reconciliation, catalog, standard) : null
  const ourCatalogCards = baseline && (!discussion || discussion.current) ? buildDeckCards(baseline, catalog, reconciliation)
    .filter((card) => card.status === 'recognized' && card.identityId) : []
  const guideReferences: GuideReference[] = report ? [
    ...reportGuideReferences(report),
    ...ourCatalogCards.map((card): GuideReference => ({ label: card.name, target: { kind: 'catalog', identityId: card.identityId! } }))
  ] : []
  const body = (text: string, references = guideReferences) => <GuideText key={`${selectedId}:${report?.metaId}:${report?.deckHash}:${report?.generatedAt}:${text}`} text={text} references={references} onOpenCatalogCard={onOpenCatalogCard} />

  const opponentOptions = allOpponents.map((opponent) => ({
    ...opponent,
    inCurrentMeta: !!snapshot?.decks.some((deck) => deck.id === opponent.id),
    guideStatus: currentReports.some((item) => item.opponentId === opponent.id) ? 'Guida disponibile'
      : knownHistory.some((item) => item.id === opponent.id) && (reportsLoaded || !snapshot?.decks.some((deck) => deck.id === opponent.id)) ? 'Guida storica'
      : historyLoaded && reportsLoaded
        ? 'Nessuna guida' : 'Disponibilità da verificare'
  }))

  return <section className="matchup-section" aria-label="Matchup del progetto" data-nav-loading={!error && (loading || !historyLoaded || !reportsLoaded || (!!selectedId && !!snapshot && discussionsKey !== `${projectId}:${selectedId}:${snapshot.id}:${baselineKey}`))}>
    {!loading && historyLoaded && selectedId && !selected && <p className="error-banner" role="alert">Questo avversario non è più disponibile. Scegline un altro oppure torna indietro.</p>}
    <div className="panel-heading">
      <h2>Matchup</h2>
      <button type="button" className="secondary-button" onClick={() => void refresh()} disabled={loading || generating}>Aggiorna Limitless</button>
    </div>
    {error && <div className="error-banner" role="alert">{error}</div>}
    {loading && !snapshot ? <p className="content-note">Caricamento del metagame Limitless…</p> : snapshot && <>
      <div className="meta-layout">
        <MatchupSwitcher opponents={opponentOptions} selectedId={selectedId} disabled={loading || generating} onSelect={(id) => { if (id !== selectedId) nav.visit({ 'matchup.selected': id, 'matchup.discussion': null, 'nav.focus': '#matchup-switcher-trigger' }, `Matchup · ${allOpponents.find((item) => item.id === id)?.name ?? 'Avversario'}`) }} />
        <div className="meta-analysis">
          {selected && <>
            {discussion && !discussion.current && <p className="matchup-freshness stale">Guida storica · base precedente</p>}
            {visibleDiscussions.length > 1 && <div className="discussion-switcher" aria-label="Discussioni Matchup">
              {visibleDiscussions.map((item, index) => <button type="button" key={item.id}
                className={`secondary-button ${discussion?.id === item.id ? 'selected' : ''}`}
                onClick={() => nav.visit({ 'matchup.discussion': item.id }, `Matchup · ${selected?.name ?? 'Guida'} · base ${date(item.createdAt)}`)}>
                {item.current ? 'Base attuale' : `Storico ${index + 1}`}{item.parentId ? ' · collegata' : ''}
              </button>)}
            </div>}
            {!hasBaseline ? <p className="matchup-empty">Importa una lista nel progetto per generare l’analisi di questo matchup.</p> : report ? <>
              <div className="matchup-fields">
                <div className="strategy-field"><h3>Come giocare il matchup</h3><p>{body(report.strategy)}</p></div>
                <div className="strategy-field matchup-trust"><h3>Limiti dell’analisi</h3><p>{body(report.limitations)}</p></div>
                <div><h3>Le nostre carte chiave</h3><p>{body(report.ourKeyCards)}</p></div>
                <div><h3>Le loro carte chiave</h3><p>{body(report.theirKeyCards)}</p></div>
              </div>
              <details className="matchup-assessment"><summary>Punti forti e rischi</summary>
                <div className="matchup-fields">
                  <div><h3>Punti forti del nostro mazzo</h3><p>{body(report.strengths)}</p></div>
                  <div><h3>Debolezze del nostro mazzo</h3><p>{body(report.weaknesses)}</p></div>
                </div>
              </details>
              <details className="guide-sources"><summary>Fonti e dati della guida</summary>
                <div className="matchup-source-links"><button type="button" className="text-button" onClick={() => void window.projectsApi.openLimitless(report.opponentSourceUrl ?? selected.url)}>Apri archetipo su Limitless ↗</button>
                  {report.metaSourceUrl && <button type="button" className="text-button"
                    onClick={() => void window.projectsApi.openLimitless(report.metaSourceUrl!)}>Apri fonte Meta usata ↗</button>}</div>
              <details className="matchup-report-meta"><summary>Versione, modello e dati usati</summary><p>Analisi Codex generata il {date(report.generatedAt)} · Standard occidentale · lista {report.deckHash.slice(0, 12)} · snapshot Meta {report.metaId.slice(0, 12)}{report.metaPeriod ? ` · ${report.metaPeriod}` : ''}{report.metaFetchedAt ? ` · acquisito ${date(report.metaFetchedAt)}` : ''}. {report.ai ? `Modello: ${report.ai.model ?? 'automatico'} · ragionamento: ${report.ai.reasoningEffort ?? 'predefinito'} · ${report.ai.source === 'override' ? 'scelta per questa analisi' : 'preferenze globali'}.` : 'Configurazione non registrata per questa analisi precedente.'}</p></details>
              {report.tournamentEvidence && <section className="rotation-panel" aria-label="Evidenze torneo del matchup">
                <strong>{report.tournamentEvidence.schemaVersion === 2 ? 'Tornei e liste osservate' : 'Liste osservate in un evento online'}</strong>
                <p>{body(report.tournamentEvidence.schemaVersion === 2 ? report.tournamentEvidence.detail
                  : report.tournamentEvidence.status === 'matched'
                    ? `${report.tournamentEvidence.matchedCompleteLists} liste complete dell’archetipo in ${report.tournamentEvidence.eventName} (${report.tournamentEvidence.eventDate ? date(report.tournamentEvidence.eventDate) : 'data non indicata'}). Evento online singolo; non è un winrate.`
                    : report.tournamentEvidence.detail)}</p>
                {report.tournamentEvidence.events && <ul>{report.tournamentEvidence.events.map((item) => <li key={`${item.source}:${item.eventId}`}>
                  {item.name} · {date(item.date)} · {item.source === 'main' ? 'Regional' : 'Play online'} · {item.matchedLists} liste dell’archetipo / {item.completeLists} liste complete acquisite · {item.visibleParticipants}/{item.totalParticipants} partecipanti visibili.
                  <button type="button" className="text-button" onClick={() => void (item.source === 'main'
                    ? window.projectsApi.openMainTournament(item.url) : window.projectsApi.openLimitless(item.url))}>Apri fonte ↗</button>
                </li>)}</ul>}
                {report.tournamentEvidence.opponentFieldRecord && <p>Risultati osservati dell’archetipo avversario contro il campo online: {report.tournamentEvidence.opponentFieldRecord.wins}V / {report.tournamentEvidence.opponentFieldRecord.losses}S / {report.tournamentEvidence.opponentFieldRecord.ties}P su {report.tournamentEvidence.opponentFieldRecord.denominator} match con esito ({report.tournamentEvidence.opponentFieldRecord.eligiblePairings} abbinamenti pertinenti, {report.tournamentEvidence.opponentFieldRecord.events} eventi, {date(report.tournamentEvidence.opponentFieldRecord.windowStart)}–{date(report.tournamentEvidence.opponentFieldRecord.windowEnd)}). Non è il winrate del tuo mazzo contro questo archetipo.</p>}
                {report.tournamentEvidence.status === 'matched' && <>
                  <details className="observed-cards"><summary>Carte osservate · frequenza e meccaniche</summary><p className="content-note">Numero di liste, non copie.</p>
                  <ul className="evidence-card-list">{report.tournamentEvidence.observedCards.slice(0, 18).map((card) => <li key={card.name}>
                    {card.name} · {card.lists}/{report.tournamentEvidence!.matchedCompleteLists} liste{card.catalogStatus === 'recognized'
                      ? '' : card.catalogStatus === 'ambiguous' ? ' · identità da verificare' : ' · non nel catalogo locale'}
                    {card.catalogIdentityId && <button type="button" className="text-button"
                      onClick={() => onOpenCatalogCard(card.catalogIdentityId!)}>Apri nel Catalogo</button>}
                    {card.gameplay && <details><summary>Meccaniche verificate</summary><p>{body(card.gameplay)}</p>
                      {card.cardSourceUrl && <small>{body(card.cardSourceUrl)}</small>}</details>}
                  </li>)}</ul></details>
                  {report.tournamentEvidence.schemaVersion !== 2 && report.tournamentEvidence.eventUrl && <button type="button" className="text-button"
                    onClick={() => void window.projectsApi.openLimitless(report.tournamentEvidence!.eventUrl!)}>Apri evento online ↗</button>}
                  {report.tournamentEvidence.sampleLists.map((list, index) => <button type="button" className="text-button" key={list.url}
                    onClick={() => void (list.source === 'main' ? window.projectsApi.openMainTournament(list.url)
                      : window.projectsApi.openLimitless(list.url))}>Lista osservata {index + 1}{list.eventName ? ` · ${list.eventName}` : ''} ↗</button>)}
                </>}
              </section>}
              {report.sampleDeckUrl && <button type="button" className="text-button" onClick={() => void window.projectsApi.openLimitless(report.sampleDeckUrl!)}>Apri la lista avversaria usata ↗</button>}
              </details>
              {discussion && <div className="matchup-discussion">
                <h4>Discussione dell’analisi</h4>
                <div className="discussion-timeline">
                  {discussion.turns.map((turn, index) => <details key={turn.id} open={index === discussion.turns.length - 1}>
                    <summary>{index === 0 ? 'Analisi iniziale' : `Revisione ${index}`} · {date(turn.createdAt)}{turn.report ? '' : ' · in attesa'}</summary>
                    {turn.feedback && <p><strong>La tua osservazione:</strong> {turn.feedback}</p>}
                    {turn.changeSummary && <p><strong>Cosa è cambiato:</strong> {body(turn.changeSummary, turn.report ? reportGuideReferences(turn.report) : [])}</p>}
                    {turn.report && index !== discussion.turns.length - 1 && <div className="discussion-version">
                      <p><strong>Punti forti:</strong> {body(turn.report.strengths, reportGuideReferences(turn.report))}</p>
                      <p><strong>Debolezze:</strong> {body(turn.report.weaknesses, reportGuideReferences(turn.report))}</p>
                      <p><strong>Le nostre carte chiave:</strong> {body(turn.report.ourKeyCards, reportGuideReferences(turn.report))}</p>
                      <p><strong>Le carte chiave avversarie:</strong> {body(turn.report.theirKeyCards, reportGuideReferences(turn.report))}</p>
                      <p><strong>Piano di gioco:</strong> {body(turn.report.strategy, reportGuideReferences(turn.report))}</p>
                      <p><strong>Limiti:</strong> {body(turn.report.limitations, reportGuideReferences(turn.report))}</p>
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
            </> : <p className="matchup-empty">Nessuna guida per questo archetipo e questa lista.</p>}
            {hasBaseline && <details className="matchup-ai-details"><summary>Opzioni AI e dati inviati</summary><div className="matchup-ai-options">
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
                <p>Righe della lista, carte identificate, regole di gioco disponibili e controllo Standard alla data odierna:</p>
                <pre>{deckContext ?? 'Caricamento corrispondenze…'}</pre>
                <p>Tornei archiviati: {previewEvidence?.detail ?? 'Caricamento evidenze…'} Inviati liste campione, frequenze, meccaniche disponibili, fonti e soli risultati espliciti degli abbinamenti Play. Le revisioni riusano le evidenze salvate.</p>
                <p>Meta: {selected.name}, quota, punti, periodo {snapshot.period} e fonti Limitless {snapshot.sourceUrl} e {selected.url}. Se disponibile, sono inviati nomi e quantità di una lista avversaria pubblica. Le revisioni includono commento, guida precedente e contesto della discussione. Non sono inviati risultati di match del tuo mazzo né dati di altri progetti.</p>
              </details>
            </div></details>}
            {selectedInCurrentMeta && (!discussion || discussion.current) && <button type="button" className="primary-button" onClick={() => void generate()} disabled={!hasBaseline || !reconciliation || generating || snapshot.cached || !!pendingTurn}>
              {generating ? 'Codex sta analizzando…' : report ? 'Rigenera analisi' : 'Genera analisi con Codex'}
            </button>}
            {snapshot.cached && <p className="content-note">Per generare una nuova analisi, aggiorna prima il metagame online.</p>}
          </>}
        </div>
      </div>
      <details className="meta-provenance meta-disclosure">
        <summary>{snapshot.decks.length} archetipi Limitless · {snapshot.cached ? 'copia locale' : `aggiornato ${date(snapshot.fetchedAt)}`}</summary>
        <button type="button" className="text-button" onClick={() => void window.projectsApi.openLimitless(snapshot.sourceUrl)}>Apri fonte Limitless ↗</button>
        <p>{snapshot.period} · Standard occidentale · acquisito {date(snapshot.fetchedAt)}. Le quote indicano il meta, non il winrate.</p>
        {selected && selectedInCurrentMeta && <p>{selected.name} · {selected.points} punti Limitless.</p>}
        {selected && !report && <button type="button" className="text-button" onClick={() => void window.projectsApi.openLimitless(selected.url)}>Apri archetipo su Limitless ↗</button>}
      </details>
    </>}
  </section>
}
