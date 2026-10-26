import { useEffect, useMemo, useState } from 'react'
import type { TournamentCard } from '../../shared/tournament'
import type { CardPreviewData } from '../../shared/card-preview'
import type { CatalogPrint } from '../../shared/catalog'
import { useViewState } from './Navigation'
import { useCardPreview } from './CardPreview'
import { CardImageTile } from './CardImageTile'
import { CardFace } from './CardOverview'
import { DeckViewToggle, type DeckView } from './DeckViewToggle'

const categories = ['pokemon', 'trainer', 'energy'] as const
const categoryName = { pokemon: 'Pokémon', trainer: 'Allenatori', energy: 'Energie' }

function EventImageDetail({ card, preview }: { card: TournamentCard; preview: CardPreviewData | null }) {
  const printId = preview?.printId ?? null
  const [detail, setDetail] = useState<{ id: string; print: CatalogPrint | null; error: string | null } | null>(null)

  useEffect(() => {
    if (!printId) return
    let active = true
    void window.projectsApi.getCatalogPrint(printId).then((result) => {
      if (active) setDetail({ id: printId, print: result.ok ? result.value : null,
        error: result.ok ? null : result.error })
    }).catch(() => { if (active) setDetail({ id: printId, print: null, error: 'Dettaglio carta non disponibile.' }) })
    return () => { active = false }
  }, [printId])

  const print = detail?.id === printId ? detail.print : null
  const message = !preview ? 'Cerco la scheda nel Catalogo locale…'
    : !printId ? preview.reason === 'ambiguous' ? 'La stampa non è univoca nel Catalogo locale.'
      : 'Scheda non trovata nel Catalogo locale.'
      : !detail || detail.id !== printId ? 'Carico i dettagli della carta…'
        : detail.error ?? 'Scheda non più disponibile nel Catalogo locale.'
  const variants = print?.variants && Object.entries(print.variants).filter(([, active]) => active).map(([name]) => name)

  return <div className="event-image-detail" role="region" aria-label={`Dettaglio ${card.name}`}>
    <div className="event-image-detail-heading"><strong>{card.name}</strong>
      <span>{card.count} {card.count === 1 ? 'copia' : 'copie'} · Stampa nella lista: {card.set} {card.number}</span></div>
    {print ? <>
      <CardFace print={print} imagePrint={print} />
      <dl className="event-print-details">
        <div><dt>Set e numero</dt><dd>{print.setName} · {print.localId}</dd></div>
        <div><dt>Rarità</dt><dd>{print.rarity ?? 'Non indicata'}</dd></div>
        <div><dt>Marchio</dt><dd>{print.regulationMark ?? 'Non indicato'}</dd></div>
        <div><dt>Varianti</dt><dd>{variants?.join(', ') || 'Non indicate'}</dd></div>
      </dl>
    </> : <p className="event-image-detail-message" role="status">{message}</p>}
  </div>
}

export function TournamentDeck({ cards, source }: { cards: TournamentCard[]; source: 'play' | 'main' }) {
  const preview = useCardPreview()
  const [view, setView] = useViewState<DeckView>(`events.${source}.deckView`, 'list')
  const [previews, setPreviews] = useState<{ key: string; data: CardPreviewData[] } | null>(null)
  const [selection, setSelection] = useState<{ key: string; index: number } | null>(null)
  const total = cards.reduce((sum, card) => sum + card.count, 0)
  const imageKey = useMemo(() => JSON.stringify(cards.map((card) => [card.name, card.set, card.number])), [cards])
  const images = previews?.key === imageKey ? previews.data : null
  const selectedIndex = selection?.key === imageKey ? selection.index : null

  useEffect(() => {
    if (view !== 'images' || previews?.key === imageKey) return
    let active = true
    const lookups = cards.map((card) => ({ name: card.name,
      setCode: card.set || undefined, cardNumber: card.number || undefined }))
    void window.projectsApi.getCardPreviews(lookups).then((result) => {
      if (active) setPreviews({ key: imageKey, data: result.ok ? result.value : [] })
    }).catch(() => { if (active) setPreviews({ key: imageKey, data: [] }) })
    return () => { active = false }
  }, [view, imageKey])

  return <>
    <div className="event-deck-heading"><p className={total === 60 ? 'event-deck-total' : 'diagnostics'}>{total} carte{total !== 60 ? ' · Lista incompleta' : ''}</p>
      <DeckViewToggle value={view} onChange={setView} label="Vista lista del torneo" /></div>
    {view === 'images' && !images && <p className="content-note" role="status">Cerco immagini nel Catalogo locale…</p>}
    <div className="event-deck">{categories.map((category) => {
      const entries = cards.map((card, index) => ({ card, index })).filter(({ card }) => card.category === category)
      const count = entries.reduce((sum, { card }) => sum + card.count, 0)
      return <section className="event-deck-group" key={category}>
        <h3>{categoryName[category]}<span>{count}</span></h3>
        {view === 'list' ? entries.length ? <ul>{entries.map(({ card, index }) => <li key={`${card.set}:${card.number}:${index}`} tabIndex={0}
          {...preview({ name: card.name, setCode: card.set, cardNumber: card.number })}>
          <span className="event-card-quantity">{card.count}×</span><span className="event-card-name">{card.name}</span>
          <span className="event-card-print">{card.set} {card.number}</span>
        </li>)}</ul> : <p className="content-note">Nessuna carta</p>
          : entries.length ? <div className="event-image-grid" aria-label={`Immagini ${categoryName[category]}`}>
            {entries.map(({ card, index }) => <div className="event-image-entry" key={`${card.set}:${card.number}:${index}`}>
              {Array.from({ length: card.count }, (_, copy) => <CardImageTile
                key={`${index}:${copy}:${images?.[index]?.image ?? ''}`} name={card.name} print={`${card.set} ${card.number}`}
                src={images?.[index]?.image ?? null} copy={copy + 1} total={card.count} selected={selectedIndex === index}
                onClick={() => setSelection(selectedIndex === index ? null : { key: imageKey, index })} />)}
              {selectedIndex === index && <EventImageDetail key={`${index}:${images?.[index]?.printId ?? ''}`}
                card={card} preview={images?.[index] ?? null} />}
            </div>)}
          </div> : <p className="content-note">Nessuna carta</p>}
      </section>
    })}</div>
  </>
}
