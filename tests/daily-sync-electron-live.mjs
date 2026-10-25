import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { DatabaseSync } from 'node:sqlite'
import { _electron as electron } from 'playwright-core'

const require = createRequire(import.meta.url)
const workspace = resolve(import.meta.dirname, '..')
const temporary = mkdtempSync(join(tmpdir(), 'pokeguru-daily-electron-'))
const profile = join(temporary, 'profile')
const database = join(profile, 'data', 'pokeguru.sqlite')
const launch = (automatic) => electron.launch({ executablePath: require('electron'), args: ['.'],
  cwd: workspace, env: { ...process.env, POKEGURU_DATA_DIR: profile,
    POKEGURU_AUTO_SYNC: automatic ? '1' : '0', POKEGURU_AUTO_SYNC_DELAY_MS: '10000' }, timeout: 30_000 })
let application

async function stubOffline() {
  await application.evaluate(() => {
    globalThis.dailyReads = []
    globalThis.fetch = async (input) => {
      globalThis.dailyReads.push(String(input))
      throw new Error('offline-fixture')
    }
  })
}

async function reads() { return application.evaluate(() => globalThis.dailyReads) }
async function waitForPlayOutcome(page, outcome) {
  const deadline = Date.now() + 15_000
  while (Date.now() < deadline) {
    const result = await page.evaluate(() => window.projectsApi.getTournamentSync())
    if (result.ok && result.value.daily?.outcome === outcome) return result.value
    await page.waitForTimeout(100)
  }
  throw new Error(`Play did not reach ${outcome}`)
}
async function waitForAllFailures(page) {
  const deadline = Date.now() + 15_000
  while (Date.now() < deadline) {
    const statuses = await page.evaluate(() => Promise.all([
      window.projectsApi.getCatalogSyncStatus(), window.projectsApi.getTournamentSync(),
      window.projectsApi.getMainTournamentSync()
    ]))
    if (statuses.every((status) => status.ok &&
      ['failed', 'rate-limited'].includes(status.value.daily?.outcome))) return statuses.map((status) => status.value)
    await page.waitForTimeout(100)
  }
  throw new Error('The three independent sources did not record their failures')
}

try {
  application = await launch(false)
  await application.firstWindow()
  await application.close()
  application = undefined

  const db = new DatabaseSync(database)
  const now = new Date().toISOString()
  const stale = new Date(Date.now() - 2 * 86_400_000).toISOString()
  for (const source of ['catalog', 'play', 'main']) db.prepare(`INSERT INTO daily_sync
    (source, last_attempt_at, last_success_at, trigger, outcome, next_attempt_at, error)
    VALUES (?, ?, ?, 'manual', 'success', NULL, NULL)`).run(source, now, now)
  db.close()

  application = await launch(true)
  const current = await application.firstWindow()
  await stubOffline()
  await current.waitForTimeout(10_600)
  assert.deepEqual(await reads(), [], 'fresh sources must not make network requests at startup')
  await current.getByRole('button', { name: 'Catalogo', exact: true }).first().click()
  await current.getByRole('button', { name: 'Eventi', exact: true }).first().click()
  await current.getByRole('button', { name: 'Regional', exact: true }).click()
  assert.deepEqual(await reads(), [], 'switching global views must not schedule a refresh')
  await application.close()
  application = undefined

  const old = new DatabaseSync(database)
  old.prepare(`UPDATE daily_sync SET last_success_at=?, last_attempt_at=?, outcome='success'`)
    .run(stale, stale)
  old.close()

  application = await launch(true)
  const due = await application.firstWindow()
  await stubOffline()
  const failures = await waitForAllFailures(due)
  assert.ok(failures.every((status) => status.daily.trigger === 'automatic'))
  assert.ok(failures.every((status) => Date.parse(status.daily.nextAttemptAt) > Date.now()))
  const requested = await reads()
  assert.equal(requested.filter((url) => url.includes('api.tcgdex.net')).length, 5)
  assert.equal(requested.filter((url) => url.includes('play.limitlesstcg.com')).length, 1)
  assert.equal(requested.filter((url) => url.includes('limitlesstcg.com/tournaments?')).length, 1)
  await application.close()
  application = undefined

  application = await launch(true)
  const reopened = await application.firstWindow()
  await stubOffline()
  await reopened.waitForTimeout(10_600)
  assert.deepEqual(await reads(), [], 'recent failure must not retry after a quick restart')
  await application.close()
  application = undefined

  const expired = new DatabaseSync(database)
  expired.prepare(`UPDATE daily_sync SET next_attempt_at=? WHERE source='play'`).run(stale)
  expired.close()
  application = await launch(true)
  const race = await application.firstWindow()
  await stubOffline()
  assert.equal((await race.evaluate(() => window.projectsApi.syncTournaments('new'))).ok, true)
  await waitForPlayOutcome(race, 'failed')
  await race.waitForTimeout(10_600)
  assert.equal((await reads()).length, 1, 'manual request and startup gate must not launch twice')
  console.log('Daily sync Electron: three sources, freshness, offline backoff, restart and manual/startup race passed.')
} finally {
  if (application) await application.close().catch(() => undefined)
  rmSync(temporary, { recursive: true, force: true })
}
