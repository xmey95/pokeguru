import { Icon } from './Icon'
import { useEffect, useMemo, useState } from 'react'
import type { DeckBaseline } from '../../shared/deck-import'
import type { CatalogView } from '../../shared/catalog'
import { buildDeckCards, type DeckReconciliation } from '../../shared/reconciliation'
import { evaluateWesternRotation } from '../../shared/standard-rotation'
import { evaluateDeckConstruction } from '../../shared/deck-construction'
import { evaluateSetAdmission } from '../../shared/standard-admission'
import { evaluatePromoAdmission } from '../../shared/promo-admission'
import { evaluateStandardDeck } from '../../shared/standard-deck'
import { BUNDLED_WESTERN_RULE_PACKAGE } from '../../shared/western-rule-package'
import type { StandardRuleAudit } from '../../shared/standard-rule-audit'
import { reviewSummary } from './review-summary'
import { CardThumbnail } from './CardThumbnail'
import { deckThumbnail, groupDeckCards } from './deck-presentation'
import { ExportButton } from './ExportButton'
import { CardOverview } from './CardOverview'

function localDate(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

function variantText(variants: Record<string, boolean> | null): string {
  if (!variants) return 'non indicate'
  return Object.entries(variants).filter(([, active]) => active).map(([name]) => name).join(', ') || 'nessuna indicata'
}

function cardStatus(status: 'recognized' | 'unverified' | 'ambiguous' | 'outside-catalog', catalog: CatalogView | null): string | null {
  if (status === 'recognized') return null
  if (status === 'unverified') return 'Equivalenza da verificare'
  if (status === 'ambiguous') return 'Identità da chiarire'
  return !catalog?.syncedAt ? null :
    catalog.scope.kind === 'sample' ? 'Nessuna corrispondenza nel campione' : 'Nessuna corrispondenza locale'
}

export function DeckList({ projectId, baseline, onOpenCatalog, onConstrain, onImport }: {
  projectId: string; baseline: DeckBaseline; onOpenCatalog(): void; onConstrain(identityId: string): void; onImport(): void
}) {
  const [catalog, setCatalog] = useState<CatalogView | null>(null)
  const [ruleAudit, setRuleAudit] = useState<StandardRuleAudit | null>(null)
  const [reconciliation, setReconciliation] = useState<DeckReconciliation | null>(null)
  const [loading, setLoading] = useState(true)
  const [dataUnavailable, setDataUnavailable] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [today, setToday] = useState(localDate)
  const [referenceDate, setReferenceDate] = useState<string | null>(null)

  useEffect(() => {
    const timer = window.setInterval(() => setToday(localDate()), 60_000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    let active = true
    setLoading(true)
    setDataUnavailable(false)
    void Promise.all([window.projectsApi.getCatalog(), window.projectsApi.getReconciliation(projectId),
      window.projectsApi.getStandardRuleAudit()])
      .then(([catalogResult, reconciliationResult, auditResult]) => {
        if (!active) return
        if (!catalogResult.ok) throw new Error(catalogResult.error)
        if (!reconciliationResult.ok) throw new Error(reconciliationResult.error)
        if (!auditResult.ok) throw new Error(auditResult.error)
        setCatalog(catalogResult.value)
        setReconciliation(reconciliationResult.value)
        setRuleAudit(auditResult.value)
      })
      .catch((cause) => { if (active) { setDataUnavailable(true); setError(cause instanceof Error ? cause.message : 'Lista non disponibile.') } })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [projectId, baseline.importedAt])

  const cards = useMemo(() => buildDeckCards(baseline, catalog, reconciliation), [baseline, catalog, reconciliation])
  const { groups, usesImportHeadings } = useMemo(() => groupDeckCards(cards, baseline), [cards, baseline])
  const asOf = referenceDate ?? today
  const rotation = useMemo(() => evaluateWesternRotation(baseline, catalog, asOf), [baseline, catalog, asOf])
  const construction = useMemo(() => evaluateDeckConstruction(baseline, catalog), [baseline, catalog])
  const rotationByLine = new Map(rotation.lines.map((line) => [line.lineNumber, line]))
  const admission = useMemo(() => evaluateSetAdmission(baseline, catalog, asOf), [baseline, catalog, asOf])
  const admissionByLine = new Map(admission.lines.map((line) => [line.lineNumber, line]))
  const promoAdmission = useMemo(() => evaluatePromoAdmission(baseline, catalog, asOf), [baseline, catalog, asOf])
  const promoByLine = new Map(promoAdmission.lines.map((line) => [line.lineNumber, line]))
  const standardDeck = useMemo(() => evaluateStandardDeck(baseline, catalog, asOf, ruleAudit), [baseline, catalog, asOf, ruleAudit])
  const reviewItems = useMemo(() => reviewSummary(standardDeck.toReview), [standardDeck])
  const importProblems = baseline.diagnostics.filter((item) => item.code === 'UNPARSED' || item.code === 'TOTAL_MISMATCH')
  const standardTone = loading || dataUnavailable ? 'neutral' : standardDeck.status === 'problem' ? 'problem' : standardDeck.legality === 'supported' ? 'success' : 'review'
  const standardLabel = loading ? 'Standard: controllo…' : dataUnavailable ? 'Standard: non disponibile'
    : standardDeck.status === 'problem' ? `Standard: ${standardDeck.problems.length} ${standardDeck.problems.length === 1 ? 'problema certo' : 'problemi certi'}`
      : standardDeck.legality === 'supported' ? 'Standard: conforme allo snapshot' : 'Standard: da verificare'

  function jumpToGroup(id: string): void {
    const heading = document.getElementById(`deck-group-${id}`)
    const main = heading?.closest('.main-content')
    if (!heading || !main) return
    main.scrollTop += heading.getBoundingClientRect().top - main.getBoundingClientRect().top - 20
    heading.focus({ preventScroll: true })
  }

  async function confirmIdentity(lineNumber: number, printId: string): Promise<void> {
    const line = baseline.lines.find((item) => item.lineNumber === lineNumber)
    if (!line || saving) return
    setSaving(true)
    setError(null)
    try {
      const result = await window.projectsApi.saveLineMapping({
        projectId, importedAt: baseline.importedAt, lineNumber, rawLine: line.raw, printId
      })
      if (!result.ok) throw new Error(result.error)
      setReconciliation(result.value)
      setExpanded(null)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Identità non salvata.') }
    finally { setSaving(false) }
  }

  async function clearIdentity(lineNumber: number): Promise<void> {
    const line = baseline.lines.find((item) => item.lineNumber === lineNumber)
    if (!line || saving) return
    setSaving(true)
    setError(null)
    try {
      const result = await window.projectsApi.clearLineMapping({
        projectId, importedAt: baseline.importedAt, lineNumber, rawLine: line.raw
      })
      if (!result.ok) throw new Error(result.error)
      setReconciliation(result.value)
      setExpanded(null)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Correzione non rimossa.') }
    finally { setSaving(false) }
  }

  return <div className="deck-list-body">
    {error && <div className="error-banner" role="alert">{error}</div>}
    <section className="standard-deck-panel" aria-label="Esito Standard occidentale">
      <div className="deck-summary-heading">
        <div className="deck-summary-title">
          <h2>Lista corrente</h2>
          <div className="deck-summary-status">
            <strong data-testid="card-total">{baseline.interpretedTotal} carte</strong>
            <span className="standard-status" data-tone={standardTone} role="status">{standardLabel}</span>
          </div>
        </div>
        <div className="deck-heading-actions">
          <ExportButton baseline={baseline} />
          <button type="button" className="secondary-button" onClick={onImport}>Importa / sostituisci</button>
        </div>
      </div>
      {standardDeck.problems.length > 0 && <ul className="standard-problems" aria-label="Problemi accertati">{standardDeck.problems.map((reason, index) => <li key={index}>{reason}</li>)}</ul>}
      <details className="standard-details"><summary>Controlli e fonti</summary>
      {reviewItems.length > 0 && <div className="standard-review"><h3>Da verificare ({reviewItems.length})</h3><ul>{reviewItems.map((reason, index) => <li key={index}>{reason}</li>)}</ul></div>}
      <h3>Copertura e fonti</h3>
      <p>Data {asOf}. Fonti del pacchetto: {ruleAudit?.status === 'matching' ? `coerenti al ${ruleAudit.checkedAt.slice(0, 10)}` : ruleAudit?.status === 'changed' ? 'da rivedere' : ruleAudit?.status === 'unavailable' ? 'non raggiungibili all’ultimo controllo' : 'non ricontrollate da questa installazione'}. {standardDeck.legality === 'supported'
        ? 'La lista è conforme ai controlli Standard coperti dal pacchetto incluso. La verifica riguarda la lista e le stampe riconosciute, non lingua, autenticità o condizioni delle carte fisiche.'
        : standardDeck.legality === 'invalid' ? 'La lista viola almeno una regola Standard verificata.'
          : 'La conformità Standard resta indeterminata dove regole, stampe o date non sono sufficientemente verificate.'}</p>
      <p>Elenco carte vietate verificato il {BUNDLED_WESTERN_RULE_PACKAGE.standardBans.checkedAt}; errata consultate il {BUNDLED_WESTERN_RULE_PACKAGE.errata.checkedAt}.{' '}
        <button type="button" className="text-button" onClick={() => void window.projectsApi.openStandardSource('standard-bans')}>Carte vietate ↗</button>{' '}
        <button type="button" className="text-button" onClick={() => void window.projectsApi.openStandardSource('errata')}>Errata ↗</button></p>
      {standardDeck.passed.length > 0 && <details><summary>Controlli superati ({standardDeck.passed.length})</summary><ul>{standardDeck.passed.map((item) => <li key={item}>{item}</li>)}</ul></details>}
      </details>
    </section>
    {baseline.declaredTotal !== null && baseline.declaredTotal !== baseline.interpretedTotal && <p className="diagnostics">Totale dichiarato: {baseline.declaredTotal}; interpretato: {baseline.interpretedTotal}.</p>}
    {importProblems.length > 0 && <details className="diagnostics" role="status">
      <summary>Testo importato · {importProblems.length} {importProblems.length === 1 ? 'problema' : 'problemi'} da correggere</summary>
      <ul>{baseline.diagnostics.map((item, index) => <li key={`${item.lineNumber}-${item.code}-${index}`}>{item.lineNumber ? `Riga ${item.lineNumber}: ` : ''}{item.message}</li>)}</ul>
    </details>}
    {!loading && !catalog?.syncedAt && <p className="diagnostics">Catalogo non sincronizzato · <button type="button" className="text-button" onClick={onOpenCatalog}>Apri Catalogo</button></p>}
    <p className="content-note">Apri una carta per vedere stampe e righe importate.</p>
    {loading ? <p className="content-note">Caricamento carte…</p> : <div className="deck-card-groups" aria-label="Carte della lista corrente">
      <nav className="deck-composition" aria-label="Composizione del mazzo">{groups.filter((group) => group.id !== 'unknown' || group.total > 0).map((group) =>
        group.total > 0 ? <a key={group.id} href={`#deck-group-${group.id}`} onClick={(event) => { event.preventDefault(); jumpToGroup(group.id) }}><span>{group.name}</span><strong>{group.total}</strong></a>
          : <span key={group.id}><span>{group.name}</span><strong>0</strong></span>
      )}</nav>
      {usesImportHeadings && <p className="deck-group-note">Le categorie non riconosciute dal catalogo seguono le sezioni del testo importato.</p>}
      {groups.filter((group) => group.cards.length > 0).map((group) => <section className="deck-card-group" key={group.id} aria-labelledby={`deck-group-${group.id}`}>
        <h3 id={`deck-group-${group.id}`} tabIndex={-1}>{group.name}<span>{group.total} {group.total === 1 ? 'carta' : 'carte'}</span></h3>
        <div className="deck-card-list">{group.cards.map((card) => {
        const open = expanded === card.key
        const thumbnail = deckThumbnail(card)
        return <article className="deck-card" key={card.key} data-testid={card.identityId ? `deck-card-${card.identityId}` : `deck-line-${card.lines[0].lineNumber}`}>
          <button type="button" className="deck-card-toggle" aria-expanded={open} onClick={() => setExpanded(open ? null : card.key)}>
            <span className="deck-card-quantity">{card.quantity}×</span>
            <CardThumbnail key={thumbnail} src={thumbnail} />
            <span className="deck-card-title"><strong>{card.name}</strong>{cardStatus(card.status, catalog) && <small>{cardStatus(card.status, catalog)}</small>}</span>
            <span className="deck-card-chevron"><Icon name="chevron" /></span>
          </button>
          {open && <div className="deck-card-detail">
            <CardOverview card={card} onOpenCatalog={onOpenCatalog} />
            {card.identityId && <div className="card-detail-actions"><button type="button" className="secondary-button" onClick={() => onConstrain(card.identityId!)}>Aggiungi vincolo su questa carta</button></div>}
            {card.staleCorrection && <p className="diagnostics">Una correzione precedente non corrisponde più al catalogo locale. Controlla l’identità prima di usarla nell’analisi.</p>}
            {card.status === 'ambiguous' && <p className="content-note">Le righe restano separate finché non confermi l’identità.</p>}
            <details className="deck-import-details"><summary>Testo importato e controlli</summary>
            <div className="deck-source-lines">{card.lines.map((line) => {
              const result = rotationByLine.get(line.lineNumber)
              const setResult = admissionByLine.get(line.lineNumber)
              const promoResult = promoByLine.get(line.lineNumber)
              const admissionResult = promoResult ?? setResult
              const rotationIssue = result && result.status !== 'mark-accepted'
              const admissionIssue = admissionResult && admissionResult.status !== 'admitted'
              return <div key={line.lineNumber}><span>Riga {line.lineNumber}: {line.raw}</span>
                {(rotationIssue || admissionIssue) && <details><summary>Controlli Standard da verificare</summary><ul>
                  {rotationIssue && <li>Rotazione: {result.message}</li>}
                  {admissionIssue && <li>Ammissione: {admissionResult.message}</li>}
                </ul></details>}</div>
            })}</div></details>
            {card.prints.length > 0 && <details className="deck-print-details"><summary>Stampe e varianti ({card.prints.length})</summary>
              <div className="catalog-print-grid">{card.prints.map((print) => <article className="catalog-print" key={print.id}>
                {print.thumbnail ? <img src={print.thumbnail} alt={`Carta ${print.name}, ${print.setName} ${print.localId}`} /> : <div className="catalog-no-image">Miniatura assente</div>}
                <div><strong>{print.setName}</strong><span>{print.setId} · N. {print.localId}</span>
                  {print.rarity && <span>Rarità: {print.rarity}</span>}{print.category === 'Pokemon' && print.stage && <span>Fase: {print.stage}</span>}<span>Marchio: {print.regulationMark ?? 'non indicato'}</span>{print.variants && <span>Varianti: {variantText(print.variants)}</span>}
                  {card.importedPrintIds.includes(print.id) && <span className="imported-print">Indicata nel testo importato</span>}
                  <button type="button" className="text-button" onClick={() => void window.projectsApi.openCatalogSource(print.sourceUrl)}>Apri scheda fonte ↗</button>
                </div>
              </article>)}</div></details>}
            {(card.status === 'ambiguous' || card.staleCorrection || card.candidateIdentities.length > 1 ||
              card.lines.some((line) => reconciliation?.mappings.some((item) => item.lineNumber === line.lineNumber))) &&
              <details className="deck-identity-options">
                <summary>Correggi l’identità della carta di gioco</summary>
                 <p className="content-note">Scegli la carta di gioco corrispondente.</p>
                {card.lines.map((line) => <div className="deck-identity-line" key={line.lineNumber}>
                  <strong>Riga {line.lineNumber}: {line.raw}</strong>
                  {card.candidateIdentities.map((candidate) => {
                    const print = catalog?.prints.find((item) => item.id === candidate.printId)
                    return <div key={candidate.identityId}><span>{candidate.name} · {print?.setName} {print?.localId} · {candidate.basis === 'trainer-text' ? 'testo Trainer coincidente' : 'equivalenza non verificata'}</span>
                      <button type="button" className="secondary-button" disabled={saving} onClick={() => void confirmIdentity(line.lineNumber, candidate.printId)}>Conferma identità</button></div>
                  })}
                  {reconciliation?.mappings.some((item) => item.lineNumber === line.lineNumber) &&
                    <button type="button" className="text-button" disabled={saving} onClick={() => void clearIdentity(line.lineNumber)}>Rimuovi correzione</button>}
                </div>)}
              </details>}
          </div>}
        </article>
      })}</div>
      </section>)}
    </div>}
    <details className="deck-technical"><summary>Rotazione, ammissione e costruzione del mazzo</summary>
    <section className="rotation-panel" aria-label="Controllo della rotazione Standard occidentale">
      <strong>Rotazione Standard occidentale</strong>
      <label>Data di riferimento <input type="date" value={asOf} onChange={(event) => setReferenceDate(event.target.value || null)} /></label>
      {referenceDate && <button type="button" className="text-button" onClick={() => setReferenceDate(null)}>Torna a oggi</button>}
      <p>{rotation.rule ? `Regole ${rotation.rule.version}: marchio ${rotation.rule.firstAllowedMark} o successivo, tra quelli documentati. ` : 'Nessuna regola locale verificata per questa data. '}
        Marchio ammesso: {rotation.counts['mark-accepted']} copie · marchio ruotato: {rotation.counts['mark-rotated']} · da chiarire: {rotation.counts.indeterminate}.
      </p>
      <p>Fonte controllata il {rotation.sourceChecked}; nuove regole arrivano con una release dell’app.
        {rotation.rule && <> <button type="button" className="text-button" onClick={() => void window.projectsApi.openStandardSource(rotation.rule!.version)}>Fonte Play! Pokémon ↗</button></>}
      </p>
    </section>
    <section className="rotation-panel" aria-label="Ammissione dei set Standard occidentali">
      <strong>Ammissione dei set ai tornei</strong>
      <p>Attesa superata: {admission.counts.admitted} copie · prima della data: {admission.counts.waiting} · data da chiarire: {admission.counts.indeterminate}. Pacchetto {admission.version}, controllato il {admission.checkedAt}.</p>
      <p>La data del set non vale per le promo. I set speciali senza data confermata restano da chiarire. <button type="button" className="text-button" onClick={() => void window.projectsApi.openStandardSource('set-admission')}>Regola 2026 ↗</button>{' '}<button type="button" className="text-button" onClick={() => void window.projectsApi.openStandardSource('set-admission-older')}>Regola precedente ↗</button>{' '}<button type="button" className="text-button" onClick={() => void window.projectsApi.openStandardSource('set-releases')}>Calendario prodotti ↗</button></p>
    </section>
    {promoAdmission.lines.length > 0 && <section className="rotation-panel" aria-label="Ammissione delle promo Standard occidentali">
      <strong>Ammissione delle promo</strong>
      <p>Disponibili nel registro alla data osservata: {promoAdmission.counts.admitted} copie · in attesa: {promoAdmission.counts.waiting} · da chiarire: {promoAdmission.counts.indeterminate}. Pacchetto v{promoAdmission.packageVersion ?? '—'}, controllato il {promoAdmission.checkedAt?.slice(0, 10) ?? 'mai'}.</p>
      <p>Per le promo già disponibili il registro non pubblica la data storica di ammissione. <button type="button" className="text-button" onClick={() => void window.projectsApi.openStandardSource('promo')}>Registro Play! Pokémon ↗</button></p>
    </section>}
    <section className="construction-panel" aria-label="Controlli di costruzione del mazzo">
      <strong>Costruzione del mazzo</strong>
      <ul>
        {([['60 carte', construction.cardCount], ['Quattro copie per nome', construction.copyLimit],
          ['Pokémon Base', construction.basicPokemon], ['ACE SPEC', construction.aceSpec]] as const).map(([name, check]) =>
          <li key={name}><span className={`construction-status ${check.status}`}>{check.status === 'met' ? 'Verificato' : check.status === 'problem' ? 'Controlla' : 'Da chiarire'}</span>
            <span><strong>{name}:</strong> {check.message}</span></li>)}
      </ul>
      <p><button type="button" className="text-button" onClick={() => void window.projectsApi.openStandardSource('construction')}>Regole del mazzo ↗</button>{' '}<button type="button" className="text-button" onClick={() => void window.projectsApi.openStandardSource('ace-spec')}>Regola ACE SPEC ↗</button></p>
    </section>
    </details>
  </div>
}
