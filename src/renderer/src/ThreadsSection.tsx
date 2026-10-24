import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { DeckThread, DeckThreadMessage, DeckVersion } from '../../shared/deck-threads'
import type { DeckCandidate } from '../../shared/deck-threads'
import type { AiModel, AiPreferences } from '../../shared/ai'
import type { DeckBaseline, ParsedDeck } from '../../shared/deck-import'
import { parseDeck } from '../../shared/deck-import'
import type { CatalogView } from '../../shared/catalog'
import type { DeckConstraint } from '../../shared/constraints'
import { compareDecks, type DeckDiff } from '../../shared/deck-diff'
import { reviewCandidate } from '../../shared/candidate-review'
import type { StandardRuleAudit } from '../../shared/standard-rule-audit'
import type { ThreadEvidencePacket } from '../../shared/thread-evidence'
import { reviewSummary } from './review-summary'
import { ThreadSwitcher } from './ThreadSwitcher'
import { Icon } from './Icon'

interface Props {
  projectId: string
  mainImportedAt: string | null
  onAdopt(baseline: DeckBaseline): void
}

function DiffView({ title, diff, beforeLabel = 'PRINCIPALE' }: { title: string; diff: DeckDiff; beforeLabel?: string }) {
  return <div className="thread-diff"><strong>{title}: {diff.beforeTotal} → {diff.afterTotal} carte</strong>
    {diff.byName.length === 0 ? <p>Nessuna variazione nelle quantità per nome.</p> : <div className="diff-table" role="table" aria-label={title}>
      <div className="diff-row diff-header" role="row"><span role="columnheader">{beforeLabel}</span><span role="columnheader">CAMBIO</span><span role="columnheader">PROPOSTA</span></div>
      {diff.byName.map((item) => <div className="diff-row" role="row" key={item.name}>
        <span role="cell">{item.before}× {item.name}</span><strong role="cell" className={`delta ${item.delta > 0 ? 'plus' : 'minus'}`}>{item.delta > 0 ? '+' : ''}{item.delta}</strong>
        <span role="cell">{item.after}× {item.name}</span></div>)}</div>}
    {diff.byPrint.length > 0 && <details><summary>Stampe indicate ({diff.byPrint.length} variazioni)</summary><ul>{diff.byPrint.map((item) =>
      <li key={item.name}>{item.name}: {item.before} → {item.after}</li>)}</ul></details>}
  </div>
}

function ComparisonList({ title, parsed }: { title: string; parsed: ParsedDeck | null }) {
  return <section className="comparison-list"><div className="comparison-list-title"><strong>{title}</strong><span>{parsed?.interpretedTotal ?? 0} carte</span></div>
    <div className="comparison-list-scroll" role="region" aria-label={title} tabIndex={0}>{parsed ? parsed.lines.filter((line) => line.kind === 'card').map((line) =>
      <div className="comparison-card" key={line.lineNumber}><strong>{line.quantity}×</strong><span>{line.name}</span><small>{line.setCode ? `${line.setCode} ${line.cardNumber}` : 'stampa non indicata'}</small></div>)
      : <p>Nessuna lista principale.</p>}</div></section>
}

function ThreadMessageEvidence({ message }: { message: DeckThreadMessage }) {
  const packet = message.evidence
  if (!packet) return null
  const cited = new Set(message.citedSourceIds ?? [])
  const changed = packet.change.updated.length + packet.change.added.length + packet.change.removed.length
  return <details className="candidate-evidence"><summary>Dati usati · {packet.cardCoverage.withGameplay}/{packet.cardCoverage.selected} schede · {packet.events.length} eventi{changed ? ` · ${changed} cambi` : ''}</summary>
    <p>Contesto del {new Date(packet.capturedAt).toLocaleString('it-IT')} · Catalogo: {packet.catalogSyncedAt ? new Date(packet.catalogSyncedAt).toLocaleString('it-IT') : 'non aggiornato'}. Le risposte precedenti mantengono questi dati.</p>
    {packet.change.updated.length > 0 && <p>Fonti aggiornate: {packet.change.updated.join('; ')}.</p>}
    {packet.change.added.length > 0 && <p>Nuove fonti selezionate: {packet.change.added.join('; ')}.</p>}
    {packet.change.removed.length > 0 && <p>Fonti non selezionate in questo turno: {packet.change.removed.join('; ')}.</p>}
    {packet.cardCoverage.omitted > 0 && <p>{packet.cardCoverage.omitted} carte oltre il limite del contesto; la loro meccanica non è stata inviata.</p>}
    <p>Fonti fornite a Codex; «citata» indica una fonte dichiarata nella risposta, non una verifica automatica della conclusione.</p>
    {packet.sources.length === 0 ? <p>Nessuna scheda o lista pertinente disponibile nell'archivio locale.</p> :
      <ul>{packet.sources.map((source) => <li key={source.id}>{cited.has(source.id) ? <strong>Citata · </strong> : null}
        {source.url ? <button type="button" className="text-button" onClick={() => void window.projectsApi.openDeckSource(source.url!)}>{source.label} ↗</button>
          : source.label}</li>)}</ul>}
    {packet.events.length > 0 && <p>Eventi: {packet.events.map((event) => `${event.name} (${event.date}, ${event.lists.length} liste selezionate su ${event.completeLists} complete)`).join('; ')}. Piazzamenti e liste non sono winrate del tuo mazzo.</p>}
  </details>
}

