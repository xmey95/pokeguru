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
const latestSummary = '**Selecting representative event archetypes**'
const historicalSummary = '**Sintesi storica Codex**\n\n- Confronto i mazzi.\n- Controllo le carte.\n\n'
  + '[Fonte](https://example.org) [link](javascript:alert(1)) ![immagine](https://example.org/image.png)'
  + '\n\n<script>window.summaryScriptRan = true</script><iframe src="https://example.org"></iframe>'
let application

try {
  application = await electron.launch({ executablePath: require('electron'), args: ['.'],
    cwd: workspace, env: { ...process.env, POKEGURU_DATA_DIR: profile, POKEGURU_AUTO_SYNC: '0',
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
      .run(id, projectId, firstId, now, now, JSON.stringify({ phase: 'planning',
        detail: 'Ricerca 2: 4 interrogazioni locali completate.', summary: latestSummary, updatedAt: now,
        steps: Array.from({ length: 12 }, (_, index) => ({ phase: 'analysis',
          detail: `Attività ${index + 56}`, at: now })) }))
    const insert = database.prepare(`INSERT INTO ai_job_activity (job_id, phase, detail, summary, at)
      VALUES (?, 'analysis', ?, ?, ?)`)
    for (let index = 1; index <= 67; index++)
      insert.run(id, index === 20 ? 'Verifico le carte citate e la risposta strutturata.'
        : `Attività ${index}`, index === 20 ? historicalSummary : null, now)
  } finally { database.close() }

  await page.getByRole('button', { name: 'Thread', exact: true }).click()
  await switchThread(page, /Thread A/)
  const activity = page.locator('.ai-job-activity')
  await activity.waitFor()
  const trace = activity.locator('.ai-job-trace')
  const rows = trace.locator(':scope > ol > li')
  await page.waitForFunction(() => document.querySelectorAll('.ai-job-trace > ol > li').length === 25)
  assert.match(await activity.innerText(), /Approfondimento 2: 4 ricerche completate\./)
  assert.doesNotMatch(await activity.innerText(), /interrogazioni locali|\*\*/)
  assert.equal(await activity.locator('.ai-job-summary strong').last().innerText(),
    'Selecting representative event archetypes')
  assert.match(await activity.locator('.ai-job-stages [data-state="current"]').innerText(), /Ricerche/)
  assert.match(await rows.last().innerText(), /Attività 67/)
  assert.equal(await page.locator('#thread-switcher-trigger').isEnabled(), true)
  assert.equal(await page.getByLabel('Scrivi nel thread').isEnabled(), true)

  const scroll = async () => trace.locator(':scope > ol').evaluate((element) => {
    element.scrollTop = 0
    element.dispatchEvent(new Event('scroll', { bubbles: true }))
  })
  await scroll()
  await page.waitForFunction(() => document.querySelectorAll('.ai-job-trace > ol > li').length === 50)
  await scroll()
  await page.waitForFunction(() => document.querySelectorAll('.ai-job-trace > ol > li').length === 67)
  assert.match(await rows.first().innerText(), /Attività 1/)
  assert.match(await trace.innerText(), /Sintesi storica Codex/)
  assert.equal(await trace.getByRole('button', { name: 'Mostra attività precedenti' }).count(), 0)
  const historical = rows.nth(19)
  assert.match(await historical.innerText(), /Controllo le carte citate e la risposta\./)
  assert.doesNotMatch(await historical.innerText(), /\*\*|risposta strutturata/)
  assert.equal(await historical.locator('strong').innerText(), 'Sintesi storica Codex')
  assert.equal(await historical.locator('ul > li').count(), 2)
  assert.equal(await activity.locator('a, img, iframe, script').count(), 0)
  assert.equal(await page.evaluate(() => window.summaryScriptRan), undefined)

  for (const width of [1280, 640]) {
    await page.setViewportSize({ width, height: 900 })
    await historical.scrollIntoViewIfNeeded()
    assert.equal(await activity.evaluate((element) => element.scrollWidth <= element.clientWidth + 1), true)
    assert.equal(await activity.locator('.ai-job-stages > li').evaluateAll((elements) =>
      elements.every((element) => element.scrollWidth <= element.clientWidth + 1)), true)
    await page.screenshot({ path: join(workspace, 'node_modules', `ai-activity-${width}.png`), fullPage: true })
  }

  // A burst larger than one page must not leave a gap between the old and new entries.
  const burst = new DatabaseSync(join(profile, 'data', 'pokeguru.sqlite'))
  try {
    const insert = burst.prepare(`INSERT INTO ai_job_activity (job_id, phase, detail, summary, at)
      VALUES (?, 'analysis', ?, NULL, ?)`)
    for (let index = 68; index <= 127; index++) insert.run(id, `Attività ${index}`, now)
    burst.prepare('UPDATE ai_jobs SET progress_json = ?, updated_at = ? WHERE id = ?')
      .run(JSON.stringify({ phase: 'analysis', detail: 'Analisi estesa: 3 di 12 lotti completati e salvati.', summary: null,
        updatedAt: now, sequence: 127, steps: [] }), now, id)
  } finally { burst.close() }
  await page.waitForFunction(() => document.querySelectorAll('.ai-job-trace > ol > li').length === 127)
  assert.match(await rows.last().innerText(), /Attività 127/)
  assert.match(await activity.innerText(), /Parti dell’analisi completate e salvate: 3 su 12\./)
  const saved = new DatabaseSync(join(profile, 'data', 'pokeguru.sqlite'))
  try {
    const original = saved.prepare('SELECT detail, summary FROM ai_job_activity WHERE job_id = ? ORDER BY id LIMIT 1 OFFSET 19').get(id)
    assert.equal(original.detail, 'Verifico le carte citate e la risposta strutturata.')
    assert.equal(original.summary, historicalSummary)
  } finally { saved.close() }

  await switchThread(page, /Thread B/)
  assert.equal(await page.getByLabel('Scrivi nel thread').isEnabled(), true)
  await switchThread(page, /Thread A/)
  await activity.waitFor()
  await page.getByRole('navigation', { name: 'Aree del progetto' })
    .getByRole('button', { name: 'Lista', exact: true }).click()
  assert.equal(await page.getByRole('navigation', { name: 'Aree del progetto' })
    .getByRole('button', { name: 'Thread', exact: true }).isEnabled(), true)
  console.log('LIVE OK: testi per giocatori, sintesi Markdown sicure a 1280/640 px, originali conservati, 127 attività, burst da 60 e navigazione attiva.')
} finally {
  if (application) await application.close()
  if (realpathSync(dirname(temporary)) !== realpathSync(tmpdir()) ||
    !basename(temporary).startsWith('pokeguru-ai-activity-ui-'))
    throw new Error('Percorso temporaneo inatteso: pulizia interrotta.')
  rmSync(temporary, { recursive: true, force: true })
}
