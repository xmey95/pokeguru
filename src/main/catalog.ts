import { createHash } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { isDeepStrictEqual } from 'node:util'
import {
  CATALOG_GAMEPLAY_SCHEMA_VERSION, CATALOG_NAMES, CATALOG_SET_IDS, CATALOG_SOURCE,
  type CardGameplay, type CatalogPrint, type CatalogSet, type CatalogView, type PromoAudit,
  type CatalogSyncMode, type CatalogSyncStatus
} from '../shared/catalog'
import { extractCardGameplay, hasComparableGameplay } from '../shared/card-gameplay'
import { promoKey, PROMO_LEGALITY_SOURCE } from './promo-legality'
import { loadPromoPackage } from './promo-package'
import { OFFICIAL_SET_RELEASE_CHECKED_AT, OFFICIAL_SET_RELEASE_SOURCE,
  OFFICIAL_SET_RELEASE_VERSION, officialSetRelease, officialSetReleases } from './official-set-releases'
import { BUNDLED_WESTERN_RULE_PACKAGE,
  type WesternRulePackage } from '../shared/western-rule-package'

type SetResponse = {
  id: string; name: string; cardCount: { total: number }; releaseDate?: string
  abbreviation?: { official?: string }
  cards: CardBrief[]
}
type CardBrief = { id: string; localId: string; name: string; image?: string }
type SetBrief = { id: string; name: string; cardCount: { total: number }; releaseDate?: string }
type CardResponse = {
  id: string; localId: string; name: string; category?: string; rarity?: string
  regulationMark?: string
  stage?: string; energyType?: string
  trainerType?: string; effect?: string; image?: string; updated?: string
  variants?: Record<string, boolean>
  hp?: number; types?: string[]; evolveFrom?: string; retreat?: number
  attacks?: { name?: string; cost?: string[]; damage?: number | string; effect?: string }[]
  abilities?: { name?: string; effect?: string; type?: string }[]
  weaknesses?: { type?: string; value?: string }[]
  resistances?: { type?: string; value?: string }[]
}

const apiOrigin = 'https://api.tcgdex.net/v2/en'
const assetOrigin = 'https://assets.tcgdex.net'
const selectedNames = new Set<string>(CATALOG_NAMES)
const candidateMarks = Array.from({ length: 'Z'.charCodeAt(0) - 'H'.charCodeAt(0) + 1 },
  (_, index) => String.fromCharCode('H'.charCodeAt(0) + index))

type StandardManifest = { sets: CatalogSet[]; prints: CatalogPrint[]; fetchedAt: string; promoAudit: PromoAudit }

async function request(url: string, method: 'GET' | 'HEAD' = 'GET'): Promise<Response> {
  const pauses = [500, 1_500, 4_000]
  for (let attempt = 0; attempt <= pauses.length; attempt += 1) {
    const response = await fetch(url, { method, signal: AbortSignal.timeout(12_000) })
    if (response.ok) return response
    if (![429, 503].includes(response.status) || attempt === pauses.length) {
      throw new Error(`TCGdex: HTTP ${response.status} per ${new URL(url).pathname}`)
    }
    const retry = response.headers.get('retry-after')
    const seconds = retry && /^\d+$/.test(retry) ? Number(retry) * 1000 : 0
    const date = retry && !seconds ? Date.parse(retry) - Date.now() : 0
    await new Promise((resolve) => setTimeout(resolve,
      Math.min(30_000, Math.max(pauses[attempt], seconds || date || 0))))
  }
  throw new Error('TCGdex non disponibile.')
}

async function json<T>(url: string): Promise<T> {
  const response = await request(url)
  const length = Number(response.headers.get('content-length') ?? 0)
  if (length > 8_000_000) throw new Error('Risposta TCGdex troppo grande.')
  const body = await response.text()
  if (body.length > 8_000_000) throw new Error('Risposta TCGdex troppo grande.')
  return JSON.parse(body) as T
}

function validateBrief(value: unknown): value is CardBrief {
  if (!value || typeof value !== 'object') return false
  const card = value as CardBrief
  return typeof card.id === 'string' && typeof card.localId === 'string' && typeof card.name === 'string' &&
    /^[a-zA-Z0-9.]+-[a-zA-Z0-9.]+$/.test(card.id)
}

