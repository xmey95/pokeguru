import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CatalogStore, enrichCatalogPrints, fetchCatalogSample } from '../src/main/catalog'

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
  const abbreviations: Record<string, string> = {
    sv01: 'SVI', sv02: 'PAL', 'sv04.5': 'PAF', me01: 'MEG', 'me02.5': 'ASC'
  }
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
      { id: 'me01-161', localId: '161', name: 'Mega Absol ex' },
      { id: 'me01-162', localId: '162', name: 'Mega Absol ex' }
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
    'me01-086': { name: 'Mega Absol ex', category: 'Pokemon', stage: 'Basic', rarity: 'Double rare', regulationMark: 'I',
      hp: 280, types: ['Darkness'], retreat: 2, attacks: [{ name: 'Darkness Attack', cost: ['Darkness', 'Colorless'], damage: 180,
        effect: 'Discard an Energy from this Pokémon.' }] },
    'me01-161': { name: 'Mega Absol ex', category: 'Pokemon', stage: 'Basic', rarity: 'Ultra Rare', regulationMark: 'I',
      hp: 280, types: ['Darkness'], retreat: 2, attacks: [{ name: 'Darkness Attack', cost: ['Darkness', 'Colorless'], damage: 180,
        effect: 'Discard an Energy from this Pokémon.' }] },
    'me01-162': { name: 'Mega Absol ex', category: 'Pokemon', stage: 'Basic', rarity: 'Ultra Rare', regulationMark: 'I',
      hp: 280, types: ['Darkness'], retreat: 2, attacks: [{ name: 'Darkness Attack', cost: ['Darkness', 'Colorless'], damage: 190,
        effect: 'Discard an Energy from this Pokémon.' }] },
    'me02.5-172': { name: 'Mega Audino ex', category: 'Pokemon', stage: 'Basic', rarity: 'Double rare', regulationMark: 'J' },
    'me02.5-253': { name: 'Mega Audino ex', category: 'Pokemon', stage: 'Basic', rarity: 'Ultra Rare', regulationMark: 'J' }
  }
  const mock = vi.fn(async (input: string | URL | Request, options?: RequestInit) => {
    const url = String(input)
    const id = url.split('/').at(-1)!
    if (url.includes('/sets/')) {
      const set = sets[id]
      return new Response(JSON.stringify({ id, name: set.name,
        abbreviation: { official: abbreviations[id] }, cardCount: { total: set.total },
        cards: set.cards }), { status: 200 })
    }
    if (url.includes('/cards/')) {
      if (!cards[id]) return new Response('', { status: 404 })
      return new Response(JSON.stringify({ id, localId: id.split('-').at(-1), ...cards[id] }), { status: 200 })
    }
    if (options?.method === 'HEAD') return new Response(null, { status: 200 })
    return new Response(new TextEncoder().encode('RIFF0000WEBP'), { status: 200, headers: { 'content-type': 'image/webp' } })
  })
  vi.stubGlobal('fetch', mock)
  return mock
}

