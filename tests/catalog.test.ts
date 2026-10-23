import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CatalogStore, fetchCatalogSample } from '../src/main/catalog'

const folders: string[] = []
afterEach(() => {
  vi.unstubAllGlobals()
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true })
})

function path(): string {
  const folder = mkdtempSync(join(tmpdir(), 'pokeguru-catalog-'))
  folders.push(folder)
  return join(folder, 'catalog.sqlite')
}

function fixtureFetch(): ReturnType<typeof vi.fn> {
  const sets: Record<string, { name: string; total: number; cards: { id: string; localId: string; name: string }[] }> = {
    sv01: { name: 'Scarlet & Violet', total: 258, cards: [
      { id: 'sv01-191', localId: '191', name: 'Rare Candy' },
      { id: 'sv01-256', localId: '256', name: 'Rare Candy' }
    ] },
    sv02: { name: 'Paldea Evolved', total: 279, cards: [
      { id: 'sv02-185', localId: '185', name: 'Iono' },
      { id: 'sv02-254', localId: '254', name: 'Iono' },
      { id: 'sv02-172', localId: '172', name: "Boss's Orders" },
      { id: 'sv02-999', localId: '999', name: 'Mew ex' },
      { id: 'sv02-998', localId: '998', name: 'Mew ex' }
    ] },
    'sv04.5': { name: 'Paldean Fates', total: 245, cards: [
      { id: 'sv04.5-080', localId: '080', name: 'Iono' }
    ] },
    me01: { name: 'Mega Evolution', total: 188, cards: [
      { id: 'me01-125', localId: '125', name: 'Rare Candy' },
      { id: 'me01-114', localId: '114', name: "Boss's Orders" },
      { id: 'me01-086', localId: '086', name: 'Mega Absol ex' },
      { id: 'me01-161', localId: '161', name: 'Mega Absol ex' }
    ] },
    'me02.5': { name: 'Ascended Heroes', total: 295, cards: [
      { id: 'me02.5-172', localId: '172', name: 'Mega Audino ex' },
      { id: 'me02.5-253', localId: '253', name: 'Mega Audino ex' }
    ] }
  }
  const effect = 'Each player draws a card.'
  const cards: Record<string, object> = {
    'sv01-191': { name: 'Rare Candy', category: 'Trainer', trainerType: 'Item', effect: 'Evolve a Pokémon.', rarity: 'Common' },
    'sv01-256': { name: 'Rare Candy', category: 'Trainer', trainerType: 'Item', effect: 'Evolve a Pokémon.', rarity: 'Hyper rare' },
    'sv02-185': { name: 'Iono', category: 'Trainer', trainerType: 'Supporter', effect, rarity: 'Uncommon', regulationMark: 'G', image: 'https://assets.tcgdex.net/en/sv/sv02/185', variants: { normal: true, reverse: true } },
    'sv02-254': { name: 'Iono', category: 'Trainer', trainerType: 'Supporter', effect, rarity: 'Ultra Rare' },
    'sv02-172': { name: "Boss's Orders", category: 'Trainer', trainerType: 'Supporter', effect: 'Switch their Active Pokémon.', rarity: 'Rare', regulationMark: 'G' },
    'sv02-999': { name: 'Mew ex', category: 'Pokemon', stage: 'Basic', rarity: 'Double rare' },
    'sv04.5-080': { name: 'Iono', category: 'Trainer', trainerType: 'Supporter', effect: 'A different effect.', rarity: 'Uncommon' },
    'me01-125': { name: 'Rare Candy', category: 'Trainer', trainerType: 'Item', effect: 'Evolve a Pokémon.', rarity: 'Common', regulationMark: 'I' },
    'me01-114': { name: "Boss's Orders", category: 'Trainer', trainerType: 'Supporter', effect: 'Switch their Active Pokémon.', rarity: 'Uncommon', regulationMark: 'I' },
    'me01-086': { name: 'Mega Absol ex', category: 'Pokemon', stage: 'Basic', rarity: 'Double rare', regulationMark: 'I' },
    'me01-161': { name: 'Mega Absol ex', category: 'Pokemon', stage: 'Basic', rarity: 'Ultra Rare', regulationMark: 'I' },
    'me02.5-172': { name: 'Mega Audino ex', category: 'Pokemon', stage: 'Basic', rarity: 'Double rare', regulationMark: 'J' },
    'me02.5-253': { name: 'Mega Audino ex', category: 'Pokemon', stage: 'Basic', rarity: 'Ultra Rare', regulationMark: 'J' }
  }
  const mock = vi.fn(async (input: string | URL | Request, options?: RequestInit) => {
    const url = String(input)
    const id = url.split('/').at(-1)!
    if (url.includes('/sets/')) {
      const set = sets[id]
      return new Response(JSON.stringify({ id, name: set.name, cardCount: { total: set.total }, cards: set.cards }), { status: 200 })
    }
    if (url.includes('/cards/')) {
      if (!cards[id]) return new Response('', { status: 404 })
      return new Response(JSON.stringify({ id, localId: id.split('-').at(-1), ...cards[id] }), { status: 200 })
    }
    if (options?.method === 'HEAD') return new Response(null, { status: 200 })
    return new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { 'content-type': 'image/webp' } })
  })
  vi.stubGlobal('fetch', mock)
  return mock
}

