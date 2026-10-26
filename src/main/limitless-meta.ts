import { createHash } from 'node:crypto'
import { load } from 'cheerio'
import type { MetaDeck, MetaSnapshot } from '../shared/meta-matchups'
import { readLimitedText } from './bounded-response'

// Exclude Asia and Other: the first release covers the Western circuit only.
export const META_URL = 'https://limitlesstcg.com/decks?format=standard&time=1months&region=eu,na,la,oc&show=100'
const REGION_CODES = ['eu', 'na', 'la', 'oc']

async function getHtml(url: string): Promise<string> {
  const response = await fetch(url, { signal: AbortSignal.timeout(15_000), headers: { 'User-Agent': 'Pokeguru/0.1 (metagame reader)' } })
  if (!response.ok) throw new Error(`Limitless non disponibile (HTTP ${response.status}).`)
  return readLimitedText(response, 1_000_000, 'Risposta Limitless troppo grande.')
}

export function parseMeta(html: string, fetchedAt = new Date().toISOString()): MetaSnapshot {
  const $ = load(html)
  const selected = $('[data-selection] [data-key]')
  const values = (key: string): string[] => selected.filter((_, element) => $(element).attr('data-key') === key)
    .map((_, element) => $(element).attr('data-value') ?? '').get()
  if (!values('format').includes('standard') || !values('time').includes('1months') ||
    REGION_CODES.some((region) => !values('region').includes(region)) || values('region').length !== 4) {
    throw new Error('I filtri restituiti da Limitless non corrispondono a Standard occidentale nel mese passato.')
  }
  const decks: MetaDeck[] = []
  $('table.data-table.striped').first().find('tr').each((_, row) => {
    const cells = $(row).find('td')
    if (cells.length !== 5) return
    const link = cells.eq(2).find('a[href^="/decks/"]').first()
    const path = link.attr('href') ?? ''
    if (!/^\/decks\/\d+$/.test(path)) return
    const name = link.text().replace(/\s+/g, ' ').trim()
    const points = Number(cells.eq(3).text().trim().replace(/,/g, ''))
    const share = Number(cells.eq(4).text().trim().replace('%', ''))
    if (!name || !Number.isFinite(points) || !Number.isFinite(share) || share < 0 || share > 100) return
    decks.push({ id: path.slice('/decks/'.length), name, points, share, url: `https://limitlesstcg.com${path}` })
  })
  if (decks.length === 0 || new Set(decks.map((deck) => deck.id)).size !== decks.length) {
    throw new Error('La tabella Metagame di Limitless non è leggibile.')
  }
  const id = createHash('sha256').update(JSON.stringify(decks)).digest('hex')
  return { id, fetchedAt, sourceUrl: META_URL, period: 'Ultimo mese', circuit: 'WESTERN', format: 'STANDARD', decks, cached: false }
}

export async function fetchMeta(): Promise<MetaSnapshot> {
  const html = await getHtml(META_URL)
  const first = parseMeta(html)
  const $ = load(html)
  const pages = Number($('.pagination[data-max]').first().attr('data-max') ?? '1')
  if (!Number.isInteger(pages) || pages < 1 || pages > 10) throw new Error('Paginazione Limitless inattesa: impossibile acquisire il meta completo.')
  if (pages === 1) return first
  const decks = [...first.decks]
  for (let page = 2; page <= pages; page++) {
    const next = parseMeta(await getHtml(`${META_URL}&page=${page}`))
    decks.push(...next.decks)
  }
  if (new Set(decks.map((deck) => deck.id)).size !== decks.length) {
    throw new Error('Archetipi duplicati tra le pagine Limitless.')
  }
  return { ...first, decks, id: createHash('sha256').update(JSON.stringify(decks)).digest('hex') }
}

export async function fetchOpponentSample(deck: MetaDeck): Promise<{ url: string | null; cards: string[] }> {
  if (!/^\d+$/.test(deck.id)) throw new Error('Archetipo Limitless non valido.')
  const page = load(await getHtml(`https://limitlesstcg.com/decks/${deck.id}?format=standard&time=1months&region=eu,na,la,oc`))
  const path = page('a[href^="/decks/list/"]').first().attr('href')
  if (!path || !/^\/decks\/list\/\d+$/.test(path)) return { url: null, cards: [] }
  const url = `https://limitlesstcg.com${path}`
  const $ = load(await getHtml(url))
  const cards: string[] = []
  $('[data-text-decklist] .decklist-card').each((_, element) => {
    const count = $(element).find('.card-count').first().text().trim()
    const name = $(element).find('.card-name').first().text().replace(/\s+/g, ' ').trim()
    if (/^\d{1,2}$/.test(count) && name && cards.length < 100) cards.push(`${count} ${name}`)
  })
  return { url, cards }
}
