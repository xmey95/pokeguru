import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import type { DeckThread, DeckThreadMessage, DeckThreadSummary, DeckVersion } from '../../shared/deck-threads'
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
import type { AiJobSummary } from '../../shared/ai-job'
import { localCalendarDate } from '../../shared/calendar-date'
import { reviewSummary } from './review-summary'
import { ThreadSwitcher } from './ThreadSwitcher'
import { ThreadMarkdown } from './ThreadMarkdown'
import { Icon } from './Icon'
import { useNavigation, useViewState, useDraftState, useBusyState, useBusyStartedAt } from './Navigation'
import { ActivityStatus, InlineLoading, LoadingSkeleton, Spinner } from './Loading'
import { catalogCardTargets, guideSourceTarget, tcgdexCardPrintId } from './guide-links'
import { useCardPreview } from './CardPreview'
import { ExpandablePreviewDeck } from './PreviewDeckLines'
import { AiQueryTraceView } from './AiQueryTraceView'
import { AiPromptAuditView } from './AiPromptAuditView'

interface Props {
  projectId: string
  mainContextKey: string | null
  onAdopt(baseline: DeckBaseline): void
}

function ThreadSource({ source, cardTargets, onOpenCatalogCard }: {
  source: { id: string; label: string; url: string | null }
  cardTargets: ReadonlyMap<string, string>
  onOpenCatalogCard(identityId: string): void
}) {
  const preview = useCardPreview()
  const printId = source.url ? tcgdexCardPrintId(source.url) : null
  const previewProps = printId ? preview({ name: source.label, printId }) : {}
  const target = source.url ? guideSourceTarget(source.url, cardTargets) : undefined
  if (target?.kind === 'catalog') return <button type="button" className="text-button"
    onClick={() => onOpenCatalogCard(target.identityId)} {...previewProps}>{source.label} · Catalogo</button>
  if (target) return <button type="button" className="text-button"
    onClick={() => void (target.kind === 'limitless' ? window.projectsApi.openLimitless(target.url)
      : window.projectsApi.openDeckSource(target.url))}>{source.label} ↗</button>
  return <span tabIndex={printId ? 0 : undefined} {...previewProps}>{source.label}{printId ? ' · scheda non disponibile nel Catalogo locale' : ''}</span>
}

const TIMELINE_PAGE_SIZE = 50

function DiffView({ title, diff, beforeLabel = 'PRINCIPALE' }: { title: string; diff: DeckDiff; beforeLabel?: string }) {
  const preview = useCardPreview()
  return <div className="thread-diff"><strong>{title}: {diff.beforeTotal} → {diff.afterTotal} carte</strong>
    {diff.byName.length === 0 ? <p>Nessuna variazione nelle quantità per nome.</p> : <div className="diff-table" role="table" aria-label={title}>
      <div className="diff-row diff-header" role="row"><span role="columnheader">{beforeLabel}</span><span role="columnheader">CAMBIO</span><span role="columnheader">PROPOSTA</span></div>
      {diff.byName.map((item) => <div className="diff-row" role="row" key={item.name} tabIndex={0}
        {...preview({ name: item.name })}>
        <span role="cell">{item.before}× {item.name}</span><strong role="cell" className={`delta ${item.delta > 0 ? 'plus' : 'minus'}`}>{item.delta > 0 ? '+' : ''}{item.delta}</strong>
        <span role="cell">{item.after}× {item.name}</span></div>)}</div>}
    {diff.byPrint.length > 0 && <details><summary>Stampe indicate ({diff.byPrint.length} variazioni)</summary><ul>{diff.byPrint.map((item) => {
      const match = /^(.*?) · ([A-Z0-9.]+) ([A-Z0-9/.-]+)$/.exec(item.name)
      return <li key={item.name} tabIndex={0} {...preview(match
        ? { name: match[1], setCode: match[2], cardNumber: match[3] } : { name: item.name })}>
        {item.name}: {item.before} → {item.after}</li>
    })}</ul></details>}
  </div>
}

function ComparisonList({ title, parsed }: { title: string; parsed: ParsedDeck | null }) {
  const preview = useCardPreview()
  return <section className="comparison-list"><div className="comparison-list-title"><strong>{title}</strong><span>{parsed?.interpretedTotal ?? 0} carte</span></div>
    <div className="comparison-list-scroll" role="region" aria-label={title} tabIndex={0}>{parsed ? parsed.lines.filter((line) => line.kind === 'card').map((line) =>
      <div className="comparison-card" key={line.lineNumber} tabIndex={0}
        {...preview({ name: line.name ?? line.raw, setCode: line.setCode, cardNumber: line.cardNumber })}>
        <strong>{line.quantity}×</strong><span>{line.name}</span><small>{line.setCode ? `${line.setCode} ${line.cardNumber}` : 'stampa non indicata'}</small></div>)
      : <p>Nessuna lista principale.</p>}</div></section>
}

function ThreadMessageEvidence({ message, cardTargets, onOpenCatalogCard }: {
  message: DeckThreadMessage; cardTargets: ReadonlyMap<string, string>; onOpenCatalogCard(identityId: string): void
}) {
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
    {packet.aiQueries && <AiQueryTraceView trace={packet.aiQueries} />}
    {packet.promptAudit && <AiPromptAuditView audit={packet.promptAudit} />}
    <p>Fonti fornite a Codex; «citata» indica una fonte dichiarata nella risposta, non una verifica automatica della conclusione.</p>
    {packet.sources.length === 0 ? <p>Nessuna scheda o lista pertinente disponibile nell'archivio locale.</p> :
      <ul>{packet.sources.map((source) => <li key={source.id}>{cited.has(source.id) ? <strong>Citata · </strong> : null}
        <ThreadSource source={source} cardTargets={cardTargets} onOpenCatalogCard={onOpenCatalogCard} /></li>)}</ul>}
    {packet.events.length > 0 && <p>Eventi: {packet.events.map((event) => `${event.name} (${event.date}, ${event.lists.length} liste selezionate su ${event.completeLists} complete)`).join('; ')}. Piazzamenti e liste non sono winrate del tuo mazzo.</p>}
  </details>
}

