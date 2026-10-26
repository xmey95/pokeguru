import { useEffect, useRef, useState } from 'react'
import { ConstraintForm, constraintLabel, ConstraintStatus, focusConstraintControl } from './ConstraintForm'
import { useDeckConstraints } from './DeckConstraintsContext'
import { useViewState } from './Navigation'

export function CardConstraints({ identityId, name }: { identityId: string; name: string }) {
  const { evaluation, loading, saving, error, remove } = useDeckConstraints()
  const [creating, setCreating] = useViewState(`constraint.card.${identityId}`, false)
  const [editingId, setEditingId] = useViewState<string | null>(`constraint.card.edit.${identityId}`, null)
  const [notice, setNotice] = useState('')
  const [deleteError, setDeleteError] = useState<{ id: string; message: string } | null>(null)
  const section = useRef<HTMLElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const formId = `card-constraint-${identityId}`
  const results = evaluation?.results.filter((result) => result.constraint.identityId === identityId) ?? []

  useEffect(() => {
    if (editingId && !results.some((result) => result.constraint.id === editingId)) setEditingId(null)
  }, [editingId, results])

  function closeCreate(): void {
    setCreating(false)
    requestAnimationFrame(() => focusConstraintControl(trigger.current))
  }

  function closeEdit(id: string): void {
    setEditingId(null)
    requestAnimationFrame(() => focusConstraintControl(section.current?.querySelector<HTMLButtonElement>(`[data-edit-constraint="${id}"]`) ?? trigger.current))
  }

  async function deleteConstraint(id: string): Promise<void> {
    setDeleteError(null)
    setNotice('')
    try {
      await remove(id)
      setCreating(false)
      setEditingId(null)
      setNotice('Vincolo eliminato.')
      requestAnimationFrame(() => focusConstraintControl(trigger.current))
    } catch (cause) {
      setDeleteError({ id, message: cause instanceof Error ? cause.message : 'Vincolo non eliminato.' })
    }
  }

  return <section ref={section} className="card-constraints" aria-label={`Vincoli su ${name}`} data-nav-loading={loading}>
    <div className="card-constraint-heading"><h3>Vincoli</h3><span className="content-note">{results.length} {results.length === 1 ? 'vincolo' : 'vincoli'}</span></div>
    <p className="constraint-notice" role="status">{notice}</p>
    {error && <p className="error-banner" role="alert">{error}</p>}
    {loading ? <p className="content-note">Caricamento vincoli…</p> : !error && <>
      {results.length > 0 ? <ul className="card-constraint-summary">{results.map((result) => {
        const constraint = result.constraint
        const editFormId = `${formId}-${constraint.id}`
        return <li key={constraint.id} className="card-constraint-item">
          <div className="card-constraint-description"><strong>{constraintLabel(constraint)}{constraint.printId ? ` · ${constraint.printId}` : ''}</strong>
            <span>{result.message}</span></div>
          <ConstraintStatus result={result} />
          <div className="card-constraint-item-actions">
            <button type="button" className="text-button" data-edit-constraint={constraint.id} disabled={saving}
              aria-expanded={editingId === constraint.id} aria-controls={editingId === constraint.id ? editFormId : undefined}
              onClick={() => { setCreating(false); setEditingId(constraint.id); setNotice(''); setDeleteError(null) }}>Modifica</button>
            <button type="button" className="text-button" disabled={saving} onClick={() => void deleteConstraint(constraint.id)}>Elimina</button>
          </div>
          {deleteError?.id === constraint.id && <p className="error-banner" role="alert">{deleteError.message}</p>}
          {editingId === constraint.id && <ConstraintForm id={editFormId} key={constraint.id} initial={constraint}
            fixedIdentity={{ id: identityId, name }} onSaved={() => { setNotice('Vincolo aggiornato.'); closeEdit(constraint.id) }}
            onCancel={() => closeEdit(constraint.id)} />}
        </li>
      })}</ul> : <p className="content-note">Nessun vincolo su questa carta.</p>}
      {results.some((result) => result.status === 'conflict') && evaluation?.conflicts.map((message) =>
        <p className="constraint-conflict" role="alert" key={message}>{message}</p>)}
      {!creating && <button ref={trigger} type="button" className="secondary-button" aria-label="Aggiungi vincolo su questa carta"
        aria-expanded={false} disabled={saving} onClick={() => { setCreating(true); setEditingId(null); setNotice('') }}>Aggiungi vincolo</button>}
      {creating && <ConstraintForm id={formId} fixedIdentity={{ id: identityId, name }}
        onSaved={() => { setNotice('Vincolo aggiunto.'); closeCreate() }} onCancel={closeCreate} />}
    </>}
  </section>
}
