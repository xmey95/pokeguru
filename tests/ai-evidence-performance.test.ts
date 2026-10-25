import { performance } from 'node:perf_hooks'
import { expect, it } from 'vitest'
import { searchCatalogEvidence } from '../src/main/catalog-evidence-search'
import { CATALOG_SOURCE, type CatalogPrint, type CatalogView } from '../src/shared/catalog'

function fixture(count: number): CatalogView {
  const prints: CatalogPrint[] = Array.from({ length: count }, (_, index) => ({
    id: `me01-${String(index + 1).padStart(5, '0')}`, setId: 'me01',
    setName: 'Synthetic set', localId: String(index + 1), name: `Card ${index + 1}`,
    category: 'Trainer', rarity: 'Common', regulationMark: 'I', variants: null,
    identityId: `card-${index + 1}`, identityBasis: 'trainer-text',
    gameplay: { hp: null, types: [], evolveFrom: null, attacks: [], abilities: [],
      effect: `Draw ${index % 4 + 1} cards from your deck.`, trainerType: 'Item',
      weaknesses: [], resistances: [], retreat: null },
    imageBase: null, thumbnail: null, highImageAvailable: null, sourceUpdated: null,
    sourceUrl: `https://api.tcgdex.net/v2/en/cards/me01-${index + 1}`,
    detailAt: '2026-10-25T00:00:00Z', error: null }))
  return { circuit: 'WESTERN', source: CATALOG_SOURCE, sourceLanguage: 'en',
    scope: { kind: 'standard-marks', setIds: ['me01'], names: [] },
    syncedAt: '2026-10-25T00:00:00Z', sets: [], prints }
}

it.skipIf(process.env.POKEGURU_PERF !== '1')('measures 5k/10k print queries separately from Codex latency', () => {
  for (const count of [5000, 10000]) {
    const catalog = fixture(count)
    const start = performance.now()
    const first = searchCatalogEvidence(catalog, { terms: ['draw'], limit: 12,
      asOf: '2026-10-25' })
    const buildMs = performance.now() - start
    const warmStart = performance.now()
    const warm = searchCatalogEvidence(catalog, { terms: ['draw'], limit: 12,
      asOf: '2026-10-25' })
    const warmMs = performance.now() - warmStart
    const responseBytes = Buffer.byteLength(JSON.stringify(first), 'utf8')
    expect(first.totalMatches).toBe(count)
    expect(first.matches).toHaveLength(12)
    expect(warm.snapshotHash).toBe(first.snapshotHash)
    console.log(`AI evidence fixture ${count}: build+query ${buildMs.toFixed(1)} ms; ` +
      `warm query ${warmMs.toFixed(1)} ms; 12-result response ${responseBytes} bytes`)
  }
}, 30_000)
