import type { DeckBaseline } from '../../shared/deck-import'
import type { DeckCardEntry } from '../../shared/reconciliation'
import { OFFICIAL_SET_CODES } from '../../shared/set-codes'

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
      section = /^pok[eé]mon/i.test(heading) ? 'pokemon' : /^(?:trainer|(?:carte\s+)?allenator[ei])/i.test(heading) ? 'trainer' : /^energ/i.test(heading) ? 'energy' : 'unknown'
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

export function deckImagePrint(card: DeckCardEntry) {
  const imported = card.prints.find((print) => card.importedPrintIds.includes(print.id) && print.thumbnail)
  return imported ?? card.prints.find((print) => print.thumbnail) ?? null
}

export function deckThumbnail(card: DeckCardEntry): string | null {
  return deckImagePrint(card)?.thumbnail ?? null
}

/** Preserve the imported printing and row order when an identity groups several printings. */
export function deckImageCopies(card: DeckCardEntry): { src: string | null; print: string }[] {
  const copies: { src: string | null; print: string }[] = []
  for (const line of card.lines) {
    const print = line.setCode && line.cardNumber ? card.prints.find((item) =>
      (item.setId.toUpperCase() === line.setCode!.toUpperCase() ||
        OFFICIAL_SET_CODES[item.setId]?.toUpperCase() === line.setCode!.toUpperCase()) &&
      item.localId.replace(/^0+(?=\d)/, '') === line.cardNumber!.replace(/^0+(?=\d)/, '')) : null
    const fallback = !line.setCode ? deckImagePrint(card) : null
    for (let index = 0; index < (line.quantity ?? 0); index++) copies.push({
      src: (print ?? fallback)?.thumbnail ?? null,
      print: print ? `${line.setCode} ${line.cardNumber}` : fallback ? 'stampa di esempio' :
        line.setCode && line.cardNumber ? `${line.setCode} ${line.cardNumber}` : 'stampa non indicata'
    })
  }
  return copies
}

/** Keep gameplay tied to one known printing; never fill gaps by mixing card texts. */
export function deckGameplayPrint(card: DeckCardEntry) {
  const imported = card.prints.filter((print) => card.importedPrintIds.includes(print.id))
  return imported.find((print) => print.gameplay) ?? card.prints.find((print) => print.gameplay)
    ?? imported[0] ?? card.prints[0] ?? null
}
