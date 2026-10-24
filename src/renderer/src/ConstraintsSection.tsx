import { useEffect, useRef, useState } from 'react'
import { ConstraintForm, constraintLabel, ConstraintStatus, focusConstraintControl } from './ConstraintForm'
import { useDeckConstraints } from './DeckConstraintsContext'
import { useViewState } from './Navigation'

export function ConstraintsSection({ selectedIdentityId, selectionVersion, onTargetConsumed, onOpenCatalog }: {
  selectedIdentityId: string | null
  selectionVersion: number
  onTargetConsumed(): void
  onOpenCatalog(): void
}) {
  const { catalog, constraints, evaluation, loading, saving, error, remove } = useDeckConstraints()
  const [editingId, setEditingId] = useViewState<string | null>('constraint.editing', null)
  const [createIdentity, setCreateIdentity] = useViewState<string | null>('constraint.creating', null)
  const [notice, setNotice] = useState('')
  const [deleteError, setDeleteError] = useState<{ id: string; message: string } | null>(null)
  const section = useRef<HTMLElement>(null)
  const addButton = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!selectedIdentityId || loading || error) return
    setEditingId(null)
    setCreateIdentity(selectedIdentityId)
    onTargetConsumed()
  }, [selectedIdentityId, selectionVersion, loading, error, onTargetConsumed])

  const problemCount = evaluation?.results.filter((result) => result.status === 'conflict' || result.status === 'unmet').length ?? 0
  function finishEdit(id: string): void {
    setEditingId(null)
    requestAnimationFrame(() => focusConstraintControl(section.current?.querySelector<HTMLButtonElement>('[data-edit-constraint="' + id + '"]') ?? null))
  }
  function finishCreate(): void {
    setCreateIdentity(null)
    requestAnimationFrame(() => focusConstraintControl(addButton.current))
  }
  async function deleteConstraint(id: string): Promise<void> {
    setDeleteError(null)
    setNotice('')
    try {
      await remove(id)
      if (editingId === id) setEditingId(null)
      setNotice('Vincolo eliminato.')
      requestAnimationFrame(() => focusConstraintControl(section.current?.querySelector<HTMLButtonElement>('[data-edit-constraint]') ?? addButton.current))
    } catch (cause) { setDeleteError({ id, message: cause instanceof Error ? cause.message : 'Vincolo non eliminato.' }) }
  }

  return <section ref={section} id="deck-constraints" className="constraints-panel" aria-label="Vincoli del mazzo" data-nav-loading={loading}>
    <div className="panel-heading"><div><h2 tabIndex={-1}>Vincoli</h2>
      <span className="content-note">{constraints.length} {constraints.length === 1 ? 'vincolo' : 'vincoli'}{problemCount ? ' · ' + problemCount + ' da risolvere' : ''}</span></div>
      {createIdentity === null && <button ref={addButton} type="button" className="secondary-button" disabled={loading || saving || !!error || !catalog?.syncedAt}
        onClick={() => { setEditingId(null); setCreateIdentity(''); setNotice('') }}>Aggiungi vincolo</button>}</div>
    {error && <div className="error-banner" role="alert">{error}</div>}
    <p className="constraint-notice" role="status">{notice}</p>
    {loading ? <p className="content-note">Caricamento vincoli…</p> : !error && <>
      {!catalog?.syncedAt && <p className="diagnostics">Catalogo non sincronizzato · <button type="button" className="text-button" onClick={onOpenCatalog}>Apri Catalogo</button> per scegliere una carta.</p>}
      {evaluation?.conflicts.map((message, index) => <p className="constraint-conflict" role="alert" key={index}>{message}</p>)}
      {constraints.length ? <div className="constraint-list">{evaluation?.results.map((result) => {
        const { constraint, status, certainCopies, message } = result
        return <article className="constraint-item" key={constraint.id}>
          <div className="constraint-item-description"><strong>{constraint.identityName}{constraint.printId ? ' · ' + constraint.printId : ''}</strong>
            <span>{constraintLabel(constraint)}{status === 'met' ? ` · ${certainCopies} ${certainCopies === 1 ? 'copia' : 'copie'}` : status === 'conflict' ? '' : ' · ' + message}</span></div>
          <ConstraintStatus result={result} />
          <button type="button" className="text-button" data-edit-constraint={constraint.id} disabled={saving} aria-expanded={editingId === constraint.id}
            onClick={() => { setCreateIdentity(null); setEditingId(constraint.id); setNotice('') }}>Modifica</button>
          <button type="button" className="text-button" onClick={() => void deleteConstraint(constraint.id)} disabled={saving}>Elimina</button>
          {deleteError?.id === constraint.id && <p className="error-banner" role="alert">{deleteError.message}</p>}
          {editingId === constraint.id && <ConstraintForm id="constraint-form" key={constraint.id} initial={constraint}
            onSaved={() => { setNotice('Vincolo aggiornato.'); finishEdit(constraint.id) }} onCancel={() => finishEdit(constraint.id)} />}
        </article>
      })}</div> : <p className="content-note">Nessun vincolo impostato.</p>}
      {createIdentity !== null && <ConstraintForm id="constraint-form" key={'new:' + createIdentity} initialIdentityId={createIdentity}
        onSaved={() => { setNotice('Vincolo aggiunto.'); finishCreate() }} onCancel={finishCreate} />}
    </>}
    <details className="constraint-legality"><summary>Come funzionano i vincoli</summary><p>Restano nel progetto quando cambi lista e contano le ristampe equivalenti. Puoi richiedere una stampa specifica. L’esito Standard complessivo è nella Lista principale.</p></details>
  </section>
}
