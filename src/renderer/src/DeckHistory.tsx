import { useEffect, useState, type FormEvent } from 'react'
import type { DeckBaseline } from '../../shared/deck-import'
import { compareDecks } from '../../shared/deck-diff'
import type { DeckVersion } from '../../shared/deck-threads'

function versionOrigin(version: DeckVersion): string {
  if (version.restoredFrom) return `Ripristino da v${version.restoredFrom.sequence}`
  if (version.adoption) return 'Adottata da una strategia'
  return version.source === 'file' ? `File ${version.fileName ?? '.txt'}` : 'Testo incollato'
}

export function DeckHistory({ projectId, versions, onOpenChange, onRestored, onAnnotated }: {
  projectId: string
  versions: DeckVersion[]
  onOpenChange(open: boolean): void
  onRestored(baseline: DeckBaseline): void
  onAnnotated(version: DeckVersion): void
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [label, setLabel] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const current = versions[0] ?? null
  const selected = versions.find((version) => version.id === selectedId) ?? versions[1] ?? current
  useEffect(() => {
    setLabel(selected?.label ?? '')
    setNote(selected?.note ?? '')
    setError(null)
  }, [selected?.id, selected?.label, selected?.note])
  const diff = current && selected ? compareDecks(current.parsed, selected.parsed) : null
  const changes = diff ? diff.byPrint.length || diff.byName.length : 0

  async function annotate(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    if (!selected || busy) return
    setBusy(true); setError(null)
    try {
      const result = await window.projectsApi.annotateDeckVersion({ projectId,
        versionId: selected.id, label, note })
      if (!result.ok) throw new Error(result.error)
      onAnnotated(result.value)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Nota non salvata.') }
    finally { setBusy(false) }
  }

  async function restore(): Promise<void> {
    if (!selected || !current || busy) return
    setBusy(true); setError(null)
    try {
      const result = await window.projectsApi.restoreDeckVersion({ projectId,
        versionId: selected.id, expectedHeadId: current.id,
        expectedResolutionId: current.resolutionId })
      if (!result.ok) throw new Error(result.error)
      setConfirming(false)
      onRestored(result.value)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Ripristino non riuscito.') }
    finally { setBusy(false) }
  }

  return <><details className="deck-history deck-reference-item" onToggle={(event) => onOpenChange(event.currentTarget.open)}>
    <summary><span className="deck-reference-label">Versioni della lista ({versions.length})</span><span className="deck-reference-description">Confronta, annota o ripristina una versione</span></summary>
    {!current || !selected ? <p>Nessuna versione salvata.</p> : <div className="deck-history-body">
      <p className="content-note">La lista principale resta visibile nel pannello. Scegli una versione per leggerla e confrontarla.</p>
      <label htmlFor="deck-history-version">Versione da consultare</label>
      <select id="deck-history-version" value={selected.id} onChange={(event) => setSelectedId(event.target.value)}>
        {versions.map((version) => <option key={version.id} value={version.id}>
          v{version.sequence}{version.id === current.id ? ' · corrente' : ''}{version.label ? ` · ${version.label}` : ''}
        </option>)}
      </select>
      <p><strong>v{selected.sequence}</strong> · {versionOrigin(selected)} · {new Intl.DateTimeFormat('it-IT',
        { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(selected.createdAt))}</p>
      {!selected.resolutionKnown && <p className="content-note">Le correzioni d’identità di questa versione storica non sono ricostruibili dall’archivio precedente. Un ripristino lascia quelle righe da verificare.</p>}
      {selected.id !== current.id && diff && <div className="deck-history-diff">
        <strong>Confronto con la principale v{current.sequence}</strong>
        <p>{changes ? `${diff.byName.length} cambi per nome · ${diff.byPrint.length} cambi per stampa` : 'Nessuna differenza nelle quantità riconosciute.'}</p>
        {diff.byPrint.length > 0 && <ul>{diff.byPrint.map((item) => <li key={item.name}>
          {item.name}: {item.before} → {item.after}</li>)}</ul>}
      </div>}
      <details><summary>Leggi il testo completo di v{selected.sequence}</summary><pre>{selected.rawText}</pre></details>
      <form className="deck-history-annotation" onSubmit={(event) => void annotate(event)}>
        <label htmlFor="deck-version-label">Etichetta</label>
        <input id="deck-version-label" value={label} maxLength={80} onChange={(event) => setLabel(event.target.value)} />
        <label htmlFor="deck-version-note">Nota</label>
        <textarea id="deck-version-note" value={note} maxLength={1000} onChange={(event) => setNote(event.target.value)} />
        <button type="submit" className="secondary-button" disabled={busy}>Salva etichetta e nota</button>
      </form>
      {error && !confirming && <p className="error-banner" role="alert">{error}</p>}
      {selected.id !== current.id && <button type="button" className="secondary-button"
        onClick={() => { setError(null); setConfirming(true) }}>Ripristina v{selected.sequence} come lista principale</button>}
    </div>}
  </details>{confirming && selected && current && <div className="adoption-modal-backdrop" onKeyDown={(event) => {
    if (event.key === 'Escape' && !busy) setConfirming(false)
  }}><div className="adoption-dialog" role="dialog" aria-modal="true" aria-labelledby="deck-restore-title">
    <h2 id="deck-restore-title">Ripristinare la lista v{selected.sequence}?</h2>
    <p>La principale v{current.sequence} resta nello storico. {selected.rawText === current.rawText
      ? 'Il testo è già identico: verranno ripristinate soltanto le correzioni d’identità disponibili, senza creare una nuova vN.'
      : `Il ripristino creerà v${current.sequence + 1} con il testo completo della versione scelta.`}</p>
    {!selected.resolutionKnown && <p>Le correzioni storiche non sono disponibili: le identità ambigue dovranno essere ricontrollate.</p>}
    {error && <p className="error-banner" role="alert">{error}</p>}
    <div className="dialog-actions">
      <button type="button" className="secondary-button" autoFocus disabled={busy} onClick={() => setConfirming(false)}>Annulla</button>
      <button type="button" className="primary-button" disabled={busy} onClick={() => void restore()}>{busy ? 'Ripristino…' : 'Confermo il ripristino'}</button>
    </div>
  </div></div>}</>
}
