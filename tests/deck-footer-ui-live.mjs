import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { _electron as electron } from 'playwright-core'
import { createProjectFromStart, openDeckImport } from './project-ui-helper.mjs'

const require = createRequire(import.meta.url)
const workspace = resolve(import.meta.dirname, '..')
const temporary = mkdtempSync(join(tmpdir(), 'pokeguru-deck-footer-'))
const profile = join(temporary, 'profile')
const capture = process.argv.includes('--screenshots')
const screenshots = join(workspace, 'docs', 'design-review')
const lists = [1, 2, 3].map((count) => `${count} Mega Absol ex MEG 86\n${60 - count} Basic Psychic Energy`)
let application

try {
  application = await electron.launch({ executablePath: require('electron'), args: ['.'], cwd: workspace,
    env: { ...process.env, POKEGURU_DATA_DIR: profile }, timeout: 30000 })
  const page = await application.firstWindow()
  await createProjectFromStart(page, 'Lista footer test')
  await openDeckImport(page)
  await page.getByLabel('Testo lista').fill(lists[0])
  await page.getByRole('button', { name: 'Salva lista' }).click()
  await page.locator('#deck-import').waitFor({ state: 'detached' })
  for (const text of lists.slice(1)) {
    await page.getByRole('button', { name: 'Importa / sostituisci' }).click()
    await page.getByLabel('Testo lista').fill(text)
    await page.getByRole('button', { name: 'Sostituisci lista' }).click()
    await page.locator('#deck-import').waitFor({ state: 'detached' })
  }

  const footer = page.locator('.deck-reference')
  const versions = page.locator('.deck-history > summary')
  const source = page.locator('.deck-import-details > summary')
  const rules = page.locator('.deck-technical > summary')
  await page.getByText('Versioni della lista (3)').waitFor()
  assert.equal(await footer.locator('.deck-reference-item').count(), 3)
  assert.equal(await page.locator('.deck-history').getAttribute('open'), null)
  assert.equal(await page.locator('.deck-import-details').getAttribute('open'), null)
  assert.equal(await page.locator('.deck-technical').getAttribute('open'), null)

  if (capture) mkdirSync(screenshots, { recursive: true })
  for (const [width, height] of [[1440, 900], [1280, 720], [640, 720]]) {
    await page.setViewportSize({ width, height })
    await footer.scrollIntoViewIfNeeded()
    const geometry = await footer.evaluate((element) => {
      const rows = [...element.querySelectorAll(':scope > .deck-reference-item > summary')]
      const box = element.getBoundingClientRect()
      return { width: box.width, overflow: element.scrollWidth - element.clientWidth,
        rowHeights: rows.map((row) => row.getBoundingClientRect().height),
        rowLeft: rows.map((row) => row.getBoundingClientRect().left - box.left) }
    })
    assert.ok(geometry.width > 0 && geometry.overflow <= 1, `${width}: footer senza overflow`)
    assert.ok(geometry.rowHeights.every((value) => value >= 44 && value <= 70), `${width}: righe compatte e accessibili`)
    assert.ok(geometry.rowLeft.every((value) => Math.abs(value) <= 1), `${width}: righe allineate`)
    if (capture) await page.screenshot({ path: join(screenshots, `lista-footer-${width}.png`) })
  }

  await page.setViewportSize({ width: 1280, height: 720 })
  await versions.focus()
  await page.keyboard.press('Enter')
  assert.equal(await page.locator('.deck-history').getAttribute('open'), '')
  await page.locator('.deck-companion').waitFor()
  assert.ok(await footer.evaluate((element) => element.scrollWidth - element.clientWidth <= 1), 'Storico aperto senza overflow a 1280 px')
  await page.getByLabel('Versione da consultare').selectOption({ label: 'v1' })
  assert.match(await page.locator('.deck-history-diff').textContent(), /Confronto con la principale v3/)
  if (capture) {
    await footer.scrollIntoViewIfNeeded()
    await page.screenshot({ path: join(screenshots, 'lista-footer-storico-1280.png') })
  }
  await versions.focus()
  await page.keyboard.press('Space')
  assert.equal(await page.locator('.deck-history').getAttribute('open'), null)

  await page.setViewportSize({ width: 640, height: 720 })
  await source.focus()
  await page.keyboard.press('Enter')
  assert.equal(await page.locator('.original-text pre').textContent(), lists[2])
  await rules.focus()
  await page.keyboard.press('Space')
  assert.ok(await page.locator('.deck-technical input[type=date]').isVisible())
  assert.equal(await page.evaluate(() => document.activeElement?.closest('.deck-technical')?.tagName), 'DETAILS')
  assert.ok(await footer.evaluate((element) => element.scrollWidth - element.clientWidth <= 1), 'Dettagli aperti senza overflow a 640 px')
  if (capture) {
    await footer.scrollIntoViewIfNeeded()
    await page.screenshot({ path: join(screenshots, 'lista-footer-aperto-640.png') })
  }
  console.log('E2E APP-132 OK: footer 1440/1280/640, accesso a storico, originale, regole e tastiera.')
} finally {
  if (application) await application.close()
  if (realpathSync(dirname(temporary)) !== realpathSync(tmpdir()) || !basename(temporary).startsWith('pokeguru-deck-footer-')) {
    throw new Error('Percorso temporaneo inatteso: pulizia interrotta.')
  }
  rmSync(temporary, { recursive: true, force: true })
}
