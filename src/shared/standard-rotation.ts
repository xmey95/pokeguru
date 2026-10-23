import type { CatalogView } from './catalog'
import type { DeckBaseline, DeckLine } from './deck-import'
import { suggestPrints } from './reconciliation'

export interface RotationRule {
  version: string
  effectiveFrom: string
  effectiveUntil: string
  firstAllowedMark: string
  lastConfirmedMark: string
  sourceUrl: string
}

// Play! Pokémon in-person Western Standard. These snapshots do not cover
// release waiting periods, reprint equivalence, errata or deck construction.
export const WESTERN_ROTATION_RULES: readonly RotationRule[] = [
  {
    version: 'play-2025-01-09', effectiveFrom: '2025-04-11', effectiveUntil: '2026-04-09',
    firstAllowedMark: 'G', lastConfirmedMark: 'H',
    sourceUrl: 'https://www.pokemon.com/uk/pokemon-news/2025-pokemon-tcg-standard-format-rotation-announcement'
  },
  {
    version: 'play-2026-01-09', effectiveFrom: '2026-04-10', effectiveUntil: '2026-12-31',
    firstAllowedMark: 'H', lastConfirmedMark: 'J',
    sourceUrl: 'https://www.pokemon.com/us/pokemon-news/2026-pokemon-tcg-standard-format-rotation-announcement'
  }
]

export const ROTATION_SOURCE_CHECKED = '2026-10-23'

export type RotationLineStatus = 'mark-accepted' | 'mark-rotated' | 'indeterminate'

export interface RotationLineResult {
  lineNumber: number
  quantity: number
  status: RotationLineStatus
  regulationMark: string | null
  printId: string | null
  message: string
}

export interface RotationEvaluation {
  circuit: 'WESTERN'
  asOf: string
  rule: RotationRule | null
  sourceChecked: string
  lines: RotationLineResult[]
  counts: Record<RotationLineStatus, number>
  /** Full Standard legality is never inferred from this partial catalog. */
  legality: 'indeterminate'
}

export function westernRotationRule(asOf: string): RotationRule | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) return null
  const date = new Date(`${asOf}T00:00:00Z`)
  if (Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== asOf) return null
  return [...WESTERN_ROTATION_RULES].reverse().find((rule) => rule.effectiveFrom <= asOf && asOf <= rule.effectiveUntil) ?? null
}

function evaluateLine(line: DeckLine, catalog: CatalogView | null, rule: RotationRule | null): RotationLineResult {
  const base = { lineNumber: line.lineNumber, quantity: line.quantity ?? 0 }
  if (!rule) return { ...base, status: 'indeterminate', regulationMark: null, printId: null,
    message: 'Nessuna regola di rotazione versionata per questa data.' }
  if (!catalog?.syncedAt) return { ...base, status: 'indeterminate', regulationMark: null, printId: null,
    message: 'Catalogo locale non sincronizzato.' }
  const matches = suggestPrints(line, catalog).filter((candidate) => candidate.reason === 'same-print')
  if (matches.length !== 1) return { ...base, status: 'indeterminate', regulationMark: null, printId: null,
    message: 'Stampa non identificata univocamente da nome, codice e numero nel catalogo locale.' }
  const print = matches[0].print
  const mark = print.regulationMark ?? null
  if (!mark || !/^[A-Z]$/.test(mark) || mark > rule.lastConfirmedMark) return { ...base, status: 'indeterminate', regulationMark: mark,
    printId: print.id, message: 'Marchio di regolamentazione assente o non coperto dalle regole locali.' }
  if (mark < rule.firstAllowedMark) {
    return { ...base, status: 'mark-rotated', regulationMark: mark, printId: print.id,
      message: `Marchio ${mark} ruotato sulla stampa indicata. Le stampe storiche non sono verificate dall'app; legalità della lista indeterminata.` }
  }
  return { ...base, status: 'mark-accepted', regulationMark: mark,
    printId: print.id, message: `Marchio ${mark} ammesso dalla rotazione. Rilascio, errata e altre regole non verificati.` }
}

export function evaluateWesternRotation(baseline: DeckBaseline, catalog: CatalogView | null,
  asOf: string): RotationEvaluation {
  const rule = westernRotationRule(asOf)
  const lines = baseline.lines.filter((line) => line.kind === 'card').map((line) => evaluateLine(line, catalog, rule))
  const counts: RotationEvaluation['counts'] = { 'mark-accepted': 0, 'mark-rotated': 0, indeterminate: 0 }
  for (const line of lines) counts[line.status] += line.quantity
  return { circuit: 'WESTERN', asOf, rule, sourceChecked: ROTATION_SOURCE_CHECKED,
    lines, counts, legality: 'indeterminate' }
}
