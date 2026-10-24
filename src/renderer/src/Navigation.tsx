import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type Dispatch, type ReactNode, type SetStateAction } from 'react'
import { NavigationHistory, type LocationState, type Route } from './navigation-history'

interface ElementReference { selector: string; text: string; index: number }
interface Presentation { details: { ref: ElementReference; open: boolean }[]; scrolls: { ref: ElementReference; top: number; left: number }[]; focus?: ElementReference }
const regions = '#main-content, .deck-companion'
function reference(element: Element): ElementReference {
  const attribute = ['id', 'href', 'aria-label', 'name'].find((name) => element.hasAttribute(name))
  const selector = attribute ? `${element.tagName.toLowerCase()}[${attribute}="${CSS.escape(element.getAttribute(attribute)!)}"]` : element.tagName.toLowerCase()
  const text = attribute ? '' : (element instanceof HTMLDetailsElement ? element.querySelector('summary')?.textContent : element.textContent)?.trim().slice(0, 180) ?? ''
  const matches = [...document.querySelectorAll(selector)].filter((item) => !text || (item instanceof HTMLDetailsElement ? item.querySelector('summary')?.textContent : item.textContent)?.trim().slice(0, 180) === text)
  return { selector, text, index: matches.indexOf(element) }
}
function resolve(ref: ElementReference): HTMLElement | undefined {
  return ([...document.querySelectorAll<HTMLElement>(ref.selector)].filter((item) => !ref.text ||
    (item instanceof HTMLDetailsElement ? item.querySelector('summary')?.textContent : item.textContent)?.trim().slice(0, 180) === ref.text))[ref.index]
}
function capture(): Presentation {
  const elements = [...document.querySelectorAll<HTMLElement>(regions)].flatMap((root) => [root, ...root.querySelectorAll<HTMLElement>('*')])
  const focused = document.activeElement
  return {
    details: elements.filter((item): item is HTMLDetailsElement => item instanceof HTMLDetailsElement).map((item) => ({ ref: reference(item), open: item.open })),
    scrolls: elements.filter((item) => item.scrollHeight > item.clientHeight && /auto|scroll/.test(getComputedStyle(item).overflowY))
      .map((item) => ({ ref: reference(item), top: item.scrollTop, left: item.scrollLeft })),
    focus: focused instanceof HTMLElement && focused.closest(regions) ? reference(focused) : undefined
  }
}

interface NavigationContextValue {
  entry: LocationState
  previous?: LocationState
  next?: LocationState
  drafts: Map<string, unknown>
  subscribe(listener: () => void): () => void
  notify(): void
  go(patch: Partial<Route>, ui?: Record<string, unknown>, label?: string): void
  visit(ui: Record<string, unknown>, label: string): void
  move(delta: -1 | 1): void
  isCurrent(): boolean
}
const Context = createContext<NavigationContextValue | null>(null)
export function useNavigation(): NavigationContextValue {
  const value = useContext(Context)
  if (!value) throw new Error('NavigationProvider mancante')
  return value
}

