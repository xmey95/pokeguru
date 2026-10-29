import { useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import type { DeckThreadSummary, DeckVersion } from '../../shared/deck-threads'
import { Icon } from './Icon'

function threadStatus(thread: DeckThreadSummary, versions: DeckVersion[]): string {
  if (thread.stale) return 'Lista precedente'
  if (thread.baseVersionNumber === null) return 'Senza lista iniziale'
  if (!thread.latestCandidateId) return 'Nessuna proposta'
  return versions.some((version) => version.adoption?.candidateId === thread.latestCandidateId) ? 'Proposta adottata' : 'Proposta nuova'
}

export function ThreadSwitcher({ threads, selected, versions, disabled, onSelect }: {
  threads: DeckThreadSummary[]
  selected: DeckThreadSummary | null
  versions: DeckVersion[]
  disabled: boolean
  onSelect: (thread: DeckThreadSummary) => void
}) {
  const id = useId()
  const trigger = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const search = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const filtered = threads.filter((thread) => thread.title.toLocaleLowerCase('it').includes(query.trim().toLocaleLowerCase('it')))

  useLayoutEffect(() => {
    if (!open) return
    const position = () => {
      const anchor = trigger.current?.getBoundingClientRect()
      const main = trigger.current?.closest('.main-content')?.getBoundingClientRect()
      if (!anchor || !main || !panel.current) return
      const width = Math.min(460, main.width - 32)
      const height = Math.min(420, main.height - 32)
      Object.assign(panel.current.style, {
        width: width + 'px', maxHeight: height + 'px',
        left: Math.max(main.left + 16, Math.min(anchor.left, main.right - width - 16)) + 'px',
        top: Math.max(main.top + 16, Math.min(anchor.bottom + 8, main.bottom - height - 16)) + 'px'
      })
    }
    position()
    search.current?.focus({ preventScroll: true })
    window.addEventListener('resize', position)
    window.addEventListener('scroll', position, true)
    return () => {
      window.removeEventListener('resize', position)
      window.removeEventListener('scroll', position, true)
    }
  }, [open])

  function navigate(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    const options = Array.from(panel.current?.querySelectorAll<HTMLButtonElement>('.thread-option') ?? [])
    const index = options.indexOf(document.activeElement as HTMLButtonElement)
    const next = event.key === 'ArrowDown' ? index + 1 : index < 0 ? options.length - 1 : index - 1
    event.preventDefault()
    if (next < 0 || next >= options.length) search.current?.focus({ preventScroll: true })
    else options[next].focus()
  }

  const description = (thread: DeckThreadSummary) => `${thread.baseVersionNumber === null ? '' : `Base v${thread.baseVersionNumber} · `}${threadStatus(thread, versions)}`

  return <>
    <button ref={trigger} id="thread-switcher-trigger" type="button" className="workspace-switcher thread-switcher"
      popoverTarget={id} aria-haspopup="dialog" aria-expanded={open} aria-controls={id}
      aria-label={selected ? `Cambia strategia: ${selected.title}` : 'Scegli strategia'}
      disabled={disabled || threads.length === 0}>
      <span><strong>{selected?.title ?? 'Nessuna strategia'}</strong>
        {selected && <small>{description(selected)}</small>}</span>
      <Icon name="chevron" />
    </button>
    <div ref={panel} id={id} popover="auto" role="dialog" aria-label="Scegli strategia"
      className="project-picker workspace-picker thread-picker" onKeyDown={navigate}
      onToggle={(event) => { const next = event.newState === 'open'; setOpen(next); if (!next) setQuery('') }}
      onBlur={(event) => {
        if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget) && event.relatedTarget !== trigger.current) panel.current?.hidePopover()
      }}>
      <div className="project-picker-head"><h2>Strategie</h2><span>{threads.length}</span></div>
      <input ref={search} type="search" aria-label="Cerca strategie" placeholder="Cerca una strategia…" value={query} onChange={(event) => setQuery(event.target.value)} />
      <div className="project-picker-results">
        {filtered.length ? <ul>{filtered.map((thread) => <li key={thread.id}>
          <button type="button" className="project-option thread-option" aria-current={selected?.id === thread.id ? 'true' : undefined}
            onClick={() => {
              panel.current?.hidePopover()
              trigger.current?.focus({ preventScroll: true })
              onSelect(thread)
            }}>
            <span><strong>{thread.title}</strong><small>{description(thread)}</small></span>
            {selected?.id === thread.id && <span className="project-current">Attivo</span>}
          </button>
        </li>)}</ul> : <p role="status">Nessuna strategia trovata.</p>}
      </div>
    </div>
  </>
}
