import { useEffect, useMemo, useState } from 'react'
import type { DeckBaseline } from '../../shared/deck-import'
import type { CatalogView } from '../../shared/catalog'
import { buildDeckCards, type DeckReconciliation } from '../../shared/reconciliation'

function variantText(variants: Record<string, boolean> | null): string {
  if (!variants) return 'non indicate'
  return Object.entries(variants).filter(([, active]) => active).map(([name]) => name).join(', ') || 'nessuna indicata'
}

export function DeckList({ projectId, baseline, onOpenCatalog }: {
  projectId: string; baseline: DeckBaseline; onOpenCatalog(): void
}) {
  const [catalog, setCatalog] = useState<CatalogView | null>(null)
  const [reconciliation, setReconciliation] = useState<DeckReconciliation | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

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

  return <>
    {error && <div className="error-banner" role="alert">{error}</div>}
    {!loading && !catalog?.syncedAt && <p className="diagnostics">Il catalogo campione non è ancora sincronizzato. <button type="button" className="text-button" onClick={onOpenCatalog}>Apri Catalogo</button> per vedere le varianti disponibili.</p>}
    <p className="content-note">Una riga per carta di gioco riconosciuta. Aprila per vedere tutte le stampe note, la rarità, le varianti e le righe originali. Il catalogo è un campione parziale.</p>
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
            <p className="content-note">{card.status === 'recognized' ? 'Stampe collegate per nome, tipo e testo Trainer coincidenti. Legalità ed errata ancora da verificare.' :
              card.status === 'unverified' ? 'Questa stampa è nota, ma altre stampe omonime non vengono unite senza prova di equivalenza.' :
                'Il catalogo non consente di stabilire con certezza la carta di gioco. Le righe restano distinte.'}</p>
            <div className="deck-source-lines"><strong>Nel testo importato</strong>{card.lines.map((line) =>
              <span key={line.lineNumber}>Riga {line.lineNumber}: {line.raw}{line.setCode ? '' : ' · stampa non indicata'}</span>)}</div>
            {card.prints.length > 0 && <><h3>Stampe e varianti note ({card.prints.length})</h3>
              <div className="catalog-print-grid">{card.prints.map((print) => <article className="catalog-print" key={print.id}>
                {print.thumbnail ? <img src={print.thumbnail} alt={`Carta ${print.name}, ${print.setName} ${print.localId}`} /> : <div className="catalog-no-image">Miniatura assente</div>}
                <div><strong>{print.setName}</strong><span>{print.setId} · N. {print.localId}</span>
                  <span>Rarità: {print.rarity ?? 'non disponibile'}</span><span>Varianti: {variantText(print.variants)}</span>
                  {card.importedPrintIds.includes(print.id) && <span className="imported-print">Indicata nel testo importato</span>}
                  <button type="button" className="text-button" onClick={() => void window.projectsApi.openCatalogSource(print.sourceUrl)}>Apri scheda fonte ↗</button>
                </div>
              </article>)}</div></>}
            {card.status === 'ambiguous' && card.candidateIdentities.length > 0 && <div className="deck-identity-options">
              <h3>Possibili carte di gioco</h3><p className="content-note">Conferma l’identità solo se riconosci la carta. Il set mostrato identifica la voce del catalogo, non sceglie una stampa del mazzo.</p>
              {card.candidateIdentities.map((candidate) => {
                const print = catalog?.prints.find((item) => item.id === candidate.printId)
                return <div key={candidate.identityId}><span>{candidate.name} · {print?.setName} {print?.localId} · {candidate.basis === 'trainer-text' ? 'testo Trainer coincidente' : 'equivalenza non verificata'}</span>
                  <button type="button" className="secondary-button" disabled={saving} onClick={() => void confirmIdentity(card.lines[0].lineNumber, candidate.printId)}>Conferma identità</button></div>
              })}</div>}
          </div>}
        </article>
      })}
    </div>}
  </>
}
