import { useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import type { DeckThread, DeckVersion } from '../../shared/deck-threads'
import { Icon } from './Icon'

function threadStatus(thread: DeckThread, versions: DeckVersion[]): string {
  if (thread.stale) return 'Base superata'
  if (thread.baseVersionNumber === null) return 'Senza lista iniziale'
  const latest = thread.candidates.at(-1)
  if (!latest) return 'Nessuna proposta'
  return versions.some((version) => version.adoption?.candidateId === latest.id) ? 'Proposta adottata' : 'Proposta nuova'
}

export function ThreadSwitcher({ threads, selected, versions, disabled, onSelect }: {
  threads: DeckThread[]
  selected: DeckThread | null
  versions: DeckVersion[]
  disabled: boolean
  onSelect: (thread: DeckThread) => void
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

  const description = (thread: DeckThread) => `${thread.baseVersionNumber === null ? '' : `Base v${thread.baseVersionNumber} · `}${threadStatus(thread, versions)}`

  return <>
    <button ref={trigger} id="thread-switcher-trigger" type="button" className="workspace-switcher thread-switcher"
      popoverTarget={id} aria-haspopup="dialog" aria-expanded={open} aria-controls={id}
      aria-label={selected ? `Cambia thread: ${selected.title}` : 'Scegli thread'}
      disabled={disabled || threads.length === 0}>
      <span><strong>{selected?.title ?? 'Nessun thread'}</strong>
        {selected && <small>{description(selected)}</small>}</span>
      <Icon name="chevron" />
    </button>
    <div ref={panel} id={id} popover="auto" role="dialog" aria-label="Scegli thread"
      className="project-picker workspace-picker thread-picker" onKeyDown={navigate}
      onToggle={(event) => { const next = event.newState === 'open'; setOpen(next); if (!next) setQuery('') }}
      onBlur={(event) => {
        if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget) && event.relatedTarget !== trigger.current) panel.current?.hidePopover()
      }}>
      <div className="project-picker-head"><h2>Thread</h2><span>{threads.length}</span></div>
      <input ref={search} type="search" aria-label="Cerca thread" placeholder="Cerca un thread…" value={query} onChange={(event) => setQuery(event.target.value)} />
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
        </li>)}</ul> : <p role="status">Nessun thread trovato.</p>}
      </div>
    </div>
  </>
}
