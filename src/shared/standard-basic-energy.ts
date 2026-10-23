import type { CatalogView, CatalogPrint } from './catalog'
import type { DeckLine } from './deck-import'
import { suggestPrints } from './reconciliation'

// Current Basic Energy prints were observed in the Standard catalog. The
// product does not assert their historical admission before this date.
export const BASIC_ENERGY_OBSERVED_AT = '2026-10-23'

export function currentBasicEnergy(line: DeckLine, catalog: CatalogView | null,
  asOf: string): CatalogPrint | null {
  if (asOf < BASIC_ENERGY_OBSERVED_AT || !catalog?.syncedAt) return null
  const exact = suggestPrints(line, catalog).filter((candidate) => candidate.reason === 'same-print')
  if (exact.length !== 1) return null
  const print = exact[0].print
  return print.detailAt && (print.setId === 'sve' || print.setId === 'mee') &&
    print.category === 'Energy' && print.energyType?.toLowerCase() === 'normal' ? print : null
}
