import type { CatalogView } from './catalog'
import type { DeckBaseline, DeckLine } from './deck-import'
import { suggestPrints } from './reconciliation'

export const DECK_CONSTRUCTION_SOURCE =
  'https://www.pokemon.com/uk/strategy/designing-a-deck-from-scratch'

export type ConstructionStatus = 'met' | 'problem' | 'indeterminate'

export interface ConstructionCheck {
  status: ConstructionStatus
  message: string
}

export interface DeckConstructionEvaluation {
  cardCount: ConstructionCheck
  copyLimit: ConstructionCheck
  basicPokemon: ConstructionCheck
  exceedingNames: { name: string; quantity: number }[]
  /** These checks are necessary, but not sufficient, for Standard legality. */
  legality: 'indeterminate'
}

const basicEnergyName = /^(?:Basic\s+)?(?:Grass|Fire|Water|Lightning|Psychic|Fighting|Darkness|Metal|Fairy)\s+Energy$/i

function normalizedName(name: string): string {
  return name.normalize('NFKC').replace(/[’‘]/g, "'").trim().replace(/\s+/g, ' ').toLocaleLowerCase()
}

function isBasicEnergy(line: DeckLine, catalog: CatalogView | null): boolean {
  if (basicEnergyName.test(line.name ?? '')) return true
  if (!catalog) return false
  const exact = suggestPrints(line, catalog).filter((candidate) => candidate.reason === 'same-print')
  return exact.length === 1 && exact[0].print.category === 'Energy' &&
    exact[0].print.energyType?.toLowerCase() === 'normal'
}

function basicPokemonEvidence(line: DeckLine, catalog: CatalogView | null): 'yes' | 'no' | 'unknown' {
  if (basicEnergyName.test(line.name ?? '')) return 'no'
  if (!catalog?.syncedAt) return 'unknown'
  const candidates = suggestPrints(line, catalog)
  const exact = candidates.filter((candidate) => candidate.reason === 'same-print')
  if (exact.length === 1) {
    const print = exact[0].print
    if (print.category === 'Pokemon') {
      if (print.stage?.toLowerCase() === 'basic') return 'yes'
      return print.stage ? 'no' : 'unknown'
    }
    return print.category === 'Trainer' || print.category === 'Energy' ? 'no' : 'unknown'
  }
  if (candidates.length > 0 && candidates.every((candidate) =>
    candidate.reason === 'same-name' &&
    (candidate.print.category === 'Trainer' || candidate.print.category === 'Energy'))) return 'no'
  return 'unknown'
}

/** Checks only rules that can be evaluated without a complete legality catalog. */
export function evaluateDeckConstruction(baseline: DeckBaseline, catalog: CatalogView | null): DeckConstructionEvaluation {
  const cards = baseline.lines.filter((line) => line.kind === 'card')
  const hasUnparsed = baseline.lines.some((line) => line.kind === 'unparsed')
  const cardCount: ConstructionCheck = baseline.interpretedTotal > 60
    ? { status: 'problem', message: `${baseline.interpretedTotal} copie interpretate: il mazzo non può superare 60.` }
    : hasUnparsed
      ? { status: 'indeterminate', message: `${baseline.interpretedTotal} copie interpretate; chiarire le righe non riconosciute per controllare le 60 carte.` }
      : baseline.interpretedTotal === 60
        ? { status: 'met', message: '60 copie interpretate.' }
        : { status: 'problem', message: `${baseline.interpretedTotal} copie: ne servono esattamente 60.` }

  const byName = new Map<string, { name: string; quantity: number; lines: DeckLine[] }>()
  for (const line of cards) {
    const key = normalizedName(line.name ?? '')
    const group = byName.get(key) ?? { name: line.name ?? '', quantity: 0, lines: [] }
    group.quantity += line.quantity ?? 0
    group.lines.push(line)
    byName.set(key, group)
  }
  const exceedingNames = [...byName.values()]
    .filter((group) => group.quantity > 4 && !group.lines.every((line) => isBasicEnergy(line, catalog)))
    .map(({ name, quantity }) => ({ name, quantity }))
  const copyLimit: ConstructionCheck = exceedingNames.length
    ? { status: 'problem', message: `${exceedingNames.map((item) => `${item.name} ×${item.quantity}`).join(', ')}: oltre il limite generale di quattro copie per nome; verificare eventuali eccezioni.` }
    : hasUnparsed
      ? { status: 'indeterminate', message: 'Nessun nome interpretato supera quattro copie; ci sono righe da chiarire.' }
      : { status: 'met', message: 'Nessun nome interpretato supera il limite generale; equivalenze tra lingue e regole speciali non verificate.' }

  const basicEvidence = cards.map((line) => basicPokemonEvidence(line, catalog))
  const basicPokemon: ConstructionCheck = basicEvidence.includes('yes')
    ? { status: 'met', message: 'Almeno un Pokémon Base riconosciuto nella lista.' }
    : hasUnparsed || basicEvidence.includes('unknown')
      ? { status: 'indeterminate', message: 'Non è possibile stabilire se la lista contiene un Pokémon Base.' }
      : { status: 'problem', message: 'Nessun Pokémon Base nella lista riconosciuta.' }
  return { cardCount, copyLimit, basicPokemon, exceedingNames, legality: 'indeterminate' }
}
