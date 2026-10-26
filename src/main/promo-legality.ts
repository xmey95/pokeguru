import { load } from 'cheerio'
import { readLimitedText } from './bounded-response'

export const PROMO_LEGALITY_SOURCE =
  'https://www.pokemon.com/uk/play-pokemon/about/pokemon-tcg-promo-card-legality-status'

export interface PromoRegistryEntry {
  code: string
  number: string
  state: 'available' | 'upcoming'
  legalDate: string | null
  dateNote: string | null
}

export interface PromoRegistry {
  checkedAt: string
  entries: Map<string, PromoRegistryEntry>
  series: string[]
}

export function promoKey(code: string, number: string): string {
  return `${code.trim().toUpperCase()}:${number.trim().toUpperCase().replace(/^0+(?=\d)/, '')}`
}

function parseCode(value: string): { code: string; number: string } | null {
  const match = /^([A-Z-]+)\s*([0-9]+[A-Z]?)$/i.exec(value.trim())
  return match ? { code: match[1].toUpperCase(), number: match[2].toUpperCase() } : null
}

function parseLegalDate(value: string): { legalDate: string | null; dateNote: string | null } {
  const date = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value)
  if (!date) {
    if (/^upon release$/i.test(value)) return { legalDate: null, dateNote: 'Upon Release' }
    throw new Error(`Data promo ufficiale non riconosciuta: ${value.slice(0, 40)}`)
  }
  const iso = `${date[3]}-${date[1].padStart(2, '0')}-${date[2].padStart(2, '0')}`
  if (new Date(`${iso}T00:00:00Z`).toISOString().slice(0, 10) !== iso) {
    throw new Error('Data promo ufficiale non valida.')
  }
  return { legalDate: iso, dateNote: null }
}

export function parsePromoRegistry(html: string, checkedAt: string): PromoRegistry {
  const $ = load(html)
  const entries = new Map<string, PromoRegistryEntry>()
  for (const [anchor, state, headers] of [
    ['#upcoming-promo-cards', 'upcoming', ['Card', 'Card Number', 'Legal Date']],
    ['#available-promo-cards', 'available', ['Card', 'Card Number']]
  ] as const) {
    const table = $(anchor).closest('div').next('div').find('table').first()
    const rows = table.find('tr')
    const observedHeaders = rows.first().find('td,th').map((_, cell) => $(cell).text().trim()).get()
    if (observedHeaders.join('|') !== headers.join('|')) throw new Error('Tabella promo ufficiale non riconosciuta.')
    rows.slice(1).each((_, row) => {
      const cells = $(row).find('td').map((__, cell) => $(cell).text().trim()).get()
      if (cells.length !== headers.length) throw new Error('Riga promo ufficiale incompleta.')
      const parsed = parseCode(cells[1])
      if (!parsed) {
        if (/^[—–-]$/.test(cells[1])) return
        throw new Error(`Codice promo ufficiale non riconosciuto: ${cells[1].slice(0, 40)}`)
      }
      const date = state === 'upcoming' ? parseLegalDate(cells[2]) : { legalDate: null, dateNote: null }
      const key = promoKey(parsed.code, parsed.number)
      if (entries.has(key)) throw new Error(`Codice promo duplicato nella fonte ufficiale: ${key}`)
      entries.set(key, { ...parsed, state, ...date })
    })
  }
  if (entries.size === 0) throw new Error('Nessuna promo nella fonte ufficiale.')
  return { checkedAt, entries, series: [...new Set([...entries.values()].map((entry) => entry.code))].sort() }
}

export async function fetchPromoRegistry(fetcher: typeof fetch = fetch): Promise<PromoRegistry> {
  let lastError: unknown
  for (const pause of [700, 1_800, 0]) {
    try {
      const response = await fetcher(PROMO_LEGALITY_SOURCE, {
        cache: 'no-store', signal: AbortSignal.timeout(12_000)
      })
      if (!response.ok) throw new Error(`Play! Pokémon: HTTP ${response.status}.`)
      const html = await readLimitedText(response, 1_000_000, 'Pagina promo ufficiale troppo grande.')
      return parsePromoRegistry(html, new Date().toISOString())
    } catch (error) {
      lastError = error
      if (pause) await new Promise((resolve) => setTimeout(resolve, pause))
    }
  }
  throw lastError
}
