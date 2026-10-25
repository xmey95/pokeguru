import type { TournamentCard } from '../../shared/tournament'
import { useCardPreview } from './CardPreview'

export function TournamentDeck({ cards }: { cards: TournamentCard[] }) {
  const preview = useCardPreview()
  const total = cards.reduce((sum, card) => sum + card.count, 0)
  return <>
    <p className={total === 60 ? 'event-deck-total' : 'diagnostics'}>{total} carte{total !== 60 ? ' · Lista incompleta' : ''}</p>
    <div className="event-deck">{(['pokemon', 'trainer', 'energy'] as const).map((category) => {
      const entries = cards.filter((card) => card.category === category)
      const count = entries.reduce((sum, card) => sum + card.count, 0)
      return <section className="event-deck-group" key={category}>
        <h3>{category === 'pokemon' ? 'Pokémon' : category === 'trainer' ? 'Allenatori' : 'Energie'}<span>{count}</span></h3>
        {entries.length ? <ul>{entries.map((card, index) => <li key={`${card.set}:${card.number}:${index}`} tabIndex={0}
          {...preview({ name: card.name, setCode: card.set, cardNumber: card.number })}>
          <span className="event-card-quantity">{card.count}×</span><span className="event-card-name">{card.name}</span>
          <span className="event-card-print">{card.set} {card.number}</span>
        </li>)}</ul> : <p className="content-note">Nessuna carta</p>}
      </section>
    })}</div>
  </>
}
