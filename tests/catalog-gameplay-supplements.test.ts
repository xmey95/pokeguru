import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { DatabaseSync } from 'node:sqlite'
import { expect, it } from 'vitest'
import { CatalogStore } from '../src/main/catalog'
import { supplementCatalogGameplay } from '../src/main/catalog-gameplay-supplements'
import supplements from '../src/main/catalog-gameplay-supplements.json'
import { hasComparableGameplay, gameplaySummary } from '../src/shared/card-gameplay'
import type { CardGameplay, CatalogPrint } from '../src/shared/catalog'

const prints: CatalogPrint[] = supplements.entries.map(entry => ({
  id: entry.id, setId: entry.id.split('-')[0], localId: entry.id.split('-')[1], setName: 'Audit',
  name: entry.name, category: entry.category, stage: entry.stage, energyType: null,
  rarity: null, variants: null, identityId: entry.id, identityBasis: 'unverified',
  gameplaySchemaVersion: 1, gameplay: entry.expected as CardGameplay, imageBase: null, thumbnail: null,
  highImageAvailable: null, sourceUpdated: null, detailAt: '2026-10-25T00:00:00Z',
  sourceUrl: `https://api.tcgdex.net/v2/en/cards/${entry.id}`, error: null
}))

it('completes exactly the 19 audited gaps and preserves costs that were already supplied', () => {
  expect(prints).toHaveLength(19)
  for (const original of prints) {
    expect(hasComparableGameplay(original.category, original.stage!, null, original.gameplay!)).toBe(false)
    const value = supplementCatalogGameplay(original)
    expect(hasComparableGameplay(value.category, value.stage!, null, value.gameplay!)).toBe(true)
    expect(value.gameplaySupplement?.sourceUrl).toMatch(/\/high.webp$/)
    expect(gameplaySummary(value.gameplay!, value)).toContain(value.gameplaySupplement!.sourceUrl)
    expect(value.identityId).toBe(original.identityId)
    expect(supplementCatalogGameplay(value)).toBe(value)
  }
  const growlithe = supplementCatalogGameplay(prints.find(p => p.id === 'sv06-099')!)
  expect(growlithe.gameplay!.attacks.map(a => a.cost)).toEqual([[], ['Fighting', 'Colorless']])
})

it('does not infer free attacks for unknown prints or override changed/complete upstream data', () => {
  const print = prints.find(p => p.id === 'me01-071')!
  for (const changed of [{ ...print, id: 'me01-072' }, { ...print, name: 'Other' },
    { ...print, localId: '072' }, { ...print, gameplay: { ...print.gameplay!, hp: 50 } },
    { ...print, gameplay: { ...print.gameplay!, attacks: print.gameplay!.attacks.map(a => ({ ...a, cost: ['Fighting'] })) } }]) {
    expect(supplementCatalogGameplay(changed)).toBe(changed)
  }
  const trainer = prints.find(p => p.id === '30th-127')!
  const corrected = { ...trainer, gameplay: { ...trainer.gameplay!, effect: 'New upstream effect' } }
  expect(supplementCatalogGameplay(corrected)).toBe(corrected)
})

it('repairs coverage on reading an old cache, including after reopen, without rewriting its payloads', () => {
  const folder = mkdtempSync(join(tmpdir(), 'pokeguru-supplements-'))
  const path = join(folder, 'catalog.sqlite')
  let store = new CatalogStore(path)
  try {
    const sets = [...new Set(prints.map(p => p.setId))].map(id => ({ id, name: id,
      sourceTotal: 300, sampleTotal: prints.filter(p => p.setId === id).length, fetchedAt: '2026-10-25T00:00:00Z' }))
    store.save({ sets, prints, fetchedAt: '2026-10-25T00:00:00Z' }, 'standard-marks')
    expect(store.view().standardCoverage).toMatchObject({ acquired: 19, gameplayAcquired: 19, gameplayMissing: 0 })
    expect(store.getPrint('30th-126')?.gameplay?.effect).toContain('Rule Box')
    const db = new DatabaseSync(path, { readOnly: true })
    try {
      const raw = JSON.parse((db.prepare('SELECT payload FROM catalog_prints WHERE id = ?').get('30th-126') as { payload: string }).payload)
      expect(raw.gameplay.effect).toBeNull()
      expect(raw.gameplaySupplement).toBeUndefined()
    } finally { db.close() }
    store.close(); store = new CatalogStore(path)
    expect(store.view().standardCoverage?.gameplayMissing).toBe(0)
  } finally { store.close(); rmSync(folder, { recursive: true, force: true }) }
})
