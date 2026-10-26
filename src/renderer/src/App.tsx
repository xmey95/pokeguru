import { InlineLoading, LoadingSkeleton, Spinner } from './Loading'
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import type { DeckBaseline, DeckImportSource } from '../../shared/deck-import'
import type { DeckVersion } from '../../shared/deck-threads'
import type { Project } from '../../shared/projects'
import { MatchupSection } from './MatchupSection'
import { AiSettings } from './AiSettings'
import { CatalogSection } from './CatalogSection'
import { DeckList } from './DeckList'
import { DeckHistory } from './DeckHistory'
import { DeckCompanion } from './DeckCompanion'
import { DeckConstraintsProvider } from './DeckConstraintsContext'
import { DeckConstraintIndex } from './DeckConstraintIndex'
import { ThreadsSection } from './ThreadsSection'
import { TournamentSection } from './TournamentSection'
import { Icon } from './Icon'
import { ProjectSwitcher } from './ProjectSwitcher'
import { NavigationControls, useNavigation, useDraftState, useViewState, useBusyState } from './Navigation'

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('it-IT', { dateStyle: 'medium' }).format(new Date(value))
}

function projectWithBaseline(project: Project, baseline: DeckBaseline): Project {
  const hasProblems = baseline.diagnostics.some((item) =>
    item.code === 'UNPARSED' || item.code === 'TOTAL_MISMATCH')
  return {
    ...project,
    cardTotal: baseline.interpretedTotal,
    updatedAt: baseline.importedAt,
    status: baseline.interpretedTotal === 60 && !hasProblems ? 'PRONTA_PER_CONTROLLO' : 'BOZZA'
  }
}

