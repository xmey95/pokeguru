import type { CatalogView } from './catalog'
import type { DeckBaseline, DeckLine } from './deck-import'
import { suggestPrints } from './reconciliation'
import { BUNDLED_WESTERN_RULE_PACKAGE } from './western-rule-package'

export const SET_ADMISSION_VERSION = BUNDLED_WESTERN_RULE_PACKAGE.version
export const SET_ADMISSION_CHECKED_AT = BUNDLED_WESTERN_RULE_PACKAGE.checkedAt
export const SET_ADMISSION_RULE_SOURCE =
  'https://community.pokemon.com/en-us/discussion/22216/pokemon-tcg-product-legality-update'
export const SET_ADMISSION_OLDER_RULE_SOURCE =
  'https://www.pokemon.com/uk/pokemon-news/2025-pokemon-tcg-standard-format-rotation-announcement'

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
  const packageUsed = catalog.rulePackage ?? BUNDLED_WESTERN_RULE_PACKAGE
  const admission = packageUsed.setAdmissions.find((rule) => rule.setId === print.setId)
  if (!admission) return { ...located, status: 'indeterminate',
    message: 'Data di ammissione di questo set non verificata nel pacchetto locale.' }
  const evidence = admission.method === 'explicit' ? 'data esplicita Play! Pokémon' : 'regola delle due settimane e data prodotto ufficiale'
  if (asOf < admission.legalDate) return { ...located, legalDate: admission.legalDate, status: 'waiting',
    message: `Set non ancora ammesso: dal ${admission.legalDate} (${evidence}).` }
  return { ...located, legalDate: admission.legalDate, status: 'admitted',
    message: `Attesa del set superata dal ${admission.legalDate} (${evidence}); carta e mazzo richiedono gli altri controlli.` }
}

export function evaluateSetAdmission(baseline: DeckBaseline, catalog: CatalogView | null,
  asOf: string): SetAdmissionEvaluation {
  const lines = baseline.lines.filter((line) => line.kind === 'card')
    .map((line) => evaluateLine(line, catalog, asOf))
  const counts: SetAdmissionEvaluation['counts'] = { admitted: 0, waiting: 0, indeterminate: 0 }
  for (const line of lines) counts[line.status] += line.quantity
  const packageUsed = catalog?.rulePackage ?? BUNDLED_WESTERN_RULE_PACKAGE
  return { circuit: 'WESTERN', asOf, version: packageUsed.version,
    checkedAt: packageUsed.checkedAt, lines, counts }
}