describe('Catalogo occidentale', () => {
  it('misura il campione, collega solo testi equivalenti e mantiene stampe/rarità', async () => {
    fixtureFetch()
    const sample = await fetchCatalogSample()
    expect(sample.sets.map((set) => [set.id, set.sourceTotal, set.sampleTotal])).toEqual([
      ['sv01', 258, 2], ['sv02', 279, 5], ['sv04.5', 245, 1], ['me01', 188, 4], ['me02.5', 295, 2]
    ])
    const iono = sample.prints.filter((print) => print.name === 'Iono')
    expect(iono[0].identityId).toBe(iono[1].identityId)
    expect(iono[2].identityId).not.toBe(iono[0].identityId)
    expect(iono.map((print) => print.rarity)).toEqual(['Uncommon', 'Ultra Rare', 'Uncommon'])
    expect(iono[0].regulationMark).toBe('G')
    expect(sample.prints.find((print) => print.id === 'sv02-998')).toMatchObject({ detailAt: null, error: expect.any(String) })
    expect(sample.prints.find((print) => print.id === 'sv02-999')?.stage).toBe('Basic')
    expect(iono[0].thumbnail).toMatch(/^data:image\/webp;base64,/)
    expect(iono[0].highImageAvailable).toBe(true)
    expect(sample.prints.find((print) => print.id === 'me01-086')).toMatchObject({ stage: 'Basic', regulationMark: 'I' })
    expect(sample.prints.find((print) => print.id === 'me02.5-172')).toMatchObject({ stage: 'Basic', regulationMark: 'J' })
    expect(sample.prints.find((print) => print.id === 'sv01-191')?.identityId)
      .toBe(sample.prints.find((print) => print.id === 'me01-125')?.identityId)
  })

  it('sincronizza senza duplicati e conserva la ricerca locale dopo la riapertura', async () => {
    const mock = fixtureFetch()
    const database = path()
    const store = new CatalogStore(database)
    const first = await fetchCatalogSample()
    store.save(first)
    store.save(await fetchCatalogSample())
    expect(store.view().prints).toHaveLength(14)
    mock.mockImplementation(async () => { throw new Error('offline') })
    await expect(fetchCatalogSample()).rejects.toThrow('offline')
    store.close()
    const reopened = new CatalogStore(database)
    const view = reopened.view()
    expect(view.prints.filter((print) => print.name === 'Rare Candy')).toHaveLength(3)
    expect(view.prints.find((print) => print.id === 'sv02-185')?.thumbnail).toMatch(/^data:image\/webp;base64,/)
    expect(view.prints.find((print) => print.id === 'sv02-185')?.regulationMark).toBe('G')
    expect(view.sets.reduce((total, set) => total + set.sourceTotal, 0)).toBe(1265)
    reopened.close()
  })

  it('non cancella dettagli già acquisiti quando un singolo dettaglio fallisce al refresh', async () => {
    const database = path()
    const store = new CatalogStore(database)
    fixtureFetch()
    const sample = await fetchCatalogSample()
    store.save(sample)
    const old = store.view().prints.find((print) => print.id === 'sv02-185')!
    store.save({ ...sample, prints: sample.prints.map((print) => print.id === old.id
      ? { ...print, detailAt: null, thumbnail: null, rarity: null, error: 'HTTP 503' } : print) })
    const current = store.view().prints.find((print) => print.id === old.id)!
    expect(current.rarity).toBe('Uncommon')
    expect(current.thumbnail).toBe(old.thumbnail)
    expect(current.error).toBe('HTTP 503')
    store.save({ ...sample, prints: sample.prints.map((print) => print.id === old.id
      ? { ...print, thumbnail: null, highImageAvailable: null } : print) })
    expect(store.view().prints.find((print) => print.id === old.id)?.thumbnail).toBe(old.thumbnail)
    store.close()
  })
})