function validateSet(value: SetResponse, id: string): void {
  if (value.id !== id || !value.name || !Number.isInteger(value.cardCount?.total) ||
    value.cardCount.total < 1 || !Array.isArray(value.cards) ||
    value.cards.some((card) => !validateBrief(card))) {
    throw new Error(`Indice TCGdex non valido per ${id}.`)
  }
}

function setReleaseDate(value: unknown): string | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const date = new Date(`${value}T00:00:00Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : null
}

function setAbbreviation(value: SetResponse): string | null {
  const code = value.abbreviation?.official
  return typeof code === 'string' && /^[A-Z0-9]{2,8}$/.test(code) ? code : null
}

function identity(card: CardResponse, gameplay: CardGameplay | null): Pick<CatalogPrint, 'identityId' | 'identityBasis'> {
  // Shared identity concerns gameplay only; Standard legality remains a separate, dated evaluation.
  if (card.category === 'Trainer' && card.name && card.trainerType && card.effect?.trim()) {
    const signature = [card.category, card.name.trim(), card.trainerType, card.effect.trim()].join('\u001f')
    return { identityId: `trainer-${createHash('sha256').update(signature).digest('hex').slice(0, 24)}`, identityBasis: 'trainer-text' }
  }
  if (hasComparableGameplay(card.category ?? null, card.stage ?? null, card.energyType ?? null, gameplay)) {
    const basis = card.category === 'Pokemon' ? 'pokemon-text' : 'energy-text'
    const signature = JSON.stringify({ category: card.category, name: card.name.trim(),
      stage: card.stage ?? null, energyType: card.energyType ?? null, gameplay })
    return { identityId: `${basis}-${createHash('sha256').update(signature).digest('hex').slice(0, 24)}`,
      identityBasis: basis }
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

function briefPrint(brief: CardBrief, set: Pick<SetResponse, 'id' | 'name'>): CatalogPrint {
  return {
    id: brief.id, setId: set.id, setName: set.name, localId: brief.localId,
    name: brief.name, category: null, stage: null, energyType: null,
    rarity: null, regulationMark: null, variants: null,
    identityId: null, identityBasis: null, imageBase: brief.image ?? null, thumbnail: null,
    highImageAvailable: null, sourceUpdated: null,
    sourceUrl: `${apiOrigin}/cards/${encodeURIComponent(brief.id)}`,
    detailAt: null, error: null
  }
}

async function details(brief: CardBrief, set: Pick<SetResponse, 'id' | 'name'>,
  fetchedAt: string, includeImages = true, manifestPrint?: CatalogPrint): Promise<CatalogPrint> {
  const base = manifestPrint ?? briefPrint(brief, set)
  try {
    const card = await json<CardResponse>(base.sourceUrl)
    if (card.id !== brief.id || card.name !== brief.name || card.localId !== brief.localId) {
      throw new Error('Dettaglio incoerente con l’indice.')
    }
    const gameplay = extractCardGameplay(card)
    const images = includeImages ? await imageStatus(card.image) : { thumbnail: null, highImageAvailable: null }
    return {
      ...base, category: card.category ?? null, stage: card.stage ?? null,
      energyType: card.energyType ?? null, rarity: card.rarity ?? null,
      regulationMark: /^[A-Z]$/i.test(card.regulationMark ?? '') ? card.regulationMark!.toUpperCase() : null,
      variants: card.variants ?? null, gameplay,
      gameplaySchemaVersion: CATALOG_GAMEPLAY_SCHEMA_VERSION, ...identity(card, gameplay),
      imageBase: card.image ?? null, ...images,
      sourceUpdated: card.updated ?? null, detailAt: fetchedAt, error: null
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
    id: set.id, name: set.name, abbreviation: setAbbreviation(set), sourceTotal: set.cardCount.total,
    sampleTotal: set.cards.filter((card) => selectedNames.has(card.name)).length,
    fetchedAt, releaseDate: setReleaseDate(set.releaseDate)
  }))
  const selected = responses.flatMap((set) => set.cards.filter((card) => selectedNames.has(card.name)).map((card) => ({ set, card })))
  const prints = await mapLimited(selected, 5, ({ set, card }) => details(card, set, fetchedAt))
  return { sets, prints, fetchedAt }
}

export async function fetchStandardManifest(): Promise<StandardManifest> {
  const fetchedAt = new Date().toISOString()
  // H is the first mark in the verified 2026 rotation. Future marks are inventory
  // candidates only; the legality evaluator still requires verified rules.
  const markFilter = candidateMarks.join('%7C')
  const promoAttempt = loadPromoPackage()
  const [marked, lowerMarked, setIndex, scarletEnergy, megaEnergy, promoResult] = await Promise.all([
    json<unknown>(`${apiOrigin}/cards?regulationMark=eq:${markFilter}`),
    json<unknown>(`${apiOrigin}/cards?regulationMark=eq:${markFilter.toLowerCase()}`),
    json<unknown>(`${apiOrigin}/sets`),
    json<SetResponse>(`${apiOrigin}/sets/sve`),
    json<SetResponse>(`${apiOrigin}/sets/mee`),
    promoAttempt
  ])
  if (!Array.isArray(marked) || !marked.every(validateBrief) ||
    !Array.isArray(lowerMarked) || !lowerMarked.every(validateBrief) || !Array.isArray(setIndex)) {
    throw new Error('Inventario TCGdex Standard non valido.')
  }
  validateSet(scarletEnergy, 'sve')
  validateSet(megaEnergy, 'mee')
  const summaries = new Map<string, SetBrief>()
  for (const value of setIndex) {
    if (!value || typeof value !== 'object') continue
    const set = value as SetBrief
    if (typeof set.id === 'string' && typeof set.name === 'string' &&
      Number.isInteger(set.cardCount?.total) && set.cardCount.total > 0) summaries.set(set.id, set)
  }
  const cards = new Map<string, CardBrief>()
  for (const card of [...marked, ...lowerMarked, ...scarletEnergy.cards, ...megaEnergy.cards] as CardBrief[]) cards.set(card.id, card)
  const groups = new Map<string, CardBrief[]>()
  for (const card of cards.values()) {
    const setId = card.id.slice(0, card.id.indexOf('-'))
    if (!summaries.has(setId)) throw new Error(`Set TCGdex ${setId} assente dall'indice.`)
    const group = groups.get(setId) ?? []
    group.push(card)
    groups.set(setId, group)
  }
  // The short set index has counts but omits releaseDate. Read each selected
  // set once so the date is available without inferring tournament legality.
  const detailedSets = new Map((await mapLimited([...groups.keys()], 4, async (id) => {
    const value = id === 'sve' ? scarletEnergy : id === 'mee' ? megaEnergy
      : await json<SetResponse>(`${apiOrigin}/sets/${encodeURIComponent(id)}`)
    validateSet(value, id)
    return value
  })).map((set) => [set.id, set]))
  const sets = [...groups].map(([id, group]) => {
    const set = detailedSets.get(id)!
    if (group.length > set.cardCount.total) throw new Error(`Indice TCGdex incoerente per ${id}.`)
    return { id, name: set.name, abbreviation: setAbbreviation(set), sourceTotal: set.cardCount.total,
      sampleTotal: group.length, fetchedAt, releaseDate: setReleaseDate(set.releaseDate) }
  }).sort((a, b) => a.id.localeCompare(b.id))
  const officialSeries = new Set(promoResult.registry?.series ?? [])
  const prints = sets.flatMap((set) => {
    const isPromo = /\bpromos?\b|\bpromotional\b/i.test(set.name) || officialSeries.has(set.id.toUpperCase())
    return (groups.get(set.id) ?? []).map((card) => {
      const print = briefPrint(card, set)
      if (!isPromo) return print
      const entry = promoResult.registry?.entries.get(promoKey(set.id, card.localId))
      const promoStatus: CatalogPrint['promoStatus'] = entry || promoResult.registry.complete ? {
          state: entry?.state ?? 'unlisted', legalDate: entry?.legalDate ?? null,
          dateNote: entry?.dateNote ?? null, checkedAt: promoResult.registry.checkedAt
        } : undefined
      return { ...print, isPromo: true, promoStatus }
    })
  })
  return { sets, prints, fetchedAt, promoAudit: {
    sourceUrl: PROMO_LEGALITY_SOURCE, checkedAt: promoResult.registry.checkedAt,
    error: promoResult.error, series: promoResult.registry.series,
    packageVersion: promoResult.registry.version, complete: promoResult.registry.complete
  } }
}

