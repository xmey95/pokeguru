import { expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CatalogStore, fetchStandardManifest, syncStandardCatalog } from '../src/main/catalog'
import { officialSetReleases } from '../src/main/official-set-releases'

it.skipIf(process.env.POKEGURU_CATALOG_LIVE !== '1')('legge l’inventario reale H/I/J e le Energie Base', async () => {
  const manifest = await fetchStandardManifest()
  expect(manifest.prints.length).toBeGreaterThan(3000)
  expect(new Set(manifest.prints.map((print) => print.id)).size).toBe(manifest.prints.length)
  expect(manifest.sets.some((set) => set.id === 'sv05')).toBe(true)
  expect(manifest.sets.find((set) => set.id === 'me02.5')?.releaseDate).toBe('2026-01-30')
  expect(manifest.sets.some((set) => set.id === 'mep')).toBe(true)
  expect(manifest.prints.some((print) => print.id === 'mep-051')).toBe(true)
  expect(manifest.sets.some((set) => set.id === 'sve')).toBe(true)
  expect(manifest.sets.some((set) => set.id === 'mee')).toBe(true)
  expect(manifest.sets.reduce((sum, set) => sum + set.sampleTotal, 0)).toBe(manifest.prints.length)
  const setIds = new Set(manifest.sets.map((set) => set.id))
  const released = officialSetReleases().filter((set) => set.releaseDate <= new Date().toISOString().slice(0, 10))
  const missing = released.filter((set) => !setIds.has(set.setId))
  console.log(`Audit set ufficiali nel manifest: ${released.length - missing.length}/${released.length}; mancanti: ${missing.map((set) => set.setId).join(', ') || 'nessuno'}`)
  expect(missing).toEqual([])
}, 30_000)

it.skipIf(process.env.POKEGURU_CATALOG_BULK_LIVE !== '1')('acquisisce e conserva l’inventario reale', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'pokeguru-standard-live-'))
  const store = new CatalogStore(join(folder, 'catalog.sqlite'))
  let closed = false
  try {
    const view = await syncStandardCatalog(store)
    expect(view.standardCoverage?.expected).toBeGreaterThan(3000)
    expect(view.standardCoverage?.acquired).toBeGreaterThan(2900)
    expect(view.prints.find((print) => print.id === 'me01-086')).toMatchObject({
      name: 'Mega Absol ex', regulationMark: 'I', detailAt: expect.any(String)
    })
    store.close()
    closed = true
    const reopened = new CatalogStore(join(folder, 'catalog.sqlite'))
    try { expect(reopened.view().standardCoverage).toEqual(view.standardCoverage) }
    finally { reopened.close() }
  } finally {
    if (!closed) store.close()
    rmSync(folder, { recursive: true, force: true })
  }
}, 600_000)