describe('Catalogo occidentale', () => {
  it('misura il campione, collega solo testi equivalenti e mantiene stampe/rarità', async () => {
    fixtureFetch()
    const sample = await fetchCatalogSample()
    expect(sample.sets.map((set) => [set.id, set.sourceTotal, set.sampleTotal])).toEqual([
      ['sv01', 258, 2], ['sv02', 279, 5], ['sv04.5', 245, 1], ['me01', 188, 5], ['me02.5', 295, 2]
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
    expect(sample.prints.find((print) => print.id === 'me01-086')?.gameplay?.attacks[0])
      .toMatchObject({ cost: ['Darkness', 'Colorless'], damage: '180' })
    expect(sample.prints.find((print) => print.id === 'me01-086')?.identityId)
      .toBe(sample.prints.find((print) => print.id === 'me01-161')?.identityId)
    expect(sample.prints.find((print) => print.id === 'me01-086')?.identityId)
      .not.toBe(sample.prints.find((print) => print.id === 'me01-162')?.identityId)
    expect(sample.prints.find((print) => print.id === 'me01-086')?.identityBasis).toBe('pokemon-text')
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
    expect(store.view().prints).toHaveLength(15)
    mock.mockImplementation(async () => { throw new Error('offline') })
    await expect(fetchCatalogSample()).rejects.toThrow('offline')
    store.close()
    const reopened = new CatalogStore(database)
    const view = reopened.view()
    expect(reopened.setAbbreviations()).toMatchObject({ 'sv04.5': 'PAF', 'me02.5': 'ASC' })
    expect(view.prints.filter((print) => print.name === 'Rare Candy')).toHaveLength(3)
    expect(view.prints.find((print) => print.id === 'sv02-185')?.thumbnail).toMatch(/^data:image\/webp;base64,/)
    expect(view.prints.find((print) => print.id === 'sv02-185')?.regulationMark).toBe('G')
    expect(view.sets.reduce((total, set) => total + set.sourceTotal, 0)).toBe(1265)
    expect(view.sets.find((set) => set.id === 'me02.5')?.abbreviation).toBe('ASC')
    reopened.close()
  })

  it('restituisce pagine leggere e dettaglio su richiesta, invalidando la ricerca dopo un aggiornamento', async () => {
    fixtureFetch()
    const store = new CatalogStore(path())
    try {
      store.save(await fetchCatalogSample())
      const overview = store.browseOverview()
      expect('prints' in overview).toBe(false)
      expect(overview.stats.acquired).toBe(14)
      expect(overview.stats.missing).toBe(1)
      const first = store.browseSearch('', 'all', 0, 2)
      const second = store.browseSearch('', 'all', 2, 2)
      expect(first.groups).toHaveLength(2)
      expect(second.groups).toHaveLength(2)
      expect(first.groups[0].key).not.toBe(second.groups[0].key)
      const iono = store.browseSearch('sv02-254', 'sv02', 0)
      expect(iono.total).toBe(1)
      expect(iono.groups[0].printCount).toBe(2)
      expect('prints' in iono.groups[0]).toBe(false)
      const detail = store.browseGroup(iono.groups[0].key)
      expect(detail?.prints.map((print) => print.id)).toEqual(['sv02-185', 'sv02-254'])
      expect(detail?.prints[0].thumbnail).toMatch(/^data:image\/webp;base64,/)
      expect(store.browseSearch('sv02-254', 'me01', 0).total).toBe(0)
      const changed = store.getPrint('sv02-185')!
      store.savePrints([{ ...changed, name: 'Iono updated', detailAt: '2026-10-25T00:00:00.000Z' }])
      expect(store.browseSearch('Iono updated', 'all', 0).total).toBe(1)
    } finally { store.close() }
  })

  it('apre il catalogo precedente e aggiunge il codice set alla scansione successiva', async () => {
    const database = path()
    const old = new DatabaseSync(database)
    old.exec(`CREATE TABLE catalog_sets (id TEXT PRIMARY KEY, name TEXT NOT NULL,
      source_total INTEGER NOT NULL, sample_total INTEGER NOT NULL,
      fetched_at TEXT NOT NULL, release_date TEXT) STRICT`)
    old.close()
    fixtureFetch()
    const store = new CatalogStore(database)
    expect(store.view().sets).toEqual([])
    store.save(await fetchCatalogSample())
    expect(store.view().sets.find((set) => set.id === 'sv02')?.abbreviation).toBe('PAL')
    store.close()
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

  it('rimette in coda le schede vecchie prive delle proprietà di gioco', async () => {
    fixtureFetch()
    const store = new CatalogStore(path())
    const sample = await fetchCatalogSample()
    store.save({ ...sample, prints: sample.prints.map((print) => print.id === 'me01-086'
      ? { ...print, gameplay: undefined, gameplaySchemaVersion: undefined } : print) }, 'standard-marks')
    store.startJob('new')
    store.queueJob('new')
    expect(store.nextJobBatch(20).map((print) => print.id)).toContain('me01-086')
    store.close()
  })

  it('rimette in coda una miniatura locale persa senza riscaricare immagini assenti alla fonte', async () => {
    fixtureFetch()
    const store = new CatalogStore(path())
    try {
      const sample = await fetchCatalogSample()
      store.save({ ...sample, prints: sample.prints.map((print) => print.id === 'sv02-185'
        ? { ...print, thumbnail: 'pokeguru://cards/sv02-185.webp' } : print) }, 'standard-marks')
      store.startJob('new')
      store.queueJob('new')
      expect(store.nextJobBatch(30).map((print) => print.id)).toContain('sv02-185')
      expect(store.getPrint('sv02-185')?.thumbnail).toBeNull()
      mkdirSync(join(store.dataDir, 'catalog-images'), { recursive: true })
      writeFileSync(join(store.dataDir, 'catalog-images', 'sv02-185.webp'), 'RIFF0000WEBP')
      expect(store.getPrint('sv02-185')?.thumbnail).toBe('pokeguru://cards/sv02-185.webp')
      store.startJob('new')
      store.queueJob('new')
      expect(store.nextJobBatch(30).map((print) => print.id)).not.toContain('sv02-185')
      expect(store.browseOverview().stats.imageSourceMissing).toBeGreaterThan(0)
    } finally { store.close() }
  })

  it('acquisisce una scansione aggiunta alla fonte dopo il primo dettaglio', async () => {
    fixtureFetch()
    const store = new CatalogStore(path())
    try {
      const sample = await fetchCatalogSample()
      const target = sample.prints.find((print) => print.id === 'sv02-185')!
      store.save({ ...sample, prints: sample.prints.map((print) => print.id === target.id
        ? { ...print, imageBase: null, thumbnail: null, highImageAvailable: null } : print) }, 'standard-marks')
      store.save({ ...sample, prints: sample.prints.map((print) => print.id === target.id
        ? { ...print, detailAt: null, imageBase: target.imageBase, thumbnail: null } : print) }, 'standard-marks')
      const updated = store.getPrint(target.id)!
      expect(updated.detailAt).toBe(target.detailAt)
      expect(updated.imageBase).toBe(target.imageBase)
      expect(updated.thumbnail).toBeNull()
      store.startJob('new')
      store.queueJob('new')
      expect(store.nextJobBatch(30).map((print) => print.id)).toContain(target.id)
    } finally { store.close() }
  })

  it('conta una miniatura Limitless locale e la rimette in coda se il PNG manca', async () => {
    fixtureFetch()
    const store = new CatalogStore(path())
    try {
      const sample = await fetchCatalogSample()
      const target = { ...sample.prints.find((print) => print.id === 'me01-086')!,
        id: 'mee-001', setId: 'mee', setName: 'Mega Evolution Energy', localId: '001' }
      const imageBase = 'https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpci/MEE/MEE_001_R_EN_SM.png'
      store.save({ ...sample, sets: [...sample.sets, { id: 'mee', name: 'Mega Evolution Energy',
        sourceTotal: 16, sampleTotal: 1, fetchedAt: sample.fetchedAt }],
      prints: [...sample.prints, { ...target, imageBase, thumbnail: `pokeguru://cards/${target.id}.png` }] }, 'standard-marks')
      expect(store.getPrint(target.id)?.thumbnail).toBeNull()
      store.startJob('new')
      store.queueJob('new')
      expect(store.nextJobBatch(30).map((print) => print.id)).toContain(target.id)
      mkdirSync(join(store.dataDir, 'catalog-images'), { recursive: true })
      writeFileSync(join(store.dataDir, 'catalog-images', `${target.id}.png`), 'PNG')
      expect(store.getPrint(target.id)?.thumbnail).toBe(`pokeguru://cards/${target.id}.png`)
      expect(store.browseOverview().stats.limitlessThumbnails).toBe(1)
      store.startJob('new')
      store.queueJob('new')
      expect(store.nextJobBatch(30).map((print) => print.id)).not.toContain(target.id)
    } finally { store.close() }
  })

  it('arricchisce prima dell’analisi una stampa esatta già salvata senza regole', async () => {
    const mock = fixtureFetch()
    const store = new CatalogStore(path())
    const sample = await fetchCatalogSample()
    store.save({ ...sample, prints: sample.prints.map((print) => print.id === 'me01-086'
      ? { ...print, gameplay: undefined, gameplaySchemaVersion: undefined,
        identityId: print.id, identityBasis: 'unverified' as const } : print) })
    mock.mockClear()
    await enrichCatalogPrints(store, ['me01-086', 'me01-086'])
    expect(mock).toHaveBeenCalledTimes(1)
    expect(store.getPrint('me01-086')).toMatchObject({ gameplaySchemaVersion: 1,
      identityBasis: 'pokemon-text', gameplay: { hp: 280 } })
    store.close()
  })
})