function EvidencePreview({ packet }: { packet: ThreadEvidencePacket }) {
  return <div className="thread-review"><strong>Anteprima dei dati locali</strong>
    <p>{packet.cardCoverage.withGameplay}/{packet.cardCoverage.selected} schede con testo di gioco; {packet.events.length} eventi, {packet.events.reduce((sum, item) => sum + item.lists.length, 0)} liste selezionate.</p>
    {packet.change.updated.length + packet.change.added.length + packet.change.removed.length > 0 &&
      <p>Rispetto alla risposta precedente: {packet.change.updated.length} fonti aggiornate, {packet.change.added.length} nuove nella selezione, {packet.change.removed.length} non più selezionate.</p>}
    <details><summary>Carte e fonti che verranno inviate</summary>
      <ul>{packet.cards.map((card) => <li key={card.name}><strong>{card.name}</strong> · {card.identityStatus === 'ambiguous' ? 'identità ambigua' : card.identityStatus === 'missing' ? 'scheda assente' : card.printId}
        {card.gameplayText && <p>{card.gameplayText}</p>}</li>)}</ul>
      {packet.cardCoverage.omitted > 0 && <p>{packet.cardCoverage.omitted} carte omesse per il limite del contesto.</p>}
      {packet.events.map((event) => <details key={event.eventId}><summary>{event.name} · {event.date} · {event.lists.length} liste</summary>
        <p>{event.kind === 'online' ? 'Online' : 'In presenza'} · {event.completeLists} liste complete su {event.participants} partecipazioni visibili.</p>
        {event.lists.map((list) => <details key={list.sourceId}><summary>{list.deck} · posto {list.placing ?? '?'}</summary><pre>{list.cards.join('\n')}</pre></details>)}
      </details>)}
    </details>
    <p>Il pacchetto viene ricalcolato al momento dell'invio, così include eventuali aggiornamenti locali nel frattempo.</p>
  </div>
}

