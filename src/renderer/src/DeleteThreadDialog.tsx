import { useEffect, useRef, useState } from 'react'
import type { DeckThreadSummary } from '../../shared/deck-threads'

export function DeleteThreadDialog({ thread, onClose, onDeleted }: {
  thread: DeckThreadSummary; onClose(): void; onDeleted(id: string): void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => { dialog.current?.showModal() }, [])
  async function remove() {
    setWorking(true)
    setError(null)
    try {
      const result = await window.projectsApi.deleteDeckThread(thread.projectId, thread.id, thread.title)
      if (!result.ok) throw new Error(result.error)
      dialog.current?.close()
      onDeleted(thread.id)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Thread non eliminato. Riprova.') }
    finally { setWorking(false) }
  }
  return <dialog ref={dialog} className="thread-delete-dialog" aria-labelledby="delete-thread-title"
    onCancel={(event) => { if (working) event.preventDefault() }} onClose={onClose}>
    <h2 id="delete-thread-title">Eliminare questo Thread?</h2>
    <p><strong>{thread.title}</strong></p>
    <p>La conversazione, le candidate e le analisi salvate in questo Thread saranno eliminate definitivamente.
      La lista principale, le versioni già adottate e gli altri Thread rimangono disponibili.</p>
    {error && <p className="error-banner" role="alert">{error}</p>}
    <div className="dialog-actions">
      <button type="button" className="secondary-button" autoFocus disabled={working} onClick={() => dialog.current?.close()}>Annulla</button>
      <button type="button" className="danger-button" disabled={working} onClick={() => void remove()}>{working ? 'Eliminazione…' : 'Elimina definitivamente'}</button>
    </div>
  </dialog>
}
