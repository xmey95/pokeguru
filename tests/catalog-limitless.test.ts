import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { fetchCatalogImage, fetchLimitlessImageIndex } from '../src/main/catalog'
import type { CatalogPrint } from '../src/shared/catalog'

afterEach(() => vi.unstubAllGlobals())

const image = 'https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpci/MEE/MEE_001_R_EN_SM.png'
const png = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0])
const print = (id: string): CatalogPrint => ({ id, setId: 'mee', setName: 'Mega Evolution Energy',
  localId: id.split('-')[1], name: 'Grass Energy', category: null, stage: null, energyType: null,
  rarity: null, regulationMark: null, variants: null, identityId: null, identityBasis: null,
  imageBase: null, thumbnail: null, highImageAvailable: null, sourceUpdated: null,
  sourceUrl: `https://api.tcgdex.net/v2/en/cards/${id}`, detailAt: null, error: null })

it('usa solo il link Limitless con set, numero e CDN corrispondenti', async () => {
  const html = `<div class="card-search-grid">
    <a href="/cards/MEE/1"><img src="${image}"></a>
    <a href="/cards/MEE/2"><img src="${image}"></a>
    <a href="/cards/MEE/3"><img src="https://example.com/tpci/MEE/MEE_003_R_EN_SM.png"></a>
    <a href="/cards/SVE/4"><img src="${image}"></a>
  </div>`
  const fetchMock = vi.fn(async () => new Response(html, { status: 200 }))
  vi.stubGlobal('fetch', fetchMock)
  const index = await fetchLimitlessImageIndex([print('mee-001'), print('mee-002'), print('mee-003'), print('mee-004')])
  expect([...index]).toEqual([['mee-001', image]])
  expect(fetchMock).toHaveBeenCalledTimes(1)
})

it('conserva solo PNG valido nella cache locale', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'pokeguru-limitless-image-'))
  try {
    const fetchMock = vi.fn(async () => new Response(png, { status: 200,
      headers: { 'content-type': 'image/png' } }))
    vi.stubGlobal('fetch', fetchMock)
    const result = await fetchCatalogImage(image, 'mee-001', folder)
    expect(result).toEqual({ thumbnail: 'pokeguru://cards/mee-001.png', highImageAvailable: null })
    expect(existsSync(join(folder, 'mee-001.png'))).toBe(true)
    expect((await fetchCatalogImage('https://example.com/tpci/MEE/MEE_001_R_EN_SM.png', 'mee-001', folder)).thumbnail).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  } finally { rmSync(folder, { recursive: true, force: true }) }
})

it('rifiuta risposte con MIME o firma PNG inattesi', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(png, { status: 200,
    headers: { 'content-type': 'image/jpeg' } })))
  expect((await fetchCatalogImage(image, 'mee-001')).thumbnail).toBeNull()
  vi.stubGlobal('fetch', vi.fn(async () => new Response('not a png', { status: 200,
    headers: { 'content-type': 'image/png' } })))
  expect((await fetchCatalogImage(image, 'mee-001')).thumbnail).toBeNull()
})
