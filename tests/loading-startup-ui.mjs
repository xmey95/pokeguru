import assert from 'node:assert/strict'
import { _electron as electron } from 'playwright-core'
import { createRequire } from 'node:module'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { auditLoading } from './loading-ui-audit.mjs'
import { createProjectFromStart } from './project-ui-helper.mjs'

const require = createRequire(import.meta.url)
const workspace = resolve(import.meta.dirname, '..')
const profile = mkdtempSync(join(tmpdir(), 'pokeguru-loading-ui-'))
const application = await electron.launch({ executablePath: require('electron'), args: ['.'], cwd: workspace,
  env: { ...process.env, POKEGURU_DATA_DIR: profile, POKEGURU_CODEX_BIN: join(profile, 'missing-codex') }, timeout: 30000 })
try {
  const page = await application.firstWindow()
  const ready = () => page.waitForFunction(() => !document.querySelector('[data-nav-loading="true"]'))
  await ready()
  async function hold(route) {
    await application.evaluate(({ ipcMain }, route) => {
      const original = ipcMain._invokeHandlers.get(route)
      globalThis.loadingOriginal = [route, original]
      const gate = new Promise(resolve => { globalThis.releaseLoading = resolve })
      ipcMain.removeHandler(route)
      ipcMain.handle(route, async (...args) => { await gate; return original(...args) })
    }, route)
  }
  async function release() {
    await application.evaluate(({ ipcMain }) => {
      globalThis.releaseLoading()
      const [route, handler] = globalThis.loadingOriginal
      ipcMain.removeHandler(route); ipcMain.handle(route, handler)
    })
    await ready()
  }
  await hold('projects:list')
  await page.reload()
  await page.getByRole('status').filter({ hasText: 'Apertura progetti…' }).waitFor()
  assert.equal(await page.getByRole('region', { name: 'Benvenuto' }).count(), 0)
  // Start before the entry points exist; auditLoading ends at the compact viewport.
  const creation = createProjectFromStart(page, 'Avvio dopo caricamento')
  await auditLoading(page, workspace, 'avvio', '.loading-skeleton')
  await release()
  await creation
  await page.getByRole('heading', { name: 'Avvio dopo caricamento', exact: true }).waitFor()
  for (const [label, route, name] of [['Catalogo', 'catalog:get', 'apertura-catalogo'], ['Eventi', 'tournament:list', 'apertura-eventi']]) {
    await hold(route)
    await page.locator('.sidebar').getByRole('button', { name: label, exact: true }).click()
    await auditLoading(page, workspace, name, '.loading-skeleton')
    assert.equal(await page.locator('.matchup-empty').count(), 0, 'Nessuno stato vuoto prima della lettura')
    assert.equal(await page.locator('.skeleton-rows').getAttribute('aria-hidden'), 'true')
    await release()
    await page.locator('.matchup-empty').waitFor()
  }
  // Unknown total must never look like 0% or 100%; polling errors must recover.
  await application.evaluate(({ ipcMain }) => {
    globalThis.loadingStatus = { state: 'running', running: true, mode: 'new', phase: 'Lettura inventario TCGdex', expected: 0, acquired: 0, error: null }
    globalThis.loadingStatusError = false
    globalThis.loadingStatusHold = false
    globalThis.loadingStatusCalls = 0
    ipcMain.removeHandler('catalog:sync-status')
    ipcMain.handle('catalog:sync-status', async () => {
      globalThis.loadingStatusCalls++
      if (globalThis.loadingStatusHold) await new Promise(resolve => { globalThis.releaseStatus = resolve })
      return globalThis.loadingStatusError ? { ok: false, error: 'Fixture: stato non leggibile' } : { ok: true, value: globalThis.loadingStatus }
    })
  })
  await page.locator('.sidebar').getByRole('button', { name: 'Catalogo', exact: true }).click()
  await page.locator('.catalog-sync-status').waitFor()
  assert.equal(await page.getByRole('progressbar').count(), 0)
  await page.getByText('Ricerca delle carte da aggiornare…').waitFor()
  await application.evaluate(() => { globalThis.loadingStatusError = true })
  await page.getByRole('status').filter({ hasText: 'Avanzamento non disponibile' }).waitFor()
  assert.ok(await page.locator('.catalog-actions .primary-button').isDisabled())
  await application.evaluate(() => { globalThis.loadingStatusError = false; globalThis.loadingStatus = { ...globalThis.loadingStatus, expected: 10, acquired: 4 } })
  await page.waitForFunction(() => document.querySelector('progress')?.value === 4)
  assert.equal(await page.getByText('Avanzamento non disponibile', { exact: false }).count(), 0)
  // Leave while a status response is held; no new polls from the unmounted view.
  await application.evaluate(() => { globalThis.loadingStatusHold = true })
  await new Promise(resolve => setTimeout(resolve, 1700))
  await page.locator('.sidebar').getByRole('button', { name: 'Eventi', exact: true }).click()
  await ready()
  const before = await application.evaluate(() => globalThis.loadingStatusCalls)
  await application.evaluate(() => { globalThis.loadingStatusHold = false; globalThis.releaseStatus() })
  await new Promise(resolve => setTimeout(resolve, 1700))
  assert.equal(await application.evaluate(() => globalThis.loadingStatusCalls), before, 'Polling stopped after navigation')
  assert.equal(await page.locator('.catalog-sync-status').count(), 0)
  console.log('LOADING STARTUP OK: opening vs empty, no fabricated total, status error/recovery, late poll cleanup; temporary profile ' + profile)
} finally { await application.close() }
