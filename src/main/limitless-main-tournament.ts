import { createHash } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'
import { load } from 'cheerio'
import type { MainTournamentEntry, MainTournamentSnapshot } from '../shared/main-tournament'
import type { TournamentCard } from '../shared/tournament'
import { readLimitedText } from './bounded-response'

const ROOT = 'https://limitlesstcg.com'
const COUNTRY = new Set('US CA MX BR AR CL CO PE UY PY BO EC VE CR PA GT SV HN NI DO PR FR GB DE IT ES PT NL BE CH AT PL CZ SK HU RO BG GR DK NO SE FI IE IS LU SI HR RS EE LV LT UA TR AU NZ'.split(' '))
const MONTHS = new Map('Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec'.split(' ').map((month, index) => [month, index]))
const EVENT_NAME = /^(Regional |Special Event |World Championships|NAIC |LAIC |EUIC |OCIC |International )/i
let lastRequestAt = 0

export class MainLimitlessRateLimitError extends Error {
  constructor(readonly retryAt: string) { super('Limitless ha limitato le richieste ai tornei principali.') }
}

async function getHtml(path: string, fetcher: typeof fetch = fetch): Promise<string> {
  if (!/^\/(tournaments(?:\/\d+)?|decks\/list\/\d+)(?:\?.*)?$/.test(path))
    throw new Error('Percorso Limitless non valido.')
  if (fetcher === fetch) {
    const wait = Math.max(0, 1_200 - (Date.now() - lastRequestAt))
    if (wait) await delay(wait)
    lastRequestAt = Date.now()
  }
  const response = await fetcher(`${ROOT}${path}`, {
    signal: AbortSignal.timeout(20_000), headers: { 'User-Agent': 'Pokeguru/0.1 (public tournament reader)' }
  })
  if (response.status === 429) {
    const seconds = Number(response.headers.get('retry-after')) || 300
    throw new MainLimitlessRateLimitError(new Date(Date.now() + Math.max(1, Math.min(seconds, 3600)) * 1000).toISOString())
  }
  if (!response.ok) throw new Error(`Limitless principale: HTTP ${response.status}.`)
  const html = await readLimitedText(response, 1_500_000, 'Pagina torneo Limitless troppo grande.')
  return html
}

function parseDate(value: string): string | null {
  const match = value.trim().match(/^(\d{1,2}) ([A-Za-z]{3}) (\d{2})$/)
  const month = match ? MONTHS.get(match[2]) : undefined
  if (!match || month === undefined) return null
  const date = new Date(Date.UTC(2000 + Number(match[3]), month, Number(match[1])))
  return date.getUTCDate() === Number(match[1]) ? date.toISOString() : null
}

export function parseMainTournamentIndex(html: string): MainTournamentEntry[] {
  const $ = load(html)
  if (!$('[data-selection] [data-key="format"][data-value="standard"]').length)
    throw new Error('Il filtro Standard dei tornei Limitless non è confermato.')
  if (!$('table').first().find('tr').length) throw new Error('Indice Regional Limitless non leggibile.')
  const entries: MainTournamentEntry[] = []
  $('table').first().find('tr').each((_, row) => {
    const cells = $(row).find('td')
    if (cells.length < 5 || cells.eq(3).find('img[alt="standard"]').length === 0) return
    const link = cells.eq(2).find('a[href^="/tournaments/"]').first()
    const path = link.attr('href') ?? ''
    const date = parseDate(cells.eq(0).text())
    const country = cells.eq(1).find('img.flag').attr('alt') ?? ''
    const name = link.text().replace(/\s+/g, ' ').trim()
    const players = Number(cells.eq(4).text().trim().replace(/,/g, ''))
    if (!/^\/tournaments\/\d+$/.test(path) || !date || !COUNTRY.has(country) ||
      !EVENT_NAME.test(name) || !Number.isInteger(players) || players < 8) return
    entries.push({ eventId: path.slice('/tournaments/'.length), name, date, country, players,
      url: `${ROOT}${path}` })
  })
  if (new Set(entries.map((entry) => entry.eventId)).size !== entries.length)
    throw new Error('Indice Regional Limitless non leggibile.')
  return entries
}

