import type { CatalogView } from './catalog'
import type { DeckBaseline } from './deck-import'
import { evaluateDeckConstruction } from './deck-construction'
import { evaluateWesternRotation } from './standard-rotation'
import { evaluateSetAdmission } from './standard-admission'
import { evaluatePromoAdmission } from './promo-admission'
import { STANDARD_RULE_PACKAGE_VERSION, type StandardRuleAudit } from './standard-rule-audit'

export type StandardDeckStatus = 'problem' | 'review' | 'checks-passed'

export interface StandardDeckEvaluation {
  status: StandardDeckStatus
  asOf: string
  problems: string[]
  toReview: string[]
  passed: string[]
  /** A positive result covers only the checks enumerated in `passed`. */
  legality: 'indeterminate'
}

/** Combine only proven local checks. Unknowns and historical reprints never become a legality verdict. */
export function evaluateStandardDeck(baseline: DeckBaseline, catalog: CatalogView | null,
  asOf: string, audit: StandardRuleAudit | null = null): StandardDeckEvaluation {
  const construction = evaluateDeckConstruction(baseline, catalog)
  const rotation = evaluateWesternRotation(baseline, catalog, asOf)
  const setAdmission = evaluateSetAdmission(baseline, catalog, asOf)
  const promoAdmission = evaluatePromoAdmission(baseline, catalog, asOf)
  const problems: string[] = []
  const toReview: string[] = []
  const passed: string[] = []
  if (catalog?.rulePackageError) toReview.push(catalog.rulePackageError)
  if (audit && (audit.status === 'changed' ||
    audit.packageVersion !== (catalog?.rulePackage?.version ?? STANDARD_RULE_PACKAGE_VERSION)))
    toReview.push('Le fonti ufficiali non confermano il pacchetto di regole locale: ricontrollare nel Catalogo.')

  for (const [name, check] of [
    ['60 carte', construction.cardCount], ['Almeno un Pokémon Base', construction.basicPokemon],
    ['ACE SPEC', construction.aceSpec]
  ] as const) {
    if (check.status === 'problem') problems.push(`${name}: ${check.message}`)
    else if (check.status === 'indeterminate') toReview.push(`${name}: ${check.message}`)
    else passed.push(name)
  }
  // Special card text can override the general four-copy rule. The local
  // catalog does not verify these exceptions, so an excess needs review.
  if (construction.copyLimit.status === 'problem') toReview.push(`Quattro copie per nome: ${construction.copyLimit.message}`)
  else if (construction.copyLimit.status === 'indeterminate') toReview.push(`Quattro copie per nome: ${construction.copyLimit.message}`)
  else passed.push('Limite generale di quattro copie per nome')

  const promoByLine = new Map(promoAdmission.lines.map((line) => [line.lineNumber, line]))
  for (const line of rotation.lines) {
    if (line.status !== 'mark-accepted') toReview.push(`Riga ${line.lineNumber} — rotazione: ${line.message}`)
  }
  if (rotation.lines.length > 0 && rotation.lines.every((line) => line.status === 'mark-accepted')) {
    passed.push(`Marchi coperti dalla rotazione ${rotation.rule?.version ?? ''}`.trim())
  }
  for (const line of setAdmission.lines) {
    const result = promoByLine.get(line.lineNumber) ?? line
    if (result.status === 'waiting') problems.push(`Riga ${line.lineNumber} — ammissione: ${result.message}`)
    else if (result.status === 'indeterminate') toReview.push(`Riga ${line.lineNumber} — ammissione: ${result.message}`)
  }
  if (setAdmission.lines.length > 0 && setAdmission.lines.every((line) =>
    (promoByLine.get(line.lineNumber) ?? line).status === 'admitted')) {
    passed.push('Date di ammissione delle stampe identificate')
  }
  return { status: problems.length ? 'problem' : toReview.length ? 'review' : 'checks-passed',
    asOf, problems, toReview, passed, legality: 'indeterminate' }
}
