import { useEffect, useState, type FormEvent } from 'react'
import type { DeckThread, DeckVersion } from '../../shared/deck-threads'
import type { DeckCandidate } from '../../shared/deck-threads'
import type { AiModel, AiPreferences } from '../../shared/ai'
import type { DeckBaseline, ParsedDeck } from '../../shared/deck-import'
import { parseDeck } from '../../shared/deck-import'
import type { CatalogView } from '../../shared/catalog'
import type { DeckConstraint } from '../../shared/constraints'
import { compareDecks, type DeckDiff } from '../../shared/deck-diff'
import { reviewCandidate } from '../../shared/candidate-review'
import type { StandardRuleAudit } from '../../shared/standard-rule-audit'

interface Props {
  projectId: string
  mainImportedAt: string | null
  onAdopt(baseline: DeckBaseline): void
}

function DiffView({ title, diff, beforeLabel = 'PRINCIPALE' }: { title: string; diff: DeckDiff; beforeLabel?: string }) {
  return <div className="thread-diff"><strong>{title}: {diff.beforeTotal} → {diff.afterTotal} carte</strong>
    {diff.byName.length === 0 ? <p>Nessuna variazione nelle quantità per nome.</p> : <div className="diff-table" role="table" aria-label={title}>
      <div className="diff-row diff-header" role="row"><span>{beforeLabel}</span><span>CAMBIO</span><span>PROPOSTA</span></div>
      {diff.byName.map((item) => <div className="diff-row" role="row" key={item.name}>
        <span>{item.before}× {item.name}</span><strong className={`delta ${item.delta > 0 ? 'plus' : 'minus'}`}>{item.delta > 0 ? '+' : ''}{item.delta}</strong>
        <span>{item.after}× {item.name}</span></div>)}</div>}
    {diff.byPrint.length > 0 && <details><summary>Stampe indicate ({diff.byPrint.length} variazioni)</summary><ul>{diff.byPrint.map((item) =>
      <li key={item.name}>{item.name}: {item.before} → {item.after}</li>)}</ul></details>}
  </div>
}

function ComparisonList({ title, parsed }: { title: string; parsed: ParsedDeck | null }) {
  return <section className="comparison-list"><div className="comparison-list-title"><strong>{title}</strong><span>{parsed?.interpretedTotal ?? 0} carte</span></div>
    <div className="comparison-list-scroll">{parsed ? parsed.lines.filter((line) => line.kind === 'card').map((line) =>
      <div className="comparison-card" key={line.lineNumber}><strong>{line.quantity}×</strong><span>{line.name}</span><small>{line.setCode ? `${line.setCode} ${line.cardNumber}` : 'stampa non indicata'}</small></div>)
      : <p>Nessuna lista principale.</p>}</div></section>
}

