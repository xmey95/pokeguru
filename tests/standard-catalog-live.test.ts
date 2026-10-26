import { expect, it } from 'vitest'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
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
  const sourceMissing = manifest.prints.filter((print) => !print.imageBase)
  const missingCounts = new Map<string, number>()
  for (const print of sourceMissing) missingCounts.set(print.setId, (missingCounts.get(print.setId) ?? 0) + 1)
  const sourceMissingBySet = [...missingCounts].map(([setId, count]) => `${setId}:${count}`).join(', ')
  console.log(`Immagini dichiarate da TCGdex nell’inventario: ${manifest.prints.length - sourceMissing.length}/${manifest.prints.length}; URL assente per ${sourceMissing.length} stampe (${sourceMissingBySet || 'nessuna'})`)
  const released = officialSetReleases().filter((set) => set.releaseDate <= new Date().toISOString().slice(0, 10))
  const missing = released.filter((set) => !setIds.has(set.setId))
  console.log(`Audit set ufficiali nel manifest: ${released.length - missing.length}/${released.length}; mancanti: ${missing.map((set) => set.setId).join(', ') || 'nessuno'}`)
  expect(missing).toEqual([])
}, 30_000)

it.skipIf(process.env.POKEGURU_CATALOG_BOUNDED_LIVE !== '1')('riprende e salva due dettagli reali senza avviare l’inventario completo', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'pokeguru-standard-bounded-live-'))
  const store = new CatalogStore(join(folder, 'catalog.sqlite'))
  try {
    const manifest = await fetchStandardManifest()
    const ids = new Set(['me01-086', 'sve-005'])
    const prints = manifest.prints.filter((print) => ids.has(print.id))
    expect(prints.map((print) => print.id).sort()).toEqual([...ids].sort())
    const setIds = new Set(prints.map((print) => print.setId))
    store.save({ ...manifest, sets: manifest.sets.filter((set) => setIds.has(set.id)), prints }, 'standard-marks')
    store.startJob('new')
    store.queueJob('new')
    store.pauseJob(null, 'In pausa su richiesta')
    expect(store.jobStatus()).toMatchObject({ state: 'paused', expected: 2, acquired: 0 })
    const view = await syncStandardCatalog(store)
    expect(store.jobStatus()).toMatchObject({ state: 'done', expected: 2, acquired: 2 })
    expect(view.prints.find((print) => print.id === 'me01-086')).toMatchObject({
      name: 'Mega Absol ex', regulationMark: 'I', detailAt: expect.any(String),
      thumbnail: 'pokeguru://cards/me01-086.webp'
    })
    expect(existsSync(join(folder, 'catalog-images', 'me01-086.webp'))).toBe(true)
    expect(view.prints.find((print) => print.id === 'sve-005')).toMatchObject({
      category: 'Energy', detailAt: expect.any(String)
    })
  } finally {
    store.close()
    rmSync(folder, { recursive: true, force: true })
  }
}, 60_000)

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