export function NavigationProvider({ children }: { children: (entryId: number) => ReactNode }) {
  const history = useRef(new NavigationHistory()).current
  const presentations = useRef(new Map<number, Presentation>()).current
  const drafts = useRef(new Map<string, unknown>()).current
  const listeners = useRef(new Set<() => void>()).current
  const [, render] = useState(0)
  const entry = history.current
  function update(action: () => boolean) {
    const before = history.current.id
    const presentation = capture()
    if (!action()) return
    presentations.set(before, presentation)
    for (const id of presentations.keys()) if (!history.entries.some((item) => item.id === id)) presentations.delete(id)
    document.querySelectorAll<HTMLElement>(':popover-open').forEach((item) => item.hidePopover())
    render((value) => value + 1)
  }
  const value: NavigationContextValue = {
    entry, previous: history.previous, next: history.next, drafts,
    subscribe: (listener) => { listeners.add(listener); return () => { listeners.delete(listener) } },
    notify: () => listeners.forEach((listener) => listener()),
    isCurrent: () => history.current.id === entry.id,
    go: (patch, ui, label) => { if (history.current.id === entry.id) update(() => history.push({ ...entry.route, ...patch }, ui, label)) },
    visit: (ui, label) => { if (history.current.id === entry.id) update(() => history.push({ ...entry.route }, ui, label)) },
    move: (delta) => update(() => history.move(delta))
  }
  useEffect(() => {
    function key(event: KeyboardEvent) {
      if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return
      event.preventDefault()
      value.move(event.key === 'ArrowLeft' ? -1 : 1)
    }
    function mouse(event: MouseEvent) {
      if (event.button !== 3 && event.button !== 4) return
      event.preventDefault()
      value.move(event.button === 3 ? -1 : 1)
    }
    window.addEventListener('keydown', key)
    window.addEventListener('mouseup', mouse)
    return () => { window.removeEventListener('keydown', key); window.removeEventListener('mouseup', mouse) }
  }, [entry.id])

  useEffect(() => {
    const saved = presentations.get(entry.id)
    let stopped = false
    let frame = 0
    const observer = new MutationObserver(restore)
    function stop() { stopped = true; observer.disconnect(); cancelAnimationFrame(frame) }
    function restore() {
      if (stopped || document.querySelector('[data-nav-loading="true"]')) return
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        if (stopped || document.querySelector('[data-nav-loading="true"]')) return
        observer.disconnect()
        saved?.details.forEach(({ ref, open }) => { const item = resolve(ref); if (item instanceof HTMLDetailsElement) item.open = open })
        frame = requestAnimationFrame(() => {
          if (stopped) return
          saved?.scrolls.forEach(({ ref, top, left }) => resolve(ref)?.scrollTo(left, top))
          const target = saved?.focus ? resolve(saved.focus) : !saved && typeof entry.ui['nav.focus'] === 'string'
            ? document.querySelector<HTMLElement>(entry.ui['nav.focus']) : undefined
          if (target && target.getClientRects().length && !target.closest('[hidden], [inert]')) target.focus({ preventScroll: true })
          else if (entry.id !== 1) document.getElementById('main-content')?.focus({ preventScroll: true })
          stopped = true
        })
      })
    }
    observer.observe(document.getElementById('root')!, { subtree: true, childList: true, attributes: true })
    restore()
    // Reading/typing always takes precedence over a delayed restoration.
    window.addEventListener('wheel', stop, { passive: true })
    window.addEventListener('pointerdown', stop)
    window.addEventListener('keydown', stop)
    return () => { stop(); window.removeEventListener('wheel', stop); window.removeEventListener('pointerdown', stop); window.removeEventListener('keydown', stop) }
  }, [entry.id])
  return <Context.Provider value={value}>{children(entry.id)}</Context.Provider>
}

/** Only presentation values go here. Saved data and commands are never history snapshots. */
export function useViewState<T>(key: string, initial: T | (() => T)): [T, Dispatch<SetStateAction<T>>] {
  const nav = useNavigation()
  const [value, setValue] = useState<T>(() => Object.hasOwn(nav.entry.ui, key) ? nav.entry.ui[key] as T : typeof initial === 'function' ? (initial as () => T)() : initial)
  useLayoutEffect(() => { nav.entry.ui[key] = value }, [value])
  const set: Dispatch<SetStateAction<T>> = (action) => {
    if (!nav.isCurrent()) return
    const old = Object.hasOwn(nav.entry.ui, key) ? nav.entry.ui[key] as T : value
    const next = typeof action === 'function' ? (action as (old: T) => T)(old) : action
    nav.entry.ui[key] = next
    setValue(next)
  }
  return [value, set]
}

/** A draft has one current value per context, so Back cannot resurrect submitted text. */
export function useDraftState<T>(key: string, initial: T): [T, Dispatch<SetStateAction<T>>] {
  const nav = useNavigation()
  const first = useRef(initial)
  const fallback = initial !== null && typeof initial === 'object' ? first.current : initial
  const value = useSyncExternalStore(nav.subscribe, () => nav.drafts.has(key) ? nav.drafts.get(key) as T : fallback)
  const set: Dispatch<SetStateAction<T>> = (action) => {
    const old = nav.drafts.has(key) ? nav.drafts.get(key) as T : initial
    // A completed request may clear its original draft after leaving, but never a newer edit.
    if (!nav.isCurrent() && !Object.is(old, value)) return
    nav.drafts.set(key, typeof action === 'function' ? (action as (old: T) => T)(old) : action)
    nav.notify()
  }
  return [value, set]
}

export function useBusyState(key: string): [boolean, Dispatch<SetStateAction<boolean>>] {
  const nav = useNavigation()
  const value = useSyncExternalStore(nav.subscribe, () => nav.drafts.get(`busy:${key}`) === true)
  return [value, (action) => {
    nav.drafts.set(`busy:${key}`, typeof action === 'function' ? action(nav.drafts.get(`busy:${key}`) === true) : action)
    nav.notify()
  }]
}

export function NavigationControls() {
  const { previous, next, move } = useNavigation()
  return <nav className="history-controls" aria-label="Cronologia di navigazione">
    <button type="button" disabled={!previous} aria-label="Indietro" aria-keyshortcuts="Alt+ArrowLeft"
      title={previous ? `Torna a ${previous.label} · Alt+←` : 'Nessuna pagina precedente'} onClick={() => move(-1)}>←</button>
    <button type="button" disabled={!next} aria-label="Avanti" aria-keyshortcuts="Alt+ArrowRight"
      title={next ? `Vai a ${next.label} · Alt+→` : 'Nessuna pagina successiva'} onClick={() => move(1)}>→</button>
  </nav>
}
