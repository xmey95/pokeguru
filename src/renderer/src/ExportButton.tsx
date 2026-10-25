import { useState } from 'react'
import type { DeckBaseline } from '../../shared/deck-import'

export function ExportButton({ baseline }: { baseline: DeckBaseline }) {
  const [copying, setCopying] = useState(false)
  const [feedback, setFeedback] = useState<{ message: string; error: boolean } | null>(null)

  async function copyExport(): Promise<void> {
    if (copying) return
    setCopying(true)
    setFeedback(null)
    try {
      const result = await window.projectsApi.copyDeckExport({
        projectId: baseline.projectId, importedAt: baseline.importedAt
      })
      if (!result.ok) setFeedback({ message: result.error, error: true })
      else {
        const warning = result.value.find((note) =>
          /^(Sigle da verificare|La lista non ha sezioni|Alcune carte sono fuori dalle sezioni)/.test(note))
        setFeedback({
          message: `Export copiato negli appunti.${warning ? ` ${warning}` :
            baseline.diagnostics.some((item) => item.code === 'ALT_PRINT')
              ? ' Verifica le stampe ALT nel client.' : ''}`,
          error: false
        })
      }
    } catch {
      setFeedback({ message: 'Impossibile copiare l’export. Riprova.', error: true })
    } finally {
      setCopying(false)
    }
  }

  return <div className="deck-export-action">
    <button type="button" className="primary-button" disabled={copying} onClick={() => void copyExport()}>
      {copying ? 'Copia…' : 'Copia export'}
    </button>
    {feedback && <span className={feedback.error ? 'export-error' : 'export-success'} role={feedback.error ? 'alert' : 'status'}>{feedback.message}</span>}
  </div>
}
