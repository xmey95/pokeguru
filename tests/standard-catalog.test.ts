import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { CatalogStore, fetchStandardManifest, syncStandardCatalog } from '../src/main/catalog'

const folders: string[] = []
afterEach(() => {
  vi.unstubAllGlobals()
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true })
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
    ({ id, name: id.toUpperCase(), cardCount: { total: 1 } }))
  let failPromo = true
  let officialUnavailable = false
  let updatedRarity = false
  const details = new Map<string, number>()
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
    const url = String(input)
    if (url.includes('promo-status-western.json')) {
      if (officialUnavailable) return new Response('', { status: 503 })
      return Response.json({ schema: 1, version: 3, checkedAt: '2026-10-23T12:00:00.000Z',
        sourceUrl: 'https://www.pokemon.com/us/play-pokemon/about/pokemon-tcg-promo-card-legality-status',
        complete: true, entries: [
          { code: 'NVP', number: '001', state: 'upcoming', legalDate: '2026-11-20', dateNote: null },
          { code: 'MEP', number: '001', state: 'available', legalDate: null, dateNote: null }
        ] })
    }    if (url.includes('/cards?regulationMark=eq:h')) return Response.json([briefs[2]])
    if (url.includes('/cards?')) return Response.json([briefs[0], briefs[1], briefs[3]])
    if (url.endsWith('/sets')) return Response.json(sets)
    if (url.endsWith('/sets/sve') || url.endsWith('/sets/mee')) {
      const id = url.slice(-3)
      return Response.json({ id, name: id.toUpperCase(), cardCount: { total: 1 },
        cards: [{ id: `${id}-001`, localId: '001', name: 'Basic Energy' }] })
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
  expect(manifest.prints.find((print) => print.id === 'nvp-001')?.promoStatus).toMatchObject({
    state: 'upcoming', legalDate: '2026-11-20'
  })
  const store = new CatalogStore(database)
  await expect(syncStandardCatalog(store)).rejects.toThrow('limitato temporaneamente')
  expect(store.jobStatus()).toMatchObject({ mode: 'new', state: 'paused', expected: 6, acquired: 5 })
  expect(store.view().standardCoverage).toMatchObject({ expected: 6, acquired: 5, missing: 1 })
  const pausedCoverage = store.view().standardCoverage!
  expect(pausedCoverage.bySet.reduce((sum, set) => sum + set.expected, 0)).toBe(pausedCoverage.expected)
  expect(pausedCoverage.bySet.reduce((sum, set) => sum + set.missing, 0)).toBe(pausedCoverage.missing)
  expect(pausedCoverage.bySet.find((set) => set.setId === 'mep')).toMatchObject({
    expected: 1, acquired: 0, missing: 1, promoVerified: 1, promoUnchecked: 0
  })
  expect(store.view().standardCoverage?.promos).toMatchObject({ expected: 2, acquired: 1, missing: 1,
    series: 2, available: 1, upcoming: 1 })
  expect(store.view().scope.kind).toBe('standard-marks')
  store.close()

  failPromo = false
  const reopened = new CatalogStore(database)
  const view = await syncStandardCatalog(reopened)
  expect(reopened.jobStatus()).toMatchObject({ mode: 'new', state: 'done', expected: 6, acquired: 6 })
  expect(view.standardCoverage).toMatchObject({ expected: 6, acquired: 6, missing: 0 })
  expect(view.standardCoverage?.promos).toMatchObject({ expected: 2, acquired: 2, missing: 0 })
  expect(details.get('sv05-001')).toBe(1)
  expect(details.get('mep-001')).toBe(5)
  expect(view.prints.find((print) => print.id === 'mep-001')?.rarity).toBe('Common')
  expect(view.prints.find((print) => print.id === 'mep-001')?.regulationMark).toBe('I')
  const standardPrint = view.prints.find((print) => print.id === 'sv05-001')!
  reopened.savePrints([{ ...standardPrint, id: 'sv05-099', localId: '099', regulationMark: 'G' }])
  expect(reopened.getPrint('sv05-099')).not.toBeNull()
  expect(reopened.view().prints.some((print) => print.id === 'sv05-099')).toBe(false)
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
  officialUnavailable = true
  const staleOfficial = await syncStandardCatalog(reopened)
  expect(staleOfficial.promoAudit?.error).toContain('HTTP 503')
  expect(staleOfficial.promoAudit?.checkedAt).toBe(latestOfficialCheck)
  expect(staleOfficial.prints.find((print) => print.id === 'nvp-001')?.promoStatus?.state).toBe('upcoming')
  expect(reopened.getPrint('mep-001')?.detailAt).toBe(unchangedDetailAt)
  reopened.close()
}, 20_000)
