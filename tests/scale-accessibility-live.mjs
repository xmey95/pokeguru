import assert from 'node:assert/strict'
import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { _electron as electron } from 'playwright-core'
import { createProjectFromStart } from './project-ui-helper.mjs'

const require = createRequire(import.meta.url)
const workspace = resolve(import.meta.dirname, '..')
const profile = mkdtempSync(join(tmpdir(), 'pokeguru-scale-a11y-'))
let application
try {
  application = await electron.launch({ executablePath: require('electron'),
    args: ['.', '--force-device-scale-factor=2'], cwd: workspace,
    env: { ...process.env, POKEGURU_DATA_DIR: profile }, timeout: 30000 })
  const page = await application.firstWindow()
  await page.getByRole('region', { name: 'Benvenuto' }).waitFor()
  await createProjectFromStart(page, 'Scala e accessibilità')
  await page.getByRole('heading', { name: 'Scala e accessibilità', exact: true }).waitFor()
  await page.waitForFunction(() => !document.querySelector('[data-nav-loading="true"]'))
  const pixelRatio = await page.evaluate(() => window.devicePixelRatio)
  assert.ok(pixelRatio >= 1.9, `Scala Chromium inattesa: ${pixelRatio}`)
  await page.setViewportSize({ width: 640, height: 580 })
  const session = await page.context().newCDPSession(page)
  for (const section of ['Lista', 'Thread', 'Matchup', 'Catalogo', 'Eventi', 'Impostazioni AI']) {
    const nav = page.locator('.sidebar').getByRole('button', { name: section, exact: true })
    // The previous route restores focus over two animation frames; let it finish before keyboard input.
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    await nav.press('Enter')
    try {
      await page.waitForFunction((name) => document.querySelector(`.sidebar button[aria-label="${name}"]`)?.getAttribute('aria-current') === 'page' &&
        !document.querySelector('[data-nav-loading="true"]'), section,
      { timeout: 10_000 })
    } catch (error) {
      const state = await page.evaluate(() => ({ active: document.querySelector('.sidebar button.active')?.getAttribute('aria-label'),
        focus: document.activeElement?.getAttribute('aria-label'),
        loading: [...document.querySelectorAll('[data-nav-loading="true"]')].map((item) => item.className) }))
      throw new Error(`${section}: navigazione non completata: ${JSON.stringify(state)}`, { cause: error })
    }
    assert.ok(await nav.evaluate((element) => element.classList.contains('active')),
      `${section}: Invio non ha selezionato la sezione`)
    const geometry = await page.evaluate(() => ({ width: document.documentElement.scrollWidth,
      controls: [...document.querySelectorAll('.sidebar button')].filter((element) =>
        element.getClientRects().length).map((element) => ({ name: element.textContent?.trim(),
        left: element.getBoundingClientRect().left, right: element.getBoundingClientRect().right })) }))
    assert.ok(geometry.width <= 641, `${section}: overflow orizzontale a scala 200%`)
    assert.ok(geometry.controls.every((control) => control.left >= 0 && control.right <= 641),
      `${section}: navigazione tagliata a scala 200%`)
    const tree = await session.send('Accessibility.getFullAXTree')
    assert.ok(tree.nodes.some((node) => node.role?.value === 'button' &&
      node.name?.value === section && !node.ignored), `${section}: nome accessibile assente`)
  }
  console.log(`A11Y SCALE OK: sei sezioni navigabili, nomi esposti nell'albero Chromium, nessun overflow a 640×580 CSS e DPR ${pixelRatio}.`)
} finally {
  if (application) await application.close()
  if (realpathSync(dirname(profile)) !== realpathSync(tmpdir()) ||
    !basename(profile).startsWith('pokeguru-scale-a11y-'))
    throw new Error('Percorso temporaneo inatteso: pulizia interrotta.')
  rmSync(profile, { recursive: true, force: true })
}
