import { useEffect, useMemo, useState, type FormEvent } from 'react'
import type { CatalogPrint, CatalogView } from '../../shared/catalog'
import type { DeckBaseline } from '../../shared/deck-import'
import { evaluateConstraints, type ConstraintKind, type DeckConstraint } from '../../shared/constraints'
import { buildDeckCards, type DeckReconciliation } from '../../shared/reconciliation'

function label(constraint: DeckConstraint): string {
  if (constraint.kind === 'required') return 'Obbligatoria'
  return constraint.kind === 'minimum' ? `Almeno ${constraint.quantity}` : `Esattamente ${constraint.quantity}`
}

export function ConstraintsSection({ projectId, baseline, selectedIdentityId, selectionVersion,
  onOpenCatalog }: {
  projectId: string
  baseline: DeckBaseline | null
  selectedIdentityId: string | null
  selectionVersion: number
  onOpenCatalog(): void
}) {
  const [catalog, setCatalog] = useState<CatalogView | null>(null)
  const [reconciliation, setReconciliation] = useState<DeckReconciliation | null>(null)
  const [constraints, setConstraints] = useState<DeckConstraint[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [identityId, setIdentityId] = useState('')
  const [printId, setPrintId] = useState('')
  const [kind, setKind] = useState<ConstraintKind>('required')
  const [quantity, setQuantity] = useState('2')
  const [editingId, setEditingId] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    setLoading(true)
    void Promise.all([
      window.projectsApi.getCatalog(),
      window.projectsApi.getReconciliation(projectId),
      window.projectsApi.listConstraints(projectId)
    ]).then(([catalogResult, reconciliationResult, constraintsResult]) => {
      if (!active) return
      if (!catalogResult.ok) throw new Error(catalogResult.error)
      if (!reconciliationResult.ok) throw new Error(reconciliationResult.error)
      if (!constraintsResult.ok) throw new Error(constraintsResult.error)
      setCatalog(catalogResult.value)
      setReconciliation(reconciliationResult.value)
      setConstraints(constraintsResult.value)
    }).catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : 'Vincoli non disponibili.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [projectId, baseline?.importedAt])

  useEffect(() => {
    if (!selectedIdentityId) return
    setEditingId(null)
    setIdentityId(selectedIdentityId)
    setPrintId('')
    document.getElementById('deck-constraints')?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }, [selectedIdentityId, selectionVersion])

  const cards = useMemo(() => baseline ? buildDeckCards(baseline, catalog, reconciliation) : [],
    [baseline, catalog, reconciliation])
  const catalogPrints = useMemo(() => (catalog?.prints ?? []).filter((print) => print.detailAt && print.identityId),
    [catalog])
  const identities = useMemo(() => {
    const byId = new Map<string, CatalogPrint>()
    for (const print of catalogPrints) if (!byId.has(print.identityId!)) byId.set(print.identityId!, print)
    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
  }, [catalogPrints])
  const inDeck = new Set(cards.map((card) => card.identityId).filter((id): id is string => !!id))
  const selectedPrints = catalogPrints.filter((print) => print.identityId === identityId)
  const evaluation = useMemo(() => catalog
    ? evaluateConstraints(constraints, baseline, catalog, reconciliation)
    : null, [constraints, baseline, catalog, reconciliation])
  const problemCount = evaluation?.results.filter((result) => result.status === 'conflict' || result.status === 'unmet').length ?? 0

  function edit(constraint: DeckConstraint): void {
    setEditingId(constraint.id)
    setIdentityId(constraint.identityId)
    setPrintId(constraint.printId ?? '')
    setKind(constraint.kind)
    setQuantity(String(constraint.quantity))
    setError(null)
    document.getElementById('constraint-form')?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }

  async function save(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    if (saving) return
    setSaving(true)
    setError(null)
    try {
      const result = await window.projectsApi.saveConstraint({
        projectId, id: editingId ?? undefined, identityId, printId: printId || null,
        kind, quantity: kind === 'required' ? 1 : Number(quantity)
      })
      if (!result.ok) throw new Error(result.error)
      setConstraints((items) => editingId
        ? items.map((item) => item.id === editingId ? result.value : item)
        : [...items, result.value])
      setEditingId(null)
      setKind('required')
      setPrintId('')
      setQuantity('2')
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Vincolo non salvato.') }
    finally { setSaving(false) }
  }

  async function remove(constraint: DeckConstraint): Promise<void> {
    if (saving) return
    setSaving(true)
    setError(null)
    try {
      const result = await window.projectsApi.deleteConstraint({ projectId, id: constraint.id })
      if (!result.ok) throw new Error(result.error)
      setConstraints(result.value)
      if (editingId === constraint.id) setEditingId(null)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Vincolo non eliminato.') }
    finally { setSaving(false) }
  }

  return <section id="deck-constraints" className="constraints-panel" aria-label="Vincoli del mazzo">
    <div className="panel-heading"><div><span className="eyebrow">Requisiti del mazzo</span><h2>Vincoli</h2></div>
      <strong>{constraints.length} {constraints.length === 1 ? 'vincolo' : 'vincoli'}{problemCount ? ` · ${problemCount} da risolvere` : ''}</strong></div>
    <p className="content-note">I vincoli restano nel progetto quando cambi la lista. Le quantità sono controllate sulla carta di gioco attraverso le ristampe equivalenti. Una stampa specifica è facoltativa.</p>
    <p className="constraint-legality">L'esito Standard occidentale della lista, con problemi e punti da verificare, è mostrato in <strong>Lista corrente</strong>. I vincoli sono un controllo aggiuntivo.</p>
    {error && <div className="error-banner" role="alert">{error}</div>}
    {loading ? <p className="content-note">Caricamento vincoli…</p> : <>
      {!catalog?.syncedAt && <p className="diagnostics">Sincronizza il catalogo campione per scegliere una carta. <button type="button" className="text-button" onClick={onOpenCatalog}>Apri Catalogo</button></p>}
      {evaluation?.conflicts.map((message, index) => <p className="constraint-conflict" role="alert" key={index}>{message}</p>)}
      {constraints.length ? <div className="constraint-list">{evaluation?.results.map(({ constraint, status, message }) =>
        <article className="constraint-item" key={constraint.id}>
          <div><strong>{constraint.identityName}{constraint.printId ? ` · ${constraint.printId}` : ''}</strong>
            <span>{label(constraint)} · {message}</span></div>
          <span className={`constraint-status ${status}`}>{status === 'met' ? 'Soddisfatto' : status === 'unmet' ? 'Non soddisfatto' : status === 'conflict' ? 'Conflitto' : 'Indeterminato'}</span>
          <button type="button" className="text-button" onClick={() => edit(constraint)} disabled={saving}>Modifica</button>
          <button type="button" className="text-button" onClick={() => void remove(constraint)} disabled={saving}>Elimina</button>
        </article>)}</div> : <p className="content-note">Nessun vincolo impostato.</p>}
      <form id="constraint-form" className="constraint-form" onSubmit={(event) => void save(event)}>
        <h3>{editingId ? 'Modifica vincolo' : 'Aggiungi vincolo'}</h3>
        <label>Carta di gioco
          <select value={identityId} onChange={(event) => { setIdentityId(event.target.value); setPrintId('') }} required disabled={!catalog?.syncedAt}>
            <option value="">Seleziona una carta</option>
            <optgroup label="Nella lista corrente">{identities.filter((print) => inDeck.has(print.identityId!)).map((print) =>
              <option key={print.identityId!} value={print.identityId!}>{print.name} · {print.setName} {print.localId}</option>)}</optgroup>
            <optgroup label="Nel catalogo">{identities.filter((print) => !inDeck.has(print.identityId!)).map((print) =>
              <option key={print.identityId!} value={print.identityId!}>{print.name} · {print.setName} {print.localId}</option>)}</optgroup>
          </select>
        </label>
        <label>Stampa specifica (facoltativa)
          <select value={printId} onChange={(event) => setPrintId(event.target.value)} disabled={!identityId}>
            <option value="">Tutte le stampe equivalenti</option>
            {selectedPrints.map((print) => <option key={print.id} value={print.id}>{print.setName} {print.localId} · {print.rarity ?? 'rarità ignota'}</option>)}
          </select>
        </label>
        <label>Tipo di vincolo
          <select value={kind} onChange={(event) => setKind(event.target.value as ConstraintKind)}>
            <option value="required">Obbligatoria</option><option value="minimum">Almeno N</option><option value="exact">Esattamente N</option>
          </select>
        </label>
        {kind !== 'required' && <label>Numero di copie
          <input type="number" min="1" max="60" step="1" value={quantity} onChange={(event) => setQuantity(event.target.value)} required />
        </label>}
        <div className="constraint-form-actions"><button type="submit" className="primary-button" disabled={saving || !identityId || !catalog?.syncedAt}>{saving ? 'Salvataggio…' : editingId ? 'Salva modifica' : 'Aggiungi vincolo'}</button>
          {editingId && <button type="button" className="text-button" onClick={() => setEditingId(null)}>Annulla modifica</button>}</div>
      </form>
    </>}
  </section>
}
