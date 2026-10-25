import { existsSync, mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { _electron as electron } from 'playwright-core'
import { expect, it } from 'vitest'
import { CatalogStore, fetchCatalogImage, fetchCatalogSample, fetchStandardManifest } from '../src/main/catalog'

const require = createRequire(import.meta.url)

it.skipIf(process.env.POKEGURU_CATALOG_IMAGE_LIVE !== '1')(
  'apre immagini TCGdex reali già acquisite dopo riavvio offline', async () => {
    const profile = mkdtempSync(join(tmpdir(), 'pokeguru-catalog-image-'))
    const database = join(profile, 'data', 'pokeguru.sqlite')
    mkdirSync(join(profile, 'data'), { recursive: true })
    const store = new CatalogStore(database)
    let application: Awaited<ReturnType<typeof electron.launch>> | null = null
    try {
      const sample = await fetchCatalogSample()
      expect(sample.prints.find((print) => print.id === 'me01-086')?.thumbnail).toMatch(/^data:image\/webp;base64,/)
      const absol = sample.prints.find((print) => print.id === 'me01-086')!
      const cachedImage = await fetchCatalogImage(absol.imageBase ?? undefined, absol.id,
        join(profile, 'data', 'catalog-images'))
      expect(cachedImage.thumbnail).toBe('pokeguru://cards/me01-086.webp')
      store.save({ ...sample, prints: sample.prints.map((print) => print.id === absol.id
        ? { ...print, ...cachedImage } : print) })
      store.close()
      application = await electron.launch({ executablePath: require('electron'), args: ['.'],
        cwd: resolve(import.meta.dirname, '..'), env: { ...process.env, POKEGURU_DATA_DIR: profile } })
      const page = await application.firstWindow()
      await page.route('https://**', (route) => route.abort())
      await page.getByRole('button', { name: 'Catalogo', exact: true }).first().click()
      await page.getByLabel('Cerca carta o stampa').fill('Mega Absol ex')
      await page.locator('.catalog-list').getByRole('button', { name: /Mega Absol ex/ }).first().click()
      const image = page.locator('.catalog-detail .card-artwork img')
      await image.waitFor()
      await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.naturalWidth)).toBeGreaterThan(0)
      expect(await image.getAttribute('src')).toBe('pokeguru://cards/me01-086.webp')
    } finally {
      await application?.close()
      try { store.close() } catch { /* Already closed after seeding. */ }
      rmSync(profile, { recursive: true, force: true })
    }
  }, 120_000)

it.skipIf(process.env.POKEGURU_CATALOG_IMAGE_SET_LIVE !== '1')(
  'misura le miniature acquisite da un set Standard reale', async () => {
    const profile = mkdtempSync(join(tmpdir(), 'pokeguru-catalog-set-images-'))
    const cacheDir = join(profile, 'catalog-images')
    try {
      const response = await fetch('https://api.tcgdex.net/v2/en/sets/me01')
      expect(response.ok).toBe(true)
      const set = await response.json() as { cards: { id: string; image?: string }[] }
      const prints = set.cards.filter((card) => card.image)
      expect(prints.length).toBeGreaterThan(150)
      let acquired = 0
      for (let offset = 0; offset < prints.length; offset += 3) {
        const batch = await Promise.all(prints.slice(offset, offset + 3).map(async (print) => {
          const image = await fetchCatalogImage(print.image, print.id, cacheDir)
          return image.thumbnail === `pokeguru://cards/${print.id}.webp` &&
            existsSync(join(cacheDir, `${print.id}.webp`))
        }))
        acquired += batch.filter(Boolean).length
      }
      console.log(`Miniature reali me01: ${acquired}/${prints.length} acquisite nella cache locale`)
      expect(acquired).toBe(prints.length)
    } finally { rmSync(profile, { recursive: true, force: true }) }
  }, 600_000)

it.skipIf(process.env.POKEGURU_CATALOG_FALLBACK_LIVE !== '1')(
  'misura e acquisisce le miniature Limitless delle stampe senza scansione TCGdex', async () => {
    const profile = mkdtempSync(join(tmpdir(), 'pokeguru-catalog-limitless-'))
    const cacheDir = join(profile, 'catalog-images')
    try {
      const manifest = await fetchStandardManifest()
      const fallback = manifest.prints.filter((print) =>
        print.imageBase?.startsWith('https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/'))
      const missing = manifest.prints.filter((print) => !print.imageBase)
      expect(manifest.prints.length).toBeGreaterThan(3_200)
      expect(fallback.length).toBeGreaterThanOrEqual(150)
      let acquired = 0
      for (const print of fallback) {
        const result = await fetchCatalogImage(print.imageBase!, print.id, cacheDir)
        if (result.thumbnail === `pokeguru://cards/${print.id}.png` &&
          existsSync(join(cacheDir, `${print.id}.png`))) acquired++
      }
      console.log(`Limitless: ${acquired}/${fallback.length} PNG acquisiti; ${missing.length} stampe senza URL in entrambe le fonti`)
      expect(acquired).toBe(fallback.length)
    } finally { rmSync(profile, { recursive: true, force: true }) }
  }, 600_000)
