import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import type { DeckBaseline, DeckImportSource } from '../../shared/deck-import'
import type { Project } from '../../shared/projects'
import { MatchupSection } from './MatchupSection'
import { AiSettings } from './AiSettings'
import { CatalogSection } from './CatalogSection'
import { DeckList } from './DeckList'
import { DeckCompanion } from './DeckCompanion'
import { ConstraintsSection } from './ConstraintsSection'
import { DeckConstraintsProvider } from './DeckConstraintsContext'
import { ThreadsSection } from './ThreadsSection'
import { TournamentSection } from './TournamentSection'
import { Icon } from './Icon'
import { ProjectSwitcher } from './ProjectSwitcher'

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('it-IT', { dateStyle: 'medium' }).format(new Date(value))
}

function statusLabel(status: Project['status']): string {
  if (status === 'BOZZA') return 'Bozza'
  if (status === 'PRONTA_PER_CONTROLLO') return 'Pronta per controllo'
  return 'Da costruire'
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
  const [projects, setProjects] = useState<Project[]>([])
  const [selected, setSelected] = useState<Project | null>(null)
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [baseline, setBaseline] = useState<DeckBaseline | null>(null)
  const [baselineLoading, setBaselineLoading] = useState(false)
  const [draft, setDraft] = useState('')
  const [source, setSource] = useState<DeckImportSource>('paste')
  const [fileName, setFileName] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'deck' | 'threads' | 'matchups'>('deck')
  const [view, setView] = useState<'project' | 'ai' | 'catalog' | 'tournament'>('project')
  const [catalogFocusIdentityId, setCatalogFocusIdentityId] = useState<string | null>(null)
  const [constraintTargetId, setConstraintTargetId] = useState<string | null>(null)
  const [constraintSelectionVersion, setConstraintSelectionVersion] = useState(0)
  const [showCompactCreate, setShowCompactCreate] = useState(false)
  const selectionVersion = useRef(0)

  useEffect(() => { document.getElementById('main-content')?.scrollTo(0, 0) }, [view, activeTab, selected?.id])
  useEffect(() => { if (showCompactCreate) document.getElementById('compact-project-name')?.focus() }, [showCompactCreate])

  async function selectProject(id: string, known?: Project): Promise<void> {
    const version = ++selectionVersion.current
    setConstraintTargetId(null)
    setError(null)
    setBaselineLoading(true)
    setBaseline(null)
    setDraft('')
    setSource('paste')
    setFileName(null)
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
      const result = await window.projectsApi.getBaseline(id)
      if (version !== selectionVersion.current) return
      if (!result.ok) throw new Error(result.error)
      setBaseline(result.value)
      setDraft(result.value?.rawText ?? '')
      setSource(result.value?.source ?? 'paste')
      setFileName(result.value?.fileName ?? null)
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
        const result = await window.projectsApi.list()
        if (!active) return
        if (!result.ok) {
          setError(result.error)
          return
        }
        setProjects(result.value)
        if (result.value[0]) void selectProject(result.value[0].id, result.value[0])
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : 'Impossibile leggere i progetti.')
      } finally {
        if (active) setLoading(false)
      }
    }
    void load()
    return () => { active = false }
  }, [])

  async function openProject(id: string): Promise<void> {
    setShowCompactCreate(false)
    setView('project')
    await selectProject(id)
  }

  function selectConstraintTarget(identityId: string): void {
    setConstraintTargetId(identityId)
    setConstraintSelectionVersion((version) => version + 1)
    setActiveTab('deck')
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
      setSelected(result.value)
      setBaseline(null)
      setBaselineLoading(false)
      setDraft('')
      setSource('paste')
      setFileName(null)
      setName('')
      setActiveTab('deck')
      setView('project')
      setShowCompactCreate(false)
    } catch {
      setError('Salvataggio non riuscito. Nessun progetto è stato creato.')
    } finally {
      setSaving(false)
    }
  }

  async function loadTextFile(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0]
    const version = selectionVersion.current
    event.target.value = ''
    if (!file) return
    if (!/\.txt$/i.test(file.name)) {
      setError('Seleziona un file .txt.')
      return
    }
    if (file.size > 400_000) {
      setError('Il file è troppo grande per una lista di mazzo.')
      return
    }
    try {
      const text = await file.text()
      if (version !== selectionVersion.current) return
      setDraft(text)
      setSource('file')
      setFileName(file.name)
      setError(null)
    } catch {
      if (version === selectionVersion.current) setError('Impossibile leggere il file selezionato.')
    }
  }

  async function importDeck(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    if (!selected || importing) return
    const projectId = selected.id
    const importVersion = selectionVersion.current
    setImporting(true)
    setError(null)
    try {
      const result = await window.projectsApi.importDeck({ projectId, rawText: draft, source, fileName })
      if (!result.ok) {
        if (selectionVersion.current === importVersion) setError(result.error)
        return
      }
      const updated = projectWithBaseline(selected, result.value)
      setProjects((current) => current.map((project) => project.id === projectId ? updated : project))
      if (selectionVersion.current !== importVersion) return
      setBaseline(result.value)
      setSelected(updated)
    } catch {
      if (selectionVersion.current === importVersion) setError('Importazione non riuscita. La lista precedente è rimasta salvata.')
    } finally {
      setImporting(false)
    }
  }

  function focusImport() {
    const input = document.getElementById('deck-text')
    input?.focus({ preventScroll: true })
    input?.scrollIntoView({ block: 'center', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
  }

  const importProblems = baseline?.diagnostics.filter((item) => item.code === 'UNPARSED' || item.code === 'TOTAL_MISMATCH') ?? []
  const showDeckCompanion = Boolean(selected && view === 'project' && activeTab !== 'deck')

  return (
    <div className={`app-shell ${showDeckCompanion ? 'with-deck' : ''} ${view === 'project' ? `workspace-${activeTab}` : ''}`}>
      <a className="skip-link" href="#main-content">Vai al contenuto</a>
      <header className="topbar">
        <span>Pokéguru <b aria-hidden="true">/</b> {view === 'project' ? activeTab === 'deck' ? 'Lista' : activeTab === 'threads' ? 'Thread' : 'Matchup' : view === 'catalog' ? 'Catalogo' : view === 'tournament' ? 'Eventi' : 'Impostazioni AI'}</span>
        <span>Standard occidentale</span>
      </header>

      <div className="workspace">
        <aside className="sidebar" aria-label="Progetti di mazzo">
          <div className="brand">
            <span className="brand-mark"><Icon name="brand" /></span>
            <div><strong>Pokéguru</strong><span>Analisi competitiva</span></div>
          </div>
          <ProjectSwitcher projects={projects} selected={selected} loading={loading}
            onSelect={(id) => void openProject(id)}
            onCreate={() => { setView('project'); setShowCompactCreate(true) }} />
          <nav className="workspace-nav" aria-label="Aree del progetto">
            <span className="rail-caption">Area di lavoro</span>
            <button type="button" className={view === 'project' && activeTab === 'deck' ? 'active' : ''} aria-current={view === 'project' && activeTab === 'deck' ? 'page' : undefined} onClick={() => { setView('project'); setActiveTab('deck') }} title="Lista" aria-label="Lista"><Icon name="deck" /><span className="nav-label">Lista</span></button>
            <button type="button" className={view === 'project' && activeTab === 'threads' ? 'active' : ''} aria-current={view === 'project' && activeTab === 'threads' ? 'page' : undefined} onClick={() => { setView('project'); setActiveTab('threads') }} title="Thread" aria-label="Thread"><Icon name="thread" /><span className="nav-label">Thread</span></button>
            <button type="button" className={view === 'project' && activeTab === 'matchups' ? 'active' : ''} aria-current={view === 'project' && activeTab === 'matchups' ? 'page' : undefined} onClick={() => { setView('project'); setActiveTab('matchups') }} title="Matchup" aria-label="Matchup"><Icon name="matchup" /><span className="nav-label">Matchup</span></button>
          </nav>
          <nav className="resource-nav" aria-label="Risorse globali">
            <span className="rail-caption">Risorse</span>
            <button type="button" className={view === 'catalog' ? 'active' : ''} onClick={() => { setCatalogFocusIdentityId(null); setView('catalog') }} title="Catalogo" aria-label="Catalogo" aria-current={view === 'catalog' ? 'page' : undefined}><Icon name="catalog" /><span className="nav-label">Catalogo</span></button>
            <button type="button" className={view === 'tournament' ? 'active' : ''} onClick={() => setView('tournament')} title="Eventi" aria-label="Eventi" aria-current={view === 'tournament' ? 'page' : undefined}><Icon name="event" /><span className="nav-label">Eventi</span></button>
            <button type="button" className={view === 'ai' ? 'active' : ''} onClick={() => setView('ai')} title="Impostazioni AI" aria-label="Impostazioni AI" aria-current={view === 'ai' ? 'page' : undefined}><Icon name="settings" /><span className="nav-label">Impostazioni AI</span></button>
          </nav>
          <div className="local-indicator"><span aria-hidden="true" /> Archivio locale</div>
        </aside>

        <main id="main-content" className="main-content" tabIndex={-1}>
          {showCompactCreate && <form className="compact-create-panel" onSubmit={(event) => void createProject(event)}>
            <div className="panel-heading"><h2>Nuovo progetto</h2><button type="button" className="text-button" onClick={() => { setShowCompactCreate(false); document.getElementById('project-switcher-trigger')?.focus() }}>Chiudi</button></div>
            <label htmlFor="compact-project-name">Nome progetto</label>
            <input id="compact-project-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={120} required placeholder="Es. Mega Absol / Mega Audino" />
            <p>Standard · circuito occidentale / internazionale</p>
            <button type="submit" className="primary-button" disabled={saving || loading || !name.trim()}>{saving ? 'Salvataggio…' : 'Crea progetto'}</button>
          </form>}
          {error && <div className="error-banner" role="alert">{error}</div>}
          {view === 'ai' ? <AiSettings /> : view === 'catalog' ? <CatalogSection focusIdentityId={catalogFocusIdentityId} onConstrain={selected ? (identityId) => { setView('project'); selectConstraintTarget(identityId) } : undefined} /> : view === 'tournament' ? <TournamentSection /> : selected ? (
            <section className="project-detail" aria-label="Dettaglio progetto">
              <div className="detail-headline">
                <div>
                  <h1 data-testid="selected-project-name">{selected.name}</h1>
                </div>
                {activeTab !== 'deck' && <span className={`status-pill status-${selected.status.toLowerCase()}`}>{statusLabel(selected.status)}</span>}
              </div>
              <details className="project-meta-details"><summary>Profilo e date del progetto</summary><div className="detail-meta">
                <div><span>Formato</span><strong>Standard</strong></div>
                <div><span>Circuito</span><strong>Occidentale / internazionale</strong></div>
                <div><span>Creato il</span><strong>{formatDate(selected.createdAt)}</strong></div>
                <div><span>Lista corrente</span><strong>{selected.cardTotal === null ? 'Assente' : `${selected.cardTotal} carte interpretate`}</strong></div>
              </div></details>
              {selected.circuitAssignment === 'MIGRATED' && <p className="migration-note">Profilo occidentale assegnato a questo progetto esistente. La lista è rimasta invariata.</p>}
              {activeTab === 'deck' ? <DeckConstraintsProvider key={`${selected.id}:${baseline?.importedAt ?? 'empty'}`} projectId={selected.id} baseline={baseline}>
              {baselineLoading ? <p className="content-note">Caricamento lista…</p> : baseline ? (
                <div className="baseline-panel" data-testid="baseline-panel">
                  <DeckList key={`${selected.id}:${baseline.importedAt}`} projectId={selected.id} baseline={baseline} onOpenCatalog={() => setView('catalog')} onImport={focusImport} />
                  <details className="project-meta-details"><summary>Origine della lista</summary><p className="content-note">{baseline.source === 'file' ? `File: ${baseline.fileName}` : 'Testo incollato'} · {formatDate(baseline.importedAt)}</p></details>
                  {importProblems.length === 0 && baseline.diagnostics.length > 0 && <details className="project-meta-details"><summary>Note sul testo importato</summary><ul>{baseline.diagnostics.map((item, index) => <li key={index}>{item.message}</li>)}</ul></details>}
                  <details className="original-text"><summary>Mostra testo originale e tutte le righe</summary><pre>{baseline.rawText}</pre></details>
                </div>
              ) : !error && (
                <div className="empty-deck">
                  <div className="empty-icon"><Icon name="deck" /></div>
                  <h2>Nessuna lista di carte</h2>
                  <p>Incolla una lista o scegli un file .txt.</p>
                  <button type="button" className="primary-button" onClick={() => focusImport()}>Aggiungi una lista</button>
                </div>
              )}
              {!baselineLoading && <ConstraintsSection key={selected.id}
                selectedIdentityId={constraintTargetId} selectionVersion={constraintSelectionVersion}
                onTargetConsumed={() => setConstraintTargetId(null)}
                onOpenCatalog={() => setView('catalog')} />}
              <form className="import-panel" onSubmit={(event) => void importDeck(event)}>
                <div className="panel-heading">
                  <div><span className="eyebrow">Importazione</span><h2>{baseline ? 'Aggiorna la lista' : 'Aggiungi una lista'}</h2></div>
                </div>
                {baseline && <p className="content-note">Il salvataggio sostituisce la lista corrente.</p>}
                <label htmlFor="deck-text">Testo lista</label>
                <textarea id="deck-text" value={draft} onChange={(event) => { setDraft(event.target.value); setSource('paste'); setFileName(null) }} placeholder={'Pokémon: 2\n2 Mega Absol ex MEG 86\nTotal Cards: 2'} spellCheck={false} />
                <div className="import-actions">
                  <label className="file-picker" htmlFor="deck-file">Scegli file .txt</label>
                  <input id="deck-file" type="file" accept=".txt,text/plain" onChange={(event) => void loadTextFile(event)} />
                  {fileName && <span className="selected-file">{fileName}</span>}
                  <button className="primary-button" type="submit" disabled={importing || !draft.trim()}>{importing ? 'Salvataggio…' : baseline ? 'Sostituisci lista' : 'Salva lista'}</button>
                </div>
              </form>
              </DeckConstraintsProvider> : activeTab === 'threads' ? <ThreadsSection key={selected.id} projectId={selected.id} mainImportedAt={baseline?.importedAt ?? null}
                onAdopt={(adopted) => {
                  const updated = projectWithBaseline(selected, adopted)
                  setBaseline(adopted)
                  setDraft(adopted.rawText)
                  setSource(adopted.source)
                  setFileName(adopted.fileName)
                  setSelected(updated)
                  setProjects((current) => current.map((project) => project.id === selected.id ? updated : project))
                }} /> : <MatchupSection key={selected.id} projectId={selected.id} baseline={baseline} onOpenAiSettings={() => setView('ai')}
                  onOpenCatalogCard={(identityId) => { setCatalogFocusIdentityId(identityId); setView('catalog') }} />}
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
        {selected && showDeckCompanion && <DeckCompanion key={selected.id} baseline={baseline} loading={baselineLoading} />}
      </div>
    </div>
  )
}
