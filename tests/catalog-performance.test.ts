import { DatabaseSync } from 'node:sqlite'
import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { performance } from 'node:perf_hooks'
import { it } from 'vitest'
import { CatalogStore } from '../src/main/catalog'
import type { CatalogPrint } from '../src/shared/catalog'

const benchmark = process.env.POKEGURU_CATALOG_PERF === '1' ? it : it.skip

benchmark('measures full Catalog views with 5k and 10k prints', () => {
  const temporary = mkdtempSync(join(tmpdir(), 'pokeguru-catalog-perf-'))
  const path = join(temporary, 'catalog.sqlite')
  let store = new CatalogStore(path)
  const db = new DatabaseSync(path)
  try {
    const now = '2026-10-25T00:00:00.000Z'
    const addSet = db.prepare(`INSERT INTO catalog_sets
      (id, name, source_total, sample_total, fetched_at) VALUES (?, ?, ?, ?, ?)`)
    for (let set = 0; set < 10; set++) addSet.run(`s${set}`, `Synthetic set ${set}`, 1000, 1000, now)
    db.prepare(`INSERT INTO catalog_scope (id, kind) VALUES (1, 'standard-marks')`).run()
    db.prepare(`INSERT INTO catalog_sync (id, fetched_at) VALUES (1, ?)`).run(now)
    const addPrint = db.prepare('INSERT INTO catalog_prints (id, set_id, payload) VALUES (?, ?, ?)')
    const addTarget = db.prepare('INSERT INTO catalog_targets (print_id) VALUES (?)')
    const thumbnail = `data:image/webp;base64,${'A'.repeat(4096)}`
    db.exec('BEGIN IMMEDIATE')
    try {
      for (let index = 0; index < 10_000; index++) {
        const setId = `s${Math.floor(index / 1000)}`
        const id = `${setId}-${String(index).padStart(5, '0')}`
        const print: CatalogPrint = {
          id, setId, setName: `Synthetic set ${Math.floor(index / 1000)}`,
          localId: String(index % 1000), name: `Synthetic card ${index}`,
          category: 'Pokemon', stage: 'Basic', rarity: 'Common', regulationMark: 'I',
          variants: null, identityId: `identity-${index}`, identityBasis: 'pokemon-text',
          imageBase: null, thumbnail: index % 20 === 0 ? thumbnail : null,
          highImageAvailable: null, sourceUpdated: null,
          sourceUrl: `https://api.tcgdex.net/v2/en/cards/${id}`, detailAt: now, error: null,
          gameplaySchemaVersion: 1,
          gameplay: { hp: 100, types: ['Grass'], evolveFrom: null, attacks: [], abilities: [],
            effect: null, trainerType: null, weaknesses: [], resistances: [], retreat: 1 }
        }
        addPrint.run(id, setId, JSON.stringify(print))
        addTarget.run(id)
        if (index === 4_999 || index === 9_999) {
          db.exec('COMMIT')
          const beforeHeap = process.memoryUsage().heapUsed
          const start = performance.now()
          const value = store.view()
          const viewMs = performance.now() - start
          const repeatStart = performance.now()
          store.view()
          const repeatedViewMs = performance.now() - repeatStart
          const cloneStart = performance.now()
          structuredClone(value)
          const cloneMs = performance.now() - cloneStart
          const bytes = Buffer.byteLength(JSON.stringify(value))
          const overviewStart = performance.now()
          const overview = store.browseOverview()
          const overviewMs = performance.now() - overviewStart
          const searchStart = performance.now()
          const page = store.browseSearch('Synthetic card', 'all', 0)
          const searchMs = performance.now() - searchStart
          const detailStart = performance.now()
          const detail = store.browseGroup(page.groups[0].key)
          const detailMs = performance.now() - detailStart
          console.log(JSON.stringify({ prints: index + 1, viewMs: +viewMs.toFixed(2),
            repeatedViewMs: +repeatedViewMs.toFixed(2),
            cloneMs: +cloneMs.toFixed(2), bytes,
            overviewMs: +overviewMs.toFixed(2), overviewBytes: Buffer.byteLength(JSON.stringify(overview)),
            searchMs: +searchMs.toFixed(2), searchBytes: Buffer.byteLength(JSON.stringify(page)),
            detailMs: +detailMs.toFixed(2), detailBytes: Buffer.byteLength(JSON.stringify(detail)),
            heapDelta: process.memoryUsage().heapUsed - beforeHeap }))
          if (index !== 9_999) {
            store.close()
            store = new CatalogStore(path)
            db.exec('BEGIN IMMEDIATE')
          }
        }
      }
    } catch (error) { if (db.isOpen) db.exec('ROLLBACK'); throw error }
  } finally {
    db.close()
    store.close()
    if (realpathSync(dirname(temporary)) !== realpathSync(tmpdir()) ||
      !basename(temporary).startsWith('pokeguru-catalog-perf-')) throw new Error('Percorso temporaneo inatteso.')
    rmSync(temporary, { recursive: true, force: true })
  }
}, 120_000)