export async function syncStandardCatalog(store: CatalogStore,
  progress?: (phase: string, expected: number, acquired: number) => void,
  mode: CatalogSyncMode = 'new'): Promise<CatalogView> {
  try {
    if (!store.resumeJob(mode)) {
      store.startJob(mode)
      progress?.('Lettura inventario TCGdex', 0, 0)
      const manifest = await fetchStandardManifest()
      store.save(manifest, 'standard-marks')
      store.queueJob(mode)
    }
    let status = store.jobStatus()
    progress?.(status.phase, status.expected, status.acquired)
    while (true) {
      const batch = store.nextJobBatch(12)
      if (batch.length === 0) break
      const results = await mapLimited(batch, 2, async (print) =>
        details({ id: print.id, localId: print.localId, name: print.name,
          image: print.imageBase ?? undefined }, { id: print.setId, name: print.setName },
        new Date().toISOString(), false, print))
      store.commitJobBatch(results)
      status = store.jobStatus()
      progress?.(status.phase, status.expected, status.acquired)
      if (results.some((print) => /HTTP 429|HTTP 503/.test(print.error ?? ''))) {
        throw new Error('TCGdex ha limitato temporaneamente le richieste. Il lavoro riprenderà senza perdere i dati acquisiti.')
      }
      if (results.every((print) => print.detailAt === null)) {
        throw new Error('Dettagli TCGdex non disponibili. Il lavoro riprenderà senza perdere i dati acquisiti.')
      }
      if (results.some((print) => print.error)) {
        throw new Error('Alcuni dettagli TCGdex non sono disponibili. I lotti riusciti restano salvati; riprendi il lavoro più tardi.')
      }
      await new Promise((resolve) => setTimeout(resolve, 400))
    }
    store.completeJob()
    return store.view()
  } catch (error) {
    store.pauseJob(error instanceof Error ? error.message : 'Aggiornamento interrotto.')
    throw error
  }
}

