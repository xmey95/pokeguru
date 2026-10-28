import { useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import type { Project } from '../../shared/projects'
import { Icon } from './Icon'

function ProjectActions({ project, archived, onArchive, onRestore, onDelete }: {
  project: Project; archived: boolean; onArchive(): void; onRestore(): void; onDelete(): void
}) {
  const id = useId()
  const trigger = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  useLayoutEffect(() => {
    if (!open) return
    const position = () => {
      const anchor = trigger.current?.getBoundingClientRect()
      const element = menu.current
      if (!anchor || !element) return
      const bounds = element.getBoundingClientRect()
      element.style.left = `${Math.max(12, Math.min(anchor.right - bounds.width, window.innerWidth - bounds.width - 12))}px`
      element.style.top = `${Math.max(12, Math.min(anchor.bottom + 4, window.innerHeight - bounds.height - 12))}px`
    }
    position()
    menu.current?.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true })
    const dismiss = () => menu.current?.hidePopover()
    window.addEventListener('resize', dismiss)
    const results = trigger.current?.closest('.project-picker-results')
    results?.addEventListener('scroll', dismiss)
    return () => { window.removeEventListener('resize', dismiss); results?.removeEventListener('scroll', dismiss) }
  }, [open])
  const run = (action: () => void) => { menu.current?.hidePopover(); action() }
  return <>
    <button ref={trigger} type="button" className="project-actions-trigger" data-picker-action
      popoverTarget={id} aria-haspopup="menu" aria-controls={id} aria-expanded={open}
      aria-label={`Azioni del progetto: ${project.name}`} title={`Azioni del progetto: ${project.name}`}>
      <span aria-hidden="true">⋯</span>
    </button>
    <div ref={menu} id={id} popover="auto" role="menu" aria-label={`Azioni del progetto: ${project.name}`}
      className="project-actions-menu" onToggle={(event) => setOpen(event.newState === 'open')}
      onBlur={(event) => {
        if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget) && event.relatedTarget !== trigger.current)
          menu.current?.hidePopover()
      }} onKeyDown={(event) => {
        event.stopPropagation()
        if (event.key === 'Escape') {
          event.preventDefault(); menu.current?.hidePopover(); trigger.current?.focus({ preventScroll: true })
        }
        if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
        event.preventDefault()
        const buttons = Array.from(menu.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1
          : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length
        buttons[next]?.focus()
      }}>
      {archived ? <>
        <button type="button" role="menuitem" onClick={() => run(onRestore)}>Ripristina</button>
        <button type="button" role="menuitem" className="project-delete-action" onClick={() => run(onDelete)}>Elimina definitivamente</button>
      </> : <button type="button" role="menuitem" onClick={() => run(onArchive)}>Archivia</button>}
    </div>
  </>
}

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
  const panel = useRef<HTMLDialogElement>(null)
  const search = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const visible = showArchived ? archivedProjects : projects
  const filtered = visible.filter((project) => project.name.toLocaleLowerCase('it').includes(query.trim().toLocaleLowerCase('it')))

  useLayoutEffect(() => {
    if (!open) return
    panel.current?.showModal()
    search.current?.focus()
  }, [open])

  function close() {
    panel.current?.querySelectorAll<HTMLElement>(':popover-open').forEach((element) => element.hidePopover())
    panel.current?.close()
  }

  function navigate(event: KeyboardEvent<HTMLDialogElement>) {
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
      onClick={() => setOpen(true)} aria-haspopup="dialog" aria-expanded={open} aria-controls={id}
      aria-label={selected ? `Cambia progetto: ${selected.name}` : 'Scegli progetto'}
      title={selected?.name ?? 'Scegli progetto'} disabled={loading}>
      <span className="project-switcher-icon"><Icon name="deck" /></span>
      <span className="project-switcher-label"><small>Progetto</small><strong>{loading ? 'Caricamento…' : selected?.name ?? 'Scegli progetto'}</strong></span>
      <span className="project-switcher-chevron"><Icon name="chevron" /></span>
    </button>
    <dialog ref={panel} id={id} aria-modal="true" aria-label="Scegli progetto"
      className="project-picker" onKeyDown={navigate}
      onClose={() => { setOpen(false); setQuery('') }}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return
        const rect = event.currentTarget.getBoundingClientRect()
        if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) close()
      }}>
      <div className="project-picker-head"><div><span className="eyebrow">Il tuo spazio di gioco</span>
        <h2>{showArchived ? 'Progetti archiviati' : 'I tuoi progetti'}</h2></div>
        <div className="project-picker-head-actions">
          {!showArchived && <button type="button" className="project-picker-create" aria-label="Nuovo progetto"
            onClick={() => { close(); onCreate() }}><Icon name="plus" />Nuovo</button>}
          <button type="button" className="text-button" onClick={close} aria-label="Chiudi selettore progetti"><span aria-hidden="true">×</span></button>
        </div></div>
      <div className="project-picker-tabs" role="group" aria-label="Stato dei progetti">
        <button type="button" aria-pressed={!showArchived} onClick={() => { setShowArchived(false); setQuery('') }}>Attivi ({projects.length})</button>
        <button type="button" aria-pressed={showArchived} onClick={() => { setShowArchived(true); setQuery('') }}>Archiviati ({archivedProjects.length})</button>
      </div>
      <input ref={search} type="search" aria-label="Cerca progetti" placeholder="Cerca un progetto…" value={query} onChange={(event) => setQuery(event.target.value)} />
      <div className="project-picker-results">
        {filtered.length ? <ul>{filtered.map((project) => (
          <li key={project.id} className="project-picker-row" data-current={!showArchived && selected?.id === project.id}>{showArchived ?
            <div className="project-option" title={project.name}><span><strong>{project.name}</strong><small>Archiviato</small></span></div> :
            <button type="button" className="project-option" data-picker-action
              title={project.name}
              data-testid={`project-${project.id}`} aria-current={selected?.id === project.id ? 'true' : undefined}
              onClick={() => { close(); onSelect(project.id) }}>
              <span><strong>{project.name}</strong><small>Standard · {project.cardTotal === null ? 'Senza lista' : `${project.cardTotal} carte`}</small></span>
              {selected?.id === project.id && <span className="project-current">In uso</span>}
            </button>}
          <ProjectActions project={project} archived={showArchived}
            onArchive={() => { close(); onArchive(project.id) }}
            onRestore={() => { close(); onRestore(project.id) }}
            onDelete={() => { close(); onDelete(project) }} /></li>
        ))}</ul> : <p role="status">{visible.length ? 'Nessun progetto trovato.' : showArchived ? 'Nessun progetto archiviato.' : 'Nessun progetto.'}</p>}
      </div>
    </dialog>
  </>
}