function EvidencePreview({ packet }: { packet: ThreadEvidencePacket }) {
  const preview = useCardPreview()
  return <div className="thread-review"><strong>Anteprima dei dati locali</strong>
    <p>{packet.cardCoverage.withGameplay}/{packet.cardCoverage.selected} schede con testo di gioco; {packet.events.length} eventi, {packet.events.reduce((sum, item) => sum + item.lists.length, 0)} liste selezionate.</p>
    {packet.change.updated.length + packet.change.added.length + packet.change.removed.length > 0 &&
      <p>Rispetto alla risposta precedente: {packet.change.updated.length} fonti aggiornate, {packet.change.added.length} nuove nella selezione, {packet.change.removed.length} non più selezionate.</p>}
    <details><summary>Carte e fonti che verranno inviate</summary>
      <ul>{packet.cards.map((card) => <li key={card.name} tabIndex={0}
        {...preview({ name: card.name, printId: card.printId })}><strong>{card.name}</strong>{card.mentionedAs ? ` (citata come ${card.mentionedAs})` : ''} · {card.identityStatus === 'ambiguous' ? 'identità ambigua' : card.identityStatus === 'missing' ? 'scheda assente' : card.printId}
        {card.gameplayText && <p>{card.gameplayText}</p>}</li>)}</ul>
      {packet.cardCoverage.omitted > 0 && <p>{packet.cardCoverage.omitted} carte omesse per il limite del contesto.</p>}
      {packet.events.map((event) => <details key={event.eventId}><summary>{event.name} · {event.date} · {event.lists.length} liste</summary>
        <p>{event.kind === 'online' ? 'Online' : 'In presenza'} · {event.completeLists} liste complete su {event.participants} partecipazioni visibili.</p>
        {event.lists.map((list) => <ExpandablePreviewDeck key={list.sourceId}
          summary={`${list.deck} · posto ${list.placing ?? '?'}`} lines={list.cards} />)}
      </details>)}
    </details>
    <p>Il pacchetto viene ricalcolato al momento dell'invio, così include eventuali aggiornamenti locali nel frattempo.</p>
    <p>Durante l'invio l'AI può scegliere automaticamente query di sola lettura al Catalogo e alle liste Eventi locali. Questa scelta richiede un turno Codex aggiuntivo, con tempi e token propri; query e risposte effettive saranno visibili nei dati della risposta.</p>
  </div>
}

