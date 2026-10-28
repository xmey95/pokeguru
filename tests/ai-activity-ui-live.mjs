import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { DatabaseSync } from 'node:sqlite'
import { _electron as electron } from 'playwright-core'
import { createProjectFromStart, switchThread } from './project-ui-helper.mjs'

const require = createRequire(import.meta.url)
const workspace = resolve(import.meta.dirname, '..')
const temporary = mkdtempSync(join(tmpdir(), 'pokeguru-ai-activity-ui-'))
const profile = join(temporary, 'profile')
let application

try {
  application = await electron.launch({ executablePath: require('electron'), args: ['.'],
    cwd: workspace, env: { ...process.env, POKEGURU_DATA_DIR: profile,
      POKEGURU_CODEX_BIN: join(temporary, 'missing-codex') }, timeout: 30000 })
  const page = await application.firstWindow()
  await createProjectFromStart(page, 'Activity test')
  const { projectId, firstId } = await page.evaluate(async () => {
    const projects = await window.projectsApi.list()
    if (!projects.ok) throw new Error(projects.error)
    const projectId = projects.value[0].id
    const first = await window.projectsApi.createDeckThread({ projectId, title: 'Thread A' })
    const second = await window.projectsApi.createDeckThread({ projectId, title: 'Thread B' })
    if (!first.ok || !second.ok) throw new Error('Thread fixture non creati')
    return { projectId, firstId: first.value.id }
  })
  const id = randomUUID()
  const now = new Date().toISOString()
  const database = new DatabaseSync(join(profile, 'data', 'pokeguru.sqlite'))
  try {
    database.prepare(`INSERT INTO ai_jobs (id, kind, project_id, resource_id, status,
      created_at, updated_at, error, progress_json)
      VALUES (?, 'thread-ask', ?, ?, 'running', ?, ?, NULL, ?)`)
      .run(id, projectId, firstId, now, now, JSON.stringify({ phase: 'analysis',
        detail: 'Codex elabora', summary: 'Sintesi recente', updatedAt: now,
        steps: Array.from({ length: 12 }, (_, index) => ({ phase: 'analysis',
          detail: `Attività ${index + 56}`, at: now })) }))
    const insert = database.prepare(`INSERT INTO ai_job_activity (job_id, phase, detail, summary, at)
      VALUES (?, 'analysis', ?, ?, ?)`)
    for (let index = 1; index <= 67; index++)
      insert.run(id, `Attività ${index}`, index === 20 ? 'Sintesi storica Codex' : null, now)
  } finally { database.close() }

  await page.getByRole('button', { name: 'Thread', exact: true }).click()
  await switchThread(page, /Thread A/)
  const activity = page.locator('.ai-job-activity')
  await activity.waitFor()
  const trace = activity.locator('.ai-job-trace')
  const rows = trace.locator('ol li')
  await page.waitForFunction(() => document.querySelectorAll('.ai-job-trace ol li').length === 25)
  assert.match(await rows.last().innerText(), /Attività 67/)
  assert.equal(await page.locator('#thread-switcher-trigger').isEnabled(), true)
  assert.equal(await page.getByLabel('Scrivi nel thread').isEnabled(), true)

  const scroll = async () => trace.locator('ol').evaluate((element) => {
    element.scrollTop = 0
    element.dispatchEvent(new Event('scroll', { bubbles: true }))
  })
  await scroll()
  await page.waitForFunction(() => document.querySelectorAll('.ai-job-trace ol li').length === 50)
  await scroll()
  await page.waitForFunction(() => document.querySelectorAll('.ai-job-trace ol li').length === 67)
  assert.match(await rows.first().innerText(), /Attività 1/)
  assert.match(await trace.innerText(), /Sintesi storica Codex/)
  assert.equal(await trace.getByRole('button', { name: 'Carica attività precedenti' }).count(), 0)

  // A burst larger than one page must not leave a gap between the old and new entries.
  const burst = new DatabaseSync(join(profile, 'data', 'pokeguru.sqlite'))
  try {
    const insert = burst.prepare(`INSERT INTO ai_job_activity (job_id, phase, detail, summary, at)
      VALUES (?, 'analysis', ?, NULL, ?)`)
    for (let index = 68; index <= 127; index++) insert.run(id, `Attività ${index}`, now)
    burst.prepare('UPDATE ai_jobs SET progress_json = ?, updated_at = ? WHERE id = ?')
      .run(JSON.stringify({ phase: 'analysis', detail: 'Codex elabora', summary: null,
        updatedAt: now, sequence: 127, steps: [] }), now, id)
  } finally { burst.close() }
  await page.waitForFunction(() => document.querySelectorAll('.ai-job-trace ol li').length === 127)
  assert.match(await rows.last().innerText(), /Attività 127/)

  await switchThread(page, /Thread B/)
  assert.equal(await page.getByLabel('Scrivi nel thread').isEnabled(), true)
  await switchThread(page, /Thread A/)
  await activity.waitFor()
  await page.getByRole('navigation', { name: 'Aree del progetto' })
    .getByRole('button', { name: 'Lista', exact: true }).click()
  assert.equal(await page.getByRole('navigation', { name: 'Aree del progetto' })
    .getByRole('button', { name: 'Thread', exact: true }).isEnabled(), true)
  console.log('LIVE OK: 127 attività, recupero di un burst da 60, sintesi storica e navigazione attiva.')
} finally {
  if (application) await application.close()
  if (realpathSync(dirname(temporary)) !== realpathSync(tmpdir()) ||
    !basename(temporary).startsWith('pokeguru-ai-activity-ui-'))
    throw new Error('Percorso temporaneo inatteso: pulizia interrotta.')
  rmSync(temporary, { recursive: true, force: true })
}