function CandidateDetail({ candidate, thread, versions, catalog, constraints, audit, working, featured, onAdopt }: {
  candidate: DeckCandidate; thread: DeckThread; versions: DeckVersion[]; catalog: CatalogView | null
  constraints: DeckConstraint[]; audit: StandardRuleAudit | null; working: boolean; featured?: boolean; onAdopt(candidate: DeckCandidate): void
}) {
  const base = versions.find((version) => version.id === thread.baseVersionId)
  const current = versions[0]
  const adopted = versions.find((version) => version.adoption?.candidateId === candidate.id)
  const review = catalog ? reviewCandidate(thread.projectId, candidate, catalog, constraints,
    new Date().toLocaleDateString('sv-SE'), audit) : null
  const comparisonDeck = review ? parseDeck(review.normalizedRawText) : candidate.parsed
  return <details className={`thread-candidate ${featured ? 'featured' : ''}`} open={featured || undefined}>
    <summary>Candidata {candidate.sequence} · {candidate.origin === 'ai' ? 'Codex' : 'manuale'} · {candidate.parsed.interpretedTotal} carte · {adopted ? `adottata in v${adopted.sequence}` : thread.stale ? 'base superata' : 'proposta nuova'}</summary>
    <div className="candidate-identities"><div><span>01 · PRINCIPALE</span><strong>{current ? `v${current.sequence} · ${current.parsed.interpretedTotal}/60` : 'Nessuna lista principale'}</strong><small>Lista usata dal progetto adesso</small></div>
      <b aria-hidden="true">→</b><div><span>02 · PROPOSTA</span><strong>Candidata {candidate.sequence} · {candidate.parsed.interpretedTotal}/60</strong><small>Salvata solo in questo thread</small></div></div>
    {candidate.note && <p>{candidate.note}</p>}
    {candidate.origin === 'ai' && <div className="candidate-source-strip"><strong>Fonti della proposta</strong>
      {candidate.sources.length === 0 ? <span>Nessuna fonte collegata</span> : candidate.sources.slice(0, 2).map((source) => source.url
        ? <button key={source.id} type="button" className="text-button" onClick={() => void window.projectsApi.openDeckSource(source.url!)}>{source.label} ↗</button>
        : <span key={source.id}>{source.label}</span>)}
      {candidate.sources.length > 2 && <span>+{candidate.sources.length - 2} nei dettagli</span>}</div>}
    {current && <DiffView title={`Rispetto alla lista corrente v${current.sequence}`} diff={compareDecks(current.parsed, comparisonDeck)} />}
    {base && base.id !== current?.id && <DiffView title={`Rispetto alla base v${base.sequence}`} diff={compareDecks(base.parsed, comparisonDeck)} beforeLabel="BASE DEL THREAD" />}
    <div className="comparison-lists"><ComparisonList title="Lista principale completa" parsed={current?.parsed ?? null} />
      <ComparisonList title="Lista proposta completa" parsed={comparisonDeck} /></div>
    {review && review.conversions.length > 0 && <p className="candidate-conversions">Testo previsto per l'adozione: {review.conversions.map((item) =>
      `riga ${item.lineNumber} ${item.from} → ${item.to}`).join('; ')}. La proposta originale resta nel thread.</p>}
    {review && <div className="thread-review"><strong>Controlli prima dell'adozione</strong>
      {review.blockers.length > 0 && <ul className="thread-blockers">{review.blockers.map((item, index) => <li key={index}>{item}</li>)}</ul>}
      {review.toReview.length > 0 && <details><summary>Da verificare ({review.toReview.length})</summary><ul>{review.toReview.map((item, index) => <li key={index}>{item}</li>)}</ul></details>}
      <p>Legalità torneo indeterminata. I vincoli e i controlli si ricalcolano sulla candidata completa.</p>
    </div>}
    {thread.stale && <p className="diagnostics">Base del thread superata: la candidata resta salvata, ma l'adozione è bloccata. Confrontala con la lista corrente e crea un nuovo thread dalla versione attuale.</p>}
    {!adopted && <div className="candidate-adoption"><div><strong>Decisione sul mazzo intero</strong><p>La proposta non modifica la lista principale senza una conferma esplicita.</p></div>
      <button type="button" className="primary-button" disabled={working || thread.stale || !current || !review || review.blockers.length > 0}
        onClick={() => onAdopt(candidate)}>Adotta l'intera lista candidata</button></div>}
    <details className="candidate-evidence"><summary>Motivi, fonti, dati tecnici e testo originale</summary>
      <p>Proposta {candidate.origin === 'ai' ? 'Codex' : 'manuale'} · {displayDate(candidate.createdAt)}</p>
      {candidate.aiConfig && <p className="content-note">AI: {candidate.aiConfig.model ?? 'Automatico'} / {candidate.aiConfig.reasoningEffort ?? 'predefinito'}</p>}
      {candidate.sources.length > 0 && <div className="content-note">Fonti: {candidate.sources.map((source) =>
        source.url ? <button key={source.id} type="button" className="text-button"
          onClick={() => void window.projectsApi.openDeckSource(source.url!)}>{source.label} ↗</button>
          : <span key={source.id}>{source.label}; </span>)}</div>}
      {candidate.checks.length > 0 && <ul>{candidate.checks.map((check, index) => <li key={index}>{check}</li>)}</ul>}
      {candidate.parsed.diagnostics.length > 0 && <p className="content-note">{candidate.parsed.diagnostics.length} note di importazione da controllare.</p>}
      {review && review.conversions.length > 0 && <div className="thread-review"><strong>Testo che sarà adottato</strong>
        <p>Codici verificati in Limitless: {review.conversions.map((item) =>
          `riga ${item.lineNumber} ${item.from} → ${item.to}`).join('; ')}. La candidata originale resta nel thread.</p>
        <pre>{review.normalizedRawText}</pre></div>}
      <pre>{candidate.rawText}</pre>
    </details>
  </details>
}

function displayDate(value: string): string {
  return new Intl.DateTimeFormat('it-IT', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value))
}

