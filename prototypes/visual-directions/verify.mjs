import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const require = createRequire(import.meta.url)
const { chromium } = require(process.env.PLAYWRIGHT_CORE || 'playwright-core')
const root = dirname(fileURLToPath(import.meta.url))
const output = join(root, 'screenshots')
const themes = ['tactical', 'editorial', 'arena']
const views = ['list', 'thread', 'matchup']
const sizes = [[1440, 900], [640, 720], [640, 580]]
const edge = process.env.EDGE_BIN || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
mkdirSync(output, { recursive: true })

const browser = await chromium.launch({ executablePath: edge, headless: true, args: ['--disable-gpu'] })
try {
  for (const [width, height] of sizes) {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    for (const theme of themes) {
      for (const view of views) {
        const url = pathToFileURL(join(root, 'index.html'))
        url.search = `?capture=1&theme=${theme}&view=${view}&state=loaded`
        await page.goto(url.href)
        await page.evaluate(() => document.fonts.ready)
        const geometry = await page.evaluate(() => {
          const rect = (selector) => {
            const box = document.querySelector(selector)?.getBoundingClientRect()
            return box ? { left: box.left, right: box.right, top: box.top, bottom: box.bottom, width: box.width } : null
          }
          const deckList = document.querySelector('.companion-scroll')
          return { bodyWidth: document.documentElement.scrollWidth, main: rect('.workspace'), deck: rect('.deck-companion'),
            deckScrolls: deckList ? deckList.scrollHeight > deckList.clientHeight : false }
        })
        assert.ok(geometry.bodyWidth <= width + 1, `${theme}/${view}/${width}: overflow del documento`)
        assert.ok(geometry.main, `${theme}/${view}/${width}: area di lavoro assente`)
        if (view === 'list') assert.equal(geometry.deck, null, `${theme}/${width}: lista duplicata`)
        else {
          assert.ok(geometry.deck, `${theme}/${view}/${width}: lista persistente assente`)
          assert.ok(geometry.deckScrolls, `${theme}/${view}/${width}: lista senza scorrimento indipendente`)
          if (width > 1240) {
            assert.equal(geometry.deck.width, 384, `${theme}/${view}: larghezza pannello`)
            assert.ok(geometry.main.right <= geometry.deck.left + 1, `${theme}/${view}: sovrapposizione orizzontale`)
          } else {
            assert.ok(geometry.main.bottom <= geometry.deck.top + 1, `${theme}/${view}: dock sopra il contenuto`)
            assert.ok(Math.abs(geometry.deck.bottom - height) <= 1, `${theme}/${view}: dock non ancorato`)
          }
        }
        if (height !== 580 && (width === 1440 || view === 'matchup')) {
          await page.screenshot({ path: join(output, `${theme}-${view}-${width}.png`) })
        }
      }
    }
    await page.close()
  }
  const page = await browser.newPage({ viewport: { width: 640, height: 720 } })
  for (const scenario of ['empty', 'loading', 'error', 'long']) {
    for (const view of views) {
      const url = pathToFileURL(join(root, 'index.html'))
      url.search = `?capture=1&theme=tactical&view=${view}&state=${scenario}`
      await page.goto(url.href)
      assert.ok(await page.locator('.workspace').count(), `${view}/${scenario}: area di lavoro assente`)
      assert.ok(await page.locator('.deck-companion').count() === (view === 'list' ? 0 : 1), `${view}/${scenario}: lista persistente errata`)
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${view}/${scenario}: overflow`)
    }
  }
  await page.close()
  console.log('Mockup OK: tre direzioni, Lista/Thread/Matchup, 1440×900, 640×720, 640×580; dock e scroll indipendenti; vuoto/caricamento/errore/lungo.')
} finally {
  await browser.close()
}