function CandidateDetail({ candidate, thread, versions, catalog, constraints, audit, working, featured, cardTargets, onOpenCatalogCard, onAdopt, onContinue, onReturn }: {
  candidate: DeckCandidate; thread: DeckThread; versions: DeckVersion[]; catalog: CatalogView | null
  constraints: DeckConstraint[]; audit: StandardRuleAudit | null; working: boolean; featured?: boolean
  cardTargets: ReadonlyMap<string, string>; onOpenCatalogCard(identityId: string): void
  onAdopt(candidate: DeckCandidate): void; onContinue(candidate: DeckCandidate): void
  onReturn?: () => void
}) {
  const comparison = useRef<HTMLDetailsElement>(null)
  const base = versions.find((version) => version.id === thread.baseVersionId)
  const current = versions[0]
  const adopted = versions.find((version) => version.adoption?.candidateId === candidate.id)
  const review = catalog ? reviewCandidate(thread.projectId, candidate, catalog, constraints,
    localCalendarDate(), audit) : null
  const comparisonDeck = review ? parseDeck(review.normalizedRawText) : candidate.parsed
  const reviewItems = review ? reviewSummary(review.toReview) : []
  const diff = current ? compareDecks(current.parsed, comparisonDeck) : null
  const added = diff?.byName.reduce((sum, item) => sum + Math.max(0, item.delta), 0) ?? 0
  const removed = diff?.byName.reduce((sum, item) => sum + Math.max(0, -item.delta), 0) ?? 0
  const blockers = adopted ? [] : [
    ...(thread.stale ? ['Base superata: apri un nuovo thread dalla lista principale.'] : []),
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
      {candidate.sources.length === 0 ? <span>Nessuna fonte collegata</span> : candidate.sources.slice(0, 2).map((source) =>
        <ThreadSource key={source.id} source={source} cardTargets={cardTargets} onOpenCatalogCard={onOpenCatalogCard} />)}
      {candidate.sources.length > 2 && <span>+{candidate.sources.length - 2} nei dettagli</span>}</div>}
    {current && diff && <DiffView title={`Rispetto alla lista principale v${current.sequence}`} diff={diff} />}
    {base && base.id !== current?.id && <DiffView title={`Rispetto alla base v${base.sequence}`} diff={compareDecks(base.parsed, comparisonDeck)} beforeLabel="BASE DEL THREAD" />}
    {review && review.conversions.length > 0 && <p className="candidate-conversions">Codici adattati per l'adozione: {review.conversions.map((item) =>
      `riga ${item.lineNumber} ${item.from} → ${item.to}`).join('; ')}.</p>}
    {review && <div className="thread-review"><strong>Controlli prima dell'adozione</strong>
      {review.blockers.length > 0 && <ul className="thread-blockers">{review.blockers.map((item, index) => <li key={index}>{item}</li>)}</ul>}
      {reviewItems.length > 0 && <details><summary>Da verificare ({reviewItems.length})</summary><ul>{reviewItems.map((item, index) => <li key={index}>{item}</li>)}</ul></details>}
      <p>Legalità torneo da verificare.</p>
    </div>}
    {thread.stale && <div className="diagnostics"><p>Base superata · adozione bloccata. Confronta la proposta con la lista principale.</p>
      <button type="button" className="secondary-button" disabled={working} onClick={() => onContinue(candidate)}>
        Continua in un thread dalla lista attuale</button></div>}
    {thread.resolutionChanged && !thread.stale && <p className="content-note">Le correzioni d’identità della lista sono cambiate dopo la partenza del thread. Controlla la candidata con i dati attuali prima dell’adozione.</p>}
    {!adopted && <div className="candidate-adoption">
      <button type="button" className="primary-button" disabled={working || thread.stale || !current || !review || review.blockers.length > 0}
        onClick={() => onAdopt(candidate)}>Adotta l'intera lista candidata</button></div>}
    <div className="comparison-lists"><ComparisonList title="Lista principale completa" parsed={current?.parsed ?? null} />
      <ComparisonList title="Lista proposta completa" parsed={comparisonDeck} /></div>
    <details className="candidate-evidence"><summary>Motivi, fonti, dati tecnici e testo originale</summary>
      <p>Proposta {candidate.origin === 'ai' ? 'Codex' : 'manuale'} · {displayDate(candidate.createdAt)}</p>
      {candidate.aiConfig && <p className="content-note">AI: {candidate.aiConfig.model ?? 'Automatico'} / {candidate.aiConfig.reasoningEffort ?? 'predefinito'}</p>}
      {candidate.sources.length > 0 && <div className="content-note">Fonti: {candidate.sources.map((source) =>
        <ThreadSource key={source.id} source={source} cardTargets={cardTargets} onOpenCatalogCard={onOpenCatalogCard} />)}</div>}
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
        <h3 id={`candidate-title-${candidate.id}`} tabIndex={-1}>Candidata {candidate.sequence} <span>· {candidate.parsed.interpretedTotal} carte</span></h3>
        <span className="candidate-state">{status}</span>
        <button type="button" className="text-button candidate-return" disabled={!onReturn} aria-hidden={!onReturn}
          tabIndex={onReturn ? 0 : -1} onClick={onReturn}>Torna alla conversazione</button>
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
      if (event.currentTarget.dataset.openedFromAccess === 'true') return
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

export function ThreadsSection({ projectId, mainContextKey, onAdopt }: Props) {
  const nav = useNavigation()
  const onOpenCatalogCard = (identityId: string) => nav.go({ view: 'catalog' }, {
    'catalog.focus': identityId, 'catalog.focusConsumed': false, 'catalog.selected': identityId,
    'catalog.query': '', 'catalog.set': 'all'
  }, 'Catalogo · carta dal Thread')
  const newThreadTrigger = useRef<HTMLButtonElement>(null)
  const newThreadTitle = useRef<HTMLInputElement>(null)
  const newThreadError = useRef<HTMLDivElement>(null)
  const candidateAccess = useRef<HTMLButtonElement>(null)
  const [candidateReturn, setCandidateReturn] = useState<{ threadId: string; candidateId: string; scrollTop: number; comparisonOpen: boolean } | null>(null)
  const hasLoaded = useRef(false)
  const returnCreateFocus = useRef(false)
  const [creating, setCreating] = useViewState('thread.creating', false)
  const [createError, setCreateError] = useState<string | null>(null)
  const adoptionTrigger = useRef<HTMLElement | null>(null)
  const [versions, setVersions] = useState<DeckVersion[]>([])
  const [threads, setThreads] = useState<DeckThreadSummary[]>([])
  const [selectedDetail, setSelectedDetail] = useState<DeckThread | null>(null)
  const [olderLoading, setOlderLoading] = useState(false)
  const olderRequest = useRef(false)
  function showDetail(next: DeckThread | null): void {
    setSelectedDetail((current) => {
      if (!next || !current || current.id !== next.id ||
        current.messages.length <= next.messages.length || !current.oldestMessageCursor) return next
      const recentIds = new Set(next.messages.map((message) => message.id))
      return { ...next, messages: [...current.messages.filter((message) => !recentIds.has(message.id)),
        ...next.messages], oldestMessageCursor: current.oldestMessageCursor }
    })
  }
  const [detailLoading, setDetailLoading] = useState(false)
  const [catalog, setCatalog] = useState<CatalogView | null>(null)
  const cardTargets = useMemo(() => catalogCardTargets(catalog), [catalog])
  const [constraints, setConstraints] = useState<DeckConstraint[]>([])
  const [ruleAudit, setRuleAudit] = useState<StandardRuleAudit | null>(null)
  const [aiModels, setAiModels] = useState<AiModel[]>([])
  const [aiModelsLoading, setAiModelsLoading] = useState(true)
  const [aiModelsError, setAiModelsError] = useState<string | null>(null)
  const aiModelsRequest = useRef(0)
  const [overrides, setOverrides] = useDraftState<Record<string, AiPreferences>>(`thread.overrides:${projectId}`, {})
  const [selectedId, setSelectedId] = useViewState<string | null>('thread.selected', null)
  const [timelineWindow, setTimelineWindow] = useState({ threadId: '', count: TIMELINE_PAGE_SIZE })
  const [title, setTitle] = useDraftState(`thread.title:${projectId}`, '')
  const [openingNote, setOpeningNote] = useDraftState(`thread.opening:${projectId}`, '')
  const [message, setMessage] = useDraftState(`thread.message:${projectId}:${selectedId}`, '')
  const [composerMode, setComposerMode] = useDraftState<'ask' | 'proposal'>(`thread.mode:${projectId}:${selectedId}`, 'ask')
  const [composerError, setComposerError] = useDraftState<string | null>(`thread.error:${projectId}:${selectedId}`, null)
  const composerErrorElement = useRef<HTMLDivElement>(null)
  const previewRequest = useRef(0)
  const [preview, setPreview] = useState<{ kind: 'ask' | 'proposal'; prompt: string; packet: ThreadEvidencePacket } | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useBusyState(`thread:${projectId}:${selectedId}`)
  const [asking, setAsking] = useBusyState(`thread.ask:${projectId}:${selectedId}`)
  const [proposing, setProposing] = useBusyState(`thread.propose:${projectId}:${selectedId}`)
  const startedAt = useBusyStartedAt(`thread:${projectId}:${selectedId}`)
  const [error, setError] = useState<string | null>(null)
  const [openingErrors, setOpeningErrors] = useState<Record<string, string>>({})
  const [aiJob, setAiJob] = useState<AiJobSummary | null>(null)
  const currentAiJob = aiJob?.projectId === projectId && aiJob?.resourceId === selectedId ? aiJob : null
  const aiBusy = currentAiJob?.status === 'running' || currentAiJob?.status === 'ready'
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
    if (composerError) focusInWorkspace(composerErrorElement.current)
  }, [composerError])
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

  const selectedSummary = threads.find((thread) => thread.id === selectedId) ?? null
  const selected = selectedSummary && selectedDetail?.id === selectedId ? selectedDetail : null
  const openingAiMessage = selected?.openingAiMessage ?? (selected?.openingAiMessageId
    ? selected.messages.find((entry) => entry.id === selected.openingAiMessageId) : null)
  const openingAiPending = selected?.openingAiPending ?? (!!openingAiMessage && !selected?.messages.some((entry) => entry.author === 'assistant'))
  useEffect(() => { if (selected) nav.entry.label = `Thread · ${selected.title}` }, [selected?.id])
  const featuredCandidate = selected?.candidates.at(-1) ?? null
  const returnPoint = candidateReturn?.threadId === selectedId && candidateReturn.candidateId === featuredCandidate?.id ? candidateReturn : null
  function openFeaturedCandidate(): void {
    if (!featuredCandidate || !selectedId) return
    const main = candidateAccess.current?.closest<HTMLElement>('.main-content')
    const heading = document.getElementById(`candidate-title-${featuredCandidate.id}`)
    const comparison = heading?.closest('.thread-candidate')?.querySelector<HTMLDetailsElement>('.candidate-comparison')
    if (!main || !heading || !comparison) return
    setCandidateReturn({ threadId: selectedId, candidateId: featuredCandidate.id, scrollTop: main.scrollTop, comparisonOpen: comparison.open })
    comparison.dataset.openedFromAccess = 'true'
    comparison.open = true
    const card = heading.closest<HTMLElement>('.thread-candidate')
    if (card) main.scrollTop += card.getBoundingClientRect().top - main.getBoundingClientRect().top - 12
    heading.focus({ preventScroll: true })
  }
  function returnToConversation(): void {
    if (!returnPoint) return
    const main = candidateAccess.current?.closest<HTMLElement>('.main-content')
    const heading = document.getElementById(`candidate-title-${returnPoint.candidateId}`)
    const comparison = heading?.closest('.thread-candidate')?.querySelector<HTMLDetailsElement>('.candidate-comparison')
    if (!main || !comparison) return
    comparison.open = returnPoint.comparisonOpen
    delete comparison.dataset.openedFromAccess
    main.scrollTop = returnPoint.scrollTop
    setCandidateReturn(null)
    candidateAccess.current?.focus({ preventScroll: true })
  }
  const selectedOverride = selected ? overrides[selected.id] ?? { model: null, reasoningEffort: null } : null
  const selectedModel = aiModels.find((model) => model.id === selectedOverride?.model)
  const timeline = selected ? [
    ...selected.messages.map((item) => ({ kind: 'message' as const, item })),
    ...selected.candidates.map((item) => ({ kind: 'candidate' as const, item }))
  ].sort((a, b) => a.item.createdAt.localeCompare(b.item.createdAt)) : []
  const timelineEntries = timeline.filter((entry) => entry.kind !== 'candidate' || entry.item.id !== featuredCandidate?.id)
  const visibleTimelineCount = timelineWindow.threadId === selectedId ? timelineWindow.count : TIMELINE_PAGE_SIZE
  const hiddenTimelineCount = Math.max(0, timelineEntries.length - visibleTimelineCount) +
    Math.max(0, (selected?.messageCount ?? selected?.messages.length ?? 0) - (selected?.messages.length ?? 0))

  async function revealOlder(): Promise<void> {
    if (!selected || olderRequest.current) return
    const threadId = selected.id
    const cursor = selected.oldestMessageCursor
    const unloaded = Math.max(0, (selected.messageCount ?? selected.messages.length) - selected.messages.length)
    if (unloaded && cursor) {
      olderRequest.current = true
      setOlderLoading(true)
      try {
        const result = await window.projectsApi.getDeckThreadMessagesBefore(projectId, threadId, cursor)
        if (!result.ok) throw new Error(result.error)
        if (!result.value.messages.length) throw new Error('Cronologia precedente non disponibile.')
        setSelectedDetail((current) => current?.id === threadId &&
          current.oldestMessageCursor?.rowId === cursor.rowId
          ? { ...current, messages: [...result.value.messages, ...current.messages],
            oldestMessageCursor: result.value.oldestCursor } : current)
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Cronologia precedente non disponibile.')
        return
      } finally { olderRequest.current = false; setOlderLoading(false) }
    }
    setTimelineWindow({ threadId, count: visibleTimelineCount + TIMELINE_PAGE_SIZE })
  }

  useEffect(() => {
    let active = true
    setLoading(!hasLoaded.current)
    setError(null)
    invalidatePreview()
    void Promise.all([window.projectsApi.listDeckVersions(projectId), window.projectsApi.listDeckThreadSummaries(projectId),
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
        if (selectedId && !threadResult.value.some((thread) => thread.id === selectedId)) setError('Il thread non è più disponibile. Scegli un altro thread oppure torna indietro.')
        else setSelectedId((current) => current ?? threadResult.value[0]?.id ?? null)
      })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : 'Impossibile leggere i thread.') })
      .finally(() => { if (active) { hasLoaded.current = true; setLoading(false) } })
    return () => { active = false; previewRequest.current++ }
  }, [projectId, mainContextKey])

  useEffect(() => {
    if (!selectedId) { setSelectedDetail(null); setDetailLoading(false); return }
    let active = true
    setDetailLoading(true)
    void window.projectsApi.getDeckThreadWindow(projectId, selectedId).then((result) => {
      if (!active) return
      if (!result.ok) throw new Error(result.error)
      if (!result.value) throw new Error('Thread non trovato in questo progetto.')
      showDetail(result.value)
    }).catch((cause) => {
      if (active) { setSelectedDetail(null); setError(cause instanceof Error ? cause.message : 'Thread non disponibile.') }
    }).finally(() => { if (active) setDetailLoading(false) })
    return () => { active = false }
  }, [projectId, selectedId, working])

  useEffect(() => {
    if (!selectedId) { setAiJob(null); return }
    let active = true
    const refresh = async () => {
      const result = await window.projectsApi.getAiJobStatus(projectId, selectedId)
      if (active && result.ok) setAiJob(result.value)
    }
    void refresh()
    const timer = window.setInterval(() => { void refresh() }, 1500)
    return () => { active = false; window.clearInterval(timer) }
  }, [projectId, selectedId, working])

  useEffect(() => {
    if (aiJob?.status !== 'applied' || aiJob.projectId !== projectId ||
      aiJob.resourceId !== selectedId || !selectedId) return
    void window.projectsApi.getDeckThreadWindow(projectId, selectedId).then((result) => {
      if (result.ok) showDetail(result.value)
    })
    void refreshSummaries()
  }, [aiJob?.id, aiJob?.status, projectId, selectedId])

  async function cancelAi(): Promise<void> {
    if (!selectedId) return
    const result = await window.projectsApi.cancelAiJob(projectId, selectedId)
    if (!result.ok) setComposerError(result.error)
    else setAiJob((current) => current ? { ...current, status: 'cancelled' } : null)
  }

  async function recoverAi(): Promise<void> {
    const result = await window.projectsApi.recoverAiJobs()
    if (!result.ok) setComposerError(result.error)
    else if (selectedId) {
      const status = await window.projectsApi.getAiJobStatus(projectId, selectedId)
      if (status.ok) setAiJob(status.value)
      const detail = await window.projectsApi.getDeckThreadWindow(projectId, selectedId)
      if (detail.ok) showDetail(detail.value)
    }
  }

  async function refreshSummaries(): Promise<void> {
    const result = await window.projectsApi.listDeckThreadSummaries(projectId)
    if (result.ok) setThreads(result.value)
    else setError(result.error)
  }

  async function refreshAiModels() {
    const request = ++aiModelsRequest.current
    setAiModelsLoading(true)
    try {
      const result = await window.projectsApi.getAiConnection()
      if (request !== aiModelsRequest.current) return
      if (!result.ok) throw new Error(result.error)
      setAiModels(result.value.models)
      setAiModelsError(null)
    } catch (cause) {
      if (request !== aiModelsRequest.current) return
      setAiModels([])
      setAiModelsError(cause instanceof Error ? cause.message : 'Modelli Codex non disponibili.')
    } finally { if (request === aiModelsRequest.current) setAiModelsLoading(false) }
  }
  useEffect(() => {
    void refreshAiModels()
    return () => { aiModelsRequest.current++ }
  }, [])

  function selectThread(thread: Pick<DeckThreadSummary, 'id' | 'title'>, focus = '#thread-switcher-trigger'): void {
    if (thread.id === selectedId && !creating) return
    nav.visit({ 'thread.selected': thread.id, 'thread.creating': false, 'nav.focus': focus }, `Thread · ${thread.title}`)
  }

  function closeCreate(): void {
    returnCreateFocus.current = true
    setCreating(false)
    setTitle('')
    setOpeningNote('')
    setCreateError(null)
  }

  function invalidatePreview(): void {
    previewRequest.current++
    setPreview(null)
    setPreviewLoading(false)
  }

  function changeComposerMode(mode: 'ask' | 'proposal'): void {
    setComposerMode(mode)
    setComposerError(null)
    invalidatePreview()
  }

  async function previewEvidence(): Promise<void> {
    if (!selected || previewLoading || working) return
    const prompt = message
    if (!prompt.trim()) return
    const request = ++previewRequest.current
    setPreviewLoading(true)
    setComposerError(null)
    try {
      const result = await window.projectsApi.previewDeckThreadEvidence(projectId, selected.id, prompt)
      if (request !== previewRequest.current) return
      if (!result.ok) throw new Error(result.error)
      setPreview({ kind: composerMode, prompt, packet: result.value })
    } catch (cause) {
      if (request === previewRequest.current) setComposerError(cause instanceof Error ? cause.message : 'Anteprima non disponibile.')
    } finally { if (request === previewRequest.current) setPreviewLoading(false) }
  }

  async function create(startWithAi: boolean): Promise<void> {
    if (working) return
    setWorking(true)
    setCreateError(null)
    try {
      const result = await window.projectsApi.createDeckThread({ projectId, title, openingNote, startWithAi })
      if (!result.ok) throw new Error(result.error)
      showDetail(result.value)
      await refreshSummaries()
      closeCreate()
      selectThread(result.value, '#new-thread-trigger')
      if (startWithAi && result.value.openingAiMessageId) {
        const response = await window.projectsApi.askDeckThread(projectId, result.value.id,
          openingNote.trim(), null, result.value.openingAiMessageId)
        const latest = await window.projectsApi.getDeckThreadWindow(projectId, result.value.id)
        if (latest.ok) showDetail(latest.value)
        if (!response.ok) setOpeningErrors((current) => ({ ...current, [result.value.id]: response.error }))
      }
    } catch (cause) { setCreateError(cause instanceof Error ? cause.message : 'Thread non creato.') }
    finally { setWorking(false) }
  }

  async function continueFrom(candidate: DeckCandidate): Promise<void> {
    if (!selected || working || !selected.stale) return
    setWorking(true); setError(null)
    try {
      const title = `${selected.title} · nuova base`.slice(0, 120)
      const result = await window.projectsApi.continueDeckThread({ projectId,
        threadId: selected.id, candidateId: candidate.id, title })
      if (!result.ok) throw new Error(result.error)
      showDetail(result.value)
      await refreshSummaries()
      selectThread(result.value)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Nuovo thread non creato.') }
    finally { setWorking(false) }
  }

  async function retryOpeningMessage(): Promise<void> {
    if (!selected || !openingAiMessage || working || aiBusy) return
    setWorking(true)
    setAsking(true)
    setComposerError(null)
    setOpeningErrors((current) => { const next = { ...current }; delete next[selected.id]; return next })
    try {
      const response = await window.projectsApi.askDeckThread(projectId, selected.id,
        openingAiMessage.text, selectedOverride?.model ? selectedOverride : null, openingAiMessage.id)
      if (!response.ok) throw new Error(response.error)
      showDetail(response.value)
      await refreshSummaries()
    } catch (cause) {
      setOpeningErrors((current) => ({ ...current, [selected.id]:
        cause instanceof Error ? cause.message : 'Risposta Codex non completata.' }))
      const latest = await window.projectsApi.getDeckThreadWindow(projectId, selected.id)
      if (latest.ok) showDetail(latest.value)
    } finally { setWorking(false); setAsking(false) }
  }

  async function addMessage(): Promise<void> {
    if (!selected || working || !message.trim()) return
    setWorking(true)
    setComposerError(null)
    invalidatePreview()
    try {
      const result = await window.projectsApi.addDeckThreadMessage(projectId, selected.id, message)
      if (!result.ok) throw new Error(result.error)
      showDetail(result.value)
      await refreshSummaries()
      setMessage('')
      setPreview(null)
    } catch (cause) { setComposerError(cause instanceof Error ? cause.message : 'Messaggio non salvato.') }
    finally { setWorking(false) }
  }

  async function ask(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    if (!selected || working || aiBusy || openingAiPending || !message.trim()) return
    setWorking(true)
    setAsking(true)
    setComposerError(null)
    invalidatePreview()
    try {
      const result = await window.projectsApi.askDeckThread(projectId, selected.id, message,
        selectedOverride?.model ? selectedOverride : null)
      if (!result.ok) throw new Error(result.error)
      showDetail(result.value)
      await refreshSummaries()
      setMessage('')
      setPreview(null)
    } catch (cause) {
      setComposerError(cause instanceof Error ? cause.message : 'Risposta Codex non completata.')
      const current = await window.projectsApi.getDeckThreadWindow(projectId, selected.id)
      if (current.ok) showDetail(current.value)
      await refreshSummaries()
    }
    finally { setWorking(false); setAsking(false) }
  }

  async function propose(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    if (!selected || working || aiBusy || openingAiPending || !selected.baseVersionId || !message.trim()) return
    setWorking(true)
    setProposing(true)
    setComposerError(null)
    invalidatePreview()
    try {
      const result = await window.projectsApi.proposeDeckThread(projectId, selected.id, message,
        selectedOverride?.model ? selectedOverride : null)
      if (!result.ok) throw new Error(result.error)
      showDetail(result.value)
      await refreshSummaries()
      setMessage('')
      setPreview(null)
    } catch (cause) {
      setComposerError(cause instanceof Error ? cause.message : 'Proposta Codex non completata.')
      const current = await window.projectsApi.getDeckThreadWindow(projectId, selected.id)
      if (current.ok) showDetail(current.value)
      await refreshSummaries()
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
      const [newVersions, newThreads, newDetail] = await Promise.all([
        window.projectsApi.listDeckVersions(projectId), window.projectsApi.listDeckThreadSummaries(projectId),
        window.projectsApi.getDeckThreadWindow(projectId, selected.id)
      ])
      if (newVersions.ok) setVersions(newVersions.value)
      if (newThreads.ok) setThreads(newThreads.value)
      if (newDetail.ok) showDetail(newDetail.value)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Adozione non riuscita.') }
    finally { setWorking(false) }
  }

  return <><section className="threads-section" aria-label="Thread del mazzo" data-nav-loading={loading || detailLoading}>
    <div className="panel-heading"><h2>Thread</h2></div>
    {error && !confirmCandidate && <div className="error-banner" role="alert">{error}</div>}
    {loading ? <LoadingSkeleton label="Caricamento thread…" rows={3} /> : <>
      <div className="threads-layout">
        <div className="threads-toolbar">
          <ThreadSwitcher threads={threads} selected={selectedSummary} versions={versions} disabled={working || creating}
            onSelect={selectThread} />
          <button ref={newThreadTrigger} id="new-thread-trigger" type="button" className="secondary-button" aria-expanded={creating}
            aria-controls="new-thread-form" disabled={working} onClick={() => creating ? closeCreate() : setCreating(true)}>
            <Icon name="plus" />Nuovo thread
          </button>
        </div>
        {creating && <form id="new-thread-form" className="thread-form new-thread-form" aria-labelledby="new-thread-heading"
          onSubmit={(event) => { event.preventDefault(); void create(true) }} onKeyDown={(event) => {
            if (event.key === 'Escape' && !working) { event.preventDefault(); closeCreate() }
          }}>
            <h3 id="new-thread-heading">Nuovo thread</h3>
            <label htmlFor="thread-title">Titolo</label>
            <input ref={newThreadTitle} id="thread-title" value={title} disabled={working} maxLength={120} onChange={(event) => setTitle(event.target.value)} placeholder="Es. Variante più veloce" required />
            <label htmlFor="thread-opening">Primo messaggio a Codex</label>
            <textarea id="thread-opening" value={openingNote} disabled={working} maxLength={5000} required onChange={(event) => setOpeningNote(event.target.value)} />
            {createError && <div ref={newThreadError} className="error-banner" role="alert" tabIndex={-1}>{createError}</div>}
            <div className="thread-form-actions">
              <button className="primary-button" disabled={working || !title.trim() || !openingNote.trim()}>{working && <Spinner />}{working ? 'Avvio conversazione…' : 'Crea e chiedi a Codex'}</button>
              <button type="button" className="secondary-button" disabled={working || !title.trim()}
                onClick={() => void create(false)}>Salva nota senza AI</button>
              <button type="button" className="text-button" disabled={working} onClick={closeCreate}>Annulla</button>
            </div>
        </form>}
        <div className="thread-detail">
          {detailLoading && !selected ? <LoadingSkeleton label="Caricamento dettaglio thread…" rows={3} /> : selected ? <>
            {openingAiPending && <div className="content-note" role="status">{aiBusy
              ? 'Codex sta rispondendo al primo messaggio.'
              : 'Il primo messaggio è salvato. La risposta Codex è ancora da completare.'}
              {(openingErrors[selected.id] || currentAiJob?.error) &&
                <p>{openingErrors[selected.id] || currentAiJob?.error}</p>}
              {!aiBusy && <button type="button" className="secondary-button" disabled={working}
                onClick={() => void retryOpeningMessage()}>Riprova primo messaggio</button>}
            </div>}
            {currentAiJob && (currentAiJob.status === 'running' || currentAiJob.status === 'ready') &&
              <div className="content-note" role="status">{currentAiJob.status === 'running'
                ? 'Job Codex in corso per questo thread.' : 'Risultato Codex in attesa di recupero.'}
                <button type="button" className="text-button" onClick={() => void cancelAi()}>Annulla job</button>
                {currentAiJob.status === 'ready' && <button type="button" className="text-button" onClick={() => void recoverAi()}>Recupera risultato</button>}
              </div>}
            {currentAiJob && (currentAiJob.status === 'interrupted' || currentAiJob.status === 'failed' || currentAiJob.status === 'cancelled') &&
              <p className="content-note" role="status">{currentAiJob.status === 'cancelled'
                ? 'Job Codex annullato.' : 'Il job Codex precedente non è stato completato. Puoi inviare di nuovo la richiesta.'}
                {currentAiJob.error ? ` ${currentAiJob.error}` : ''}</p>}
            {!featuredCandidate && selected.stale && <p className="diagnostics">Base superata: apri un nuovo thread dalla lista principale.</p>}
            {selected.parentThreadId && <div className="content-note">Thread collegato a un percorso precedente. La candidata scelta è conservata come contesto per Codex; descrivi nella conversazione le modifiche che vuoi valutare. Il thread originale resta nello storico.
              {selected.seedCandidateText && <details className="seed-candidate"><summary>Mostra la candidata di partenza</summary><pre>{selected.seedCandidateText}</pre></details>}
            </div>}
            {featuredCandidate ? <CandidateDetail key={featuredCandidate.id} candidate={featuredCandidate} thread={selected} versions={versions}
              catalog={catalog} constraints={constraints} audit={ruleAudit} working={working} featured cardTargets={cardTargets} onOpenCatalogCard={onOpenCatalogCard} onAdopt={confirmAdoption} onContinue={(candidate) => void continueFrom(candidate)}
              onReturn={returnPoint ? returnToConversation : undefined} />
              : <p className="thread-no-candidate">Nessuna proposta salvata.</p>}
            {featuredCandidate && <div className="candidate-access">
              <span>Candidata {featuredCandidate.sequence}</span>
              <button ref={candidateAccess} type="button" className="text-button" onClick={openFeaturedCandidate}>Apri proposta e confronto</button>
            </div>}
            <div className="thread-timeline"><h4>Conversazione</h4>
              {hiddenTimelineCount > 0 && <button type="button" className="text-button" aria-busy={olderLoading} onClick={() => void revealOlder()}>
                Mostra {Math.min(TIMELINE_PAGE_SIZE, hiddenTimelineCount)} precedenti ({hiddenTimelineCount} nascosti)
              </button>}
              {timelineEntries.slice(-visibleTimelineCount).map((entry) => entry.kind === 'message' ? <div className="thread-message" data-author={entry.item.author} key={entry.item.id}><small>{entry.item.author === 'user' ? 'Tu' : 'Codex'} · {displayDate(entry.item.createdAt)}</small>{entry.item.author === 'assistant' ? <ThreadMarkdown text={entry.item.text} cardTargets={cardTargets} onOpenCatalogCard={onOpenCatalogCard} /> : <p>{entry.item.text}</p>}<ThreadMessageEvidence message={entry.item} cardTargets={cardTargets} onOpenCatalogCard={onOpenCatalogCard} />{entry.item.aiConfig && <details><summary>Dettagli AI</summary><p>{entry.item.aiConfig.model ?? 'Automatico'} / {entry.item.aiConfig.reasoningEffort ?? 'predefinito'} · {entry.item.aiConfig.source === 'override' ? 'scelta del thread' : 'preferenze globali'}</p></details>}</div> : <CandidateDetail key={entry.item.id} candidate={entry.item} thread={selected} versions={versions}
                catalog={catalog} constraints={constraints} audit={ruleAudit} working={working} cardTargets={cardTargets} onOpenCatalogCard={onOpenCatalogCard} onAdopt={confirmAdoption} onContinue={(candidate) => void continueFrom(candidate)} />)}
            </div>
            {(asking || proposing) && <ActivityStatus className="thread-ai-activity" startedAt={startedAt}
              title={proposing ? 'Codex sta preparando la proposta…' : 'Codex sta rispondendo…'}
              detail={proposing ? 'La lista principale resta invariata. Potrai confrontare la proposta quando sarà pronta.' : 'Puoi consultare la lista o cambiare sezione durante l’attesa.'} />}
            <form className="thread-form thread-composer" onSubmit={(event) => void (composerMode === 'ask' ? ask(event) : propose(event))}>
              <fieldset className="composer-mode" aria-label="Modalità di invio" disabled={working}>
                <label><input type="radio" name="thread-composer-mode" value="ask" checked={composerMode === 'ask'}
                  onChange={() => changeComposerMode('ask')} /><span>Discuti</span></label>
                <label><input type="radio" name="thread-composer-mode" value="proposal" checked={composerMode === 'proposal'}
                  onChange={() => changeComposerMode('proposal')} /><span>Proponi una lista</span></label>
              </fieldset>
              <label htmlFor="thread-message">Scrivi nel thread</label>
              <textarea id="thread-message" value={message} maxLength={5000} disabled={working} aria-describedby="thread-composer-help"
                onChange={(event) => { setMessage(event.target.value); invalidatePreview(); setComposerError(null) }} />
              <p id="thread-composer-help" className="content-note">{composerMode === 'ask' ? 'Ricevi una risposta da Codex.'
                : !selected.baseVersionId ? 'Per proporre una lista serve una lista iniziale del thread.' : 'Ricevi una lista completa da confrontare.'}</p>
              {composerError && <div ref={composerErrorElement} className="error-banner" role="alert" tabIndex={-1}>{composerError}</div>}
              <div className="composer-actions"><div className="thread-form-actions">
                <button className="primary-button" disabled={working || aiBusy || openingAiPending || !message.trim() || (composerMode === 'proposal' && !selected.baseVersionId)}>
                  {(asking || proposing) && <Spinner />}{asking ? 'Risposta in corso…' : proposing ? 'Proposta in corso…'
                    : composerMode === 'ask' ? 'Chiedi a Codex' : 'Genera proposta Codex'}
                </button>
                <button type="button" className="secondary-button" disabled={working || !message.trim()}
                  title="Salva il testo senza inviarlo a Codex" onClick={() => void addMessage()}>Salva osservazione</button>
              </div>
              <button type="button" className="text-button composer-preview" disabled={!message.trim() || previewLoading || working}
                onClick={() => void previewEvidence()}>{previewLoading && <Spinner />}{previewLoading ? 'Preparo i dati…' : 'Vedi dati inviati a Codex'}</button>
              </div>
              {preview?.kind === composerMode && preview.prompt === message && <EvidencePreview packet={preview.packet} />}
            </form>
            <details className="thread-ai-options"><summary>Dettagli del thread e AI{selectedOverride?.model && <span className="thread-ai-choice"> · Personalizzata</span>}</summary><div className="thread-form"><p className="content-note">Creato il {displayDate(selected.createdAt)}</p>
              <label htmlFor="thread-ai-model">Modello Codex per questo thread</label>
              <select id="thread-ai-model" value={selectedOverride?.model ?? ''} disabled={working || aiModelsLoading}
                onChange={(event) => setOverrides((current) => ({ ...current, [selected.id]: {
                  model: event.target.value || null, reasoningEffort: null } }))}>
                <option value="">Usa preferenze globali</option>
                {selectedOverride?.model && !selectedModel && <option value={selectedOverride.model}>{selectedOverride.model} · disponibilità da verificare</option>}
                {aiModels.map((model) => <option key={model.id} value={model.id}>{model.name}</option>)}
              </select>
              <label htmlFor="thread-ai-effort">Ragionamento per questo thread</label>
              <select id="thread-ai-effort" value={selectedOverride?.reasoningEffort ?? ''}
                disabled={working || aiModelsLoading || !selectedModel}
                onChange={(event) => setOverrides((current) => ({ ...current, [selected.id]: {
                  model: selectedOverride?.model ?? null, reasoningEffort: event.target.value || null } }))}>
                <option value="">Predefinito</option>
                {selectedOverride?.reasoningEffort && !selectedModel?.reasoningEfforts.some((effort) => effort.id === selectedOverride.reasoningEffort) && <option value={selectedOverride.reasoningEffort}>{selectedOverride.reasoningEffort} · disponibilità da verificare</option>}
                {selectedModel?.reasoningEfforts.map((effort) => <option key={effort.id} value={effort.id}>{effort.id}</option>)}
              </select>
              {aiModelsLoading && <InlineLoading>Caricamento modelli…</InlineLoading>}
              {aiModelsError && <p className="error-banner" role="alert">{aiModelsError}</p>}
              {!aiModelsLoading && !aiModelsError && !aiModels.length && <p className="content-note">Nessun modello disponibile.</p>}
              {!aiModelsLoading && !aiModelsError && selectedOverride?.model && (!selectedModel || (selectedOverride.reasoningEffort && !selectedModel.reasoningEfforts.some((effort) => effort.id === selectedOverride.reasoningEffort))) && <p className="warning-banner" role="status">Disponibilità della scelta personalizzata da verificare.</p>}
              <button type="button" className="text-button" disabled={working || aiModelsLoading} onClick={() => void refreshAiModels()}>Ricarica modelli</button>
            </div></details>
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
