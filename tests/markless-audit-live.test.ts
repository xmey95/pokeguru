import { expect, it } from 'vitest'
import { fetchStandardManifest } from '../src/main/catalog'

it.skipIf(process.env.POKEGURU_MARKLESS_AUDIT_LIVE !== '1')('classifica le stampe recenti senza marchio', async () => {
  const response = await fetch('https://api.tcgdex.net/v2/en/cards?regulationMark=null:')
  expect(response.ok).toBe(true)
  const cards = await response.json() as { id: string; name: string }[]
  const recent = cards.filter((card) => /^(?:sv\d|me\d|sve-|mee-|mep-|svp-)/.test(card.id))
  const energy = recent.filter((card) => card.id.startsWith('sve-') || card.id.startsWith('mee-'))
  const outside = recent.filter((card) => !energy.includes(card))
  const basicOutside = outside.filter((card) => /^Basic .* Energy$/.test(card.name))
  const other = outside.filter((card) => !basicOutside.includes(card))
  const manifest = await fetchStandardManifest()
  const included = new Set(manifest.prints.map((print) => print.id))

  console.log(`Audit senza marchio ${manifest.fetchedAt}: ${JSON.stringify({
    energyCurrent: energy.length, basicEnergyOlder: basicOutside.map((card) => card.id),
    other: other.map((card) => card.id)
  })}`)
  expect(energy).toHaveLength(40)
  expect(energy.every((card) => included.has(card.id))).toBe(true)
  expect(basicOutside).toHaveLength(8)
  expect(other.map((card) => card.id).sort()).toEqual(['mep-Museum', 'svp-500'])
  expect(other.every((card) => !included.has(card.id))).toBe(true)
}, 30_000)
