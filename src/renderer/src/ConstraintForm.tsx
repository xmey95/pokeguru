import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { evaluateConstraints, type ConstraintKind, type ConstraintResult, type DeckConstraint } from '../../shared/constraints'
import { useDeckConstraints } from './DeckConstraintsContext'
import { useDraftState } from './Navigation'

export function constraintLabel(constraint: DeckConstraint): string {
  return constraint.kind === 'required' ? 'Obbligatoria' : constraint.kind === 'minimum'
    ? `Almeno ${constraint.quantity}` : `Esattamente ${constraint.quantity}`
}

export function ConstraintStatus({ result }: { result: ConstraintResult }) {
  return <span className={`constraint-status ${result.status}`}>{result.status === 'met' ? 'Soddisfatto'
    : result.status === 'unmet' ? 'Non soddisfatto' : result.status === 'conflict' ? 'Conflitto' : 'Indeterminato'}</span>
}

// Scroll only the workspace: native scrollIntoView can shift the entire app grid.
export function focusConstraintControl(element: HTMLElement | null): void {
  if (!element) return
  element.focus({ preventScroll: true })
  const main = element.closest('.main-content')
  if (!main) return
  const rect = element.getBoundingClientRect()
  const viewport = main.getBoundingClientRect()
  if (rect.top < viewport.top + 16 || rect.bottom > viewport.bottom - 16)
    main.scrollTop += rect.top - viewport.top - 20
}

export function ConstraintForm({ id, initial, fixedIdentity, onSaved, onCancel: cancel }: {
  id: string
  initial?: DeckConstraint
  fixedIdentity: { id: string; name: string }
  onSaved(constraint: DeckConstraint): void
  onCancel(): void
}) {
  const { projectId, baseline, catalog, reconciliation, constraints, saving, save } = useDeckConstraints()
  const draftKey = `constraint:${projectId}:${id}:${initial?.updatedAt ?? 'new'}`
  const [printId, setPrintId] = useDraftState(`${draftKey}:print`, initial?.printId ?? '')
  const [kind, setKind] = useDraftState<ConstraintKind>(`${draftKey}:kind`, initial?.kind ?? 'required')
  const [quantity, setQuantity] = useDraftState(`${draftKey}:quantity`, String(initial?.quantity ?? 2))
  function resetDraft(): void {
    setPrintId(initial?.printId ?? '')
    setKind(initial?.kind ?? 'required')
    setQuantity(String(initial?.quantity ?? 2))
  }
  function onCancel(): void { resetDraft(); cancel() }
  const [error, setError] = useState<string | null>(null)
  const form = useRef<HTMLFormElement>(null)
  useEffect(() => { focusConstraintControl(form.current?.querySelector('select') ?? null) }, [])

  const prints = useMemo(() => (catalog?.prints ?? []).filter((print) => print.detailAt && print.identityId), [catalog])
  const copies = kind === 'required' ? 1 : Number(quantity)
  const valid = !!fixedIdentity.id && Number.isInteger(copies) && copies >= 1 && copies <= 60
  const preview = useMemo(() => {
    if (!valid || !catalog) return null
    const draft: DeckConstraint = { id: initial?.id ?? 'draft', projectId, identityId: fixedIdentity.id,
      identityName: fixedIdentity.name,
      printId: printId || null, kind, quantity: copies, createdAt: '', updatedAt: '' }
    const result = evaluateConstraints([...constraints.filter((item) => item.id !== initial?.id), draft], baseline, catalog, reconciliation)
    return { result: result.results.find((item) => item.constraint.id === draft.id)!, conflicts: result.conflicts }
  }, [valid, catalog, initial, projectId, fixedIdentity, printId, kind, copies, constraints, baseline, reconciliation])

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    if (!valid || saving) return
    setError(null)
    try { const saved = await save({ id: initial?.id, identityId: fixedIdentity.id, printId: printId || null, kind, quantity: copies }); resetDraft(); onSaved(saved) }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Vincolo non salvato.') }
  }

  return <form ref={form} id={id} className="constraint-form" aria-labelledby={`${id}-title`} onSubmit={(event) => void submit(event)}
    onKeyDown={(event) => { if (event.key === 'Escape' && !saving) { event.preventDefault(); event.stopPropagation(); onCancel() } }}>
    <h3 id={`${id}-title`}>{initial ? 'Modifica vincolo' : `Vincolo su ${fixedIdentity.name}`}</h3>
    <fieldset className="constraint-fields" disabled={saving}>
      <label>Tipo di vincolo<select value={kind} onChange={(event) => setKind(event.target.value as ConstraintKind)}>
        <option value="required">Obbligatoria</option><option value="minimum">Almeno N</option><option value="exact">Esattamente N</option>
      </select></label>
      {kind !== 'required' && <label>Numero di copie<input type="number" min="1" max="60" step="1" value={quantity} onChange={(event) => setQuantity(event.target.value)} required /></label>}
      <label className="constraint-print-field">Stampa specifica (facoltativa)
        <select value={printId} onChange={(event) => setPrintId(event.target.value)}>
          <option value="">Tutte le stampe equivalenti</option>
          {initial?.printId && !prints.some((print) => print.id === initial.printId) &&
            <option value={initial.printId}>{initial.printId} · stampa non disponibile nel catalogo</option>}
          {prints.filter((print) => print.identityId === fixedIdentity.id).map((print) =>
            <option key={print.id} value={print.id}>{print.setName} {print.localId} · {print.rarity ?? 'rarità ignota'}</option>)}
        </select>
      </label>
    </fieldset>
    {preview && <div className="constraint-preview" aria-live="polite"><ConstraintStatus result={preview.result} />
      <span>{preview.result.status === 'met' ? `${preview.result.certainCopies} ${preview.result.certainCopies === 1 ? 'copia' : 'copie'} nella lista` : preview.result.message}</span>
      {preview.result.status === 'conflict' && preview.conflicts.map((message) => <p className="constraint-conflict" key={message}>{message}</p>)}
    </div>}
    {error && <p className="error-banner" role="alert">{error}</p>}
    <div className="constraint-form-actions"><button type="submit" className="primary-button" disabled={saving || !valid || !catalog?.syncedAt}>{saving ? 'Salvataggio…' : initial ? 'Salva modifica' : 'Aggiungi vincolo'}</button>
      <button type="button" className="text-button" onClick={onCancel} disabled={saving}>Annulla</button></div>
  </form>
}
