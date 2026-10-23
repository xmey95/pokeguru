import { useEffect, useMemo, useState } from 'react'
import type { DeckBaseline, DeckLine } from '../../shared/deck-import'
import type { CatalogView } from '../../shared/catalog'
import { suggestPrints, type DeckReconciliation, type PrintCandidate } from '../../shared/reconciliation'

function reasonText(candidate: PrintCandidate): string {
  switch (candidate.reason) {
    case 'same-print': return 'Codice, numero e nome coincidono'
    case 'code-conflict': return 'Codice e numero coincidono, ma il nome è diverso: verifica prima di scegliere'
    case 'same-name': return 'Solo nome coincidente: scegli la stampa esatta'
    default: return 'Risultato della ricerca manuale: verifica carta e stampa'
  }
}

function variantText(value: Record<string, boolean> | null): string {
  if (!value) return 'varianti non indicate'
  const active = Object.entries(value).filter(([, enabled]) => enabled).map(([name]) => name)
  return active.length ? active.join(', ') : 'nessuna variante indicata'
}

export function ReconciliationSection({ projectId, baseline, onOpenCatalog }: {
  projectId: string; baseline: DeckBaseline; onOpenCatalog: () => void
}) {
  const [catalog, setCatalog] = useState<CatalogView | null>(null)
  const [reconciliation, setReconciliation] = useState<DeckReconciliation | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<number | null>(null)
  const [search, setSearch] = useState('')
  const [language, setLanguage] = useState('')

  useEffect(() => {
    let active = true
    void Promise.all([window.projectsApi.getCatalog(), window.projectsApi.getReconciliation(projectId)])
      .then(([catalogResult, reconciliationResult]) => {
        if (!active) return
        if (!catalogResult.ok) throw new Error(catalogResult.error)
        if (!reconciliationResult.ok) throw new Error(reconciliationResult.error)
        setCatalog(catalogResult.value)
        setReconciliation(reconciliationResult.value)
      })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : 'Riconciliazione non disponibile.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [projectId, baseline.importedAt])

  const lines = useMemo(() => baseline.lines.filter((line) => line.kind === 'card'), [baseline])
  const mappingByLine = new Map(reconciliation?.mappings.map((mapping) => [mapping.lineNumber, mapping]) ?? [])
  const editingLine = lines.find((line) => line.lineNumber === editing)
  const candidates = editingLine && catalog ? suggestPrints(editingLine, catalog, search) : []

  function startEditing(line: DeckLine): void {
    setEditing(line.lineNumber)
    setSearch('')
    setLanguage(mappingByLine.get(line.lineNumber)?.sourceLanguage ?? '')
    setError(null)
  }

  async function selectPrint(printId: string): Promise<void> {
    if (editing === null || !editingLine || saving) return
    setSaving(true)
    setError(null)
    try {
      const result = await window.projectsApi.saveLineMapping({
        projectId, importedAt: baseline.importedAt, lineNumber: editing,
        rawLine: editingLine.raw,
        printId, sourceLanguage: language.trim() || null
      })
      if (!result.ok) throw new Error(result.error)
      setReconciliation(result.value)
      setEditing(null)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Scelta non salvata.') }
    finally { setSaving(false) }
  }

  async function clearPrint(lineNumber: number): Promise<void> {
    if (saving) return
    setSaving(true)
    setError(null)
    try {
      const line = lines.find((item) => item.lineNumber === lineNumber)
      if (!line) throw new Error('Riga non trovata.')
      const result = await window.projectsApi.clearLineMapping({ projectId, importedAt: baseline.importedAt, lineNumber, rawLine: line.raw })
      if (!result.ok) throw new Error(result.error)
      setReconciliation(result.value)
      if (editing === lineNumber) setEditing(null)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Scelta non rimossa.') }
    finally { setSaving(false) }
  }

  return <section className="reconciliation-panel" aria-label="Riconciliazione della lista">
    <div className="panel-heading"><div><span className="eyebrow">Riconciliazione</span><h2>Carte della lista</h2></div>
      {reconciliation && <strong>{reconciliation.resolvedLines}/{lines.length} righe</strong>}
    </div>
    <p className="content-note">Abbina ogni riga alla stampa esatta del catalogo. I suggerimenti non modificano la lista: la scelta è sempre manuale. Le ristampe con identità testuale comune si sommano come carta di gioco; set, numero e rarità restano associati alla riga originale.</p>
    {loading ? <p className="content-note">Caricamento corrispondenze…</p> : <>
      {error && <div className="error-banner" role="alert">{error}</div>}
      {!catalog?.syncedAt && <div className="diagnostics">Il campione del catalogo non è ancora scaricato. <button type="button" className="text-button" onClick={onOpenCatalog}>Apri Catalogo</button> per sincronizzarlo.</div>}
      {reconciliation && <p className="reconciliation-counts">Copie riconciliate: <strong>{reconciliation.resolvedCopies}/{baseline.interpretedTotal}</strong> · Righe irrisolte: <strong>{reconciliation.unresolvedLines}</strong>. Le righe non interpretate restano nella diagnostica originale.</p>}
      <div className="reconciliation-lines">{lines.map((line) => {
        const mapping = mappingByLine.get(line.lineNumber)
        return <article className="reconciliation-line" key={line.lineNumber} data-testid={`reconcile-line-${line.lineNumber}`}>
          <div className="reconciliation-line-head">
            <div><strong>Riga {line.lineNumber} · {line.quantity}× {line.name}</strong><span>Testo originale: {line.raw}</span><span>Stampa nel testo: {line.setCode ? `${line.setCode} ${line.cardNumber}` : 'non indicata'}</span></div>
            <span className={mapping ? 'reconciliation-status resolved' : 'reconciliation-status'}>{mapping ? 'Riconciliata' : 'Irrisolta'}</span>
          </div>
          {mapping ? <div className="mapped-print"><div><strong>{mapping.print.name} · {mapping.print.setName} {mapping.print.localId}</strong><span>{mapping.print.setId} · rarità: {mapping.print.rarity ?? 'non disponibile'} · {variantText(mapping.print.variants)}</span><span>Identità di gioco: {mapping.print.identityBasis === 'trainer-text' ? 'testo Trainer coincidente' : 'equivalenza da verificare'} · lingua del testo: {mapping.sourceLanguage ?? 'non indicata'}</span><span>Fonte: TCGdex · {mapping.print.sourceUrl}</span>{catalog && catalog.prints.find((item) => item.id === mapping.print.id)?.identityId !== mapping.print.identityId && <span className="catalog-error">Il catalogo è cambiato: ricontrolla questa scelta.</span>}</div><button type="button" className="secondary-button" onClick={() => startEditing(line)} disabled={saving}>Cambia stampa</button><button type="button" className="text-button" onClick={() => void clearPrint(line.lineNumber)} disabled={saving}>Lascia irrisolta</button></div>
            : <button type="button" className="secondary-button" onClick={() => startEditing(line)} disabled={!catalog?.syncedAt || saving}>Scegli carta e stampa</button>}
          {editing === line.lineNumber && <div className="reconciliation-picker">
            {/ALT/i.test(line.setCode ?? '') && <p className="diagnostics">Codice ALT nel testo: non esiste una corrispondenza certa nel campione. Controlla nome, set e numero prima di confermare.</p>}
            <div className="reconciliation-picker-fields"><label>Cerca nel catalogo<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nome, set, numero o rarità" autoFocus /></label><label>Lingua del testo originale (facoltativa)<input value={language} onChange={(event) => setLanguage(event.target.value)} placeholder="es. it, en, ja" maxLength={35} /></label></div>
            <p className="content-note">Il nome originale «{line.name}» resta salvato anche quando scegli una carta con altro nome. La lingua non crea un’altra identità competitiva.</p>
            <div className="reconciliation-candidates">{candidates.length ? candidates.map(({ print, reason }) => <div className="reconciliation-candidate" key={print.id}>
              {print.thumbnail ? <img src={print.thumbnail} alt="" /> : <div className="reconciliation-image-empty">Immagine assente</div>}
              <div><strong>{print.name}</strong><span>{print.setName} ({print.setId}) · n. {print.localId} · {print.rarity ?? 'rarità non disponibile'}</span><span>{variantText(print.variants)}</span><span>{print.identityBasis === 'trainer-text' ? 'Identità Trainer per testo coincidente' : 'Identità da verificare'}</span><em>{reasonText({ print, reason })}</em></div>
              <button type="button" className="secondary-button" onClick={() => void selectPrint(print.id)} disabled={saving}>Usa questa stampa</button>
            </div>) : <p className="content-note">Nessuna proposta nel campione. Cerca un altro nome oppure lascia la riga irrisolta; promo, Energie e carte fuori campione non vengono sostituite automaticamente.</p>}</div>
            <button type="button" className="text-button" onClick={() => setEditing(null)}>Chiudi scelta</button>
          </div>}
        </article>
      })}</div>
      {reconciliation && reconciliation.identityTotals.length > 0 && <div className="identity-totals"><h3>Totali per carta di gioco riconciliata</h3><p className="content-note">Somma le copie di stampe collegate; la verifica del limite di copie e della legalità arriverà nei task successivi.</p><ul>{reconciliation.identityTotals.map((item) => <li key={item.identityId}><strong>{item.name}: {item.quantity}</strong><span>{item.printIds.join(', ')}</span></li>)}</ul></div>}
    </>}
  </section>
}
