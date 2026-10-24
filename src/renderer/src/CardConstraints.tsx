import { useId, useRef, useState } from 'react'
import { ConstraintForm, constraintLabel, ConstraintStatus, focusConstraintControl } from './ConstraintForm'
import { useDeckConstraints } from './DeckConstraintsContext'

export function CardConstraints({ identityId, name }: { identityId: string; name: string }) {
  const { evaluation, loading, saving, error } = useDeckConstraints()
  const [open, setOpen] = useState(false)
  const [notice, setNotice] = useState('')
  const trigger = useRef<HTMLButtonElement>(null)
  const formId = useId()
  const results = evaluation?.results.filter((result) => result.constraint.identityId === identityId) ?? []
  function close(): void {
    setOpen(false)
    requestAnimationFrame(() => focusConstraintControl(trigger.current))
  }
  return <div className="card-constraints">
    {results.length > 0 && <ul className="card-constraint-summary" aria-label={`Vincoli su ${name}`}>{results.map((result) =>
      <li key={result.constraint.id}><span>{constraintLabel(result.constraint)}{result.constraint.printId ? ` · ${result.constraint.printId}` : ''}</span><ConstraintStatus result={result} /></li>)}</ul>}
    <p className="constraint-notice" role="status">{notice}</p>
    {error && <p className="error-banner" role="alert">{error}</p>}
    {!open && <div className="card-constraint-actions">
      <button ref={trigger} type="button" className="secondary-button" aria-label="Aggiungi vincolo su questa carta" aria-expanded={open} aria-controls={open ? formId : undefined}
        disabled={loading || saving || !!error} onClick={() => { setOpen(true); setNotice('') }}>{loading ? 'Caricamento vincoli…' : 'Aggiungi vincolo'}</button>
      {results.length > 0 && <button type="button" className="text-button" onClick={() => focusConstraintControl(document.querySelector('#deck-constraints h2'))}>Gestisci vincoli</button>}
    </div>}
    {open && <ConstraintForm id={formId} fixedIdentity={{ id: identityId, name }}
      onSaved={() => { setNotice('Vincolo aggiunto.'); close() }} onCancel={close} />}
  </div>
}