/** Upgrade only exact printings needed by an imminent analysis. The full catalog
 * remains under the user's explicit global update action.
 */
export async function enrichCatalogPrints(store: CatalogStore, ids: readonly string[]): Promise<void> {
  const pending = [...new Set(ids)].slice(0, 120).map((id) => store.getPrint(id))
    .filter((print): print is CatalogPrint => !!print && !!print.detailAt &&
      print.gameplaySchemaVersion !== CATALOG_GAMEPLAY_SCHEMA_VERSION)
  const results = await mapLimited(pending, 2, async (print) =>
    details({ id: print.id, localId: print.localId, name: print.name,
      image: print.imageBase ?? undefined }, { id: print.setId, name: print.setName },
    new Date().toISOString(), false, print))
  if (results.length) store.savePrints(results)
}

export class CatalogStore {
  private readonly db: DatabaseSync
  readonly dataDir: string

  constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true })
    this.dataDir = dirname(path)
    this.db = new DatabaseSync(path)
    this.db.exec('PRAGMA journal_mode = WAL')
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS catalog_sets (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, source_total INTEGER NOT NULL,
        sample_total INTEGER NOT NULL, fetched_at TEXT NOT NULL, release_date TEXT,
        abbreviation TEXT
      ) STRICT;
      CREATE TABLE IF NOT EXISTS catalog_prints (
        id TEXT PRIMARY KEY, set_id TEXT NOT NULL REFERENCES catalog_sets(id), payload TEXT NOT NULL
      ) STRICT;
      CREATE TABLE IF NOT EXISTS catalog_sync (
        id INTEGER PRIMARY KEY CHECK (id = 1), fetched_at TEXT NOT NULL
      ) STRICT;
      CREATE TABLE IF NOT EXISTS catalog_scope (
        id INTEGER PRIMARY KEY CHECK (id = 1), kind TEXT NOT NULL
      ) STRICT;
      CREATE TABLE IF NOT EXISTS catalog_targets (
        print_id TEXT PRIMARY KEY
      ) STRICT;
      CREATE TABLE IF NOT EXISTS catalog_promo_audit (
        id INTEGER PRIMARY KEY CHECK (id = 1), checked_at TEXT,
        error TEXT, series_json TEXT NOT NULL
      ) STRICT;
      CREATE TABLE IF NOT EXISTS catalog_promo_package (
        id INTEGER PRIMARY KEY CHECK (id = 1), version INTEGER NOT NULL,
        complete INTEGER NOT NULL
      ) STRICT;
      CREATE TABLE IF NOT EXISTS catalog_job (
        id INTEGER PRIMARY KEY CHECK (id = 1), mode TEXT NOT NULL,
        state TEXT NOT NULL, phase TEXT NOT NULL, expected INTEGER NOT NULL,
        error TEXT, updated_at TEXT NOT NULL
      ) STRICT;
      CREATE TABLE IF NOT EXISTS catalog_job_targets (
        print_id TEXT PRIMARY KEY
      ) STRICT;
      CREATE TABLE IF NOT EXISTS catalog_rule_package (
        id INTEGER PRIMARY KEY CHECK (id = 1), payload TEXT NOT NULL,
        installed_at TEXT NOT NULL
      ) STRICT;
    `)
    const setColumns = this.db.prepare('PRAGMA table_info(catalog_sets)').all()
      .map((row) => (row as { name: string }).name)
    if (!setColumns.includes('release_date')) this.db.exec('ALTER TABLE catalog_sets ADD COLUMN release_date TEXT')
    if (!setColumns.includes('abbreviation')) this.db.exec('ALTER TABLE catalog_sets ADD COLUMN abbreviation TEXT')
    // A process killed during a batch leaves only committed targets completed.
    this.db.prepare("UPDATE catalog_job SET state = 'paused', phase = 'Interrotto alla chiusura' WHERE state = 'running'").run()
  }

  jobStatus(): CatalogSyncStatus {
    const row = this.db.prepare('SELECT mode, state, phase, expected, error FROM catalog_job WHERE id = 1')
      .get() as { mode: CatalogSyncMode; state: CatalogSyncStatus['state']; phase: string; expected: number; error: string | null } | undefined
    if (!row) return { running: false, mode: null, state: 'idle', phase: '', expected: 0, acquired: 0, error: null }
    const pending = (this.db.prepare('SELECT COUNT(*) AS n FROM catalog_job_targets').get() as { n: number }).n
    return { running: row.state === 'running', mode: row.mode, state: row.state,
      phase: row.phase, expected: row.expected, acquired: row.expected - pending, error: row.error }
  }

  startJob(mode: CatalogSyncMode): void {
    this.db.exec('BEGIN IMMEDIATE')
    try {
      this.db.exec('DELETE FROM catalog_job_targets')
      this.db.prepare(`INSERT INTO catalog_job VALUES (1, ?, 'running', 'Lettura inventario TCGdex', 0, NULL, ?)
        ON CONFLICT(id) DO UPDATE SET mode=excluded.mode, state=excluded.state,
        phase=excluded.phase, expected=0, error=NULL, updated_at=excluded.updated_at`)
        .run(mode, new Date().toISOString())
      this.db.exec('COMMIT')
    } catch (error) { this.db.exec('ROLLBACK'); throw error }
  }

  resumeJob(mode: CatalogSyncMode): boolean {
    const status = this.jobStatus()
    if (status.mode !== mode || status.state !== 'paused' || status.expected === 0 ||
      status.acquired >= status.expected) return false
    this.db.prepare("UPDATE catalog_job SET state='running', phase='Verifica dettagli', error=NULL, updated_at=? WHERE id=1")
      .run(new Date().toISOString())
    return true
  }

  queueJob(mode: CatalogSyncMode): void {
    const targets = this.db.prepare(`SELECT p.id, p.payload FROM catalog_targets t
      JOIN catalog_prints p ON p.id=t.print_id ORDER BY p.id`).all()
    this.db.exec('BEGIN IMMEDIATE')
    try {
      this.db.exec('DELETE FROM catalog_job_targets')
      let expected = 0
      for (const row of targets) {
        const print = JSON.parse((row as { payload: string }).payload) as CatalogPrint
        if (mode === 'full' || !print.detailAt || print.gameplaySchemaVersion !== CATALOG_GAMEPLAY_SCHEMA_VERSION) {
          this.db.prepare('INSERT INTO catalog_job_targets VALUES (?)').run(print.id)
          expected++
        }
      }
      this.db.prepare("UPDATE catalog_job SET phase='Verifica dettagli', expected=?, updated_at=? WHERE id=1")
        .run(expected, new Date().toISOString())
      this.db.exec('COMMIT')
    } catch (error) { this.db.exec('ROLLBACK'); throw error }
  }

  nextJobBatch(limit: number): CatalogPrint[] {
    return this.db.prepare(`SELECT p.payload FROM catalog_job_targets j
      JOIN catalog_prints p ON p.id=j.print_id ORDER BY j.print_id LIMIT ?`).all(limit)
      .map((row) => JSON.parse((row as { payload: string }).payload) as CatalogPrint)
  }

  commitJobBatch(prints: CatalogPrint[]): void {
    this.db.exec('BEGIN IMMEDIATE')
    try {
      for (const print of prints) {
        this.upsertPrint(print)
        if (!print.error && print.detailAt) this.db.prepare('DELETE FROM catalog_job_targets WHERE print_id=?').run(print.id)
      }
      this.db.prepare('UPDATE catalog_job SET updated_at=? WHERE id=1').run(new Date().toISOString())
      this.db.exec('COMMIT')
    } catch (error) { this.db.exec('ROLLBACK'); throw error }
  }

  pauseJob(message: string): void {
    this.db.prepare("UPDATE catalog_job SET state='paused', phase='In pausa', error=?, updated_at=? WHERE id=1")
      .run(message, new Date().toISOString())
  }

  completeJob(): void {
    this.db.prepare("UPDATE catalog_job SET state='done', phase='Aggiornamento terminato', error=NULL, updated_at=? WHERE id=1")
      .run(new Date().toISOString())
  }

  private upsertPrint(print: CatalogPrint): void {
    const previous = this.db.prepare('SELECT payload FROM catalog_prints WHERE id = ?').get(print.id) as { payload: string } | undefined
    // A failed refresh does not discard a previously acquired detail or cached image.
    const old = previous ? JSON.parse(previous.payload) as CatalogPrint : null
    const promoStatus = print.promoStatus === undefined ? old?.promoStatus : print.promoStatus
    const value: CatalogPrint = print.detailAt === null && old?.detailAt
      ? { ...old, setName: print.setName, name: print.name, localId: print.localId,
        isPromo: print.isPromo ?? old.isPromo, promoStatus, error: print.error }
      : { ...print, isPromo: print.isPromo ?? old?.isPromo, promoStatus,
        thumbnail: print.thumbnail ?? (old?.imageBase === print.imageBase ? old.thumbnail : null),
        highImageAvailable: print.highImageAvailable ??
          (old?.imageBase === print.imageBase ? old.highImageAvailable : null) }
    if (old?.detailAt && value.detailAt) {
      const stable = (item: CatalogPrint): CatalogPrint => ({ ...item, detailAt: null,
        promoStatus: item.promoStatus ? { ...item.promoStatus, checkedAt: '' } : undefined })
      if (isDeepStrictEqual(stable(old), stable(value))) {
        value.detailAt = old.detailAt
        if (isDeepStrictEqual(old, value)) return
      }
    }
    this.db.prepare(`INSERT INTO catalog_prints VALUES (?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET set_id=excluded.set_id, payload=excluded.payload`)
      .run(print.id, print.setId, JSON.stringify(value))
  }

  save(sample: { sets: CatalogSet[]; prints: CatalogPrint[]; fetchedAt: string; promoAudit?: PromoAudit },
    kind: 'sample' | 'standard-marks' = 'sample'): CatalogView {
    this.db.exec('BEGIN IMMEDIATE')
    try {
      for (const set of sample.sets) {
        this.db.prepare(`INSERT INTO catalog_sets (id, name, source_total, sample_total, fetched_at, release_date, abbreviation) VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET name=excluded.name, source_total=excluded.source_total,
          sample_total=excluded.sample_total, fetched_at=excluded.fetched_at,
          release_date=excluded.release_date, abbreviation=COALESCE(excluded.abbreviation, catalog_sets.abbreviation)`)
          .run(set.id, set.name, set.sourceTotal, set.sampleTotal, set.fetchedAt,
            set.releaseDate ?? null, set.abbreviation ?? null)
      }
      for (const print of sample.prints) this.upsertPrint(print)
      if (kind === 'standard-marks') {
        this.db.exec('DELETE FROM catalog_targets')
        for (const print of sample.prints) {
          this.db.prepare('INSERT INTO catalog_targets VALUES (?)').run(print.id)
        }
        if (sample.promoAudit) {
          if (sample.promoAudit.packageVersion !== undefined) {
            this.db.prepare(`INSERT INTO catalog_promo_package VALUES (1, ?, ?)
              ON CONFLICT(id) DO UPDATE SET version=excluded.version, complete=excluded.complete`)
              .run(sample.promoAudit.packageVersion, sample.promoAudit.complete ? 1 : 0)
          }
          const previous = this.db.prepare('SELECT checked_at, series_json FROM catalog_promo_audit WHERE id = 1')
            .get() as { checked_at: string | null; series_json: string } | undefined
          this.db.prepare(`INSERT INTO catalog_promo_audit VALUES (1, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET checked_at=excluded.checked_at,
            error=excluded.error, series_json=excluded.series_json`)
            .run(sample.promoAudit.checkedAt ?? previous?.checked_at ?? null,
              sample.promoAudit.error,
              sample.promoAudit.checkedAt ? JSON.stringify(sample.promoAudit.series)
                : previous?.series_json ?? '[]')
        }
      }
      this.db.prepare(`INSERT INTO catalog_scope VALUES (1, ?)
        ON CONFLICT(id) DO UPDATE SET kind=excluded.kind`).run(kind)
      this.db.prepare(`INSERT INTO catalog_sync VALUES (1, ?)
        ON CONFLICT(id) DO UPDATE SET fetched_at=excluded.fetched_at`).run(sample.fetchedAt)
      this.db.exec('COMMIT')
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
    return this.view()
  }

  savePrints(prints: CatalogPrint[]): void {
    this.db.exec('BEGIN IMMEDIATE')
    try {
      for (const print of prints) this.upsertPrint(print)
      this.db.exec('COMMIT')
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }

  pendingStandardPrints(): CatalogPrint[] {
    return this.db.prepare(`SELECT p.payload FROM catalog_targets t
      JOIN catalog_prints p ON p.id = t.print_id ORDER BY t.print_id`)
      .all().map((row) => JSON.parse((row as { payload: string }).payload) as CatalogPrint)
      .filter((print) => print.detailAt === null)
  }

  scopeKind(): 'sample' | 'standard-marks' {
    const row = this.db.prepare('SELECT kind FROM catalog_scope WHERE id = 1').get() as { kind: string } | undefined
    return row?.kind === 'standard-marks' ? 'standard-marks' : 'sample'
  }

  rulePackage(): { value: WesternRulePackage; error: string | null } {
    // Rules are distributed with verified application releases. Older databases
    // may contain a package from an experimental build; it must not override the release.
    return { value: BUNDLED_WESTERN_RULE_PACKAGE, error: null }
  }

  view(): CatalogView {
    const rules = this.rulePackage()
    const sets = this.db.prepare('SELECT id, name, source_total, sample_total, fetched_at, release_date, abbreviation FROM catalog_sets ORDER BY id')
      .all().map((row) => {
        const item = row as { id: string; name: string; source_total: number; sample_total: number;
          fetched_at: string; release_date: string | null; abbreviation: string | null }
        return { id: item.id, name: item.name, sourceTotal: item.source_total, sampleTotal: item.sample_total,
          fetchedAt: item.fetched_at, releaseDate: item.release_date, abbreviation: item.abbreviation }
      })
    const promoRegistry = loadPromoPackage().registry
    const prints = this.db.prepare('SELECT payload FROM catalog_prints ORDER BY id')
      .all().map((row) => {
        const print = JSON.parse((row as { payload: string }).payload) as CatalogPrint
        if (!print.isPromo) return print
        const entry = promoRegistry.entries.get(promoKey(print.setId, print.localId))
        return { ...print, promoStatus: {
          state: entry?.state ?? 'unlisted', legalDate: entry?.legalDate ?? null,
          dateNote: entry?.dateNote ?? null, checkedAt: promoRegistry.checkedAt
        } } as CatalogPrint
      })
    const sync = this.db.prepare('SELECT fetched_at FROM catalog_sync WHERE id = 1').get() as { fetched_at: string } | undefined
    const kind = this.scopeKind()
    const targetIds = kind === 'standard-marks' ? new Set(this.db.prepare('SELECT print_id FROM catalog_targets')
      .all().map((row) => (row as { print_id: string }).print_id)) : null
    const targetPrints = targetIds ? prints.filter((print) => targetIds.has(print.id)) : []
    const acquiredTargets = targetPrints.filter((print) => print.detailAt !== null).length
    const hasGameplay = (print: CatalogPrint): boolean =>
      print.gameplaySchemaVersion === CATALOG_GAMEPLAY_SCHEMA_VERSION &&
      hasComparableGameplay(print.category, print.stage ?? null, print.energyType ?? null, print.gameplay ?? null)
    const gameplayTargets = targetPrints.filter(hasGameplay).length
    const promoTargets = targetPrints.filter((print) => print.isPromo)
    const acquiredPromos = promoTargets.filter((print) => print.detailAt !== null).length
    const targetSetIds = [...new Set(targetPrints.map((print) => print.setId))].sort()
    const officialReleased = officialSetReleases().filter((set) =>
      set.releaseDate <= new Date().toISOString().slice(0, 10))
    const officialMissing = officialReleased.filter((set) => !targetSetIds.includes(set.setId))
    const printsBySet = new Map<string, CatalogPrint[]>()
    for (const print of targetPrints) {
      const group = printsBySet.get(print.setId) ?? []
      group.push(print)
      printsBySet.set(print.setId, group)
    }
    const bySet = sets.filter((set) => printsBySet.has(set.id)).map((set) => {
      const group = printsBySet.get(set.id)!
      const acquired = group.filter((print) => print.detailAt !== null).length
      const gameplayAcquired = group.filter(hasGameplay).length
      const promos = group.filter((print) => print.isPromo)
      return { setId: set.id, name: set.name, sourceTotal: set.sourceTotal, releaseDate: set.releaseDate,
        officialReleaseDate: officialSetRelease(set.id),
        expected: group.length, acquired, missing: group.length - acquired,
        gameplayAcquired, gameplayMissing: group.length - gameplayAcquired,
        promo: promos.length > 0, promoVerified: promos.filter((print) => !!print.promoStatus).length,
        promoUnchecked: promos.filter((print) => !print.promoStatus).length }
    })
    return {
      circuit: 'WESTERN', source: CATALOG_SOURCE, sourceLanguage: 'en',
      rulePackage: rules.value, rulePackageError: rules.error,
      scope: kind === 'sample'
        ? { setIds: CATALOG_SET_IDS, names: CATALOG_NAMES, kind }
        : { setIds: targetSetIds, names: [], kind },
      standardCoverage: targetIds
        ? { expected: targetIds.size, acquired: acquiredTargets,
          missing: targetIds.size - acquiredTargets,
          gameplayAcquired: gameplayTargets, gameplayMissing: targetIds.size - gameplayTargets,
          marks: candidateMarks, bySet,
          releaseSource: { url: OFFICIAL_SET_RELEASE_SOURCE, version: OFFICIAL_SET_RELEASE_VERSION,
            checkedAt: OFFICIAL_SET_RELEASE_CHECKED_AT },
          officialSets: { expected: officialReleased.length,
            present: officialReleased.length - officialMissing.length, missing: officialMissing.length,
            missingSets: officialMissing.map((set) => ({ setId: set.setId, product: set.product })) },
          promos: { expected: promoTargets.length, acquired: acquiredPromos,
            missing: promoTargets.length - acquiredPromos,
            series: new Set(promoTargets.map((print) => print.setId)).size,
            available: promoTargets.filter((print) => print.promoStatus?.state === 'available').length,
            upcoming: promoTargets.filter((print) => print.promoStatus?.state === 'upcoming').length,
            unlisted: promoTargets.filter((print) => print.promoStatus?.state === 'unlisted').length,
            unchecked: promoTargets.filter((print) => !print.promoStatus).length } } : undefined,
      promoAudit: targetIds ? { sourceUrl: PROMO_LEGALITY_SOURCE,
        checkedAt: promoRegistry.checkedAt, error: null,
        series: promoRegistry.series,
        packageVersion: promoRegistry.version, complete: promoRegistry.complete } : undefined,
      syncedAt: sync?.fetched_at ?? null,
      sets: targetIds ? sets.filter((set) => targetSetIds.includes(set.id)) : sets,
      prints: targetIds ? targetPrints : prints
    }
  }

  getPrint(id: string): CatalogPrint | null {
    if (typeof id !== 'string' || id.length > 100) return null
    const row = this.db.prepare('SELECT payload FROM catalog_prints WHERE id = ?').get(id) as { payload: string } | undefined
    return row ? JSON.parse(row.payload) as CatalogPrint : null
  }

  close(): void { this.db.close() }
}
