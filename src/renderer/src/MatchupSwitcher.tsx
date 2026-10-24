import { useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import type { MetaDeck } from '../../shared/meta-matchups'
import { Icon } from './Icon'

export type MatchupOption = MetaDeck & { inCurrentMeta: boolean; guideStatus: string }

function description(opponent: MatchupOption): string {
  const context = opponent.inCurrentMeta
    ? `${opponent.share.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}% quota meta`
    : 'Solo nello storico'
  return `${context} · ${opponent.guideStatus}`
}

export function MatchupSwitcher({ opponents, selectedId, disabled, onSelect }: {
  opponents: MatchupOption[]
  selectedId: string | null
  disabled: boolean
  onSelect: (id: string) => void
}) {
  const id = useId()
  const trigger = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const search = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const selected = opponents.find((opponent) => opponent.id === selectedId)
  const filtered = opponents.filter((opponent) => opponent.name.toLocaleLowerCase('it').includes(query.trim().toLocaleLowerCase('it')))

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
    const results = panel.current?.querySelector<HTMLElement>('.project-picker-results')
    const current = results?.querySelector<HTMLElement>('[aria-current=true]')
    if (results) {
      results.scrollTop = 0
      if (current) results.scrollTop = current.getBoundingClientRect().top - results.getBoundingClientRect().top - 4
    }
    search.current?.focus({ preventScroll: true })
    window.addEventListener('resize', position)
    window.addEventListener('scroll', position, true)
    return () => {
      window.removeEventListener('resize', position)
      window.removeEventListener('scroll', position, true)
    }
  }, [open])

  function navigate(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      panel.current?.hidePopover()
      trigger.current?.focus({ preventScroll: true })
      return
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    const options = Array.from(panel.current?.querySelectorAll<HTMLButtonElement>('.matchup-option') ?? [])
    const index = options.indexOf(document.activeElement as HTMLButtonElement)
    const next = event.key === 'ArrowDown' ? index + 1 : index < 0 ? options.length - 1 : index - 1
    event.preventDefault()
    if (next < 0 || next >= options.length) search.current?.focus({ preventScroll: true })
    else options[next].focus()
  }

  return <>
    <button ref={trigger} id="matchup-switcher-trigger" type="button" className="workspace-switcher matchup-switcher"
      popoverTarget={id} aria-haspopup="dialog" aria-expanded={open} aria-controls={id}
      aria-label={selected ? `Cambia avversario: ${selected.name}` : 'Scegli avversario'}
      disabled={disabled || opponents.length === 0}>
      <span><strong>{selected?.name ?? (opponents.length ? 'Scegli avversario' : 'Nessun avversario disponibile')}</strong>
        {selected && <small>{description(selected)}</small>}</span>
      <Icon name="chevron" />
    </button>
    <div ref={panel} id={id} popover="auto" role="dialog" aria-label="Scegli avversario"
      className="project-picker workspace-picker matchup-picker" onKeyDown={navigate}
      onToggle={(event) => { const next = event.newState === 'open'; setOpen(next); if (!next) setQuery('') }}
      onBlur={(event) => {
        if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget) && event.relatedTarget !== trigger.current) panel.current?.hidePopover()
      }}>
      <div className="project-picker-head"><h2>Avversario</h2><span>{opponents.length}</span></div>
      <input ref={search} type="search" aria-label="Cerca avversario" placeholder="Cerca un avversario…" value={query} onChange={(event) => setQuery(event.target.value)} />
      <div className="project-picker-results">
        {filtered.length ? <ul>{filtered.map((opponent) => <li key={opponent.id}>
          <button type="button" className="project-option matchup-option" aria-current={selectedId === opponent.id ? 'true' : undefined}
            onClick={() => {
              panel.current?.hidePopover()
              trigger.current?.focus({ preventScroll: true })
              onSelect(opponent.id)
            }}>
            <span><strong>{opponent.name}</strong><small>{description(opponent)}</small></span>
            {selectedId === opponent.id && <span className="project-current">Attivo</span>}
          </button>
        </li>)}</ul> : <p role="status">Nessun avversario trovato.</p>}
      </div>
    </div>
  </>
}
