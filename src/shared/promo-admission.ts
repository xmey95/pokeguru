import type { CatalogView } from './catalog'
import type { DeckBaseline, DeckLine } from './deck-import'
import { suggestPrints } from './reconciliation'

export type PromoAdmissionStatus = 'admitted' | 'waiting' | 'indeterminate'

export interface PromoAdmissionLine {
  lineNumber: number
  quantity: number
  printId: string | null
  status: PromoAdmissionStatus
  message: string
}

export interface PromoAdmissionEvaluation {
  circuit: 'WESTERN'
  asOf: string
  packageVersion: number | null
  checkedAt: string | null
  lines: PromoAdmissionLine[]
  counts: Record<PromoAdmissionStatus, number>
}

function evaluateLine(line: DeckLine, catalog: CatalogView | null, asOf: string,
  validDate: boolean): PromoAdmissionLine | null {
  const matches = catalog?.syncedAt ? suggestPrints(line, catalog).filter((item) => item.reason === 'same-print') : []
  if (matches.length !== 1) return null
  const print = matches[0].print
  if (!print.isPromo) return null
  const base = { lineNumber: line.lineNumber, quantity: line.quantity ?? 0, printId: print.id }
  if (!validDate) return { ...base, status: 'indeterminate', message: 'Data di riferimento non valida.' }
  const promo = print.promoStatus
  if (!promo) return { ...base, status: 'indeterminate', message: 'Promo non classificata nel registro ufficiale locale.' }
  if (promo.state === 'available') {
    const observedDate = promo.checkedAt.slice(0, 10)
    return asOf >= observedDate
      ? { ...base, status: 'admitted', message: `Promo disponibile nel registro osservato il ${observedDate}; non prova la data storica.` }
      : { ...base, status: 'indeterminate', message: `Promo disponibile al ${observedDate}, ma la data storica di ammissione non è indicata.` }
  }
  if (promo.state === 'upcoming') {
    if (!promo.legalDate) return { ...base, status: 'indeterminate',
      message: `Promo futura: ${promo.dateNote ?? 'data non indicata'}.` }
    return asOf < promo.legalDate
      ? { ...base, status: 'waiting', message: `Promo non ancora ammessa: data indicata ${promo.legalDate}.` }
      : { ...base, status: 'indeterminate',
        message: `Il pacchetto la indicava futura per il ${promo.legalDate}; aggiornare il registro per confermare.` }
  }
  return { ...base, status: 'indeterminate', message: 'Promo non elencata nel registro ufficiale osservato.' }
}

export function evaluatePromoAdmission(baseline: DeckBaseline, catalog: CatalogView | null,
  asOf: string): PromoAdmissionEvaluation {
  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(asOf) &&
    !Number.isNaN(Date.parse(`${asOf}T00:00:00Z`)) &&
    new Date(`${asOf}T00:00:00Z`).toISOString().slice(0, 10) === asOf
  const lines = baseline.lines.filter((line) => line.kind === 'card')
    .map((line) => evaluateLine(line, catalog, asOf, validDate))
    .filter((line): line is PromoAdmissionLine => line !== null)
  const counts: PromoAdmissionEvaluation['counts'] = { admitted: 0, waiting: 0, indeterminate: 0 }
  for (const line of lines) counts[line.status] += line.quantity
  return { circuit: 'WESTERN', asOf, packageVersion: catalog?.promoAudit?.packageVersion ?? null,
    checkedAt: catalog?.promoAudit?.checkedAt ?? null, lines, counts }
}
