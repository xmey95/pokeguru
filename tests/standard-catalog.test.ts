import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, expect, it, vi } from 'vitest'
import { CatalogStore, fetchStandardManifest, syncStandardCatalog } from '../src/main/catalog'
import { OFFICIAL_SET_RELEASE_CHECKED_AT, officialSetRelease, officialSetReleases } from '../src/main/official-set-releases'

const folders: string[] = []
afterEach(() => {
  vi.unstubAllGlobals()
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true })
})

it('mappa le date di uscita ufficiali dei set senza inferire quelle delle promo o dei set ignoti', () => {
  const releases = officialSetReleases()
  expect(releases).toHaveLength(17)
  expect(new Set(releases.map((entry) => entry.setId)).size).toBe(releases.length)
  expect(OFFICIAL_SET_RELEASE_CHECKED_AT).toBe('2026-10-23')
  for (const entry of releases) {
    expect(entry.product.length).toBeGreaterThan(2)
    expect(new Date(`${entry.releaseDate}T00:00:00Z`).toISOString().slice(0, 10)).toBe(entry.releaseDate)
  }
  expect(officialSetRelease('me02.5')).toBe('2026-01-30')
  expect(officialSetRelease('30th')).toBe('2026-09-16')
  expect(officialSetRelease('mep')).toBeNull()
  expect(officialSetRelease('sv99')).toBeNull()
})

it('salva l’inventario Standard a lotti, riprende un errore e conserva i dettagli acquisiti', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'pokeguru-standard-'))
  folders.push(folder)
  const database = join(folder, 'catalog.sqlite')
  const briefs = [
    { id: 'sv05-001', localId: '001', name: 'Pokémon A' },
    { id: 'me01-001', localId: '001', name: 'Pokémon B' },
    { id: 'mep-001', localId: '001', name: 'Pokémon promo' },
    { id: 'nvp-001', localId: '001', name: 'Nuova promo' }
  ]
  const sets = ['sv05', 'me01', 'mep', 'nvp', 'sve', 'mee'].map((id) =>
    ({ id, name: id === 'nvp' ? 'NVP Promos' : id.toUpperCase(), cardCount: { total: 1 },
      releaseDate: id === 'sv05' ? '2024-03-22' : id === 'me01' ? '2026-02-30' : undefined }))
  let failPromo = true
  let updatedRarity = false
  const details = new Map<string, number>()
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
    const url = String(input)
    if (url.includes('/cards?regulationMark=eq:h')) return Response.json([briefs[2]])
    if (url.includes('/cards?')) return Response.json([briefs[0], briefs[1], briefs[3]])
    if (url.endsWith('/sets')) return Response.json(sets)
    if (url.includes('/sets/')) {
      const actualId = url.split('/').at(-1)!
      const set = sets.find((candidate) => candidate.id === actualId)!
      return Response.json({ ...set, cards: actualId === 'sve' || actualId === 'mee'
        ? [{ id: `${actualId}-001`, localId: '001', name: 'Basic Energy' }]
        : briefs.filter((card) => card.id.startsWith(`${actualId}-`)) })
    }
    const id = url.split('/').at(-1)!
    details.set(id, (details.get(id) ?? 0) + 1)
    if (id === 'mep-001' && failPromo) return new Response('', { status: 503 })
    const name = briefs.find((card) => card.id === id)?.name ?? 'Basic Energy'
    return Response.json({ id, localId: '001', name, category: name === 'Basic Energy' ? 'Energy' : 'Pokemon',
      regulationMark: id === 'mep-001' ? 'i' : id === 'nvp-001' ? 'K' : id.startsWith('me') ? 'I' : 'H',
      rarity: id === 'sv05-001' && updatedRarity ? 'Rare' : 'Common', stage: 'Basic', updated: '2026-10-23' })
  }))

  const manifest = await fetchStandardManifest()
  expect(manifest.prints).toHaveLength(6)
  expect(manifest.sets.find((set) => set.id === 'sv05')?.releaseDate).toBe('2024-03-22')
  expect(manifest.sets.find((set) => set.id === 'me01')?.releaseDate).toBeNull()
  expect(manifest.prints.find((print) => print.id === 'nvp-001')?.promoStatus).toMatchObject({
    state: 'unlisted', legalDate: null
  })
  const store = new CatalogStore(database)
  await expect(syncStandardCatalog(store)).rejects.toThrow('limitato temporaneamente')
  expect(store.jobStatus()).toMatchObject({ mode: 'new', state: 'paused', expected: 6, acquired: 5 })
  expect(store.view().standardCoverage).toMatchObject({ expected: 6, acquired: 5, missing: 1 })
  expect(store.view().standardCoverage?.officialSets).toMatchObject({
    expected: 17, present: 2, missing: 15,
    missingSets: expect.arrayContaining([{ setId: 'sv06', product: 'Scarlet & Violet—Twilight Masquerade' }])
  })
  const pausedCoverage = store.view().standardCoverage!
  expect(pausedCoverage.bySet.reduce((sum, set) => sum + set.expected, 0)).toBe(pausedCoverage.expected)
  expect(pausedCoverage.bySet.reduce((sum, set) => sum + set.missing, 0)).toBe(pausedCoverage.missing)
  expect(pausedCoverage.bySet.find((set) => set.setId === 'mep')).toMatchObject({
    expected: 1, acquired: 0, missing: 1, promoVerified: 1, promoUnchecked: 0
  })
  expect(store.view().standardCoverage?.promos).toMatchObject({ expected: 2, acquired: 1, missing: 1,
    series: 2, available: 1, unlisted: 1 })
  expect(store.view().scope.kind).toBe('standard-marks')
  store.close()

  failPromo = false
  const reopened = new CatalogStore(database)
  const view = await syncStandardCatalog(reopened)
  expect(reopened.jobStatus()).toMatchObject({ mode: 'new', state: 'done', expected: 6, acquired: 6 })
  expect(view.standardCoverage).toMatchObject({ expected: 6, acquired: 6, missing: 0 })
  expect(view.standardCoverage?.officialSets).toEqual(pausedCoverage.officialSets)
  expect(view.standardCoverage?.bySet.find((set) => set.setId === 'sv05')?.releaseDate).toBe('2024-03-22')
  expect(view.standardCoverage?.bySet.find((set) => set.setId === 'sv05')?.officialReleaseDate).toBe('2024-03-22')
  expect(view.standardCoverage?.bySet.find((set) => set.setId === 'me01')?.releaseDate).toBeNull()
  expect(view.standardCoverage?.bySet.find((set) => set.setId === 'me01')?.officialReleaseDate).toBe('2025-09-26')
  expect(view.standardCoverage?.bySet.find((set) => set.setId === 'nvp')?.officialReleaseDate).toBeNull()
  expect(view.standardCoverage?.promos).toMatchObject({ expected: 2, acquired: 2, missing: 0 })
  const legacyPromo = view.prints.find((print) => print.id === 'nvp-001')!
  reopened.savePrints([{ ...legacyPromo, promoStatus: { state: 'available', legalDate: null,
    dateNote: null, checkedAt: '2026-11-01' } }])
  expect(reopened.view().prints.find((print) => print.id === 'nvp-001')?.promoStatus?.state).toBe('unlisted')
  expect(details.get('sv05-001')).toBe(1)
  expect(details.get('mep-001')).toBe(5)
  expect(view.prints.find((print) => print.id === 'mep-001')?.rarity).toBe('Common')
  expect(view.prints.find((print) => print.id === 'mep-001')?.regulationMark).toBe('I')
  const standardPrint = view.prints.find((print) => print.id === 'sv05-001')!
  reopened.savePrints([{ ...standardPrint, id: 'sv05-099', localId: '099', regulationMark: 'G' }])
  expect(reopened.getPrint('sv05-099')).not.toBeNull()
  expect(reopened.view().prints.some((print) => print.id === 'sv05-099')).toBe(false)
  expect(reopened.view().referencePrints?.some((print) => print.id === 'sv05-099')).toBe(true)
  expect(reopened.view().standardCoverage?.bySet.find((set) => set.setId === 'sv05')?.expected).toBe(1)
  updatedRarity = true
  await syncStandardCatalog(reopened)
  expect(details.get('sv05-001')).toBe(1)
  expect(reopened.getPrint('sv05-001')?.rarity).toBe('Common')
  await syncStandardCatalog(reopened, undefined, 'full')
  expect(details.get('mep-001')).toBe(6)
  expect(reopened.getPrint('sv05-001')?.rarity).toBe('Rare')
  const unchangedDetailAt = reopened.getPrint('mep-001')?.detailAt
  const latestOfficialCheck = reopened.view().promoAudit?.checkedAt
  const staleOfficial = await syncStandardCatalog(reopened)
  expect(staleOfficial.promoAudit?.error).toBeNull()
  expect(staleOfficial.promoAudit?.checkedAt).toBe(latestOfficialCheck)
  expect(staleOfficial.prints.find((print) => print.id === 'nvp-001')?.promoStatus?.state).toBe('unlisted')
  expect((fetch as ReturnType<typeof vi.fn>).mock.calls.some(([url]) =>
    String(url).includes('promo-status-western.json'))).toBe(false)
  expect(reopened.getPrint('mep-001')?.detailAt).toBe(unchangedDetailAt)
  reopened.close()
}, 20_000)

