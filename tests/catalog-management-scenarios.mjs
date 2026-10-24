import assert from 'node:assert/strict'
import { join } from 'node:path'
import { auditDesignSystem } from './design-system-audit.mjs'

// Real catalog reads; synchronization and source-audit responses are controlled UI fixtures.
export async function catalogManagementScenarios(page, application, workspace) {
  const ready = async () => {
    await page.waitForFunction(() => !document.querySelector('[data-nav-loading="true"]'))
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(resolve)))))
  }
  const trigger = page.getByRole('button', { name: 'Gestisci catalogo', exact: true })
  const panel = page.getByRole('region', { name: 'Gestione catalogo', exact: true })
  const search = page.getByLabel('Cerca carta o stampa')
  await page.getByLabel('Espansione').selectOption('all')
  await search.fill('Carta')
  await trigger.focus()
  await page.keyboard.press('Enter')
  const method = page.locator('.catalog-set-coverage').filter({ hasText: 'Metodo, promo e dati delle stampe' })
  await method.locator('summary').click()
  await page.locator('.sidebar').getByRole('button', { name: 'Impostazioni AI', exact: true }).click()
  await ready()
  await page.getByRole('button', { name: 'Indietro', exact: true }).click()
  await ready()
  assert.equal(await trigger.getAttribute('aria-expanded'), 'true')
  assert.equal(await method.evaluate((el) => el.open), true)
  assert.equal(await search.inputValue(), 'Carta')
  await method.locator('summary').focus()
  await page.keyboard.press('Escape')
  assert.equal(await trigger.getAttribute('aria-expanded'), 'false')
  assert.ok(await trigger.evaluate((el) => document.activeElement === el))
  assert.equal(await search.inputValue(), 'Carta')
  await trigger.click()
  await method.locator('summary').click()
  let minimumContrast = Infinity
  for (const [width, height] of [[1440, 900], [1280, 720], [640, 720]]) {
    await page.setViewportSize({ width, height })
    await page.locator('.main-content').evaluate((el) => { el.scrollTop = 0 })
    assert.equal(await page.locator('.main-content').evaluate((el) => el.scrollWidth > el.clientWidth + 1), false)
    minimumContrast = Math.min(minimumContrast, (await auditDesignSystem(page, `Gestione catalogo ${width}`)).minimumContrast)
    await page.screenshot({ path: join(workspace, 'node_modules', `catalog-management-${width}.png`) })
  }
  await page.setViewportSize({ width: 1280, height: 720 })
  await page.getByRole('button', { name: 'Chiudi gestione' }).click()
  await application.evaluate(({ ipcMain }) => {
    globalThis.catalogUiOriginals = new Map()
    globalThis.catalogUiRequests = []
    globalThis.catalogUiStatus = { state: 'idle', mode: null, running: false, phase: '', acquired: 3, expected: 4, error: null }
    globalThis.catalogUiAudit = null
    const handlers = {
      'catalog:sync-status': () => ({ ok: true, value: globalThis.catalogUiStatus }),
      'catalog:sync-standard': (_event, mode) => {
        globalThis.catalogUiRequests.push(mode)
        globalThis.catalogUiStatus = { ...globalThis.catalogUiStatus, state: 'running', mode, running: true, phase: 'Dettagli · fixture UI' }
        return { ok: true, value: globalThis.catalogUiStatus }
      },
      'standard:get-rule-audit': () => ({ ok: true, value: globalThis.catalogUiAudit }),
      'standard:check-rule-sources': () => {
        globalThis.catalogUiRequests.push('audit')
        globalThis.catalogUiAudit = { packageVersion: 'fixture', checkedAt: new Date().toISOString(), verifiedAt: null,
          status: 'changed', sources: [] }
        return { ok: true, value: globalThis.catalogUiAudit }
      }
    }
    for (const [route, handler] of Object.entries(handlers)) {
      globalThis.catalogUiOriginals.set(route, ipcMain._invokeHandlers.get(route))
      ipcMain.removeHandler(route); ipcMain.handle(route, handler)
    }
  })
  await page.getByRole('button', { name: 'Aggiorna nuove carte' }).click()
  await page.locator('.catalog-sync-status').filter({ hasText: 'Aggiornamento in corso · 3/4 dettagli' }).waitFor()
  assert.deepEqual(await application.evaluate(() => globalThis.catalogUiRequests), ['new'])
  assert.ok(await page.getByRole('button', { name: 'Aggiornamento in corso…' }).isDisabled())
  assert.equal(await panel.count(), 0)
  await application.evaluate(() => { globalThis.catalogUiStatus = { ...globalThis.catalogUiStatus, running: false, state: 'paused', error: 'Fixture: limite della fonte.' } })
  await page.getByRole('button', { name: 'Riprendi aggiornamento' }).waitFor()
  await page.getByRole('status').filter({ hasText: 'Fixture: limite della fonte.' }).waitFor()
  assert.equal(await search.inputValue(), 'Carta')
  assert.equal(await page.locator('.catalog-list > button').count(), 3)
  await page.getByRole('button', { name: 'Riprendi aggiornamento' }).click()
  await page.locator('.catalog-sync-status').filter({ hasText: 'in corso' }).waitFor()
  await application.evaluate(() => { globalThis.catalogUiStatus = { ...globalThis.catalogUiStatus, running: false, state: 'done', error: null } })
  await page.getByRole('button', { name: 'Aggiorna nuove carte' }).waitFor()
  await page.waitForFunction(() => !document.querySelector('.catalog-actions .primary-button')?.disabled)
  await trigger.click()
  await page.getByRole('button', { name: 'Scansione completa', exact: true }).click()
  await page.getByRole('button', { name: 'Chiudi gestione' }).click()
  await page.locator('.catalog-sync-status').filter({ hasText: 'Scansione completa in corso' }).waitFor()
  await application.evaluate(() => { globalThis.catalogUiStatus = { ...globalThis.catalogUiStatus, running: false, state: 'paused', error: 'Fixture: scansione interrotta.' } })
  await page.locator('.catalog-sync-status').filter({ hasText: 'riprendi da Gestisci catalogo' }).waitFor()
  await trigger.click()
  await page.getByRole('button', { name: 'Riprendi scansione completa' }).click()
  await page.locator('.catalog-sync-status').filter({ hasText: 'in corso' }).waitFor()
  assert.deepEqual(await application.evaluate(() => globalThis.catalogUiRequests), ['new', 'new', 'full', 'full'])
  await application.evaluate(() => { globalThis.catalogUiStatus = { ...globalThis.catalogUiStatus, running: false, state: 'done', error: null } })
  await page.waitForFunction(() => !document.querySelector('.catalog-actions .primary-button')?.disabled)
  await page.locator('details[aria-label="Fonti delle regole Standard"] > summary').click()
  await page.getByRole('button', { name: 'Controlla fonti Standard' }).click()
  await page.getByRole('alert').filter({ hasText: 'Fonti Standard cambiate' }).waitFor()
  await page.getByRole('button', { name: 'Chiudi gestione' }).click()
  assert.ok(await page.getByRole('alert').filter({ hasText: 'Fonti Standard cambiate' }).isVisible())
  assert.ok(await page.locator('.catalog-gap-summary').isVisible())
  assert.deepEqual(await application.evaluate(() => globalThis.catalogUiRequests), ['new', 'new', 'full', 'full', 'audit'])
  await page.screenshot({ path: join(workspace, 'node_modules', 'catalog-warning-1280.png') })
  await application.evaluate(() => { globalThis.catalogUiAudit = { ...globalThis.catalogUiAudit, status: 'unavailable' } })
  await page.locator('.sidebar').getByRole('button', { name: 'Impostazioni AI', exact: true }).click()
  await ready()
  await page.getByRole('button', { name: 'Indietro', exact: true }).click()
  await ready()
  await page.getByRole('status').filter({ hasText: 'Fonti Standard non raggiungibili' }).waitFor()
  assert.equal(await trigger.getAttribute('aria-expanded'), 'false')
  assert.equal(await search.inputValue(), 'Carta')
  await application.evaluate(({ ipcMain }) => {
    for (const [route, handler] of globalThis.catalogUiOriginals) {
      ipcMain.removeHandler(route); ipcMain.handle(route, handler)
    }
  })
  console.log('CATALOG MANAGEMENT OK: keyboard/focus, filters/history, new/full/resume routing, progress/errors and changed rules outside panel; 1440/1280/640; minimum contrast ' + minimumContrast.toFixed(2))
}
