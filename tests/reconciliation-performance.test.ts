import { performance } from 'node:perf_hooks'
import { it } from 'vitest'
import { parseDeck } from '../src/shared/deck-import'
import { buildDeckCards, suggestPrints } from '../src/shared/reconciliation'
import type { CatalogPrint, CatalogView } from '../src/shared/catalog'

const benchmark = process.env.POKEGURU_RECONCILIATION_PERF === '1' ? it : it.skip

benchmark('measures deck grouping against ten thousand catalog prints', () => {
  const prints: CatalogPrint[] = Array.from({ length: 10_000 }, (_, index) => ({
    id: `s0-${String(index).padStart(5, '0')}`, setId: 's0', setName: 'Synthetic set',
    localId: String(index), name: `Synthetic card ${index}`, category: 'Pokemon',
    rarity: 'Common', variants: null, identityId: `identity-${index}`,
    identityBasis: 'pokemon-text', imageBase: null, thumbnail: null,
    highImageAvailable: null, sourceUpdated: null, sourceUrl: '',
    detailAt: '2026-10-25T00:00:00Z', error: null
  }))
  const catalog: CatalogView = { circuit: 'WESTERN', source: 'TCGdex REST v2/en', sourceLanguage: 'en',
    scope: { setIds: ['s0'], names: [] }, syncedAt: '2026-10-25T00:00:00Z', sets: [], prints }
  const rawText = Array.from({ length: 40 }, (_, index) =>
    `1 Synthetic card ${index * 200} S0 ${index * 200}`).join('\n')
  const baseline = { projectId: 'performance', source: 'paste' as const, fileName: null,
    importedAt: '2026-10-25T00:00:00Z', rawText, ...parseDeck(rawText) }
  const samples: number[] = []
  const suggestionSamples: number[] = []
  let cards: ReturnType<typeof buildDeckCards> = []
  for (let index = 0; index < 3; index++) {
    const start = performance.now()
    cards = buildDeckCards(baseline, catalog)
    samples.push(+(performance.now() - start).toFixed(2))
    const suggestStart = performance.now()
    for (const line of baseline.lines) suggestPrints(line, catalog)
    suggestionSamples.push(+(performance.now() - suggestStart).toFixed(2))
  }
  console.log(JSON.stringify({ prints: prints.length, lines: 40, samples, suggestionSamples,
    cards: cards.length, recognized: cards.filter((card) => card.status === 'recognized').length }))
}, 30_000)