function CandidateDetail({ candidate, thread, versions, catalog, constraints, audit, working, featured, onAdopt }: {
  candidate: DeckCandidate; thread: DeckThread; versions: DeckVersion[]; catalog: CatalogView | null
  constraints: DeckConstraint[]; audit: StandardRuleAudit | null; working: boolean; featured?: boolean; onAdopt(candidate: DeckCandidate): void
}) {
  const comparison = useRef<HTMLDetailsElement>(null)
  const base = versions.find((version) => version.id === thread.baseVersionId)
  const current = versions[0]
  const adopted = versions.find((version) => version.adoption?.candidateId === candidate.id)
  const review = catalog ? reviewCandidate(thread.projectId, candidate, catalog, constraints,
    new Date().toLocaleDateString('sv-SE'), audit) : null
  const comparisonDeck = review ? parseDeck(review.normalizedRawText) : candidate.parsed
  const reviewItems = review ? reviewSummary(review.toReview) : []
  const diff = current ? compareDecks(current.parsed, comparisonDeck) : null
  const added = diff?.byName.reduce((sum, item) => sum + Math.max(0, item.delta), 0) ?? 0
  const removed = diff?.byName.reduce((sum, item) => sum + Math.max(0, -item.delta), 0) ?? 0
  const blockers = adopted ? [] : [
    ...(thread.stale ? ['Base superata: apri un nuovo thread dalla lista corrente.'] : []),
    ...(!current ? ['Manca una lista principale.'] : []),
    ...(!review ? ['Controlli non disponibili.'] : review.blockers)
  ]
  const status = adopted ? `Adottata in v${adopted.sequence}` : thread.stale ? 'Base superata' : 'Proposta nuova'
  function closeComparison() {
    if (!comparison.current) return
    comparison.current.open = false
    focusInWorkspace(comparison.current.querySelector('summary'))
  }
  const content = <>
    <div className="candidate-identities"><div><span>LISTA PRINCIPALE</span><strong>{current ? `v${current.sequence} · ${current.parsed.interpretedTotal}/60` : 'Nessuna lista principale'}</strong></div>
      <b aria-hidden="true">→</b><div><span>LISTA PROPOSTA</span><strong>Candidata {candidate.sequence} · {candidate.parsed.interpretedTotal}/60</strong></div></div>
    {candidate.note && <p>{candidate.note}</p>}
    {candidate.origin === 'ai' && <div className="candidate-source-strip"><strong>Fonti della proposta</strong>
      {candidate.sources.length === 0 ? <span>Nessuna fonte collegata</span> : candidate.sources.slice(0, 2).map((source) => source.url
        ? <button key={source.id} type="button" className="text-button" onClick={() => void window.projectsApi.openDeckSource(source.url!)}>{source.label} ↗</button>
        : <span key={source.id}>{source.label}</span>)}
      {candidate.sources.length > 2 && <span>+{candidate.sources.length - 2} nei dettagli</span>}</div>}
    {current && diff && <DiffView title={`Rispetto alla lista corrente v${current.sequence}`} diff={diff} />}
    {base && base.id !== current?.id && <DiffView title={`Rispetto alla base v${base.sequence}`} diff={compareDecks(base.parsed, comparisonDeck)} beforeLabel="BASE DEL THREAD" />}
    {review && review.conversions.length > 0 && <p className="candidate-conversions">Codici adattati per l'adozione: {review.conversions.map((item) =>
      `riga ${item.lineNumber} ${item.from} → ${item.to}`).join('; ')}.</p>}
    {review && <div className="thread-review"><strong>Controlli prima dell'adozione</strong>
      {review.blockers.length > 0 && <ul className="thread-blockers">{review.blockers.map((item, index) => <li key={index}>{item}</li>)}</ul>}
      {reviewItems.length > 0 && <details><summary>Da verificare ({reviewItems.length})</summary><ul>{reviewItems.map((item, index) => <li key={index}>{item}</li>)}</ul></details>}
      <p>Legalità torneo da verificare.</p>
    </div>}
    {thread.stale && <p className="diagnostics">Base superata · adozione bloccata. Confronta la proposta con la lista corrente e apri un nuovo thread.</p>}
    {!adopted && <div className="candidate-adoption">
      <button type="button" className="primary-button" disabled={working || thread.stale || !current || !review || review.blockers.length > 0}
        onClick={() => onAdopt(candidate)}>Adotta l'intera lista candidata</button></div>}
    <div className="comparison-lists"><ComparisonList title="Lista principale completa" parsed={current?.parsed ?? null} />
      <ComparisonList title="Lista proposta completa" parsed={comparisonDeck} /></div>
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
        <pre>{review.normalizedRawText}</pre></div>}
      <pre>{candidate.rawText}</pre>
    </details>
  </>
  if (!featured) return <details className="thread-candidate">
    <summary>Candidata {candidate.sequence} · {candidate.origin === 'ai' ? 'Codex' : 'manuale'} · {candidate.parsed.interpretedTotal} carte · {status}</summary>
    <div className="candidate-comparison-body">{content}</div>
  </details>
  return <section className="thread-candidate featured" aria-labelledby={`candidate-title-${candidate.id}`}>
    <div className="candidate-brief">
      <div className="candidate-brief-heading">
        <h3 id={`candidate-title-${candidate.id}`}>Candidata {candidate.sequence} <span>· {candidate.parsed.interpretedTotal} carte</span></h3>
        <span className="candidate-state">{status}</span>
      </div>
      <p className="candidate-change-summary">{diff ? <>
        {added || removed ? <strong>+{added} / −{removed} copie</strong>
          : <strong>{diff.byPrint.length ? 'Cambiano solo le stampe' : 'Nessuna variazione'}</strong>}
        <span> rispetto alla principale v{current!.sequence}</span>
      </> : 'Nessuna lista principale da confrontare.'}</p>
      {blockers.length > 0 && <p className="candidate-blocked"><strong>Adozione bloccata.</strong> {blockers[0]}
        {blockers.length > 1 && <span> Altri {blockers.length - 1} blocchi nel confronto.</span>}</p>}
      <p className="candidate-caution">{reviewItems.length > 0 && <span>{reviewItems.length} verifiche aperte · </span>}Legalità torneo da verificare.</p>
      <span className="candidate-origin">{candidate.origin === 'ai'
        ? `Codex · ${candidate.sources.length ? `${candidate.sources.length} fonti nel confronto` : 'nessuna fonte collegata'}` : 'Proposta manuale'}</span>
    </div>
    <details ref={comparison} className="candidate-comparison" onToggle={(event) => {
      if (event.target !== event.currentTarget || !event.currentTarget.open) return
      const main = event.currentTarget.closest<HTMLElement>('.main-content')
      const heading = event.currentTarget.querySelector('summary')?.getBoundingClientRect()
      if (!main || !heading) return
      const bounds = main.getBoundingClientRect()
      if (heading.bottom > bounds.bottom - 200) main.scrollTop += heading.top - bounds.top - 16
    }} onKeyDown={(event) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeComparison() }
    }}>
      <summary><span className="comparison-closed-label">Apri confronto</span><span className="comparison-open-label">Chiudi confronto</span></summary>
      <div className="candidate-comparison-body">{content}
        <button type="button" className="secondary-button close-comparison" onClick={closeComparison}>Chiudi confronto</button>
      </div>
    </details>
  </section>
}