export function App() {
  const nav = useNavigation()
  const { view, tab: activeTab } = nav.entry.route
  const importKey = `import:${nav.entry.route.projectId}`
  const [projects, setProjects] = useState<Project[]>([])
  const [archivedProjects, setArchivedProjects] = useState<Project[]>([])
  const [selected, setSelected] = useState<Project | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null)
  const [deleteName, setDeleteName] = useState('')
  const [projectActionBusy, setProjectActionBusy] = useState(false)
  const [name, setName] = useDraftState('project-name', '')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useBusyState('project.create')
  const [baseline, setBaseline] = useState<DeckBaseline | null>(null)
  const [deckVersions, setDeckVersions] = useState<DeckVersion[]>([])
  const [historyOpen, setHistoryOpen] = useState(false)
  const [baselineLoading, setBaselineLoading] = useState(false)
  const [draft, setDraft] = useDraftState(`${importKey}:text`, baseline?.rawText ?? '')
  const [source, setSource] = useDraftState<DeckImportSource>(`${importKey}:source`, baseline?.source ?? 'paste')
  const [fileName, setFileName] = useDraftState<string | null>(`${importKey}:file`, baseline?.fileName ?? null)
  const [importing, setImporting] = useBusyState(importKey)
  const [importOpen, setImportOpen] = useViewState('import.open', false)
  const [readingFile, setReadingFile] = useState(false)
  const [importError, setImportError] = useDraftState<string | null>(`${importKey}:error`, null)
  const [importNotice, setImportNotice] = useState('')
  const [error, setError] = useState<string | null>(null)
  const catalogFocusIdentityId = nav.entry.ui['catalog.focus'] as string | null ?? null
  const setView = (next: typeof view) => nav.go({ view: next })
  const [showCompactCreate, setShowCompactCreate] = useViewState('project.create', false)
  const selectionVersion = useRef(0)
  const importDraftVersion = useRef(0)
  const wasImporting = useRef(importing)
  useEffect(() => {
    const finished = wasImporting.current && !importing
    wasImporting.current = importing
    if (finished && selected) void selectProject(selected.id)
  }, [importing])

  useEffect(() => { if (showCompactCreate) document.getElementById('compact-project-name')?.focus() }, [showCompactCreate])

  async function selectProject(id: string, known?: Project): Promise<void> {
    const version = ++selectionVersion.current
    setError(null)
    setBaselineLoading(true)
    setBaseline(null)
    setDeckVersions([])
    setHistoryOpen(false)
    try {
      let project = known
      if (!project) {
        const found = await window.projectsApi.get(id)
        if (!found.ok) throw new Error(found.error)
        if (!found.value) throw new Error('Progetto non trovato. Riapri l’app per aggiornare l’elenco.')
        project = found.value
      }
      if (version !== selectionVersion.current) return
      setSelected(project)
      const [result, versions] = await Promise.all([
        window.projectsApi.getBaseline(id), window.projectsApi.listDeckVersions(id)
      ])
      if (version !== selectionVersion.current) return
      if (!result.ok) throw new Error(result.error)
      if (!versions.ok) throw new Error(versions.error)
      setBaseline(result.value)
      setDeckVersions(versions.value)
    } catch (cause) {
      if (version === selectionVersion.current) {
        setError(cause instanceof Error ? cause.message : 'Impossibile aprire la lista del progetto.')
      }
    } finally {
      if (version === selectionVersion.current) setBaselineLoading(false)
    }
  }

  useEffect(() => {
    let active = true
    async function load(): Promise<void> {
      try {
        if (!window.projectsApi?.list) throw new Error('Collegamento con l’archivio locale non disponibile.')
        const [result, archived] = await Promise.all([window.projectsApi.list(), window.projectsApi.listArchived()])
        if (!active) return
        if (!result.ok) {
          setError(result.error)
          return
        }
        if (!archived.ok) throw new Error(archived.error)
        setProjects(result.value)
        setArchivedProjects(archived.value)
        const requested = nav.entry.route.projectId
        const project = requested ? result.value.find((item) => item.id === requested) : result.value[0]
        if (project) {
          nav.entry.route.projectId = project.id
          void selectProject(project.id, project)
        } else if (requested) setError('Questo progetto non è più disponibile. Scegli un altro progetto oppure torna indietro.')
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : 'Impossibile leggere i progetti.')
      } finally {
        if (active) setLoading(false)
      }
    }
    void load()
    return () => { active = false; selectionVersion.current++; importDraftVersion.current++ }
  }, [])

  async function openProject(id: string): Promise<void> {
    nav.go({ view: 'project', projectId: id }, undefined, `${activeTab === 'deck' ? 'Lista' : activeTab === 'threads' ? 'Thread' : 'Matchup'} · ${projects.find((item) => item.id === id)?.name ?? 'Progetto'}`)
  }

  async function archiveProject(id: string): Promise<void> {
    if (projectActionBusy) return
    setProjectActionBusy(true)
    setError(null)
    try {
      const result = await window.projectsApi.archive(id)
      if (!result.ok) throw new Error(result.error)
      const remaining = projects.filter((project) => project.id !== id)
      setProjects(remaining)
      setArchivedProjects((current) => [result.value, ...current])
      if (selected?.id === id) nav.go({ view: 'project', tab: 'deck', projectId: remaining[0]?.id ?? null })
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Archiviazione non riuscita.') }
    finally { setProjectActionBusy(false) }
  }

  async function restoreProject(id: string): Promise<void> {
    if (projectActionBusy) return
    setProjectActionBusy(true)
    setError(null)
    try {
      const result = await window.projectsApi.restore(id)
      if (!result.ok) throw new Error(result.error)
      setArchivedProjects((current) => current.filter((project) => project.id !== id))
      setProjects((current) => [result.value, ...current])
      nav.go({ view: 'project', tab: 'deck', projectId: id })
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Ripristino non riuscito.') }
    finally { setProjectActionBusy(false) }
  }

  async function deleteArchivedProject(): Promise<void> {
    if (!deleteTarget || projectActionBusy || deleteName !== deleteTarget.name) return
    setProjectActionBusy(true)
    setError(null)
    try {
      const result = await window.projectsApi.deleteArchived(deleteTarget.id, deleteName)
      if (!result.ok) throw new Error(result.error)
      setArchivedProjects((current) => current.filter((project) => project.id !== deleteTarget.id))
      setDeleteTarget(null)
      setDeleteName('')
      document.getElementById('project-switcher-trigger')?.focus()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Cancellazione non riuscita.') }
    finally { setProjectActionBusy(false) }
  }

  async function createProject(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    if (saving) return
    setSaving(true)
    setError(null)
    try {
      const result = await window.projectsApi.create({ name, format: 'STANDARD' })
      if (!result.ok) {
        setError(result.error)
        return
      }
      setProjects((current) => [result.value, ...current])
      selectionVersion.current++
      setName('')
      setShowCompactCreate(false)
      nav.go({ view: 'project', tab: 'deck', projectId: result.value.id })
    } catch {
      setError('Salvataggio non riuscito. Nessun progetto è stato creato.')
    } finally {
      setSaving(false)
    }
  }

  async function loadTextFile(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0]
    const version = selectionVersion.current
    const draftVersion = ++importDraftVersion.current
    event.target.value = ''
    if (!file) return
    setReadingFile(false)
    if (!/\.txt$/i.test(file.name)) {
      setImportError('Seleziona un file .txt.')
      return
    }
    if (file.size > 400_000) {
      setImportError('Il file è troppo grande per una lista di mazzo.')
      return
    }
    try {
      setReadingFile(true)
      setImportError(null)
      const text = await file.text()
      if (version !== selectionVersion.current || draftVersion !== importDraftVersion.current) return
      setDraft(text)
      setSource('file')
      setFileName(file.name)
    } catch {
      if (version === selectionVersion.current && draftVersion === importDraftVersion.current) setImportError('Impossibile leggere il file selezionato.')
    } finally { if (draftVersion === importDraftVersion.current) setReadingFile(false) }
  }

  async function importDeck(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    if (!selected || importing || readingFile || baselineLoading) return
    const projectId = selected.id
    const importVersion = selectionVersion.current
    setImporting(true)
    setImportError(null)
    try {
      const result = await window.projectsApi.importDeck({ projectId, rawText: draft, source, fileName,
        expectedHeadId: baseline?.versionId ?? null })
      if (!result.ok) {
        setImportError(result.error)
        return
      }
      if (selectionVersion.current !== importVersion || !nav.isCurrent()) return
      const versions = await window.projectsApi.listDeckVersions(projectId)
      if (selectionVersion.current !== importVersion || !nav.isCurrent()) return
      const updated = projectWithBaseline(selected, result.value)
      setProjects((current) => current.map((project) => project.id === projectId ? updated : project))
      setBaseline(result.value)
      if (versions.ok) setDeckVersions(versions.value)
      setSelected(updated)
      setDraft(result.value.rawText)
      setSource(result.value.source)
      setFileName(result.value.fileName)
      setImportOpen(false)
      setImportNotice(baseline ? 'Lista sostituita.' : 'Lista salvata.')
      requestAnimationFrame(focusList)
    } catch {
      setImportError('Importazione non riuscita. Riprova il salvataggio.')
    } finally {
      setImporting(false)
    }
  }

  function resetImportUi(): void {
    importDraftVersion.current++
    setImportOpen(false)
    setReadingFile(false)
    setImportError(null)
    setImportNotice('')
  }

  function focusList(): void {
    const trigger = document.getElementById('deck-import-trigger')
    if (!trigger) return
    trigger.focus({ preventScroll: true })
    trigger.closest('.main-content')?.scrollTo(0, 0)
  }

  function cancelImport(): void {
    if (importing || !baseline) return
    resetImportUi()
    setDraft(baseline.rawText)
    setSource(baseline.source)
    setFileName(baseline.fileName)
    requestAnimationFrame(focusList)
  }

  function focusImport(): void {
    if (!importOpen) {
      importDraftVersion.current++
      setDraft(baseline?.rawText ?? '')
      setSource(baseline?.source ?? 'paste')
      setFileName(baseline?.fileName ?? null)
      setImportError(null)
      setImportNotice('')
      setImportOpen(true)
    }
    requestAnimationFrame(() => {
      const panel = document.getElementById('deck-import')
      const main = panel?.closest('.main-content')
      document.getElementById('deck-text')?.focus({ preventScroll: true })
      if (panel && main) main.scrollTop += panel.getBoundingClientRect().top - main.getBoundingClientRect().top - 20
    })
  }

  const importProblems = baseline?.diagnostics.filter((item) => item.code === 'UNPARSED' || item.code === 'TOTAL_MISMATCH') ?? []
  const showDeckCompanion = Boolean(selected && view === 'project' && (activeTab !== 'deck' || historyOpen))
  const activeSelectionVersion = selectionVersion.current

  return (
    <div className={`app-shell ${showDeckCompanion ? 'with-deck' : ''} ${view === 'project' ? `workspace-${activeTab}` : ''}`}>
      <a className="skip-link" href="#main-content">Vai al contenuto</a>
      <header className="topbar">
        <NavigationControls />
        <span>Pokéguru <b aria-hidden="true">/</b> {view === 'project' ? activeTab === 'deck' ? 'Lista' : activeTab === 'threads' ? 'Thread' : 'Matchup' : view === 'catalog' ? 'Catalogo' : view === 'tournament' ? 'Eventi' : 'Impostazioni AI'}</span>
        <span>Standard occidentale</span>
      </header>

      <div className="workspace">
        <aside className="sidebar" aria-label="Progetti di mazzo">
          <div className="brand">
            <img className="brand-mark" src="./favicon.svg" alt="Pokéguru" width="40" height="40" />
            <div><strong aria-hidden="true">Pokéguru</strong><span>Analisi competitiva</span></div>
          </div>
          <ProjectSwitcher projects={projects} archivedProjects={archivedProjects} selected={selected} loading={loading || projectActionBusy}
            onSelect={(id) => void openProject(id)}
            onArchive={(id) => void archiveProject(id)} onRestore={(id) => void restoreProject(id)}
            onDelete={(project) => { setDeleteTarget(project); setDeleteName(''); setError(null) }}
            onCreate={() => { if (view === 'project') setShowCompactCreate(true); else nav.go({ view: 'project' }, { 'project.create': true }) }} />
          <nav className="workspace-nav" aria-label="Aree del progetto">
            <span className="rail-caption">Area di lavoro</span>
            <button type="button" className={view === 'project' && activeTab === 'deck' ? 'active' : ''} aria-current={view === 'project' && activeTab === 'deck' ? 'page' : undefined} onClick={() => nav.go({ view: 'project', tab: 'deck' })} title="Lista" aria-label="Lista"><Icon name="deck" /><span className="nav-label">Lista</span></button>
            <button type="button" className={view === 'project' && activeTab === 'threads' ? 'active' : ''} aria-current={view === 'project' && activeTab === 'threads' ? 'page' : undefined} onClick={() => nav.go({ view: 'project', tab: 'threads' })} title="Thread" aria-label="Thread"><Icon name="thread" /><span className="nav-label">Thread</span></button>
            <button type="button" className={view === 'project' && activeTab === 'matchups' ? 'active' : ''} aria-current={view === 'project' && activeTab === 'matchups' ? 'page' : undefined} onClick={() => nav.go({ view: 'project', tab: 'matchups' })} title="Matchup" aria-label="Matchup"><Icon name="matchup" /><span className="nav-label">Matchup</span></button>
          </nav>
          <nav className="resource-nav" aria-label="Risorse globali">
            <span className="rail-caption">Risorse</span>
            <button type="button" className={view === 'catalog' ? 'active' : ''} onClick={() => setView('catalog')} title="Catalogo" aria-label="Catalogo" aria-current={view === 'catalog' ? 'page' : undefined}><Icon name="catalog" /><span className="nav-label">Catalogo</span></button>
            <button type="button" className={view === 'tournament' ? 'active' : ''} onClick={() => setView('tournament')} title="Eventi" aria-label="Eventi" aria-current={view === 'tournament' ? 'page' : undefined}><Icon name="event" /><span className="nav-label">Eventi</span></button>
            <button type="button" className={view === 'ai' ? 'active' : ''} onClick={() => setView('ai')} title="Impostazioni AI" aria-label="Impostazioni AI" aria-current={view === 'ai' ? 'page' : undefined}><Icon name="settings" /><span className="nav-label">Impostazioni AI</span></button>
          </nav>
          <div className="local-indicator"><span aria-hidden="true" /> Archivio locale</div>
        </aside>

        <main id="main-content" className="main-content" tabIndex={-1} data-nav-loading={loading || baselineLoading}>
          {showCompactCreate && <form className="compact-create-panel" onSubmit={(event) => void createProject(event)}>
            <div className="panel-heading"><h2>Nuovo progetto</h2><button type="button" className="text-button" onClick={() => { setShowCompactCreate(false); document.getElementById('project-switcher-trigger')?.focus() }}>Chiudi</button></div>
            <label htmlFor="compact-project-name">Nome progetto</label>
            <input id="compact-project-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={120} required placeholder="Es. Mega Absol / Mega Audino" />
            <p className="content-note">Standard · circuito occidentale / internazionale</p>
            <button type="submit" className="primary-button" disabled={saving || loading || !name.trim()}>{saving ? 'Salvataggio…' : 'Crea progetto'}</button>
          </form>}
          {error && <div className="error-banner" role="alert">{error}</div>}
          {view === 'ai' ? <AiSettings /> : view === 'catalog' ? selected && !baselineLoading
            ? <DeckConstraintsProvider key={selected.id} projectId={selected.id} baseline={baseline}>
                <CatalogSection focusIdentityId={catalogFocusIdentityId} canConstrain />
              </DeckConstraintsProvider>
            : <CatalogSection focusIdentityId={catalogFocusIdentityId} /> : view === 'tournament' ? <TournamentSection /> : loading ? <LoadingSkeleton label="Apertura progetti…" rows={3} /> : selected ? (
            <section className="project-detail" aria-label="Dettaglio progetto">
              <div className="detail-headline">
                <div>
                  <h1 data-testid="selected-project-name">{selected.name}</h1>
                </div>
              </div>
              <details className="project-meta-details"><summary>Profilo e date del progetto</summary><div className="detail-meta">
                <div><span>Formato</span><strong>Standard</strong></div>
                <div><span>Circuito</span><strong>Occidentale / internazionale</strong></div>
                <div><span>Creato il</span><strong>{formatDate(selected.createdAt)}</strong></div>
                <div><span>Lista principale</span><strong>{selected.cardTotal === null ? 'Assente' : `${selected.cardTotal} carte interpretate`}</strong></div>
              </div></details>
              {selected.circuitAssignment === 'MIGRATED' && <p className="migration-note">Profilo occidentale assegnato a questo progetto esistente. La lista è rimasta invariata.</p>}
              {activeTab === 'deck' ? <DeckConstraintsProvider key={`${selected.id}:${baseline?.importedAt ?? 'empty'}`} projectId={selected.id} baseline={baseline}>
              {importNotice && <p className="import-notice" role="status">{importNotice}</p>}
              {!baselineLoading && !error && (!baseline || importOpen) && <form id="deck-import" className="import-panel" aria-labelledby="deck-import-title" aria-describedby="deck-import-note"
                onSubmit={(event) => void importDeck(event)} onKeyDown={(event) => {
                  if (event.key === 'Escape' && baseline && !importing) { event.preventDefault(); event.stopPropagation(); cancelImport() }
                }}>
                <div className="panel-heading"><h2 id="deck-import-title">{baseline ? 'Sostituisci la lista' : 'Aggiungi una lista'}</h2></div>
                <p id="deck-import-note" className="content-note">{baseline ? 'Il salvataggio sostituisce la lista principale.' : 'Incolla una lista o scegli un file .txt.'}</p>
                <label htmlFor="deck-text">Testo lista</label>
                <textarea id="deck-text" value={draft} disabled={importing || readingFile} onChange={(event) => {
                  importDraftVersion.current++; setDraft(event.target.value); setSource('paste'); setFileName(null)
                }} placeholder={'Pokémon: 2\n2 Mega Absol ex MEG 86\nTotal Cards: 2'} spellCheck={false} />
                {importError && <p className="error-banner" role="alert">{importError}</p>}
                <div className="import-actions">
                  <label className="file-picker" htmlFor="deck-file" aria-disabled={importing || readingFile}>Scegli file .txt</label>
                  <input id="deck-file" type="file" accept=".txt,text/plain" disabled={importing || readingFile} onChange={(event) => void loadTextFile(event)} />
                  {fileName && <span className="selected-file">{fileName}</span>}
                  {readingFile && <InlineLoading>Lettura file…</InlineLoading>}
                  <div className="import-submit-actions">
                    {baseline && <button type="button" className="text-button" disabled={importing} onClick={cancelImport}>Annulla</button>}
                    <button className="primary-button" type="submit" disabled={importing || readingFile || !draft.trim()}>{importing && <Spinner />}{importing ? 'Salvataggio…' : baseline ? 'Sostituisci lista' : 'Salva lista'}</button>
                  </div>
                </div>
              </form>}
              {!baselineLoading && <DeckConstraintIndex />}
              {baselineLoading ? <LoadingSkeleton label="Caricamento lista…" /> : baseline ? (
                <div className="baseline-panel" data-testid="baseline-panel">
                  <DeckList key={`${selected.id}:${baseline.importedAt}`} projectId={selected.id} baseline={baseline} onOpenCatalog={() => setView('catalog')} onImport={focusImport} importOpen={importOpen} />
                  <details className="project-meta-details"><summary>Origine della lista</summary><p className="content-note">{baseline.source === 'file' ? `File: ${baseline.fileName}` : 'Testo incollato'} · {formatDate(baseline.importedAt)}</p></details>
                  {importProblems.length === 0 && baseline.diagnostics.length > 0 && <details className="project-meta-details"><summary>Note sul testo importato</summary><ul>{baseline.diagnostics.map((item, index) => <li key={index}>{item.message}</li>)}</ul></details>}
                  <details className="original-text"><summary>Mostra testo originale e tutte le righe</summary><pre>{baseline.rawText}</pre></details>
                  <DeckHistory projectId={selected.id} versions={deckVersions} onOpenChange={setHistoryOpen}
                    onAnnotated={(version) => {
                      if (selectionVersion.current === activeSelectionVersion) setDeckVersions((items) =>
                        items.map((item) => item.id === version.id ? version : item))
                    }}
                    onRestored={(restored) => {
                      if (selectionVersion.current !== activeSelectionVersion) return
                      const restoreSelectionVersion = selectionVersion.current
                      setBaseline(restored)
                      setDraft(restored.rawText)
                      setSource(restored.source)
                      setFileName(restored.fileName)
                      const updated = projectWithBaseline(selected, restored)
                      setSelected(updated)
                      setProjects((items) => items.map((item) => item.id === selected.id ? updated : item))
                      void window.projectsApi.listDeckVersions(selected.id).then((result) => {
                        if (result.ok && selectionVersion.current === restoreSelectionVersion) setDeckVersions(result.value)
                      })
                    }} />
                </div>
              ) : null}
              </DeckConstraintsProvider> : activeTab === 'threads' ? <ThreadsSection key={selected.id} projectId={selected.id} mainContextKey={baseline ? `${baseline.versionId}:${baseline.resolutionId}` : null}
                onAdopt={(adopted) => {
                  resetImportUi()
                  const updated = projectWithBaseline(selected, adopted)
                  setBaseline(adopted)
                  void window.projectsApi.listDeckVersions(selected.id).then((result) => {
                    if (result.ok) setDeckVersions(result.value)
                  })
                  setDraft(adopted.rawText)
                  setSource(adopted.source)
                  setFileName(adopted.fileName)
                  setSelected(updated)
                  setProjects((current) => current.map((project) => project.id === selected.id ? updated : project))
                }} /> : <MatchupSection key={selected.id} projectId={selected.id} baseline={baseline} onOpenAiSettings={() => setView('ai')}
                  onOpenCatalogCard={(identityId) => nav.go({ view: 'catalog' }, { 'catalog.focus': identityId, 'catalog.focusConsumed': false, 'catalog.selected': identityId, 'catalog.query': '', 'catalog.set': 'all' }, 'Catalogo · carta dalla guida')} />}
            </section>
          ) : (
            <section className="welcome" aria-label="Benvenuto">
              <span className="eyebrow">Inizia da qui</span>
              <h1>Il tuo prossimo mazzo.</h1>
              <p>Crea un progetto, importa la lista e confronta le varianti.</p>
              <button type="button" className="primary-button welcome-create" onClick={() => setShowCompactCreate(true)}>Inizia un progetto</button>
              {!showCompactCreate && <form className="create-form" onSubmit={(event) => void createProject(event)}>
                <label htmlFor="project-name">Nome progetto</label>
                <input
                  id="project-name"
                  name="project-name"
                  autoComplete="off"
                  maxLength={120}
                  placeholder="Es. Mega Absol / Mega Audino"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  required
                />
                <label htmlFor="project-format">Formato</label>
                <select id="project-format" defaultValue="STANDARD">
                  <option value="STANDARD">Standard</option>
                </select>
                <span className="fixed-circuit">Circuito: Occidentale / internazionale</span>
                <button className="primary-button" type="submit" disabled={saving || loading || !name.trim()}>
                  {saving ? 'Salvataggio…' : 'Crea progetto'}
                </button>
              </form>}
              <div className="welcome-steps">
                <span>01 <strong>Crea un progetto</strong></span>
                <span>02 <strong>Importa la lista</strong></span>
                <span>03 <strong>Analizza e migliora</strong></span>
              </div>
            </section>
          )}
        </main>
        {selected && showDeckCompanion && <DeckCompanion key={selected.id} baseline={baseline}
          versionSequence={deckVersions[0]?.sequence ?? null} loading={baselineLoading} />}
      </div>
      {deleteTarget && <div className="adoption-modal-backdrop" onKeyDown={(event) => {
        if (event.key === 'Escape' && !projectActionBusy) { setDeleteTarget(null); setDeleteName(''); document.getElementById('project-switcher-trigger')?.focus() }
      }}>
        <div className="adoption-dialog" role="dialog" aria-modal="true" aria-labelledby="project-delete-title" aria-describedby="project-delete-description">
          <h2 id="project-delete-title">Elimina definitivamente “{deleteTarget.name}”?</h2>
          <p id="project-delete-description">Questa azione cancella dall’archivio attivo il progetto, le versioni della lista, i vincoli, i Thread, le candidate, le guide Matchup e le evidenze AI collegate. Non può essere annullata. Il Catalogo e l’archivio globale Eventi restano disponibili.</p>
          <p>Le copie di backup pre-aggiornamento già create possono ancora contenere questo progetto: vanno gestite separatamente.</p>
          <label htmlFor="project-delete-name">Scrivi esattamente <strong>{deleteTarget.name}</strong> per confermare</label>
          <input id="project-delete-name" autoFocus value={deleteName} onChange={(event) => setDeleteName(event.target.value)} autoComplete="off" />
          {error && <p className="error-banner" role="alert">{error}</p>}
          <div className="dialog-actions">
            <button type="button" className="secondary-button" disabled={projectActionBusy} onClick={() => { setDeleteTarget(null); setDeleteName(''); document.getElementById('project-switcher-trigger')?.focus() }}>Annulla</button>
            <button type="button" className="danger-button" disabled={projectActionBusy || deleteName !== deleteTarget.name} onClick={() => void deleteArchivedProject()}>{projectActionBusy ? 'Eliminazione…' : 'Elimina definitivamente'}</button>
          </div>
        </div>
      </div>}
    </div>
  )
}
