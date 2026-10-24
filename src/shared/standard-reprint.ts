import type { CatalogPrint, CatalogView } from './catalog'
import type { RulePeriod, WesternRulePackage } from './western-rule-package'

/** A stored historical Trainer print can use an admitted, text-identical current print.
 * Name alone never proves equivalence; this does not fetch or certify older sets.
 */
export function admittedTrainerReprint(print: CatalogPrint, catalog: CatalogView,
  rule: RulePeriod, rules: WesternRulePackage, asOf: string):
    { print: CatalogPrint; legalDate: string } | null {
  if (!print.detailAt || !print.identityId || print.identityBasis !== 'trainer-text' ||
    print.category !== 'Trainer' || !print.regulationMark ||
    print.regulationMark >= rule.firstAllowedMark) return null
  for (const current of catalog.prints) {
    if (!current.detailAt || current.isPromo || current.category !== 'Trainer' ||
      current.identityBasis !== 'trainer-text' || current.identityId !== print.identityId ||
      current.name.normalize('NFKC').toLowerCase() !== print.name.normalize('NFKC').toLowerCase() ||
      !current.regulationMark || current.regulationMark < rule.firstAllowedMark ||
      current.regulationMark > rule.lastConfirmedMark) continue
    const admission = rules.setAdmissions.find((item) => item.setId === current.setId)
    if (admission && admission.legalDate <= asOf) return { print: current, legalDate: admission.legalDate }
  }
  return null
}