it('migra un archivio catalogo precedente senza perdere i set e salva la data nuova', () => {
  const folder = mkdtempSync(join(tmpdir(), 'pokeguru-standard-legacy-'))
  folders.push(folder)
  const database = join(folder, 'catalog.sqlite')
  const legacy = new DatabaseSync(database)
  legacy.exec(`CREATE TABLE catalog_sets (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, source_total INTEGER NOT NULL,
    sample_total INTEGER NOT NULL, fetched_at TEXT NOT NULL
  ) STRICT`)
  legacy.prepare('INSERT INTO catalog_sets VALUES (?, ?, ?, ?, ?)')
    .run('me01', 'Mega Evolution', 188, 180, '2026-10-01T00:00:00.000Z')
  legacy.close()

  const store = new CatalogStore(database)
  expect(store.view().sets).toMatchObject([{ id: 'me01', sourceTotal: 188, releaseDate: null }])
  store.save({ fetchedAt: '2026-10-23T00:00:00.000Z', prints: [], sets: [{ id: 'me01', name: 'Mega Evolution',
    sourceTotal: 188, sampleTotal: 180, fetchedAt: '2026-10-23T00:00:00.000Z', releaseDate: '2025-09-26' }] })
  store.close()
  const reopened = new CatalogStore(database)
  expect(reopened.view().sets[0].releaseDate).toBe('2025-09-26')
  reopened.close()
})
