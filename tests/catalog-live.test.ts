import { describe, expect, it } from 'vitest'
import { fetchCatalogSample } from '../src/main/catalog'

describe('TCGdex reale', () => {
  it.skipIf(process.env.POKEGURU_CATALOG_LIVE !== '1')('acquisisce il campione occidentale dichiarato', async () => {
    const sample = await fetchCatalogSample()
    expect(sample.sets.map((set) => set.id)).toEqual(['sv01', 'sv02', 'sv04.5', 'me01', 'me02.5'])
    expect(sample.sets.reduce((sum, set) => sum + set.sourceTotal, 0)).toBeGreaterThanOrEqual(782)
    expect(sample.prints.length).toBe(sample.sets.reduce((sum, set) => sum + set.sampleTotal, 0))
    expect(new Set(sample.prints.map((print) => print.id)).size).toBe(sample.prints.length)
    const iono = sample.prints.filter((print) => print.name === 'Iono' && print.detailAt)
    expect(new Set(iono.map((print) => print.setId)).size).toBeGreaterThanOrEqual(2)
    expect(new Set(iono.map((print) => print.identityId)).size).toBe(1)
    expect(new Set(iono.map((print) => print.rarity)).size).toBeGreaterThanOrEqual(2)
    expect(sample.prints.find((print) => print.id === 'me01-086')).toMatchObject({
      name: 'Mega Absol ex', regulationMark: 'I', stage: 'Basic', detailAt: expect.any(String)
    })
    expect(sample.prints.find((print) => print.id === 'me02.5-172')).toMatchObject({
      name: 'Mega Audino ex', regulationMark: 'J', stage: 'Basic', detailAt: expect.any(String)
    })
    const rareCandy = sample.prints.filter((print) =>
      ['sv01-191', 'me01-125'].includes(print.id))
    expect(rareCandy).toHaveLength(2)
    expect(rareCandy.every((print) => print.detailAt !== null)).toBe(true)
    expect(rareCandy[0].identityId).toBe(rareCandy[1].identityId)
    expect(rareCandy.map((print) => print.regulationMark)).toEqual(['G', 'I'])
    const bosses = sample.prints.filter((print) => ['sv02-172', 'me01-114'].includes(print.id))
    expect(bosses).toHaveLength(2)
    expect(bosses.every((print) => print.detailAt !== null)).toBe(true)
    expect(bosses[0].identityId).toBe(bosses[1].identityId)
    expect(bosses.map((print) => print.regulationMark)).toEqual(['G', 'I'])
    expect(sample.prints.filter((print) => print.thumbnail).length).toBeGreaterThan(0)
    console.info(JSON.stringify({
      sets: sample.sets.map((set) => ({ id: set.id, total: set.sourceTotal, sample: set.sampleTotal })),
      acquired: sample.prints.filter((print) => print.detailAt).length,
      missing: sample.prints.filter((print) => !print.detailAt).map((print) => print.id),
      rarity: sample.prints.filter((print) => print.rarity).length,
      thumbnails: sample.prints.filter((print) => print.thumbnail).length,
      high: sample.prints.filter((print) => print.highImageAvailable).length
    }))
  }, 120_000)
})