export function ThreadsSection({ projectId, mainImportedAt, onAdopt }: Props) {
  const [versions, setVersions] = useState<DeckVersion[]>([])
  const [threads, setThreads] = useState<DeckThread[]>([])
  const [catalog, setCatalog] = useState<CatalogView | null>(null)
  const [constraints, setConstraints] = useState<DeckConstraint[]>([])
  const [ruleAudit, setRuleAudit] = useState<StandardRuleAudit | null>(null)
  const [aiModels, setAiModels] = useState<AiModel[]>([])
  const [overrides, setOverrides] = useState<Record<string, AiPreferences>>({})
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [openingNote, setOpeningNote] = useState('')
  const [message, setMessage] = useState('')
  const [proposalRequest, setProposalRequest] = useState('')
  const [candidateText, setCandidateText] = useState('')
  const [candidateNote, setCandidateNote] = useState('')
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState(false)
  const [asking, setAsking] = useState(false)
  const [proposing, setProposing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmCandidate, setConfirmCandidate] = useState<DeckCandidate | null>(null)
  const selected = threads.find((thread) => thread.id === selectedId) ?? null
  const featuredCandidate = selected?.candidates.at(-1) ?? null
  const selectedOverride = selected ? overrides[selected.id] ?? { model: null, reasoningEffort: null } : null
  const selectedModel = aiModels.find((model) => model.id === selectedOverride?.model)
  const timeline = selected ? [
    ...selected.messages.map((item) => ({ kind: 'message' as const, item })),
    ...selected.candidates.map((item) => ({ kind: 'candidate' as const, item }))
  ].sort((a, b) => a.item.createdAt.localeCompare(b.item.createdAt)) : []

  useEffect(() => {
    let active = true
    setLoading(true)
    setError(null)
    void Promise.all([window.projectsApi.listDeckVersions(projectId), window.projectsApi.listDeckThreads(projectId),
      window.projectsApi.getCatalog(), window.projectsApi.listConstraints(projectId), window.projectsApi.getStandardRuleAudit()])
      .then(([versionResult, threadResult, catalogResult, constraintResult, auditResult]) => {
        if (!active) return
        if (!versionResult.ok) throw new Error(versionResult.error)
        if (!threadResult.ok) throw new Error(threadResult.error)
        if (!catalogResult.ok) throw new Error(catalogResult.error)
        if (!constraintResult.ok) throw new Error(constraintResult.error)
        if (!auditResult.ok) throw new Error(auditResult.error)
        setVersions(versionResult.value)
        setThreads(threadResult.value)
        setCatalog(catalogResult.value)
        setConstraints(constraintResult.value)
        setRuleAudit(auditResult.value)
        setSelectedId((current) => threadResult.value.some((thread) => thread.id === current)
          ? current : threadResult.value[0]?.id ?? null)
        const first = threadResult.value[0]
        setCandidateText(first?.candidates.at(-1)?.rawText ??
          versionResult.value.find((version) => version.id === first?.baseVersionId)?.rawText ?? '')
      })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : 'Impossibile leggere i thread.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [projectId, mainImportedAt])

  useEffect(() => {
    let active = true
    void window.projectsApi.getAiConnection().then((result) => {
      if (active && result.ok) setAiModels(result.value.models)
    }).catch(() => undefined)
    return () => { active = false }
  }, [])

  function selectThread(thread: DeckThread): void {
    setSelectedId(thread.id)
    setCandidateText(thread.candidates.at(-1)?.rawText ??
      versions.find((version) => version.id === thread.baseVersionId)?.rawText ?? '')
    setCandidateNote('')
    setMessage('')
    setProposalRequest('')
  }

  async function create(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    if (working) return
    setWorking(true)
    setError(null)
    try {
      const result = await window.projectsApi.createDeckThread({ projectId, title, openingNote })
      if (!result.ok) throw new Error(result.error)
      setThreads((current) => [result.value, ...current])
      selectThread(result.value)
      setTitle('')
      setOpeningNote('')
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Thread non creato.') }
    finally { setWorking(false) }
  }

  async function addMessage(): Promise<void> {
    if (!selected || working) return
    setWorking(true)
    setError(null)
    try {
      const result = await window.projectsApi.addDeckThreadMessage(projectId, selected.id, message)
      if (!result.ok) throw new Error(result.error)
      setThreads((current) => current.map((thread) => thread.id === selected.id ? result.value : thread))
      setMessage('')
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Messaggio non salvato.') }
    finally { setWorking(false) }
  }

  async function ask(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    if (!selected || working) return
    setWorking(true)
    setAsking(true)
    setError(null)
    try {
      const result = await window.projectsApi.askDeckThread(projectId, selected.id, message,
        selectedOverride?.model ? selectedOverride : null)
      if (!result.ok) throw new Error(result.error)
      setThreads((current) => current.map((thread) => thread.id === selected.id ? result.value : thread))
      setMessage('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Risposta Codex non completata.')
      const current = await window.projectsApi.listDeckThreads(projectId)
      if (current.ok) setThreads(current.value)
    }
    finally { setWorking(false); setAsking(false) }
  }

  async function saveCandidate(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    if (!selected || working) return
    setWorking(true)
    setError(null)
    try {
      const result = await window.projectsApi.saveDeckCandidate({
        projectId, threadId: selected.id, rawText: candidateText, note: candidateNote
      })
      if (!result.ok) throw new Error(result.error)
      setThreads((current) => current.map((thread) => thread.id === selected.id ? result.value : thread))
      setCandidateNote('')
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Candidata non salvata.') }
    finally { setWorking(false) }
  }

  async function propose(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    if (!selected || working) return
    setWorking(true)
    setProposing(true)
    setError(null)
    try {
      const result = await window.projectsApi.proposeDeckThread(projectId, selected.id, proposalRequest,
        selectedOverride?.model ? selectedOverride : null)
      if (!result.ok) throw new Error(result.error)
      setThreads((current) => current.map((thread) => thread.id === selected.id ? result.value : thread))
      setCandidateText(result.value.candidates.at(-1)?.rawText ?? candidateText)
      setProposalRequest('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Proposta Codex non completata.')
      const current = await window.projectsApi.listDeckThreads(projectId)
      if (current.ok) setThreads(current.value)
    }
    finally { setWorking(false); setProposing(false) }
  }

  async function adopt(candidate: DeckCandidate): Promise<void> {
    if (!selected || !selected.currentVersionId || working) return
    setWorking(true)
    setError(null)
    try {
      const result = await window.projectsApi.adoptDeckCandidate({ projectId, threadId: selected.id,
        candidateId: candidate.id, expectedHeadId: selected.currentVersionId })
      if (!result.ok) throw new Error(result.error)
      onAdopt(result.value)
      setConfirmCandidate(null)
      const [newVersions, newThreads] = await Promise.all([
        window.projectsApi.listDeckVersions(projectId), window.projectsApi.listDeckThreads(projectId)
      ])
      if (newVersions.ok) setVersions(newVersions.value)
      if (newThreads.ok) setThreads(newThreads.value)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Adozione non riuscita.') }
    finally { setWorking(false) }
  }

  return <><section className="threads-section" aria-label="Thread del mazzo">
    <div className="panel-heading"><div><span className="eyebrow">Esplora in parallelo</span><h2>Thread del mazzo</h2></div></div>
    <p className="content-note">Ogni thread esplora una direzione. La proposta resta separata dalla lista principale finché non confermi l’adozione dell’intera lista.</p>
    {error && <div className="error-banner" role="alert">{error}</div>}
    {loading ? <p className="content-note">Caricamento thread…</p> : <>
      <div className="threads-layout">
        <aside className="threads-sidebar">
          <details className="new-thread-details"><summary>＋ Nuovo thread</summary><form className="thread-form" onSubmit={(event) => void create(event)}>
            <h3>Nuovo thread</h3>
            <label htmlFor="thread-title">Titolo</label>
            <input id="thread-title" value={title} maxLength={120} onChange={(event) => setTitle(event.target.value)} placeholder="Es. Variante più veloce" required />
            <label htmlFor="thread-opening">Prima osservazione (facoltativa)</label>
            <textarea id="thread-opening" value={openingNote} maxLength={5000} onChange={(event) => setOpeningNote(event.target.value)} />
            <button className="primary-button" disabled={working || !title.trim()}>Crea thread</button>
          </form></details>
          <div className="thread-picker" aria-label="Thread salvati">
            {threads.length === 0 && <p className="content-note">Nessun thread creato.</p>}
            {threads.map((thread) => <button key={thread.id} type="button" className={thread.id === selectedId ? 'active' : ''}
              onClick={() => selectThread(thread)}>
              <strong>{thread.title}</strong>
              <small>{thread.baseVersionNumber === null ? 'Senza lista iniziale' : `Base v${thread.baseVersionNumber}`} · {thread.candidates.length} candidate{thread.stale ? ' · Da confrontare' : ''}</small>
            </button>)}
          </div>
        </aside>
        <div className="thread-detail">
          {selected ? <>
            <div className="thread-heading"><div><h3>{selected.title}</h3><p className="content-note">Creato il {displayDate(selected.createdAt)} · {selected.baseVersionNumber === null ? 'Senza lista iniziale' : `Versione di partenza: v${selected.baseVersionNumber}`} · {selected.aiSessionRef ? 'Sessione Codex collegata' : 'Nessuna sessione Codex'}</p></div>
              {selected.stale && <span className="matchup-freshness stale">Base da confrontare</span>}</div>
            {selected.stale && <p className="stale-discussion">La lista principale è cambiata dopo la creazione di questo thread. Confronta le versioni prima di usare una candidata.</p>}
            {featuredCandidate ? <CandidateDetail key={featuredCandidate.id} candidate={featuredCandidate} thread={selected} versions={versions}
              catalog={catalog} constraints={constraints} audit={ruleAudit} working={working} featured onAdopt={setConfirmCandidate} />
              : <div className="thread-no-candidate"><strong>Nessuna proposta salvata</strong><p>Discuti un’ipotesi o chiedi a Codex una lista completa. La principale rimane consultabile nel pannello fisso.</p></div>}
            <details className="thread-ai-options"><summary>Modello e ragionamento per questo thread</summary><div className="thread-form">
              <label htmlFor="thread-ai-model">Modello Codex per questo thread</label>
              <select id="thread-ai-model" value={selectedOverride?.model ?? ''} disabled={working}
                onChange={(event) => setOverrides((current) => ({ ...current, [selected.id]: {
                  model: event.target.value || null, reasoningEffort: null } }))}>
                <option value="">Usa preferenze globali</option>
                {aiModels.map((model) => <option key={model.id} value={model.id}>{model.name}</option>)}
              </select>
              <label htmlFor="thread-ai-effort">Ragionamento per questo thread</label>
              <select id="thread-ai-effort" value={selectedOverride?.reasoningEffort ?? ''}
                disabled={working || !selectedModel}
                onChange={(event) => setOverrides((current) => ({ ...current, [selected.id]: {
                  model: selectedOverride?.model ?? null, reasoningEffort: event.target.value || null } }))}>
                <option value="">Predefinito</option>
                {selectedModel?.reasoningEfforts.map((effort) => <option key={effort.id} value={effort.id}>{effort.id}</option>)}
              </select>
            </div></details>
            <div className="thread-timeline"><h4>Discussione e proposte precedenti</h4>
              {timeline.filter((entry) => entry.kind !== 'candidate' || entry.item.id !== featuredCandidate?.id).map((entry) => entry.kind === 'message' ? <div className="thread-message" key={entry.item.id}><small>{entry.item.author === 'user' ? 'Tu' : 'Codex'} · {displayDate(entry.item.createdAt)}{entry.item.aiConfig ? ` · ${entry.item.aiConfig.model ?? 'Automatico'} / ${entry.item.aiConfig.reasoningEffort ?? 'predefinito'} · ${entry.item.aiConfig.source === 'override' ? 'scelta del thread' : 'preferenze globali'}` : ''}</small><p>{entry.item.text}</p></div> : <CandidateDetail key={entry.item.id} candidate={entry.item} thread={selected} versions={versions}
                catalog={catalog} constraints={constraints} audit={ruleAudit} working={working} onAdopt={setConfirmCandidate} />)}
            </div>
            <form className="thread-form" onSubmit={(event) => void ask(event)}>
              <label htmlFor="thread-message">Scrivi nel thread</label>
              <textarea id="thread-message" value={message} maxLength={5000} onChange={(event) => setMessage(event.target.value)} />
              <p className="content-note">Codex risponde usando la lista di partenza e la cronologia del thread. La lista principale non cambia. Se la richiesta fallisce, il testo resta qui per riprovare.</p>
              <button className="primary-button" disabled={working || !message.trim()}>{asking ? 'Codex sta rispondendo…' : 'Chiedi a Codex'}</button>
              <button type="button" className="secondary-button" disabled={working || !message.trim()} onClick={() => void addMessage()}>Salva osservazione</button>
            </form>
            <form className="thread-form candidate-form" onSubmit={(event) => void propose(event)}>
              <h4>Proposta completa con Codex</h4>
              <p className="content-note">Descrivi cosa vuoi migliorare. Codex usa la base del thread, i vincoli, le stampe locali e l'ultimo evento disponibile. Salva una candidata solo se restituisce 60 carte verificabili; la legalità Standard completa resta da accertare.</p>
              <label htmlFor="thread-proposal-request">Modifica da valutare</label>
              <textarea id="thread-proposal-request" value={proposalRequest} maxLength={5000}
                onChange={(event) => setProposalRequest(event.target.value)} />
              <button className="primary-button" disabled={working || !selected.baseVersionId || !proposalRequest.trim()}>
                {proposing ? 'Codex sta preparando la proposta…' : 'Genera proposta Codex'}
              </button>
            </form>
            <details className="manual-candidate"><summary>Incolla manualmente una candidata completa</summary><form className="thread-form candidate-form" onSubmit={(event) => void saveCandidate(event)}>
              <h4>Nuova candidata</h4>
              <p className="content-note">Incolla sempre l'intera lista. Puoi salvare una bozza incompleta: il totale interpretato e le note saranno visibili nella cronologia.</p>
              <label htmlFor="candidate-text">Lista completa proposta</label>
              <textarea id="candidate-text" value={candidateText} onChange={(event) => setCandidateText(event.target.value)} spellCheck={false} />
              <label htmlFor="candidate-note">Motivo o appunti (facoltativo)</label>
              <textarea id="candidate-note" value={candidateNote} maxLength={5000} onChange={(event) => setCandidateNote(event.target.value)} />
              <button className="primary-button" disabled={working || !candidateText.trim()}>Salva candidata nel thread</button>
            </form></details>
          </> : <p className="content-note">Crea un thread per esplorare una variante del mazzo.</p>}
        </div>
      </div>
      <details className="thread-versions"><summary>Versioni principali ({versions.length})</summary>
        {versions.length === 0 ? <p className="content-note">Ancora nessuna lista principale.</p> : versions.map((version, index) =>
          <details key={version.id}><summary>v{version.sequence}{index === 0 ? ' · corrente' : ''}{version.adoption ? ' · adottata da un thread' : ''} · {version.parsed.interpretedTotal} carte · {displayDate(version.createdAt)}</summary><pre>{version.rawText}</pre></details>)}
      </details>
    </>}
  </section>{confirmCandidate && <div className="adoption-modal-backdrop" onKeyDown={(event) => { if (event.key === 'Escape') setConfirmCandidate(null) }}>
    <div className="adoption-dialog" role="dialog" aria-modal="true" aria-labelledby="adoption-title" onKeyDown={(event) => {
      if (event.key !== 'Tab') return
      const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'))
      const first = buttons[0]
      const last = buttons.at(-1)
      if (!first || !last) return
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }}>
      <span className="eyebrow">Conferma esplicita</span><h2 id="adoption-title">Adottare l’intera lista candidata?</h2>
      <p>La candidata {confirmCandidate.sequence} sostituirà la lista principale di questo progetto con {confirmCandidate.parsed.interpretedTotal} carte. Le altre candidate resteranno nei rispettivi thread.</p>
      <div className="dialog-actions"><button type="button" className="secondary-button" autoFocus onClick={() => setConfirmCandidate(null)}>Annulla</button>
        <button type="button" className="primary-button" disabled={working} onClick={() => void adopt(confirmCandidate)}>{working ? 'Adozione…' : 'Confermo: adotta l’intera lista'}</button></div>
    </div>
  </div>}</>
}
