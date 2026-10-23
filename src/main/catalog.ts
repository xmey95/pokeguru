import { createHash } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import {
  CATALOG_NAMES, CATALOG_SET_IDS, CATALOG_SOURCE,
  type CatalogPrint, type CatalogSet, type CatalogView
} from '../shared/catalog'

type SetResponse = {
  id: string; name: string; cardCount: { total: number }
  cards: { id: string; localId: string; name: string }[]
}
type CardResponse = {
  id: string; localId: string; name: string; category?: string; rarity?: string
  trainerType?: string; effect?: string; image?: string; updated?: string
  variants?: Record<string, boolean>
}

const apiOrigin = 'https://api.tcgdex.net/v2/en'
const assetOrigin = 'https://assets.tcgdex.net'
const selectedNames = new Set<string>(CATALOG_NAMES)

async function request(url: string, method: 'GET' | 'HEAD' = 'GET'): Promise<Response> {
  const response = await fetch(url, { method, signal: AbortSignal.timeout(12_000) })
  if (!response.ok) throw new Error(`TCGdex: HTTP ${response.status} per ${new URL(url).pathname}`)
  return response
}

async function json<T>(url: string): Promise<T> {
  const response = await request(url)
  const length = Number(response.headers.get('content-length') ?? 0)
  if (length > 2_000_000) throw new Error('Risposta TCGdex troppo grande.')
  const body = await response.text()
  if (body.length > 2_000_000) throw new Error('Risposta TCGdex troppo grande.')
  return JSON.parse(body) as T
}

function validateSet(value: SetResponse, id: string): void {
  if (value.id !== id || !value.name || !Number.isInteger(value.cardCount?.total) ||
    value.cardCount.total < 1 || !Array.isArray(value.cards) ||
    value.cards.some((card) => typeof card.id !== 'string' || typeof card.localId !== 'string' || typeof card.name !== 'string')) {
    throw new Error(`Indice TCGdex non valido per ${id}.`)
  }
}

function identity(card: CardResponse): Pick<CatalogPrint, 'identityId' | 'identityBasis'> {
  // The shared identity is a provisional gameplay-text match, never a legality ruling.
  // For Pokémon or absent rules text, keep every printing separate pending review.
  if (card.category === 'Trainer' && card.name && card.trainerType && card.effect?.trim()) {
    const signature = [card.category, card.name.trim(), card.trainerType, card.effect.trim()].join('\u001f')
    return { identityId: `trainer-${createHash('sha256').update(signature).digest('hex').slice(0, 24)}`, identityBasis: 'trainer-text' }
  }
  return { identityId: card.id, identityBasis: 'unverified' }
}

async function imageStatus(base: string | undefined): Promise<Pick<CatalogPrint, 'thumbnail' | 'highImageAvailable'>> {
  if (!base || !base.startsWith(`${assetOrigin}/`)) return { thumbnail: null, highImageAvailable: null }
  const [low, high] = await Promise.allSettled([
    request(`${base}/low.webp`).then(async (response) => {
      const bytes = new Uint8Array(await response.arrayBuffer())
      if (bytes.length > 250_000 || response.headers.get('content-type')?.split(';')[0] !== 'image/webp') return null
      return `data:image/webp;base64,${Buffer.from(bytes).toString('base64')}`
    }),
    request(`${base}/high.webp`, 'HEAD').then(() => true)
  ])
  return {
    thumbnail: low.status === 'fulfilled' ? low.value : null,
    highImageAvailable: high.status === 'fulfilled' ? high.value
      : high.reason instanceof Error && high.reason.message.includes('HTTP 404') ? false : null
  }
}

async function details(brief: SetResponse['cards'][number], set: SetResponse, fetchedAt: string): Promise<CatalogPrint> {
  const base: CatalogPrint = {
    id: brief.id, setId: set.id, setName: set.name, localId: brief.localId,
    name: brief.name, category: null, rarity: null, variants: null,
    identityId: null, identityBasis: null, imageBase: null, thumbnail: null,
    highImageAvailable: null, sourceUpdated: null,
    sourceUrl: `${apiOrigin}/cards/${encodeURIComponent(brief.id)}`,
    detailAt: null, error: null
  }
  try {
    const card = await json<CardResponse>(base.sourceUrl)
    if (card.id !== brief.id || card.name !== brief.name || card.localId !== brief.localId) {
      throw new Error('Dettaglio incoerente con l’indice.')
    }
    const images = await imageStatus(card.image)
    return {
      ...base, category: card.category ?? null, rarity: card.rarity ?? null,
      variants: card.variants ?? null, ...identity(card),
      imageBase: card.image ?? null, ...images,
      sourceUpdated: card.updated ?? null, detailAt: fetchedAt
    }
  } catch (error) {
    return { ...base, error: error instanceof Error ? error.message : 'Dettaglio non disponibile.' }
  }
}

