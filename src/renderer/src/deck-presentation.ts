import type { DeckBaseline } from '../../shared/deck-import'
import type { DeckCardEntry } from '../../shared/reconciliation'

type GroupId = 'pokemon' | 'trainer' | 'energy' | 'unknown'
export interface DeckCardGroup {
  id: GroupId
  name: string
  cards: DeckCardEntry[]
  total: number
}

function catalogCategory(value: string | null): GroupId {
  return value === 'Pokemon' ? 'pokemon' : value === 'Trainer' ? 'trainer' : value === 'Energy' ? 'energy' : 'unknown'
}

/** Presentation only: catalog categories take precedence over explicit import headings. */
export function groupDeckCards(cards: DeckCardEntry[], baseline: DeckBaseline) {
  const importedGroups = new Map<number, GroupId>()
  let section: GroupId = 'unknown'
  for (const line of baseline.lines) {
    if (line.kind === 'section') {
      const heading = line.raw.trim()
      section = /^pok[eé]mon/i.test(heading) ? 'pokemon' : /^(?:trainer|allenatori)/i.test(heading) ? 'trainer' : /^energ/i.test(heading) ? 'energy' : 'unknown'
    } else if (line.kind === 'card') importedGroups.set(line.lineNumber, section)
  }
  const groups: DeckCardGroup[] = [
    { id: 'pokemon', name: 'Pokémon', cards: [], total: 0 },
    { id: 'trainer', name: 'Allenatori', cards: [], total: 0 },
    { id: 'energy', name: 'Energie', cards: [], total: 0 },
    { id: 'unknown', name: 'Da classificare', cards: [], total: 0 }
  ]
  let usesImportHeadings = false
  for (const card of cards) {
    const categories = new Set(card.prints.map((print) => catalogCategory(print.category)))
    let category: GroupId = 'unknown'
    if (categories.size === 1 && !categories.has('unknown')) category = [...categories][0]
    // Conflicting catalog data must remain unknown, even when the import has a heading.
    else if (categories.size === 0 || (categories.size === 1 && categories.has('unknown'))) {
      const headings = new Set(card.lines.map((line) => importedGroups.get(line.lineNumber) ?? 'unknown'))
      if (headings.size === 1 && !headings.has('unknown')) {
        category = [...headings][0]
        usesImportHeadings = true
      }
    }
    const group = groups.find((item) => item.id === category)!
    group.cards.push(card)
    group.total += card.quantity
  }
  return { groups, usesImportHeadings }
}

export function deckThumbnail(card: DeckCardEntry): string | null {
  const imported = card.prints.find((print) => card.importedPrintIds.includes(print.id) && print.thumbnail)
  return imported?.thumbnail ?? card.prints.find((print) => print.thumbnail)?.thumbnail ?? null
}
