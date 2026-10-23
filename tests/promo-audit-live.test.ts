import { expect, it } from 'vitest'
import { fetchStandardManifest } from '../src/main/catalog'
import { loadPromoPackage } from '../src/main/promo-package'
import { promoKey } from '../src/main/promo-legality'

it.skipIf(process.env.POKEGURU_PROMO_AUDIT_LIVE !== '1')('confronta registro ufficiale e indici TCGdex delle promo', async () => {
  const { registry } = await loadPromoPackage(undefined, async () => { throw new Error('offline') })
  const manifest = await fetchStandardManifest()
  const included = new Set(manifest.prints.map((print) => print.id))
  const report: Record<string, { available: number; inSet: number; inManifest: number; missingInSet: string[]; outsideManifest: string[] }> = {}

  for (const series of ['mep', 'svp']) {
    const response = await fetch(`https://api.tcgdex.net/v2/en/sets/${series}`)
    expect(response.ok).toBe(true)
    const set = await response.json() as { cards: { id: string; localId: string }[] }
    const cards = new Map(set.cards.map((card) => [promoKey(series, card.localId), card.id]))
    const official = [...registry.entries].filter(([key, entry]) => key.startsWith(`${series.toUpperCase()}:`) && entry.state === 'available')
    const missingInSet = official.filter(([key]) => !cards.has(key)).map(([key]) => key)
    const outsideManifest = official.filter(([key]) => cards.has(key) && !included.has(cards.get(key)!)).map(([key]) => key)
    report[series.toUpperCase()] = { available: official.length, inSet: official.length - missingInSet.length,
      inManifest: official.length - missingInSet.length - outsideManifest.length, missingInSet, outsideManifest }
  }

  console.log(`Audit promo ${manifest.fetchedAt}: ${JSON.stringify(Object.fromEntries(Object.entries(report).map(([series, data]) =>
    [series, { available: data.available, inSet: data.inSet, inManifest: data.inManifest,
      missingInSet: data.missingInSet, outsideManifestCount: data.outsideManifest.length }])) )}`)
  expect(report.MEP.missingInSet).toEqual([])
  expect(report.SVP.missingInSet).toEqual([])
  expect(report.MEP.outsideManifest).toEqual([])

  const retired = new Set<string>()
  for (const mark of ['G', 'g']) {
    const response = await fetch(`https://api.tcgdex.net/v2/en/cards?regulationMark=eq:${mark}`)
    expect(response.ok).toBe(true)
    const cards = await response.json() as { id: string }[]
    cards.forEach((card) => retired.add(card.id))
  }
  expect(report.SVP.outsideManifest.every((key) => retired.has(`svp-${String(key.split(':')[1]).padStart(3, '0')}`))).toBe(true)
}, 30_000)
