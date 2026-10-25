import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { _electron as electron } from 'playwright-core'

const require = createRequire(import.meta.url)
const workspace = resolve(import.meta.dirname, '..')
const temporary = mkdtempSync(join(tmpdir(), 'pokeguru-job-alerts-'))
let app
try {
  app = await electron.launch({ executablePath: require('electron'), args: ['.'], cwd: workspace,
    env: { ...process.env, POKEGURU_DATA_DIR: join(temporary, 'profile') }, timeout: 30000 })
  const page = await app.firstWindow()
  await page.waitForFunction(() => {
    const state = JSON.parse(localStorage.getItem('pokeguru.job-alerts.v1') ?? 'null')
    return state?.sources.catalog && state?.sources.play && state?.sources.main && state?.sources.ai
  })
  await app.evaluate(({ ipcMain }) => {
    globalThis.alertFixtures = {
      catalog: { runId: null, state: 'idle', running: false, mode: null, phase: '',
        expected: 0, acquired: 0, error: null, cooldownUntil: null },
      play: { runId: null, status: 'idle', active: false, mode: null, lastError: null,
        page: 1, pending: [], inspected: 0, saved: 0, skipped: 0, watermark: null,
        previousWatermark: null, newestSeen: null, stopAfterPage: false, cooldownUntil: null },
      main: { runId: null, status: 'idle', active: false, mode: null, lastError: null,
        page: 1, maxPages: null, pendingEvents: [], pendingLists: [], inspectedEvents: 0,
        fetchedLists: 0, rotationStart: null, scannedPages: 0, indexedRows: 0,
        eligibleEvents: 0, ineligibleEvents: 0, unavailableIndexRows: 0, outsideRotationEvents: 0,
        alreadyAcquiredEvents: 0, unavailableEvents: [], unavailableLists: [], watermark: null,
        previousWatermark: null, newestSeen: null, stopAfterPage: false, cooldownUntil: null },
      ai: []
    }
    for (const [route, key] of [['catalog:sync-status', 'catalog'], ['tournament:sync-status', 'play'],
      ['tournament:main-sync-status', 'main'], ['ai:recent-jobs', 'ai']]) {
      ipcMain.removeHandler(route)
      ipcMain.handle(route, () => ({ ok: true, value: globalThis.alertFixtures[key] }))
    }
  })
  const change = (key, values) => app.evaluate((_, { key, values }) => {
    globalThis.alertFixtures[key] = { ...globalThis.alertFixtures[key], ...values }
  }, { key, values })
  const recorded = (key, state) => page.waitForFunction(([key, state]) => {
    const ledger = JSON.parse(localStorage.getItem('pokeguru.job-alerts.v1') ?? 'null')
    return ledger?.jobs[key] === state
  }, [key, state])
  await change('catalog', { runId: 'catalog-1', state: 'running', running: true, mode: 'new' })
  await recorded('catalog:catalog-1', 'working')
  await page.getByRole('button', { name: 'Impostazioni AI', exact: true }).click()
  await change('catalog', { state: 'done', running: false })
  const catalogAlert = page.getByRole('status').filter({ hasText: 'Aggiornamento del Catalogo completato' })
  await catalogAlert.waitFor()
  assert.equal(await page.getByRole('heading', { name: 'Impostazioni AI' }).count(), 1)
  await catalogAlert.getByRole('button', { name: 'Apri Catalogo' }).click()
  await page.getByRole('heading', { name: 'Catalogo' }).waitFor()
  assert.equal(await page.locator('.job-alert').count(), 0)
  await change('catalog', { runId: 'catalog-2', state: 'paused', error: 'Dettaglio non disponibile' })
  const catalogError = page.getByRole('status').filter({ hasText: 'Catalogo in pausa per errore' })
  await catalogError.waitFor()
  await catalogError.getByRole('button', { name: /Chiudi avviso/ }).click()
  await change('play', { runId: 'play-1', status: 'rate-limited', active: true, mode: 'new' })
  await recorded('play:play-1', 'working')
  assert.equal(await page.locator('.job-alert').count(), 0)
  await change('play', { status: 'complete', active: false })
  const playAlert = page.getByRole('status').filter({ hasText: 'Acquisizione Eventi Play completata' })
  await playAlert.waitFor()
  await playAlert.getByRole('button', { name: 'Apri Eventi' }).click()
  await page.getByRole('button', { name: 'Play online', exact: true }).waitFor()
  await change('main', { runId: 'regional-1', status: 'running', active: true, mode: 'full' })
  await recorded('main:regional-1', 'working')
  await change('main', { status: 'running', active: false, lastError: 'Fonte non disponibile' })
  const regionalAlert = page.getByRole('status').filter({ hasText: 'Acquisizione Regional interrotta' })
  await regionalAlert.waitFor()
  await regionalAlert.getByRole('button', { name: 'Apri Eventi' }).click()
  assert.equal(await page.getByRole('button', { name: 'Regional', exact: true }).getAttribute('aria-pressed'), 'true')
  const ids = await page.evaluate(async () => {
    const project = await window.projectsApi.create({ name: 'Avvisi AI fixture', format: 'STANDARD' })
    if (!project.ok) throw new Error(project.error)
    const thread = await window.projectsApi.createDeckThread({ projectId: project.value.id, title: 'Thread avviso' })
    if (!thread.ok) throw new Error(thread.error)
    return { projectId: project.value.id, resourceId: thread.value.id }
  })
  await app.evaluate((_, ids) => {
    globalThis.alertFixtures.ai = [{ id: 'ai-fixture-1', kind: 'thread-ask',
      projectId: ids.projectId, resourceId: ids.resourceId, status: 'running',
      createdAt: '2026-10-25T10:00:00.000Z', updatedAt: '2026-10-25T10:00:00.000Z', error: null }]
  }, ids)
  await recorded('ai:ai-fixture-1', 'working')
  await app.evaluate(() => { globalThis.alertFixtures.ai[0].status = 'applied' })
  const aiAlert = page.getByRole('status').filter({ hasText: 'Analisi Thread completata' })
  await aiAlert.waitFor()
  await aiAlert.getByRole('button', { name: 'Apri Thread' }).click()
  await page.getByRole('button', { name: 'Thread', exact: true }).waitFor()
  await page.getByText('Thread avviso', { exact: true }).first().waitFor()
  await recorded('main:regional-1', 'failed')
  await page.reload()
  await page.waitForTimeout(2300)
  assert.equal(await page.locator('.job-alert').count(), 0, 'riapertura non deve duplicare gli avvisi')
  console.log('Avvisi job OK: Catalogo successo/errore, Play, Regional, AI, navigazione e riapertura.')
} finally {
  if (app) await app.close()
  if (realpathSync(dirname(temporary)) !== realpathSync(tmpdir()) || !basename(temporary).startsWith('pokeguru-job-alerts-'))
    throw new Error('Percorso temporaneo inatteso: pulizia interrotta.')
  if (existsSync(temporary)) rmSync(temporary, { recursive: true, force: true })
}
