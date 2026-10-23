import type { CatalogView } from './catalog'
import type { DeckBaseline, DeckLine } from './deck-import'
import { suggestPrints } from './reconciliation'
import { BUNDLED_WESTERN_RULE_PACKAGE, type RulePeriod, type WesternRulePackage } from './western-rule-package'
import { currentBasicEnergy } from './standard-basic-energy'

export type RotationRule = RulePeriod

// Play! Pokémon in-person Western Standard. These snapshots do not cover
// release waiting periods, reprint equivalence, errata or deck construction.
export const WESTERN_ROTATION_RULES: readonly RotationRule[] = BUNDLED_WESTERN_RULE_PACKAGE.rotations

export const ROTATION_SOURCE_CHECKED = BUNDLED_WESTERN_RULE_PACKAGE.checkedAt

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

export function westernRotationRule(asOf: string, rules: WesternRulePackage = BUNDLED_WESTERN_RULE_PACKAGE): RotationRule | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) return null
  const date = new Date(`${asOf}T00:00:00Z`)
  if (Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== asOf) return null
  return [...rules.rotations].reverse().find((rule) => rule.effectiveFrom <= asOf && asOf <= rule.effectiveUntil) ?? null
}

function evaluateLine(line: DeckLine, catalog: CatalogView | null, rule: RotationRule | null,
  asOf: string): RotationLineResult {
  const base = { lineNumber: line.lineNumber, quantity: line.quantity ?? 0 }
  if (!rule) return { ...base, status: 'indeterminate', regulationMark: null, printId: null,
    message: 'Nessuna regola di rotazione versionata per questa data.' }
  if (!catalog?.syncedAt) return { ...base, status: 'indeterminate', regulationMark: null, printId: null,
    message: 'Catalogo locale non sincronizzato.' }
  const basicEnergy = currentBasicEnergy(line, catalog, asOf)
  if (basicEnergy) return { ...base, status: 'mark-accepted', regulationMark: null,
    printId: basicEnergy.id, message: 'Energia Base corrente identificata: eccezione al marchio di regolamentazione.' }
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
  const packageUsed = catalog?.rulePackage ?? BUNDLED_WESTERN_RULE_PACKAGE
  const rule = westernRotationRule(asOf, packageUsed)
  const lines = baseline.lines.filter((line) => line.kind === 'card').map((line) => evaluateLine(line, catalog, rule, asOf))
  const counts: RotationEvaluation['counts'] = { 'mark-accepted': 0, 'mark-rotated': 0, indeterminate: 0 }
  for (const line of lines) counts[line.status] += line.quantity
  return { circuit: 'WESTERN', asOf, rule, sourceChecked: packageUsed.checkedAt,
    lines, counts, legality: 'indeterminate' }
}