export function parseMainTournament(html: string, entry: MainTournamentEntry,
  fetchedAt = new Date().toISOString()): MainTournamentSnapshot {
  const $ = load(html)
  if (!$('title').text().includes(entry.name)) throw new Error('La pagina evento non corrisponde all’indice.')
  const participants: MainTournamentSnapshot['participants'] = []
  $('table').first().find('tr').each((_, row) => {
    const cells = $(row).find('td')
    if (cells.length < 5) return
    const placing = Number(cells.eq(0).text().trim())
    const player = cells.eq(1).find('a[href^="/players/"]').first()
    const playerName = player.text().replace(/\s+/g, ' ').trim()
    const playerPath = player.attr('href') ?? ''
    const country = cells.eq(2).find('img.flag').attr('alt') ?? null
    const deck = cells.eq(3).find('a[href^="/decks/"]').first()
    const deckPath = deck.attr('href') ?? ''
    const deckName = deck.find('[data-tooltip]').first().attr('data-tooltip') ?? null
    const listPath = cells.eq(4).find('a[href^="/decks/list/"]').first().attr('href') ?? ''
    if (!Number.isInteger(placing) || placing < 1 || !playerName || playerName.length > 160) return
    participants.push({ placing, playerName, playerId: /^\/players\/\d+$/.test(playerPath)
      ? playerPath.slice('/players/'.length) : null,
    country: country && /^[A-Z]{2}$/.test(country) ? country : null,
    deckId: /^\/decks\/\d+(?:\?.*)?$/.test(deckPath) ? deckPath.match(/^\/decks\/(\d+)/)?.[1] ?? null : null,
    deckName: deckName?.slice(0, 160) ?? null,
    listId: /^\/decks\/list\/\d+$/.test(listPath) ? listPath.slice('/decks/list/'.length) : null,
    listUrl: /^\/decks\/list\/\d+$/.test(listPath) ? `${ROOT}${listPath}` : null,
    cards: null, cardTotal: null })
  })
  if (!participants.length || participants.length > entry.players ||
    new Set(participants.map((item) => item.placing)).size !== participants.length)
    throw new Error('Risultati del Regional non completi o incoerenti.')
  return completeMainTournament({ ...entry, id: '', fetchedAt, source: 'Limitless tournament database',
    circuit: 'WESTERN', format: 'STANDARD', type: 'IN_PERSON', participants,
    coverage: { returnedParticipants: 0, listedDecks: 0, fetchedLists: 0, complete60Lists: 0, noListLink: 0 }, cached: false })
}

export function parseMainDecklist(html: string): { cards: TournamentCard[]; total: number } {
  const $ = load(html)
  const root = $('[data-text-decklist]').first()
  if (!root.length) throw new Error('Lista del Regional non leggibile.')
  const cards: TournamentCard[] = []
  root.find('.decklist-column').each((_, column) => {
    const heading = $(column).find('.decklist-column-heading').first().text().trim().toLowerCase()
    const category: TournamentCard['category'] | null = heading.startsWith('pokémon') || heading.startsWith('pokemon')
      ? 'pokemon' : heading.startsWith('trainer') ? 'trainer' : heading.startsWith('energy') ? 'energy' : null
    if (!category) return
    $(column).find('.decklist-card').each((_, element) => {
      const count = Number($(element).find('.card-count').first().text().trim())
      const name = $(element).find('.card-name').first().text().replace(/\s+/g, ' ').trim()
      const set = $(element).attr('data-set') ?? ''
      const number = $(element).attr('data-number') ?? ''
      if (!Number.isInteger(count) || count < 1 || count > 60 || !name || name.length > 160 ||
        !/^[A-Za-z0-9.]{1,12}$/.test(set) || !/^[A-Za-z0-9]{1,12}$/.test(number))
        throw new Error('Carta della lista Regional non leggibile.')
      cards.push({ category, count, name, set, number })
    })
  })
  const total = cards.reduce((sum, card) => sum + card.count, 0)
  if (!cards.length || total > 60) throw new Error('Totale della lista Regional non valido.')
  return { cards, total }
}

export function completeMainTournament(snapshot: MainTournamentSnapshot): MainTournamentSnapshot {
  const coverage = {
    returnedParticipants: snapshot.participants.length,
    listedDecks: snapshot.participants.filter((item) => item.deckId !== null).length,
    fetchedLists: snapshot.participants.filter((item) => item.cards !== null).length,
    complete60Lists: snapshot.participants.filter((item) => item.cardTotal === 60).length,
    noListLink: snapshot.participants.filter((item) => item.listId === null).length
  }
  const id = createHash('sha256').update(JSON.stringify({ eventId: snapshot.eventId,
    participants: snapshot.participants, coverage })).digest('hex')
  return { ...snapshot, id, coverage }
}

export async function fetchMainTournamentIndex(page = 1, fetcher: typeof fetch = fetch): Promise<MainTournamentEntry[]> {
  if (!Number.isInteger(page) || page < 1 || page > 100) throw new Error('Pagina Regional non valida.')
  return (await fetchMainTournamentIndexPage(page, fetcher)).entries
}

export async function fetchMainTournamentIndexPage(page = 1, fetcher: typeof fetch = fetch): Promise<{
  entries: MainTournamentEntry[]; maxPages: number
}> {
  if (!Number.isInteger(page) || page < 1 || page > 100) throw new Error('Pagina Regional non valida.')
  const html = await getHtml(`/tournaments?format=standard&time=all&page=${page}`, fetcher)
  const pages = Number(load(html)('.pagination[data-max]').first().attr('data-max') ?? '1')
  if (!Number.isInteger(pages) || pages < 1 || pages > 100) throw new Error('Paginazione Regional non leggibile.')
  return { entries: parseMainTournamentIndex(html), maxPages: pages }
}

export async function fetchMainTournament(entry: MainTournamentEntry, fetcher: typeof fetch = fetch): Promise<MainTournamentSnapshot> {
  if (!/^\d+$/.test(entry.eventId)) throw new Error('ID Regional non valido.')
  return parseMainTournament(await getHtml(`/tournaments/${entry.eventId}`, fetcher), entry)
}

export async function fetchMainDecklist(listId: string, fetcher: typeof fetch = fetch): Promise<{ cards: TournamentCard[]; total: number }> {
  if (!/^\d+$/.test(listId)) throw new Error('ID lista Regional non valido.')
  return parseMainDecklist(await getHtml(`/decks/list/${listId}`, fetcher))
}
