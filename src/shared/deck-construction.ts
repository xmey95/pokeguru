import type { CatalogView } from './catalog'
import type { DeckBaseline, DeckLine } from './deck-import'
import { suggestPrints } from './reconciliation'
import { basicEnergyType, expandEnergyNameSymbols } from './basic-energy-name'

export const DECK_CONSTRUCTION_SOURCE =
  'https://www.pokemon.com/uk/strategy/designing-a-deck-from-scratch'
export const ACE_SPEC_SOURCE =
  'https://press.pokemon.com/en-CA/MEDIA-ALERT-Pokemon-Trading-Card-Game-Scarlet-VioletTemporal-Forces-Ex'

export type ConstructionStatus = 'met' | 'problem' | 'indeterminate'

export interface ConstructionCheck {
  status: ConstructionStatus
  message: string
}

export interface DeckConstructionEvaluation {
  cardCount: ConstructionCheck
  copyLimit: ConstructionCheck
  basicPokemon: ConstructionCheck
  aceSpec: ConstructionCheck
  exceedingNames: { name: string; quantity: number }[]
  /** These checks are necessary, but not sufficient, for Standard legality. */
  legality: 'indeterminate'
}

function normalizedName(name: string): string {
  return expandEnergyNameSymbols(name.normalize('NFKC')).replace(/[’‘]/g, "'").trim().replace(/\s+/g, ' ').toLocaleLowerCase()
}

function isBasicEnergy(line: DeckLine, catalog: CatalogView | null): boolean {
  if (basicEnergyType(line.name ?? '')) return true
  if (!catalog) return false
  const exact = suggestPrints(line, catalog).filter((candidate) => candidate.reason === 'same-print')
  return exact.length === 1 && exact[0].print.category === 'Energy' &&
    exact[0].print.energyType?.toLowerCase() === 'normal' && !!basicEnergyType(exact[0].print.name)
}

function basicPokemonEvidence(line: DeckLine, catalog: CatalogView | null): 'yes' | 'no' | 'unknown' {
  if (basicEnergyType(line.name ?? '')) return 'no'
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
  let aceSpecCopies = 0
  let aceSpecUnknown = hasUnparsed
  for (const line of cards) {
    if (isBasicEnergy(line, catalog)) continue
    const exact = catalog?.syncedAt ? suggestPrints(line, catalog).filter((candidate) => candidate.reason === 'same-print') : []
    if (exact.length !== 1 || exact[0].print.rarity === null) {
      aceSpecUnknown = true
    } else if (/ACE SPEC/i.test(exact[0].print.rarity)) {
      aceSpecCopies += line.quantity ?? 0
    }
  }
  const aceSpec: ConstructionCheck = aceSpecCopies > 1
    ? { status: 'problem', message: `${aceSpecCopies} copie ACE SPEC riconosciute: è ammessa una sola carta ACE SPEC in tutto il mazzo.` }
    : aceSpecUnknown
      ? { status: 'indeterminate', message: `${aceSpecCopies} copie ACE SPEC riconosciute; alcune stampe o rarità non sono verificabili.` }
      : { status: 'met', message: `${aceSpecCopies} copie ACE SPEC riconosciute su tutte le stampe indicate.` }
  return { cardCount, copyLimit, basicPokemon, aceSpec, exceedingNames, legality: 'indeterminate' }
}
