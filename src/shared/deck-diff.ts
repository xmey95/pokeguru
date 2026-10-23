import type { ParsedDeck } from './deck-import'

export interface DeckQuantityChange {
  name: string
  before: number
  after: number
  delta: number
}

export interface DeckDiff {
  beforeTotal: number
  afterTotal: number
  byName: DeckQuantityChange[]
  byPrint: DeckQuantityChange[]
}

function normalize(value: string): string {
  return value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase()
}

function quantities(parsed: ParsedDeck, printLevel: boolean): Map<string, { name: string; quantity: number }> {
  const result = new Map<string, { name: string; quantity: number }>()
  for (const line of parsed.lines) {
    if (line.kind !== 'card' || !line.name) continue
    const print = printLevel && line.setCode && line.cardNumber
      ? ` · ${line.setCode.toUpperCase()} ${line.cardNumber.toUpperCase().replace(/^0+(?=\d)/, '')}` : ''
    const name = `${line.name}${print}`
    const key = normalize(name)
    const current = result.get(key)
    result.set(key, { name: current?.name ?? name, quantity: (current?.quantity ?? 0) + (line.quantity ?? 0) })
  }
  return result
}

function changes(before: ParsedDeck, after: ParsedDeck, printLevel: boolean): DeckQuantityChange[] {
  const old = quantities(before, printLevel)
  const next = quantities(after, printLevel)
  const keys = new Set([...old.keys(), ...next.keys()])
  return [...keys].map((key) => {
    const previous = old.get(key)?.quantity ?? 0
    const current = next.get(key)?.quantity ?? 0
    return { name: next.get(key)?.name ?? old.get(key)!.name,
      before: previous, after: current, delta: current - previous }
  }).filter((change) => change.delta !== 0).sort((a, b) => a.name.localeCompare(b.name))
}

/** The first level compares names; print changes are shown separately. No text-equivalence claim is inferred. */
export function compareDecks(before: ParsedDeck, after: ParsedDeck): DeckDiff {
  return { beforeTotal: before.interpretedTotal, afterTotal: after.interpretedTotal,
    byName: changes(before, after, false), byPrint: changes(before, after, true) }
}
