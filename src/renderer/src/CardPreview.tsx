import { createContext, useCallback, useContext, useLayoutEffect, useMemo, useRef, useState,
  type FocusEvent, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { CardPreviewData, CardPreviewLookup } from '../../shared/card-preview'

type PreviewState = { anchor: HTMLElement; lookup: CardPreviewLookup; data: CardPreviewData | null }
type PreviewContext = { show(anchor: HTMLElement, lookup: CardPreviewLookup, delay: number): void;
  hide(anchor: HTMLElement): void }
const Context = createContext<PreviewContext | null>(null)
const fallback: Record<Exclude<CardPreviewData['reason'], 'available'>, string> = {
  'source-missing': 'La fonte non fornisce un’immagine per questa stampa.',
  'not-cached': 'Immagine non ancora conservata nel Catalogo locale.',
  'not-in-catalog': 'Carta non trovata nel Catalogo locale.',
  ambiguous: 'Stampa da chiarire: più carte corrispondono ai dati disponibili.',
  unavailable: 'Anteprima locale non disponibile.'
}

/** One tooltip and at most 64 small lookup results per view. Artwork is loaded only while visible. */
export function CardPreviewProvider({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<PreviewState | null>(null)
  const [failedImage, setFailedImage] = useState(false)
  const [position, setPosition] = useState({ left: 8, top: 8, width: 220, maxHeight: 340 })
  const timer = useRef<number | null>(null)
  const sequence = useRef(0)
  const anchor = useRef<HTMLElement | null>(null)
  const cache = useRef(new Map<string, CardPreviewData>())

  const clear = useCallback(() => {
    if (timer.current !== null) window.clearTimeout(timer.current)
    timer.current = null
    sequence.current++
    anchor.current = null
    setCurrent(null)
  }, [])

  const show = useCallback((element: HTMLElement, lookup: CardPreviewLookup, delay: number) => {
    clear()
    const id = sequence.current
    const start = () => {
      if (id !== sequence.current || !element.isConnected) return
      anchor.current = element
      const key = JSON.stringify(lookup)
      const saved = cache.current.get(key)
      setFailedImage(false)
      setCurrent({ anchor: element, lookup, data: saved ?? null })
      if (saved) return
      void window.projectsApi.getCardPreview(lookup).then((result) => {
        if (id !== sequence.current) return
        const data: CardPreviewData = result.ok ? result.value : {
          name: lookup.name, printLabel: null, image: null, reason: 'unavailable', sample: false
        }
        // Older profiles can contain large data URLs; keep those only while the card is visible.
        if (data.reason === 'available' && data.image?.startsWith('pokeguru://cards/')) {
          cache.current.set(key, data)
          if (cache.current.size > 64) cache.current.delete(cache.current.keys().next().value!)
        }
        setCurrent({ anchor: element, lookup, data })
      }).catch(() => {
        if (id === sequence.current) setCurrent({ anchor: element, lookup, data: {
          name: lookup.name, printLabel: null, image: null, reason: 'unavailable', sample: false
        } })
      })
    }
    if (delay) timer.current = window.setTimeout(start, delay)
    else start()
  }, [clear])

  const hide = useCallback((element: HTMLElement) => {
    if (anchor.current === element || (timer.current !== null && !anchor.current)) clear()
  }, [clear])
  const actions = useMemo(() => ({ show, hide }), [show, hide])

  useLayoutEffect(() => {
    if (!current) return
    let frame = 0
    const update = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        if (!current.anchor.isConnected) { clear(); return }
        const rect = current.anchor.getBoundingClientRect()
        const width = Math.min(220, window.innerWidth - 16)
        const maxHeight = Math.min(340, window.innerHeight - 16)
        const left = rect.right + width + 8 <= window.innerWidth - 8 ? rect.right + 8
          : rect.left - width - 8 >= 8 ? rect.left - width - 8
            : rect.left < window.innerWidth / 2 ? window.innerWidth - width - 8 : 8
        setPosition({ left, top: Math.max(8, Math.min(rect.top, window.innerHeight - maxHeight - 8)), width, maxHeight })
      })
    }
    update()
    window.addEventListener('scroll', update, true)
    window.addEventListener('resize', update)
    return () => { cancelAnimationFrame(frame); window.removeEventListener('scroll', update, true); window.removeEventListener('resize', update) }
  }, [current?.anchor])

  return <Context.Provider value={actions}>{children}{createPortal(
    <div id="card-preview" className="card-preview" role="tooltip" aria-live="polite" hidden={!current}
      style={position} data-testid="card-preview">
      {current && <><strong>{current.data?.name ?? current.lookup.name}</strong>
        {current.data?.printLabel && <span>{current.data.sample ? 'Stampa di esempio · ' : ''}{current.data.printLabel}</span>}
        {current.data?.image && !failedImage ? <img src={current.data.image} alt="" decoding="async"
          onError={() => setFailedImage(true)} /> : <p>{failedImage ? 'Immagine locale non leggibile.'
            : current.data ? fallback[current.data.reason as Exclude<CardPreviewData['reason'], 'available'>]
              : 'Ricerca nell’archivio locale…'}</p>}</>}
    </div>, document.body)}</Context.Provider>
}

export function useCardPreview() {
  const context = useContext(Context)
  // Standalone server renders have no browser portal; the app always installs the provider.
  if (!context) return (_lookup: CardPreviewLookup) => ({})
  return (lookup: CardPreviewLookup) => ({
    'aria-describedby': 'card-preview',
    onPointerEnter: (event: PointerEvent<HTMLElement>) => {
      if (document.activeElement !== event.currentTarget) context.show(event.currentTarget, lookup, 140)
    },
    onPointerLeave: (event: PointerEvent<HTMLElement>) => {
      if (document.activeElement !== event.currentTarget) context.hide(event.currentTarget)
    },
    onFocus: (event: FocusEvent<HTMLElement>) => context.show(event.currentTarget, lookup, 0),
    onBlur: (event: FocusEvent<HTMLElement>) => context.hide(event.currentTarget),
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
      if (event.key === 'Escape') { context.hide(event.currentTarget); event.stopPropagation() }
    }
  })
}
