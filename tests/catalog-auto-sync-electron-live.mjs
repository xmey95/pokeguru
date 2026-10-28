import assert from 'node:assert/strict'
import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { DatabaseSync } from 'node:sqlite'
import { _electron as electron } from 'playwright-core'
import { evaluateBackend } from './backend-evaluate-helper.mjs'

const require = createRequire(import.meta.url)
const workspace = resolve(import.meta.dirname, '..')
const temporary = mkdtempSync(join(tmpdir(), 'pokeguru-catalog-auto-'))
const profile = join(temporary, 'profile')
const launch = () => electron.launch({ executablePath: require('electron'), args: ['.'], cwd: workspace,
  env: { ...process.env, POKEGURU_DATA_DIR: profile }, timeout: 30_000 })
let application

async function installSource(limitOnce = false) {
  await evaluateBackend(application, (_electron, limit) => {
    const cards = Array.from({ length: 14 }, (_, index) => ({
      id: `sv05-${String(index + 1).padStart(3, '0')}`,
      localId: String(index + 1).padStart(3, '0'), name: `Carta ${index + 1}`
    }))
    const energy = (setId) => ({ id: `${setId}-001`, localId: '001', name: 'Basic Energy' })
    const sets = ['sv05', 'sve', 'mee'].map((id) => ({ id, name: id.toUpperCase(),
      cardCount: { total: id === 'sv05' ? 14 : 1 } }))
    globalThis.catalogAutoReads = []
    globalThis.catalogLimitOnce = limit
    globalThis.catalogMissingOnce = false
    globalThis.catalogDetailDelay = 20
    globalThis.fetch = async (input, options) => {
      const url = String(input)
      if (!url.startsWith('https://api.tcgdex.net/v2/en/'))
        throw new Error(`Unexpected source: ${url}`)
      if (url.includes('/cards?regulationMark=eq:h')) return Response.json([])
      if (url.includes('/cards?')) return Response.json(cards)
      if (url.endsWith('/sets')) return Response.json(sets)
      if (url.includes('/sets/')) {
        const id = url.split('/').at(-1)
        const set = sets.find((item) => item.id === id)
        return Response.json({ ...set, cards: id === 'sv05' ? cards : [energy(id)] })
      }
      const id = url.split('/').at(-1)
      globalThis.catalogAutoReads.push(id)
      if (id === 'sv05-001' && globalThis.catalogLimitOnce) {
        globalThis.catalogLimitOnce = false
        return new Response('', { status: 429, headers: { 'Retry-After': '31' } })
      }
      if (id === 'sv05-001' && globalThis.catalogMissingOnce) {
        globalThis.catalogMissingOnce = false
        return new Response('', { status: 404 })
      }
      const card = [...cards, energy('sve'), energy('mee')].find((item) => item.id === id)
      if (!card) return new Response('', { status: 404 })
      return new Promise((resolve, reject) => {
        const onAbort = () => { clearTimeout(timer); reject(options.signal.reason) }
        const timer = setTimeout(() => {
          options.signal?.removeEventListener('abort', onAbort)
          resolve(Response.json({ ...card, category: 'Pokemon', stage: 'Basic', regulationMark: 'H' }))
        }, globalThis.catalogDetailDelay)
        options.signal?.addEventListener('abort', onAbort, { once: true })
      })
    }
  }, limitOnce)
}

async function status(page) {
  const result = await page.evaluate(() => window.projectsApi.getCatalogSyncStatus())
  assert.equal(result.ok, true)
  return result.value
}

async function waitFor(page, predicate) {
  const deadline = Date.now() + 20_000
  while (Date.now() < deadline) {
    const current = await status(page)
    if (predicate === 'first-block'
      ? current.state === 'running' && current.acquired >= 12
      : current.state === predicate) return
    await page.waitForTimeout(50)
  }
  throw new Error(`Catalog did not reach ${predicate}: ${JSON.stringify(await status(page))}`)
}

