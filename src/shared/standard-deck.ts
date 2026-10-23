import type { CatalogView } from './catalog'
import type { DeckBaseline } from './deck-import'
import { evaluateDeckConstruction } from './deck-construction'
import { evaluateWesternRotation } from './standard-rotation'
import { evaluateSetAdmission } from './standard-admission'
import { evaluatePromoAdmission } from './promo-admission'
import { STANDARD_RULE_PACKAGE_VERSION, type StandardRuleAudit } from './standard-rule-audit'
import { BUNDLED_WESTERN_RULE_PACKAGE } from './western-rule-package'

export type StandardDeckStatus = 'problem' | 'review' | 'checks-passed'

export interface StandardDeckEvaluation {
  status: StandardDeckStatus
  asOf: string
  problems: string[]
  toReview: string[]
  passed: string[]
  /** A positive result concerns this versioned list and rule snapshot, not physical card checks. */
  legality: 'supported' | 'invalid' | 'indeterminate'
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
  const rules = catalog?.rulePackage ?? BUNDLED_WESTERN_RULE_PACKAGE
  if (catalog?.rulePackageError) toReview.push(catalog.rulePackageError)
  if (audit && (audit.status === 'changed' ||
    audit.packageVersion !== (catalog?.rulePackage?.version ?? STANDARD_RULE_PACKAGE_VERSION)))
    toReview.push('Le fonti ufficiali non confermano il pacchetto di regole locale: ricontrollare nel Catalogo.')
  if (asOf < rules.standardBans.checkedAt) {
    toReview.push(`Elenco delle carte vietate verificato solo dal ${rules.standardBans.checkedAt}: data storica da verificare.`)
  } else {
    const banned = new Set(rules.standardBans.cardNames.map((name) =>
      name.normalize('NFKC').trim().toLocaleLowerCase()))
    let bannedHits = 0
    for (const line of baseline.lines.filter((item) => item.kind === 'card')) {
      if (banned.has((line.name ?? '').normalize('NFKC').trim().toLocaleLowerCase())) {
        bannedHits += 1
        problems.push(`Riga ${line.lineNumber} — ${line.name}: carta vietata nel pacchetto Standard ${rules.version}.`)
      }
    }
    if (bannedHits === 0) passed.push(`Nessuna carta vietata nello snapshot ${rules.standardBans.checkedAt}`)
  }

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
  const status = problems.length ? 'problem' : toReview.length ? 'review' : 'checks-passed'
  return { status, asOf, problems, toReview, passed,
    legality: status === 'problem' ? 'invalid' : status === 'checks-passed' &&
      catalog?.scope.kind === 'standard-marks' ? 'supported' : 'indeterminate' }
}