function displayDate(value: string): string {
  return new Intl.DateTimeFormat('it-IT', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value))
}

function focusInWorkspace(element: HTMLElement | null): void {
  const main = element?.closest<HTMLElement>('.main-content')
  if (!element || !main) return
  element.focus({ preventScroll: true })
  const bounds = main.getBoundingClientRect()
  const target = element.getBoundingClientRect()
  if (target.top < bounds.top || target.bottom > bounds.bottom) main.scrollTop += target.top - bounds.top - 24
}

export function ThreadsSection({ projectId, mainImportedAt, onAdopt }: Props) {
  const newThreadTrigger = useRef<HTMLButtonElement>(null)
  const newThreadTitle = useRef<HTMLInputElement>(null)
  const newThreadError = useRef<HTMLDivElement>(null)
  const returnCreateFocus = useRef(false)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const adoptionTrigger = useRef<HTMLElement | null>(null)
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
  const [preview, setPreview] = useState<{ kind: 'ask' | 'proposal'; prompt: string; packet: ThreadEvidencePacket } | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [candidateText, setCandidateText] = useState('')
  const [candidateNote, setCandidateNote] = useState('')
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState(false)
  const [asking, setAsking] = useState(false)
  const [proposing, setProposing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmCandidate, setConfirmCandidate] = useState<DeckCandidate | null>(null)
  useEffect(() => {
    if (creating) focusInWorkspace(newThreadTitle.current)
    else if (returnCreateFocus.current) {
      focusInWorkspace(newThreadTrigger.current)
      returnCreateFocus.current = false
    }
  }, [creating])
  useEffect(() => {
    if (createError) focusInWorkspace(newThreadError.current)
  }, [createError])
  useEffect(() => {
    if (!confirmCandidate && !loading && !working && adoptionTrigger.current) {
      if (adoptionTrigger.current.isConnected) focusInWorkspace(adoptionTrigger.current)
      else focusInWorkspace(document.getElementById('thread-switcher-trigger'))
      adoptionTrigger.current = null
    }
  }, [confirmCandidate, loading, working])

  function confirmAdoption(candidate: DeckCandidate) {
    adoptionTrigger.current = document.activeElement as HTMLElement
    setConfirmCandidate(candidate)
  }

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
    setPreview(null)
  }

  function closeCreate(): void {
    returnCreateFocus.current = true
    setCreating(false)
    setTitle('')
    setOpeningNote('')
    setCreateError(null)
  }

  async function previewEvidence(kind: 'ask' | 'proposal'): Promise<void> {
    if (!selected || previewLoading) return
    const prompt = kind === 'ask' ? message : proposalRequest
    if (!prompt.trim()) return
    setPreviewLoading(true)
    setError(null)
    try {
      const result = await window.projectsApi.previewDeckThreadEvidence(projectId, selected.id, prompt)
      if (!result.ok) throw new Error(result.error)
      setPreview({ kind, prompt, packet: result.value })
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Anteprima non disponibile.') }
    finally { setPreviewLoading(false) }
  }

  async function create(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    if (working) return
    setWorking(true)
    setCreateError(null)
    try {
      const result = await window.projectsApi.createDeckThread({ projectId, title, openingNote })
      if (!result.ok) throw new Error(result.error)
      setThreads((current) => [result.value, ...current])
      selectThread(result.value)
      closeCreate()
    } catch (cause) { setCreateError(cause instanceof Error ? cause.message : 'Thread non creato.') }
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
      setPreview(null)
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
      setPreview(null)
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
      setPreview(null)
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
    <div className="panel-heading"><h2>Thread del mazzo</h2></div>
    {error && !confirmCandidate && <div className="error-banner" role="alert">{error}</div>}
    {loading ? <p className="content-note">Caricamento thread…</p> : <>
      <div className="threads-layout">
        <div className="threads-toolbar">
          <ThreadSwitcher threads={threads} selected={selected} versions={versions} disabled={working || creating}
            onSelect={selectThread} />
          <button ref={newThreadTrigger} type="button" className="secondary-button" aria-expanded={creating}
            aria-controls="new-thread-form" disabled={working} onClick={() => creating ? closeCreate() : setCreating(true)}>
            <Icon name="plus" />Nuovo thread
          </button>
        </div>
        {creating && <form id="new-thread-form" className="thread-form new-thread-form" aria-labelledby="new-thread-heading"
          onSubmit={(event) => void create(event)} onKeyDown={(event) => {
            if (event.key === 'Escape' && !working) { event.preventDefault(); closeCreate() }
          }}>
            <h3 id="new-thread-heading">Nuovo thread</h3>
            <label htmlFor="thread-title">Titolo</label>
            <input ref={newThreadTitle} id="thread-title" value={title} disabled={working} maxLength={120} onChange={(event) => setTitle(event.target.value)} placeholder="Es. Variante più veloce" required />
            <label htmlFor="thread-opening">Prima osservazione (facoltativa)</label>
            <textarea id="thread-opening" value={openingNote} disabled={working} maxLength={5000} onChange={(event) => setOpeningNote(event.target.value)} />
            {createError && <div ref={newThreadError} className="error-banner" role="alert" tabIndex={-1}>{createError}</div>}
            <div className="thread-form-actions">
              <button className="primary-button" disabled={working || !title.trim()}>{working ? 'Creazione…' : 'Crea thread'}</button>
              <button type="button" className="secondary-button" disabled={working} onClick={closeCreate}>Annulla</button>
            </div>
        </form>}
        <div className="thread-detail">
          {selected ? <>
            {!featuredCandidate && selected.stale && <p className="diagnostics">Base superata: apri un nuovo thread dalla lista corrente.</p>}
            {featuredCandidate ? <CandidateDetail key={featuredCandidate.id} candidate={featuredCandidate} thread={selected} versions={versions}
              catalog={catalog} constraints={constraints} audit={ruleAudit} working={working} featured onAdopt={confirmAdoption} />
              : <p className="thread-no-candidate">Nessuna proposta salvata.</p>}
            <div className="thread-timeline"><h4>Conversazione</h4>
              {timeline.filter((entry) => entry.kind !== 'candidate' || entry.item.id !== featuredCandidate?.id).map((entry) => entry.kind === 'message' ? <div className="thread-message" data-author={entry.item.author} key={entry.item.id}><small>{entry.item.author === 'user' ? 'Tu' : 'Codex'} · {displayDate(entry.item.createdAt)}</small><p>{entry.item.text}</p><ThreadMessageEvidence message={entry.item} />{entry.item.aiConfig && <details><summary>Dettagli AI</summary><p>{entry.item.aiConfig.model ?? 'Automatico'} / {entry.item.aiConfig.reasoningEffort ?? 'predefinito'} · {entry.item.aiConfig.source === 'override' ? 'scelta del thread' : 'preferenze globali'}</p></details>}</div> : <CandidateDetail key={entry.item.id} candidate={entry.item} thread={selected} versions={versions}
                catalog={catalog} constraints={constraints} audit={ruleAudit} working={working} onAdopt={confirmAdoption} />)}
            </div>
            <form className="thread-form" onSubmit={(event) => void ask(event)}>
              <label htmlFor="thread-message">Scrivi nel thread</label>
              <textarea id="thread-message" value={message} maxLength={5000} onChange={(event) => { setMessage(event.target.value); setPreview(null) }} />
              <p className="content-note">Base, candidata e fonti locali sono incluse nella richiesta.</p>
              <button type="button" className="secondary-button" disabled={!message.trim() || previewLoading || working} onClick={() => void previewEvidence('ask')}>{previewLoading ? 'Preparo i dati…' : 'Vedi dati inviati a Codex'}</button>
              {preview?.kind === 'ask' && preview.prompt === message && <EvidencePreview packet={preview.packet} />}
              <div className="thread-form-actions"><button className="primary-button" disabled={working || !message.trim()}>{asking ? 'Codex sta rispondendo…' : 'Chiedi a Codex'}</button>
              <button type="button" className="secondary-button" disabled={working || !message.trim()} onClick={() => void addMessage()}>Salva osservazione</button></div>
            </form>
            <details className="thread-ai-options"><summary>Dettagli del thread e AI</summary><div className="thread-form"><p className="content-note">Creato il {displayDate(selected.createdAt)}</p>
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
            <form className="thread-form candidate-form" onSubmit={(event) => void propose(event)}>
              <h4>Proposta completa con Codex</h4>
              <p className="content-note">Descrivi cosa cambiare. Riceverai una lista completa da confrontare.</p>
              <label htmlFor="thread-proposal-request">Modifica da valutare</label>
              <textarea id="thread-proposal-request" value={proposalRequest} maxLength={5000}
                onChange={(event) => { setProposalRequest(event.target.value); setPreview(null) }} />
              <button type="button" className="secondary-button" disabled={!proposalRequest.trim() || previewLoading || working} onClick={() => void previewEvidence('proposal')}>{previewLoading ? 'Preparo i dati…' : 'Vedi dati inviati a Codex'}</button>
              {preview?.kind === 'proposal' && preview.prompt === proposalRequest && <EvidencePreview packet={preview.packet} />}
              <button className="primary-button" disabled={working || !selected.baseVersionId || !proposalRequest.trim()}>
                {proposing ? 'Codex sta preparando la proposta…' : 'Genera proposta Codex'}
              </button>
            </form>
            <details className="manual-candidate"><summary>Incolla manualmente una candidata completa</summary><form className="thread-form candidate-form" onSubmit={(event) => void saveCandidate(event)}>
              <h4>Nuova candidata</h4>
              <p className="content-note">Incolla l'intera lista. Puoi salvare anche una bozza incompleta.</p>
              <label htmlFor="candidate-text">Lista completa proposta</label>
              <textarea id="candidate-text" value={candidateText} onChange={(event) => setCandidateText(event.target.value)} spellCheck={false} />
              <label htmlFor="candidate-note">Motivo o appunti (facoltativo)</label>
              <textarea id="candidate-note" value={candidateNote} maxLength={5000} onChange={(event) => setCandidateNote(event.target.value)} />
              <button className="primary-button" disabled={working || !candidateText.trim()}>Salva candidata nel thread</button>
            </form></details>
          </> : !creating && <p className="content-note">Crea un thread per esplorare una variante del mazzo.</p>}
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
      <p>La candidata {confirmCandidate.sequence} ({confirmCandidate.parsed.interpretedTotal} carte) sostituirà la lista principale. Le altre candidate resteranno nei rispettivi thread.</p>
      {error && <div className="error-banner" role="alert">{error}</div>}
      <div className="dialog-actions"><button type="button" className="secondary-button" autoFocus onClick={() => setConfirmCandidate(null)}>Annulla</button>
        <button type="button" className="primary-button" disabled={working} onClick={() => void adopt(confirmCandidate)}>{working ? 'Adozione…' : 'Confermo: adotta l’intera lista'}</button></div>
    </div>
  </div>}</>
}
