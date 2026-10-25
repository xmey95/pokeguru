import { useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import type { Project } from '../../shared/projects'
import { Icon } from './Icon'

export function ProjectSwitcher({ projects, archivedProjects, selected, loading, onSelect, onCreate, onArchive, onRestore, onDelete }: {
  projects: Project[]
  archivedProjects: Project[]
  selected: Project | null
  loading: boolean
  onSelect: (id: string) => void
  onCreate: () => void
  onArchive: (id: string) => void
  onRestore: (id: string) => void
  onDelete: (project: Project) => void
}) {
  const id = useId()
  const trigger = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const search = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const visible = showArchived ? archivedProjects : projects
  const filtered = visible.filter((project) => project.name.toLocaleLowerCase('it').includes(query.trim().toLocaleLowerCase('it')))

  useLayoutEffect(() => {
    if (!open) return
    const position = () => {
      const anchor = trigger.current?.getBoundingClientRect()
      if (!anchor || !panel.current) return
      const width = Math.min(360, window.innerWidth - 32)
      const height = Math.min(420, window.innerHeight - 32)
      Object.assign(panel.current.style, {
        width: width + 'px', maxHeight: height + 'px',
        left: Math.max(16, Math.min(anchor.left, window.innerWidth - width - 16)) + 'px',
        top: Math.max(16, Math.min(anchor.bottom + 8, window.innerHeight - height - 16)) + 'px'
      })
    }
    position()
    search.current?.focus()
    window.addEventListener('resize', position)
    window.addEventListener('scroll', position, true)
    return () => {
      window.removeEventListener('resize', position)
      window.removeEventListener('scroll', position, true)
    }
  }, [open])

  function close() {
    panel.current?.hidePopover()
    trigger.current?.focus()
  }

  function navigate(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    const buttons = Array.from(panel.current?.querySelectorAll<HTMLButtonElement>('[data-picker-action]') ?? [])
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
    const next = event.key === 'ArrowDown' ? index + 1 : index < 0 ? buttons.length - 1 : index - 1
    event.preventDefault()
    if (next < 0 || next >= buttons.length) search.current?.focus()
    else buttons[next].focus()
  }

  return <>
    <button ref={trigger} id="project-switcher-trigger" type="button" className="project-switcher"
      popoverTarget={id} aria-haspopup="dialog" aria-expanded={open} aria-controls={id}
      aria-label={selected ? `Cambia progetto: ${selected.name}` : 'Scegli progetto'}
      title={selected?.name ?? 'Scegli progetto'} disabled={loading}>
      <span className="project-switcher-icon"><Icon name="deck" /></span>
      <span className="project-switcher-label"><small>Progetto</small><strong>{loading ? 'Caricamento…' : selected?.name ?? 'Scegli progetto'}</strong></span>
      <span className="project-switcher-chevron"><Icon name="chevron" /></span>
    </button>
    <div ref={panel} id={id} popover="auto" role="dialog" aria-label="Scegli progetto"
      className="project-picker" onKeyDown={navigate}
      onToggle={(event) => { const next = event.newState === 'open'; setOpen(next); if (!next) setQuery('') }}
      onBlur={(event) => {
        if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget) && event.relatedTarget !== trigger.current) panel.current?.hidePopover()
      }}>
      <div className="project-picker-head"><h2>{showArchived ? 'Progetti archiviati' : 'Progetti'}</h2><span>{visible.length}</span></div>
      <div className="project-picker-tabs" role="group" aria-label="Stato dei progetti">
        <button type="button" aria-pressed={!showArchived} onClick={() => { setShowArchived(false); setQuery('') }}>Attivi ({projects.length})</button>
        <button type="button" aria-pressed={showArchived} onClick={() => { setShowArchived(true); setQuery('') }}>Archiviati ({archivedProjects.length})</button>
      </div>
      <input ref={search} type="search" aria-label="Cerca progetti" placeholder="Cerca un progetto…" value={query} onChange={(event) => setQuery(event.target.value)} />
      <div className="project-picker-results">
        {filtered.length ? <ul>{filtered.map((project) => (
          <li key={project.id} className="project-picker-row">{showArchived ?
            <div className="project-option"><span><strong>{project.name}</strong><small>Archiviato</small></span></div> :
            <button type="button" className="project-option" data-picker-action
              data-testid={`project-${project.id}`} aria-current={selected?.id === project.id ? 'true' : undefined}
              onClick={() => { close(); onSelect(project.id) }}>
              <span><strong>{project.name}</strong><small>{project.cardTotal === null ? 'Senza lista' : `${project.cardTotal} carte`}</small></span>
              {selected?.id === project.id && <span className="project-current">Attivo</span>}
            </button>}
          <div className="project-row-actions">
            {showArchived ? <>
              <button type="button" data-picker-action onClick={() => { close(); onRestore(project.id) }}>Ripristina</button>
              <button type="button" data-picker-action className="project-delete-action" onClick={() => { close(); onDelete(project) }}>Elimina definitivamente</button>
            </> : <button type="button" data-picker-action onClick={() => { close(); onArchive(project.id) }}>Archivia</button>}
          </div></li>
        ))}</ul> : <p role="status">{visible.length ? 'Nessun progetto trovato.' : showArchived ? 'Nessun progetto archiviato.' : 'Nessun progetto.'}</p>}
      </div>
      {!showArchived && <button type="button" className="project-picker-create" data-picker-action onClick={() => { close(); onCreate() }}><Icon name="plus" />Nuovo progetto</button>}
    </div>
  </>
}
