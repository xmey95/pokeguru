import { useState } from 'react'
import type { CatalogPrint } from '../../shared/catalog'
import type { DeckCardEntry } from '../../shared/reconciliation'
import { hasComparableGameplay, prizeCardsOnKnockOut } from '../../shared/card-gameplay'
import { deckGameplayPrint, deckImagePrint } from './deck-presentation'
import { Icon } from './Icon'

function CardArtwork({ print }: { print: CatalogPrint | null }) {
  const [failed, setFailed] = useState(false)
  return <figure className="card-artwork">
    {print?.thumbnail && !failed
      ? <img src={print.thumbnail} alt={`Carta ${print.name}`} onError={() => setFailed(true)} />
      : <div className="card-artwork-empty"><Icon name="deck" /><span>Immagine non disponibile</span></div>}
    {print && <figcaption>{print.setName} · {print.localId}</figcaption>}
  </figure>
}

function energyCost(cost: string[] | null): string {
  if (cost === null) return 'Non indicato'
  if (!cost.length) return 'Nessuno'
  const counts = new Map<string, number>()
  for (const type of cost) counts.set(type, (counts.get(type) ?? 0) + 1)
  return [...counts].map(([type, count]) => `${count} ${type}`).join(' · ')
}

export function CardOverview({ card, onOpenCatalog }: { card: DeckCardEntry; onOpenCatalog(): void }) {
  return <CardFace print={deckGameplayPrint(card)} imagePrint={deckImagePrint(card)} onOpenCatalog={onOpenCatalog}
    missingMessage={card.status === 'ambiguous' ? 'Conferma l’identità per consultare il testo di gioco.' : undefined} />
}

/** One source print supplies all gameplay fields; image provenance is shown separately. */
export function CardFace({ print, imagePrint, missingMessage, onOpenCatalog }: {
  print: CatalogPrint | null
  imagePrint: CatalogPrint | null
  missingMessage?: string
  onOpenCatalog?(): void
}) {
  const gameplay = print?.gameplay
  const prizes = prizeCardsOnKnockOut(print ?? undefined)
  const hasText = gameplay && (gameplay.attacks.length > 0 || gameplay.abilities.length > 0 || !!gameplay.effect)
  const basicEnergy = print?.category === 'Energy' && (print.energyType === 'Normal' || print.energyType === 'Basic')
  const partial = gameplay && !hasComparableGameplay(print.category, print.stage ?? null, print.energyType ?? null, gameplay)
  const category = print?.category === 'Pokemon' ? 'Pokémon' : print?.category === 'Trainer' ? 'Allenatore' : print?.category === 'Energy' ? 'Energia' : null
  const stage = print?.stage === 'Basic' ? 'Base' : print?.stage === 'Stage1' ? 'Fase 1' : print?.stage === 'Stage2' ? 'Fase 2' : print?.stage

  return <div className="card-overview">
    <CardArtwork key={imagePrint?.thumbnail ?? 'missing'} print={imagePrint} />
    <div className="card-gameplay">
      <div className="card-gameplay-meta">
        {category && <span>{category}</span>}
        {stage && <span>{stage}</span>}
        {basicEnergy && <span>Base</span>}
        {gameplay?.trainerType && <span>{gameplay.trainerType}</span>}
        {gameplay?.hp !== null && gameplay?.hp !== undefined && <strong>{gameplay.hp} PS</strong>}
        {!!gameplay?.types.length && <span>{gameplay.types.join(' / ')}</span>}
        {partial && <span className="card-data-partial">Scheda parziale</span>}
      </div>
      {!hasText && !basicEnergy && <div className="card-gameplay-missing">
        <p>{missingMessage ?? 'Testo di gioco non disponibile nel catalogo locale.'}</p>
        {onOpenCatalog && <button type="button" className="text-button" onClick={onOpenCatalog}>Apri Catalogo</button>}
      </div>}
      {basicEnergy && !hasText && <p className="content-note">Nessun testo effetto riportato dal catalogo.</p>}
      {gameplay?.abilities.map((ability, index) => <section className="card-ability" key={index} aria-label={`Abilità: ${ability.name}`}>
        <span className="card-rule-label">Abilità</span>
        <h4>{ability.name}</h4><p>{ability.effect}</p>
      </section>)}
      {gameplay?.attacks.map((attack, index) => <section className="card-attack" key={index} aria-label={`Attacco: ${attack.name}`}>
        <span className="card-rule-label">Attacco</span>
        <div className="card-attack-heading"><h4>{attack.name}</h4>{attack.damage !== null && <strong>{attack.damage}</strong>}</div>
        <p className="card-attack-cost">Costo: {energyCost(attack.cost)}</p>
        {attack.effect && <p>{attack.effect}</p>}
      </section>)}
      {gameplay?.effect && <section className="card-effect" aria-label="Effetto della carta"><h4>Effetto</h4><p>{gameplay.effect}</p></section>}
      {gameplay && print.category === 'Pokemon' && <dl className="card-battle-stats">
        <div><dt>Debolezza</dt><dd>{gameplay.weaknesses.map((item) => `${item.type} ${item.value}`).join(' · ') || 'Non riportata'}</dd></div>
        <div><dt>Resistenza</dt><dd>{gameplay.resistances.map((item) => `${item.type} ${item.value}`).join(' · ') || 'Non riportata'}</dd></div>
        <div><dt>Ritirata</dt><dd>{gameplay.retreat ?? 'Non indicata'}</dd></div>
        {prizes !== null && <div><dt>Premi al KO</dt><dd>{prizes}</dd></div>}
      </dl>}
      {gameplay?.evolveFrom && <p className="card-evolves">Evolve da {gameplay.evolveFrom}</p>}
      {print && <div className="card-gameplay-source"><span>{hasText ? 'Testo in inglese' : 'Scheda TCGdex'} · {print.setName} {print.localId}</span></div>}
    </div>
  </div>
}
