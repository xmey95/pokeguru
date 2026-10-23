import { useEffect, useMemo, useState } from 'react'
import type { DeckBaseline } from '../../shared/deck-import'
import type { CatalogView } from '../../shared/catalog'
import { buildDeckCards, type DeckReconciliation } from '../../shared/reconciliation'
import { evaluateWesternRotation } from '../../shared/standard-rotation'
import { evaluateDeckConstruction } from '../../shared/deck-construction'
import { evaluateSetAdmission } from '../../shared/standard-admission'

function localDate(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

function variantText(variants: Record<string, boolean> | null): string {
  if (!variants) return 'non indicate'
  return Object.entries(variants).filter(([, active]) => active).map(([name]) => name).join(', ') || 'nessuna indicata'
}

export function DeckList({ projectId, baseline, onOpenCatalog, onConstrain }: {
  projectId: string; baseline: DeckBaseline; onOpenCatalog(): void; onConstrain(identityId: string): void
}) {
  const [catalog, setCatalog] = useState<CatalogView | null>(null)
  const [reconciliation, setReconciliation] = useState<DeckReconciliation | null>(null)
  const [loading, setLoading] = useState(true)
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
    void Promise.all([window.projectsApi.getCatalog(), window.projectsApi.getReconciliation(projectId)])
      .then(([catalogResult, reconciliationResult]) => {
        if (!active) return
        if (!catalogResult.ok) throw new Error(catalogResult.error)
        if (!reconciliationResult.ok) throw new Error(reconciliationResult.error)
        setCatalog(catalogResult.value)
        setReconciliation(reconciliationResult.value)
      })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : 'Lista non disponibile.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [projectId, baseline.importedAt])

  const cards = useMemo(() => buildDeckCards(baseline, catalog, reconciliation), [baseline, catalog, reconciliation])
  const asOf = referenceDate ?? today
  const rotation = useMemo(() => evaluateWesternRotation(baseline, catalog, asOf), [baseline, catalog, asOf])
  const construction = useMemo(() => evaluateDeckConstruction(baseline, catalog), [baseline, catalog])
  const rotationByLine = new Map(rotation.lines.map((line) => [line.lineNumber, line]))
  const admission = useMemo(() => evaluateSetAdmission(baseline, catalog, asOf), [baseline, catalog, asOf])
  const admissionByLine = new Map(admission.lines.map((line) => [line.lineNumber, line]))

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

  return <>
    {error && <div className="error-banner" role="alert">{error}</div>}
    {!loading && !catalog?.syncedAt && <p className="diagnostics">Il catalogo campione non è ancora sincronizzato. <button type="button" className="text-button" onClick={onOpenCatalog}>Apri Catalogo</button> per vedere le varianti disponibili.</p>}
    <section className="rotation-panel" aria-label="Controllo della rotazione Standard occidentale">
      <strong>Rotazione Standard occidentale</strong>
      <label>Data di riferimento <input type="date" value={asOf} onChange={(event) => setReferenceDate(event.target.value || null)} /></label>
      {referenceDate && <button type="button" className="text-button" onClick={() => setReferenceDate(null)}>Torna a oggi</button>}
      <p>{rotation.rule ? `Regole ${rotation.rule.version}: marchio ${rotation.rule.firstAllowedMark} o successivo, tra quelli documentati. ` : 'Nessuna regola locale verificata per questa data. '}
        Marchio ammesso: {rotation.counts['mark-accepted']} copie · marchio ruotato: {rotation.counts['mark-rotated']} · da chiarire: {rotation.counts.indeterminate}.
      </p>
      <p>La legalità completa resta <strong>indeterminata</strong>: copertura del catalogo, promo, date non confermate, errata e stampe storiche richiedono verifica. Fonte controllata il {rotation.sourceChecked}; aggiornamento online delle regole non ancora disponibile.
        {rotation.rule && <> <button type="button" className="text-button" onClick={() => void window.projectsApi.openStandardSource(rotation.rule!.version)}>Fonte Play! Pokémon ↗</button></>}
      </p>
    </section>
    <section className="rotation-panel" aria-label="Ammissione dei set Standard occidentali">
      <strong>Ammissione dei set ai tornei</strong>
      <p>Attesa superata: {admission.counts.admitted} copie · prima della data: {admission.counts.waiting} · data da chiarire: {admission.counts.indeterminate}. Pacchetto {admission.version}, controllato il {admission.checkedAt}.</p>
      <p>La data del set non vale per le promo. I set speciali senza data confermata restano da chiarire. <button type="button" className="text-button" onClick={() => void window.projectsApi.openStandardSource('set-admission')}>Regola 2026 ↗</button>{' '}<button type="button" className="text-button" onClick={() => void window.projectsApi.openStandardSource('set-admission-older')}>Regola precedente ↗</button>{' '}<button type="button" className="text-button" onClick={() => void window.projectsApi.openStandardSource('set-releases')}>Calendario prodotti ↗</button></p>
    </section>
    <section className="construction-panel" aria-label="Controlli di costruzione del mazzo">
      <strong>Costruzione del mazzo</strong>
      <ul>
        {([['60 carte', construction.cardCount], ['Quattro copie per nome', construction.copyLimit],
          ['Pokémon Base', construction.basicPokemon]] as const).map(([name, check]) =>
          <li key={name}><span className={`construction-status ${check.status}`}>{check.status === 'met' ? 'Verificato' : check.status === 'problem' ? 'Controlla' : 'Da chiarire'}</span>
            <span><strong>{name}:</strong> {check.message}</span></li>)}
      </ul>
      <p>Questi controlli sono necessari, ma non bastano a confermare la legalità Standard. <button type="button" className="text-button" onClick={() => void window.projectsApi.openStandardSource('construction')}>Fonte Pokémon ↗</button></p>
    </section>
    <p className="content-note">Una riga per carta di gioco riconosciuta. Aprila per vedere tutte le stampe note, la rarità, le varianti e le righe originali. {catalog?.scope.kind === 'standard-marks' ? 'La copertura del manifest TCGdex è indicata nel Catalogo.' : 'Il catalogo è un campione parziale.'}</p>
    {loading ? <p className="content-note">Caricamento carte…</p> : <div className="deck-card-list" aria-label="Carte della lista corrente">
      {cards.map((card) => {
        const open = expanded === card.key
        return <article className="deck-card" key={card.key} data-testid={card.identityId ? `deck-card-${card.identityId}` : `deck-line-${card.lines[0].lineNumber}`}>
          <button type="button" className="deck-card-toggle" aria-expanded={open} onClick={() => setExpanded(open ? null : card.key)}>
            <span className="deck-card-quantity">{card.quantity}×</span>
            <span className="deck-card-title"><strong>{card.name}</strong><small>{card.status === 'recognized' ? 'Carta di gioco riconosciuta' :
              card.status === 'unverified' ? 'Stampa riconosciuta · equivalenza da verificare' :
                card.status === 'ambiguous' ? 'Identità da chiarire' : 'Fuori dal catalogo campione'}</small></span>
            <span className="deck-card-chevron" aria-hidden="true">{open ? '−' : '+'}</span>
          </button>
          {open && <div className="deck-card-detail">
            {card.identityId && <button type="button" className="secondary-button" onClick={() => onConstrain(card.identityId!)}>Aggiungi vincolo su questa carta</button>}
            {card.staleCorrection && <p className="diagnostics">Una correzione precedente non corrisponde più al catalogo locale. Controlla l’identità prima di usarla nell’analisi.</p>}
            <p className="content-note">{card.status === 'recognized' ? 'Stampe collegate per nome, tipo e testo Trainer coincidenti. Legalità ed errata ancora da verificare.' :
              card.status === 'unverified' ? 'Questa stampa è nota, ma altre stampe omonime non vengono unite senza prova di equivalenza.' :
                'Il catalogo non consente di stabilire con certezza la carta di gioco. Le righe restano distinte.'}</p>
            <div className="deck-source-lines"><strong>Nel testo importato</strong>{card.lines.map((line) => {
              const result = rotationByLine.get(line.lineNumber)
              const setResult = admissionByLine.get(line.lineNumber)
              return <div key={line.lineNumber}><span>Riga {line.lineNumber}: {line.raw}{line.setCode ? '' : ' · stampa non indicata'} · {result?.message} {setResult?.message}</span></div>
            })}</div>
            {card.prints.length > 0 && <><h3>Stampe e varianti note ({card.prints.length})</h3>
              <div className="catalog-print-grid">{card.prints.map((print) => <article className="catalog-print" key={print.id}>
                {print.thumbnail ? <img src={print.thumbnail} alt={`Carta ${print.name}, ${print.setName} ${print.localId}`} /> : <div className="catalog-no-image">Miniatura assente</div>}
                <div><strong>{print.setName}</strong><span>{print.setId} · N. {print.localId}</span>
                  <span>Rarità: {print.rarity ?? 'non disponibile'}</span>{print.category === 'Pokemon' && <span>Fase: {print.stage ?? 'non disponibile'}</span>}<span>Marchio: {print.regulationMark ?? 'non disponibile'}</span><span>Varianti: {variantText(print.variants)}</span>
                  {card.importedPrintIds.includes(print.id) && <span className="imported-print">Indicata nel testo importato</span>}
                  <button type="button" className="text-button" onClick={() => void window.projectsApi.openCatalogSource(print.sourceUrl)}>Apri scheda fonte ↗</button>
                </div>
              </article>)}</div></>}
            {(card.status === 'ambiguous' || card.staleCorrection || card.candidateIdentities.length > 1 ||
              card.lines.some((line) => reconciliation?.mappings.some((item) => item.lineNumber === line.lineNumber))) &&
              <details className="deck-identity-options">
                <summary>Correggi l’identità della carta di gioco</summary>
                <p className="content-note">La correzione riguarda la carta di gioco, non la rarità. Il set identifica la voce usata per distinguerla.</p>
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
      })}
    </div>}
  </>
}
