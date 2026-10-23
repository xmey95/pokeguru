import type { CatalogView } from './catalog'
import type { DeckBaseline, DeckLine } from './deck-import'
import { suggestPrints } from './reconciliation'
import { officialSetRelease } from '../main/official-set-releases'

export const SET_ADMISSION_VERSION = 'western-sets-2026-10-23-v1'
export const SET_ADMISSION_CHECKED_AT = '2026-10-23'
export const SET_ADMISSION_RULE_SOURCE =
  'https://community.pokemon.com/en-us/discussion/22216/pokemon-tcg-product-legality-update'
export const SET_ADMISSION_OLDER_RULE_SOURCE =
  'https://www.pokemon.com/uk/pokemon-news/2025-pokemon-tcg-standard-format-rotation-announcement'

// Only regular expansions with a verified launch of the qualifying product use
// the two-week rule. Special sets can have different product schedules.
const regularSets = new Set([
  'sv05', 'sv06', 'sv07', 'sv08', 'sv09', 'sv10',
  'me01', 'me02', 'me03', 'me04', 'me05'
])

const explicitAdmission = new Map([['me02.5', {
  legalDate: '2026-03-06', sourceUrl: SET_ADMISSION_RULE_SOURCE
}]])

export type SetAdmissionStatus = 'admitted' | 'waiting' | 'indeterminate'

export interface SetAdmissionLine {
  lineNumber: number
  quantity: number
  setId: string | null
  printId: string | null
  legalDate: string | null
  status: SetAdmissionStatus
  message: string
}

export interface SetAdmissionEvaluation {
  circuit: 'WESTERN'
  asOf: string
  version: string
  checkedAt: string
  lines: SetAdmissionLine[]
  counts: Record<SetAdmissionStatus, number>
}

function plusTwoWeeks(date: string): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + 14 * 86_400_000).toISOString().slice(0, 10)
}

function evaluateLine(line: DeckLine, catalog: CatalogView | null, asOf: string): SetAdmissionLine {
  const base = { lineNumber: line.lineNumber, quantity: line.quantity ?? 0, setId: null, printId: null, legalDate: null }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf) || Number.isNaN(Date.parse(`${asOf}T00:00:00Z`)) ||
    new Date(`${asOf}T00:00:00Z`).toISOString().slice(0, 10) !== asOf) {
    return { ...base, status: 'indeterminate', message: 'Data di riferimento non valida.' }
  }
  if (!catalog?.syncedAt) return { ...base, status: 'indeterminate', message: 'Catalogo locale non sincronizzato.' }
  const matches = suggestPrints(line, catalog).filter((item) => item.reason === 'same-print')
  if (matches.length !== 1) return { ...base, status: 'indeterminate',
    message: 'Stampa non identificata univocamente nel catalogo locale.' }
  const print = matches[0].print
  const located = { ...base, setId: print.setId, printId: print.id }
  if (print.isPromo) return { ...located, status: 'indeterminate',
    message: 'Promo: usare la data del registro ufficiale; non eredita quella del set.' }
  const explicit = explicitAdmission.get(print.setId)
  const releaseDate = officialSetRelease(print.setId)
  const legalDate = explicit?.legalDate ?? (regularSets.has(print.setId) && releaseDate
    ? plusTwoWeeks(releaseDate) : null)
  if (!legalDate) return { ...located, status: 'indeterminate',
    message: 'Data di ammissione di questo set non verificata nel pacchetto locale.' }
  const evidence = explicit ? 'data esplicita Play! Pokémon' : 'regola delle due settimane e data prodotto ufficiale'
  if (asOf < legalDate) return { ...located, legalDate, status: 'waiting',
    message: `Set non ancora ammesso: dal ${legalDate} (${evidence}).` }
  return { ...located, legalDate, status: 'admitted',
    message: `Attesa del set superata dal ${legalDate} (${evidence}); carta e mazzo richiedono gli altri controlli.` }
}

export function evaluateSetAdmission(baseline: DeckBaseline, catalog: CatalogView | null,
  asOf: string): SetAdmissionEvaluation {
  const lines = baseline.lines.filter((line) => line.kind === 'card')
    .map((line) => evaluateLine(line, catalog, asOf))
  const counts: SetAdmissionEvaluation['counts'] = { admitted: 0, waiting: 0, indeterminate: 0 }
  for (const line of lines) counts[line.status] += line.quantity
  return { circuit: 'WESTERN', asOf, version: SET_ADMISSION_VERSION,
    checkedAt: SET_ADMISSION_CHECKED_AT, lines, counts }
}
