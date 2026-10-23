import { useEffect, useState, type FormEvent } from 'react'
import type { DeckThread, DeckVersion } from '../../shared/deck-threads'

interface Props {
  projectId: string
  mainImportedAt: string | null
}

function displayDate(value: string): string {
  return new Intl.DateTimeFormat('it-IT', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value))
}

export function ThreadsSection({ projectId, mainImportedAt }: Props) {
  const [versions, setVersions] = useState<DeckVersion[]>([])
  const [threads, setThreads] = useState<DeckThread[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [openingNote, setOpeningNote] = useState('')
  const [message, setMessage] = useState('')
  const [candidateText, setCandidateText] = useState('')
  const [candidateNote, setCandidateNote] = useState('')
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const selected = threads.find((thread) => thread.id === selectedId) ?? null
  const timeline = selected ? [
    ...selected.messages.map((item) => ({ kind: 'message' as const, item })),
    ...selected.candidates.map((item) => ({ kind: 'candidate' as const, item }))
  ].sort((a, b) => a.item.createdAt.localeCompare(b.item.createdAt)) : []

  useEffect(() => {
    let active = true
    setLoading(true)
    setError(null)
    void Promise.all([window.projectsApi.listDeckVersions(projectId), window.projectsApi.listDeckThreads(projectId)])
      .then(([versionResult, threadResult]) => {
        if (!active) return
        if (!versionResult.ok) throw new Error(versionResult.error)
        if (!threadResult.ok) throw new Error(threadResult.error)
        setVersions(versionResult.value)
        setThreads(threadResult.value)
        const first = threadResult.value[0]
        setSelectedId(first?.id ?? null)
        setCandidateText(first?.candidates.at(-1)?.rawText ??
          versionResult.value.find((version) => version.id === first?.baseVersionId)?.rawText ?? '')
      })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : 'Impossibile leggere i thread.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [projectId, mainImportedAt])

  function selectThread(thread: DeckThread): void {
    setSelectedId(thread.id)
    setCandidateText(thread.candidates.at(-1)?.rawText ??
      versions.find((version) => version.id === thread.baseVersionId)?.rawText ?? '')
    setCandidateNote('')
    setMessage('')
  }

  async function create(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    if (working) return
    setWorking(true)
    setError(null)
    try {
      const result = await window.projectsApi.createDeckThread({ projectId, title, openingNote })
      if (!result.ok) throw new Error(result.error)
      setThreads((current) => [result.value, ...current])
      selectThread(result.value)
      setTitle('')
      setOpeningNote('')
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Thread non creato.') }
    finally { setWorking(false) }
  }

  async function addMessage(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    if (!selected || working) return
    setWorking(true)
    setError(null)
    try {
      const result = await window.projectsApi.addDeckThreadMessage(projectId, selected.id, message)
      if (!result.ok) throw new Error(result.error)
      setThreads((current) => current.map((thread) => thread.id === selected.id ? result.value : thread))
      setMessage('')
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Messaggio non salvato.') }
    finally { setWorking(false) }
  }

  async function saveCandidate(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    if (!selected || working) return
    setWorking(true)
    setError(null)
    try {
      const result = await window.projectsApi.saveDeckCandidate({
        projectId, threadId: selected.id, rawText: candidateText, note: candidateNote
      })
      if (!result.ok) throw new Error(result.error)
      setThreads((current) => current.map((thread) => thread.id === selected.id ? result.value : thread))
      setCandidateNote('')
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Candidata non salvata.') }
    finally { setWorking(false) }
  }

  return <section className="threads-section" aria-label="Thread del mazzo">
    <div className="panel-heading"><div><span className="eyebrow">Esplora in parallelo</span><h2>Thread del mazzo</h2></div></div>
    <p className="content-note">Ogni thread parte dalla versione corrente al momento della creazione. Messaggi e liste candidate restano nel thread; la lista principale cambia solo dalla sezione Lista.</p>
    {error && <div className="error-banner" role="alert">{error}</div>}
    {loading ? <p className="content-note">Caricamento thread…</p> : <>
      <div className="threads-layout">
        <aside className="threads-sidebar">
          <form className="thread-form" onSubmit={(event) => void create(event)}>
            <h3>Nuovo thread</h3>
            <label htmlFor="thread-title">Titolo</label>
            <input id="thread-title" value={title} maxLength={120} onChange={(event) => setTitle(event.target.value)} placeholder="Es. Variante più veloce" required />
            <label htmlFor="thread-opening">Prima osservazione (facoltativa)</label>
            <textarea id="thread-opening" value={openingNote} maxLength={5000} onChange={(event) => setOpeningNote(event.target.value)} />
            <button className="primary-button" disabled={working || !title.trim()}>Crea thread</button>
          </form>
          <div className="thread-picker" aria-label="Thread salvati">
            {threads.length === 0 && <p className="content-note">Nessun thread creato.</p>}
            {threads.map((thread) => <button key={thread.id} type="button" className={thread.id === selectedId ? 'active' : ''}
              onClick={() => selectThread(thread)}>
              <strong>{thread.title}</strong>
              <small>{thread.baseVersionNumber === null ? 'Senza lista iniziale' : `Base v${thread.baseVersionNumber}`} · {thread.candidates.length} candidate{thread.stale ? ' · Da confrontare' : ''}</small>
            </button>)}
          </div>
        </aside>
        <div className="thread-detail">
          {selected ? <>
            <div className="thread-heading"><div><h3>{selected.title}</h3><p className="content-note">Creato il {displayDate(selected.createdAt)} · {selected.baseVersionNumber === null ? 'Senza lista iniziale' : `Versione di partenza: v${selected.baseVersionNumber}`}</p></div>
              {selected.stale && <span className="matchup-freshness stale">Base da confrontare</span>}</div>
            {selected.stale && <p className="stale-discussion">La lista principale è cambiata dopo la creazione di questo thread. Confronta le versioni prima di usare una candidata.</p>}
            <div className="thread-timeline">
              {timeline.map((entry) => entry.kind === 'message' ? <div className="thread-message" key={entry.item.id}><small>{entry.item.author === 'user' ? 'Tu' : 'AI'} · {displayDate(entry.item.createdAt)}</small><p>{entry.item.text}</p></div> : <details className="thread-candidate" key={entry.item.id}>
                <summary>Candidata {entry.item.sequence} · {entry.item.parsed.interpretedTotal} carte · {displayDate(entry.item.createdAt)}</summary>
                {entry.item.note && <p>{entry.item.note}</p>}
                {entry.item.parsed.diagnostics.length > 0 && <p className="content-note">{entry.item.parsed.diagnostics.length} note di importazione da controllare.</p>}
                <pre>{entry.item.rawText}</pre>
              </details>)}
            </div>
            <form className="thread-form" onSubmit={(event) => void addMessage(event)}>
              <label htmlFor="thread-message">Aggiungi un'osservazione</label>
              <textarea id="thread-message" value={message} maxLength={5000} onChange={(event) => setMessage(event.target.value)} />
              <button className="secondary-button" disabled={working || !message.trim()}>Salva osservazione</button>
            </form>
            <form className="thread-form candidate-form" onSubmit={(event) => void saveCandidate(event)}>
              <h4>Nuova candidata</h4>
              <p className="content-note">Incolla sempre l'intera lista. Puoi salvare una bozza incompleta: il totale interpretato e le note saranno visibili nella cronologia.</p>
              <label htmlFor="candidate-text">Lista completa proposta</label>
              <textarea id="candidate-text" value={candidateText} onChange={(event) => setCandidateText(event.target.value)} spellCheck={false} />
              <label htmlFor="candidate-note">Motivo o appunti (facoltativo)</label>
              <textarea id="candidate-note" value={candidateNote} maxLength={5000} onChange={(event) => setCandidateNote(event.target.value)} />
              <button className="primary-button" disabled={working || !candidateText.trim()}>Salva candidata nel thread</button>
            </form>
          </> : <p className="content-note">Crea un thread per esplorare una variante del mazzo.</p>}
        </div>
      </div>
      <details className="thread-versions"><summary>Versioni principali ({versions.length})</summary>
        {versions.length === 0 ? <p className="content-note">Ancora nessuna lista principale.</p> : versions.map((version, index) =>
          <details key={version.id}><summary>v{version.sequence}{index === 0 ? ' · corrente' : ''} · {version.parsed.interpretedTotal} carte · {displayDate(version.createdAt)}</summary><pre>{version.rawText}</pre></details>)}
      </details>
    </>}
  </section>
}
