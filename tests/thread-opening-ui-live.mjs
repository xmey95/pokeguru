import assert from 'node:assert/strict'
import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { _electron as electron } from 'playwright-core'
import { createProjectFromStart } from './project-ui-helper.mjs'

const require = createRequire(import.meta.url)
const workspace = resolve(import.meta.dirname, '..')
const temporary = mkdtempSync(join(tmpdir(), 'pokeguru-thread-opening-'))
const profile = join(temporary, 'profile')
const real = process.argv.includes('--real')
let application

async function launch() {
  return electron.launch({ executablePath: require('electron'), args: ['.'], cwd: workspace,
    env: { ...process.env, POKEGURU_DATA_DIR: profile,
      ...(!real ? { POKEGURU_CODEX_BIN: join(temporary, 'missing-codex') } : {}) }, timeout: 30000 })
}

async function inspect(page) {
  return page.evaluate(async () => {
    const projects = await window.projectsApi.list()
    if (!projects.ok) throw new Error(projects.error)
    const threads = await window.projectsApi.listDeckThreads(projects.value[0].id)
    if (!threads.ok) throw new Error(threads.error)
    return { projectId: projects.value[0].id, threads: threads.value }
  })
}

try {
  application = await launch()
  let page = await application.firstWindow()
  await createProjectFromStart(page, 'Apertura AI')
  await page.getByRole('button', { name: 'Strategie', exact: true }).click()
  await page.getByRole('button', { name: 'Nuova strategia', exact: true }).click()
  await page.getByLabel('Titolo').fill('Prima conversazione')
  await page.getByLabel('Primo messaggio a Codex').fill('Quale piano iniziale suggerisci?')
  await page.getByRole('button', { name: 'Crea e chiedi a Codex' }).click()
  await page.locator('#new-thread-form').waitFor({ state: 'detached' })
  if (real) {
    await page.locator('.thread-message[data-author="assistant"]').first().waitFor({ timeout: 240000 })
    let state = await inspect(page)
    const first = state.threads[0]
    assert.ok(first.aiSessionRef)
    assert.equal(first.messages.length, 2)
    assert.equal(first.messages[0].id, first.openingAiMessageId)
    assert.ok(first.messages[1].aiTurnId)
    assert.ok(first.messages[1].evidence)
    await page.getByRole('button', { name: 'Nuova strategia', exact: true }).click()
    await page.getByLabel('Titolo').fill('Seconda conversazione')
    await page.getByLabel('Primo messaggio a Codex').fill('Rispondi con una breve osservazione diversa.')
    await page.getByRole('button', { name: 'Crea e chiedi a Codex' }).click()
    await page.waitForFunction(() => document.querySelector('#thread-switcher-trigger')?.textContent?.includes('Seconda conversazione'))
    await page.locator('.thread-message[data-author="assistant"]').first().waitFor({ timeout: 240000 })
    state = await inspect(page)
    const second = state.threads.find((thread) => thread.title === 'Seconda conversazione')
    assert.ok(second?.aiSessionRef)
    assert.notEqual(second.aiSessionRef, first.aiSessionRef)
    assert.equal(second.messages.length, 2)
    await application.close()
    application = undefined
    application = await launch()
    page = await application.firstWindow()
    await page.getByRole('button', { name: 'Strategie', exact: true }).click()
    const reopened = await inspect(page)
    assert.equal(reopened.threads.find((thread) => thread.id === first.id)?.aiSessionRef, first.aiSessionRef)
    assert.equal(reopened.threads.find((thread) => thread.id === second.id)?.messages.length, 2)
    console.log('Thread opening Codex real, two sessions, evidence, reopen: passed')
  } else {
  await page.getByRole('button', { name: 'Riprendi analisi' }).waitFor()
  let state = await inspect(page)
  assert.equal(state.threads.length, 1)
  assert.equal(state.threads[0].messages.length, 1)
  assert.equal(state.threads[0].messages[0].text, 'Quale piano iniziale suggerisci?')
  assert.equal(state.threads[0].openingAiMessageId, state.threads[0].messages[0].id)
  const beforeResume = await page.evaluate((value) => window.projectsApi.getAiJobStatus(value.projectId,
    value.threads[0].id), state)
  await page.getByRole('button', { name: 'Riprendi analisi' }).click()
  let resumed
  for (let attempt = 0; attempt < 50; attempt++) {
    resumed = await page.evaluate((value) => window.projectsApi.getAiJobStatus(value.projectId,
      value.threads[0].id), state)
    if (resumed.ok && resumed.value.status === 'interrupted' &&
      resumed.value.updatedAt !== beforeResume.value.updatedAt) break
    await page.waitForTimeout(100)
  }
  assert.notEqual(resumed.value.updatedAt, beforeResume.value.updatedAt)
  state = await inspect(page)
  assert.equal(state.threads[0].messages.length, 1)
  const job = await page.evaluate((value) => window.projectsApi.getAiJobStatus(value.projectId,
    value.threads[0].id), state)
  assert.equal(job.ok, true)
  assert.equal(job.value.status, 'interrupted')
  assert.equal(job.value.id, beforeResume.value.id)
  assert.equal(job.value.progress.diagnostics.resumable, true)
  await application.close()
  application = undefined

  application = await launch()
  page = await application.firstWindow()
  await page.getByRole('button', { name: 'Strategie', exact: true }).click()
  await page.getByRole('button', { name: 'Riprendi analisi' }).waitFor()
  state = await inspect(page)
  assert.equal(state.threads[0].messages.length, 1)
  assert.equal(state.threads[0].openingAiMessageId, state.threads[0].messages[0].id)
  await page.getByRole('button', { name: 'Annulla analisi' }).click()
  await page.getByRole('button', { name: 'Riprova primo messaggio' }).click()
  await page.getByRole('button', { name: 'Riprendi analisi' }).waitFor()
  state = await inspect(page)
  assert.equal(state.threads[0].messages.length, 1)
  console.log('Thread opening UI, retry, reopen: passed (Codex unavailable fixture)')
  }
} finally {
  if (application) await application.close()
  if (realpathSync(dirname(temporary)) !== realpathSync(tmpdir()) ||
    !basename(temporary).startsWith('pokeguru-thread-opening-')) throw new Error('Unsafe cleanup path')
  rmSync(temporary, { recursive: true, force: true })
}
