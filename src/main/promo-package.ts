import bundled from './promo-status-western.json'
import { promoKey, type PromoRegistry, type PromoRegistryEntry } from './promo-legality'

interface PromoPackage {
  schema: 1
  version: number
  checkedAt: string
  sourceUrl: string
  complete: boolean
  availableRanges?: { code: string; first: number; last: number }[]
  entries: PromoRegistryEntry[]
}

const officialSources = new Set([
  'https://www.pokemon.com/us/play-pokemon/about/pokemon-tcg-promo-card-legality-status',
  bundled.sourceUrl
])

function parsePackage(value: unknown): PromoPackage {
  if (!value || typeof value !== 'object') throw new Error('Pacchetto promo non valido.')
  const pkg = value as PromoPackage
  if (pkg.schema !== 1 || !Number.isSafeInteger(pkg.version) || pkg.version < 1 ||
    !Number.isFinite(Date.parse(pkg.checkedAt)) ||
    !officialSources.has(pkg.sourceUrl) || typeof pkg.complete !== 'boolean' ||
    !Array.isArray(pkg.entries) || pkg.entries.length > 10_000 ||
    (pkg.availableRanges !== undefined && !Array.isArray(pkg.availableRanges))) throw new Error('Pacchetto promo non valido.')
  const entries = [...pkg.entries]
  for (const range of pkg.availableRanges ?? []) {
    if (!range || !/^[A-Z-]{2,12}$/.test(range.code) ||
      !Number.isSafeInteger(range.first) || !Number.isSafeInteger(range.last) ||
      range.first < 1 || range.last < range.first || range.last - range.first > 1_000 ||
      entries.length + range.last - range.first + 1 > 10_000) throw new Error('Intervallo promo non valido.')
    for (let number = range.first; number <= range.last; number++) {
      entries.push({ code: range.code, number: String(number).padStart(3, '0'),
        state: 'available', legalDate: null, dateNote: null })
    }
  }
  const seen = new Set<string>()
  for (const entry of entries) {
    if (!/^[A-Z-]{2,12}$/.test(entry.code) || !/^\d+[A-Z]?$/.test(entry.number) ||
      !['available', 'upcoming'].includes(entry.state) ||
      (entry.legalDate !== null && !/^\d{4}-\d{2}-\d{2}$/.test(entry.legalDate)) ||
      (entry.dateNote !== null && entry.dateNote !== 'Upon Release')) throw new Error('Voce promo non valida.')
    const key = promoKey(entry.code, entry.number)
    if (seen.has(key)) throw new Error('Codice promo duplicato.')
    seen.add(key)
  }
  return { ...pkg, entries }
}

export function loadPromoPackage(): {
  registry: PromoRegistry & { complete: boolean; version: number }; error: string | null
} {
  const selected = parsePackage(bundled)
  return { registry: {
    checkedAt: selected.checkedAt,
    entries: new Map(selected.entries.map((entry) => [promoKey(entry.code, entry.number), entry])),
    series: [...new Set(selected.entries.map((entry) => entry.code))].sort(),
    complete: selected.complete, version: selected.version
  }, error: null }
}
