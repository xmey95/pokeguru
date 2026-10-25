import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { DatabaseSync } from 'node:sqlite'
import { _electron as electron } from 'playwright-core'
import { createProjectFromStart, switchThread } from './project-ui-helper.mjs'

const require = createRequire(import.meta.url)
const workspace = resolve(import.meta.dirname, '..')
const temporary = mkdtempSync(join(tmpdir(), 'pokeguru-ai-cancel-'))
const profile = join(temporary, 'profile')
let application

async function launch() {
  return electron.launch({ executablePath: require('electron'), args: ['.'], cwd: workspace,
    env: { ...process.env, POKEGURU_DATA_DIR: profile }, timeout: 30000 })
}

try {
  application = await launch()
  let page = await application.firstWindow()
  await createProjectFromStart(page, 'Job da annullare')
  const project = await page.evaluate(async () => {
    const result = await window.projectsApi.list()
    if (!result.ok) throw new Error(result.error)
    return result.value[0]
  })
  await page.getByRole('button', { name: 'Thread', exact: true }).click()
  await page.getByRole('button', { name: 'Nuovo thread', exact: true }).click()
  await page.getByLabel('Titolo').fill('Prova cancellazione')
  await page.getByRole('button', { name: 'Salva nota senza AI' }).click()
  await page.locator('#new-thread-form').waitFor({ state: 'detached' })
  const thread = await page.evaluate(async (id) => {
    const result = await window.projectsApi.listDeckThreads(id)
    if (!result.ok) throw new Error(result.error)
    return result.value[0]
  }, project.id)
  await page.getByLabel('Scrivi nel thread').fill('Rispondi in italiano con un piano generale di prova in più passaggi. Non usare strumenti.')
  await page.getByRole('button', { name: 'Chiedi a Codex' }).click()
  const active = await page.waitForFunction(async ({ projectId, threadId }) => {
    const result = await window.projectsApi.getAiJobStatus(projectId, threadId)
    return result.ok && result.value?.status === 'running' ? result.value : false
  }, { projectId: project.id, threadId: thread.id }, { timeout: 30000 })
  const job = await active.jsonValue()
  const sessionPath = join(profile, 'data', 'ai-jobs', job.id, 'session-id.txt')
  for (let index = 0; index < 100 && !existsSync(sessionPath); index++)
    await new Promise((resolve) => setTimeout(resolve, 100))
  assert.ok(existsSync(sessionPath), 'Il processo Codex non ha avviato la sessione prima della cancellazione')
  await page.getByRole('button', { name: 'Annulla job' }).click()
  await page.waitForFunction(async ({ projectId, threadId }) => {
    const result = await window.projectsApi.getAiJobStatus(projectId, threadId)
    return result.ok && result.value?.status === 'cancelled'
  }, { projectId: project.id, threadId: thread.id }, { timeout: 30000 })
  const statusInFile = () => {
    const db = new DatabaseSync(join(profile, 'data', 'pokeguru.sqlite'), { readOnly: true })
    try { return db.prepare('SELECT status FROM ai_jobs WHERE id = ?').get(job.id)?.status }
    finally { db.close() }
  }
  assert.equal(statusInFile(), 'cancelled')
  await application.close()
  application = undefined
  assert.equal(statusInFile(), 'cancelled')

  application = await launch()
  page = await application.firstWindow()
  await page.getByRole('button', { name: 'Thread', exact: true }).click()
  await switchThread(page, /Prova cancellazione/)
  try { await page.getByText('Job Codex annullato.').waitFor({ timeout: 10000 }) }
  catch (error) {
    console.error('Stato dopo riapertura:', await page.evaluate(async ({ projectId, threadId }) =>
      window.projectsApi.getAiJobStatus(projectId, threadId),
    { projectId: project.id, threadId: thread.id }))
    console.error('UI dopo riapertura:', (await page.locator('body').innerText()).slice(-2500))
    throw error
  }
  const db = new DatabaseSync(join(profile, 'data', 'pokeguru.sqlite'))
  assert.equal(db.prepare('SELECT status FROM ai_jobs WHERE id = ?').get(job.id).status, 'cancelled')
  assert.equal(db.prepare('SELECT COUNT(*) AS total FROM deck_thread_messages WHERE thread_id = ?')
    .get(thread.id).total, 0)
  db.close()
  console.log('LIVE OK: cancellazione di un turno Codex reale e stato coerente dopo riapertura.')
} finally {
  if (application) await application.close()
  if (realpathSync(dirname(temporary)) !== realpathSync(tmpdir()) ||
    !basename(temporary).startsWith('pokeguru-ai-cancel-'))
    throw new Error('Percorso temporaneo inatteso: pulizia interrotta.')
  rmSync(temporary, { recursive: true, force: true })
}