try {
  application = await launch()
  let page = await application.firstWindow()
  await installSource()
  assert.equal((await page.evaluate(() => window.projectsApi.syncStandardCatalog('new'))).ok, true)
  await waitFor(page, 'done')
  const completed = await status(page)
  const { runId, rotationCleanup, daily, ...completedProgress } = completed
  assert.equal(daily?.outcome, 'success')
  assert.match(runId, /^[a-f0-9-]{36}$/)
  assert.deepEqual({ ...rotationCleanup, completedAt: undefined }, {
    ruleVersion: 'play-2026-01-09', removedPrints: 0, retainedReferences: 0,
    completedAt: undefined })
  assert.equal(Number.isFinite(Date.parse(rotationCleanup.completedAt)), true)
  assert.deepEqual(completedProgress, { running: false, mode: 'new', state: 'done',
    phase: 'Aggiornamento terminato', expected: 16, acquired: 16, error: null, cooldownUntil: null })
  assert.equal((await evaluateBackend(application, () => globalThis.catalogAutoReads)).length, 16)

  await page.getByRole('button', { name: 'Catalogo', exact: true }).first().click()
  await page.getByRole('button', { name: 'Gestisci catalogo' }).click()
  await page.getByRole('button', { name: 'Scansione completa', exact: true }).click()
  await waitFor(page, 'first-block')
  const fullRunId = (await status(page)).runId
  assert.notEqual(fullRunId, runId)
  await page.locator('.catalog-sync-status').getByRole('button', { name: 'Metti in pausa' }).click()
  assert.equal((await status(page)).state, 'paused')
  assert.equal((await status(page)).acquired, 12)
  await page.locator('.catalog-sync-status').getByText('12 / 16 · dettagli acquisiti').waitFor()
  await page.setViewportSize({ width: 640, height: 720 })
  assert.equal(await page.locator('.catalog-sync-status').getByRole('button', { name: 'Riprendi scansione' }).isVisible(), true)
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false)
  await page.waitForTimeout(550)
  assert.equal((await status(page)).acquired, 12)
  await application.close()
  application = undefined

  application = await launch()
  page = await application.firstWindow()
  await installSource()
  await page.waitForTimeout(2_500)
  assert.equal((await status(page)).state, 'paused')
  assert.equal((await status(page)).runId, fullRunId)
  await page.getByRole('button', { name: 'Catalogo', exact: true }).first().click()
  await page.locator('.catalog-sync-status').getByRole('button', { name: 'Riprendi scansione', exact: true }).click()
  await waitFor(page, 'done')
  assert.equal((await status(page)).acquired, 16)
  assert.equal((await status(page)).runId, fullRunId)
  assert.equal((await evaluateBackend(application, () => globalThis.catalogAutoReads)).length, 4)

  await evaluateBackend(application, () => { globalThis.catalogDetailDelay = 600 })
  assert.equal((await page.evaluate(() => window.projectsApi.syncStandardCatalog('full'))).ok, true)
  const detailDeadline = Date.now() + 10_000
  while ((await evaluateBackend(application, () => globalThis.catalogAutoReads.length)) <= 4) {
    if (Date.now() > detailDeadline) throw new Error('Full scan never reached a detail request')
    await page.waitForTimeout(50)
  }
  await page.locator('.catalog-sync-status').getByRole('button', { name: 'Annulla aggiornamento' }).click()
  assert.equal((await status(page)).state, 'cancelled')
  assert.equal((await status(page)).acquired, 0)
  await page.waitForTimeout(650)
  assert.equal((await status(page)).acquired, 0)
  await application.close()
  application = undefined
  application = await launch()
  page = await application.firstWindow()
  await page.waitForTimeout(2_500)
  assert.equal((await status(page)).state, 'cancelled')

  await installSource(true)
  assert.equal((await page.evaluate(() => window.projectsApi.syncStandardCatalog('full'))).ok, true)
  await waitFor(page, 'rate-limited')
  const limited = await status(page)
  assert.equal(limited.acquired, 11)
  assert.ok(Date.parse(limited.cooldownUntil) > Date.now() + 25_000)
  await application.close()
  application = undefined
  const db = new DatabaseSync(join(profile, 'data', 'pokeguru.sqlite'))
  db.prepare('UPDATE catalog_job SET retry_at=? WHERE id=1')
    .run(new Date(Date.now() + 2_000).toISOString())
  db.close()

  application = await launch()
  await installSource()
  page = await application.firstWindow()
  await page.waitForTimeout(2_500)
  assert.equal((await status(page)).state, 'rate-limited')
  assert.equal((await status(page)).running, false)
  assert.equal((await evaluateBackend(application, () => globalThis.catalogAutoReads)).length, 0)
  await page.getByRole('button', { name: 'Catalogo', exact: true }).first().click()
  await page.locator('.catalog-sync-status').getByRole('button', { name: 'Riprendi scansione', exact: true }).click()
  await waitFor(page, 'done')
  assert.equal((await status(page)).acquired, 16)
  assert.equal((await evaluateBackend(application, () => globalThis.catalogAutoReads)).length, 5)

  await evaluateBackend(application, () => { globalThis.catalogDetailDelay = 300 })
  assert.equal((await page.evaluate(() => window.projectsApi.syncStandardCatalog('full'))).ok, true)
  const interruptedDeadline = Date.now() + 10_000
  while ((await evaluateBackend(application, () => globalThis.catalogAutoReads.length)) <= 5) {
    if (Date.now() > interruptedDeadline) throw new Error('Full scan never started before shutdown')
    await page.waitForTimeout(50)
  }
  await application.close()
  application = undefined
  application = await launch()
  await installSource()
  page = await application.firstWindow()
  await page.waitForTimeout(2_500)
  assert.equal((await status(page)).state, 'interrupted')
  assert.equal((await evaluateBackend(application, () => globalThis.catalogAutoReads)).length, 0)
  await page.getByRole('button', { name: 'Catalogo', exact: true }).first().click()
  await page.locator('.catalog-sync-status').getByRole('button', { name: 'Riprendi scansione', exact: true }).click()
  await waitFor(page, 'done')

  await evaluateBackend(application, () => {
    globalThis.catalogAutoReads = []
    globalThis.catalogMissingOnce = true
    globalThis.catalogDetailDelay = 100
  })
  await page.getByRole('button', { name: 'Gestisci catalogo' }).click()
  await page.getByRole('button', { name: 'Scansione completa', exact: true }).click()
  const blockDeadline = Date.now() + 10_000
  let firstBlock = await status(page)
  while (firstBlock.acquired < 11 && Date.now() < blockDeadline) {
    await page.waitForTimeout(50)
    firstBlock = await status(page)
  }
  assert.equal(firstBlock.state, 'running')
  assert.match(firstBlock.phase, /Ultimo blocco: 11\/12 dettagli acquisiti/)
  assert.match(firstBlock.error, /sv05-001 non disponibile/)
  await waitFor(page, 'paused')
  assert.equal((await status(page)).acquired, 15)
  const missingReads = await evaluateBackend(application, () => globalThis.catalogAutoReads)
  assert.equal(missingReads.length, 16)
  assert.ok(missingReads.includes('sv05-014'))
  await page.locator('.diagnostics').filter({ hasText: /1 dettaglio TCGdex non disponibile/ }).waitFor()
  await page.locator('.catalog-sync-status').getByRole('button', { name: 'Riprendi scansione', exact: true }).click()
  await waitFor(page, 'done')
  const recoveredReads = await evaluateBackend(application, () => globalThis.catalogAutoReads)
  assert.equal(recoveredReads.filter((id) => id === 'sv05-001').length, 2)
  assert.equal(recoveredReads.filter((id) => id === 'sv05-014').length, 1)
  console.log('CATALOG AUTO SYNC OK: one click advances blocks; UI pause/cancel/resume, 429 and individual failures recover across restarts without scanning at startup.')
} finally {
  if (application) await application.close()
  if (realpathSync(dirname(temporary)) !== realpathSync(tmpdir()) ||
    !basename(temporary).startsWith('pokeguru-catalog-auto-')) throw new Error('Unexpected temporary path.')
  rmSync(temporary, { recursive: true, force: true })
}