async function mapLimited<T, R>(values: T[], limit: number, action: (item: T) => Promise<R>): Promise<R[]> {
  const result = new Array<R>(values.length)
  let next = 0
  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, async () => {
    while (next < values.length) {
      const index = next++
      result[index] = await action(values[index])
    }
  }))
  return result
}

export async function fetchCatalogSample(): Promise<{ sets: CatalogSet[]; prints: CatalogPrint[]; fetchedAt: string }> {
  const fetchedAt = new Date().toISOString()
  const responses = await Promise.all(CATALOG_SET_IDS.map(async (id) => {
    const value = await json<SetResponse>(`${apiOrigin}/sets/${id}`)
    validateSet(value, id)
    return value
  }))
  const sets = responses.map((set) => ({
    id: set.id, name: set.name, sourceTotal: set.cardCount.total,
    sampleTotal: set.cards.filter((card) => selectedNames.has(card.name)).length,
    fetchedAt
  }))
  const selected = responses.flatMap((set) => set.cards.filter((card) => selectedNames.has(card.name)).map((card) => ({ set, card })))
  const prints = await mapLimited(selected, 5, ({ set, card }) => details(card, set, fetchedAt))
  return { sets, prints, fetchedAt }
}

export class CatalogStore {
  private readonly db: DatabaseSync

  constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true })
    this.db = new DatabaseSync(path)
    this.db.exec('PRAGMA journal_mode = WAL')
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS catalog_sets (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, source_total INTEGER NOT NULL,
        sample_total INTEGER NOT NULL, fetched_at TEXT NOT NULL
      ) STRICT;
      CREATE TABLE IF NOT EXISTS catalog_prints (
        id TEXT PRIMARY KEY, set_id TEXT NOT NULL REFERENCES catalog_sets(id), payload TEXT NOT NULL
      ) STRICT;
      CREATE TABLE IF NOT EXISTS catalog_sync (
        id INTEGER PRIMARY KEY CHECK (id = 1), fetched_at TEXT NOT NULL
      ) STRICT;
    `)
  }

  save(sample: { sets: CatalogSet[]; prints: CatalogPrint[]; fetchedAt: string }): CatalogView {
    this.db.exec('BEGIN IMMEDIATE')
    try {
      for (const set of sample.sets) {
        this.db.prepare(`INSERT INTO catalog_sets VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET name=excluded.name, source_total=excluded.source_total,
          sample_total=excluded.sample_total, fetched_at=excluded.fetched_at`)
          .run(set.id, set.name, set.sourceTotal, set.sampleTotal, set.fetchedAt)
      }
      for (const print of sample.prints) {
        const previous = this.db.prepare('SELECT payload FROM catalog_prints WHERE id = ?').get(print.id) as { payload: string } | undefined
        // A failed refresh does not discard a previously acquired detail or cached image.
        const old = previous ? JSON.parse(previous.payload) as CatalogPrint : null
        const value = print.detailAt === null && old?.detailAt ? { ...old, error: print.error }
          : print.detailAt && old?.thumbnail && !print.thumbnail && old.imageBase === print.imageBase
            ? { ...print, thumbnail: old.thumbnail, highImageAvailable: print.highImageAvailable ?? old.highImageAvailable }
            : print
        this.db.prepare(`INSERT INTO catalog_prints VALUES (?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET set_id=excluded.set_id, payload=excluded.payload`)
          .run(print.id, print.setId, JSON.stringify(value))
      }
      this.db.prepare(`INSERT INTO catalog_sync VALUES (1, ?)
        ON CONFLICT(id) DO UPDATE SET fetched_at=excluded.fetched_at`).run(sample.fetchedAt)
      this.db.exec('COMMIT')
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
    return this.view()
  }

  view(): CatalogView {
    const sets = this.db.prepare('SELECT id, name, source_total, sample_total, fetched_at FROM catalog_sets ORDER BY id')
      .all().map((row) => {
        const item = row as { id: string; name: string; source_total: number; sample_total: number; fetched_at: string }
        return { id: item.id, name: item.name, sourceTotal: item.source_total, sampleTotal: item.sample_total, fetchedAt: item.fetched_at }
      })
    const prints = this.db.prepare('SELECT payload FROM catalog_prints ORDER BY id')
      .all().map((row) => JSON.parse((row as { payload: string }).payload) as CatalogPrint)
    const sync = this.db.prepare('SELECT fetched_at FROM catalog_sync WHERE id = 1').get() as { fetched_at: string } | undefined
    return {
      circuit: 'WESTERN', source: CATALOG_SOURCE, sourceLanguage: 'en',
      scope: { setIds: CATALOG_SET_IDS, names: CATALOG_NAMES },
      syncedAt: sync?.fetched_at ?? null, sets, prints
    }
  }

  getPrint(id: string): CatalogPrint | null {
    if (typeof id !== 'string' || id.length > 100) return null
    const row = this.db.prepare('SELECT payload FROM catalog_prints WHERE id = ?').get(id) as { payload: string } | undefined
    return row ? JSON.parse(row.payload) as CatalogPrint : null
  }

  close(): void { this.db.close() }
}
