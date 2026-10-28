import assert from 'node:assert/strict'
import { auditLoading } from './loading-ui-audit.mjs'
import { mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { DatabaseSync } from 'node:sqlite'
import { _electron as electron } from 'playwright-core'
import { auditDesignSystem } from './design-system-audit.mjs'
import { createProjectFromStart, openDeckImport, switchThread } from './project-ui-helper.mjs'
import { threadAiPresentationScenarios } from './thread-ai-presentation-scenarios.mjs'

const require = createRequire(import.meta.url)
const workspace = resolve(import.meta.dirname, '..')
const profile = mkdtempSync(join(tmpdir(), 'pokeguru-thread-composer-'))
let application
function database(action) {
  const db = new DatabaseSync(join(profile, 'data', 'pokeguru.sqlite'))
  try { return action(db) } finally { db.close() }
}

async function inspect(page, width, height, name) {
  await page.setViewportSize({ width, height })
  await page.locator('.thread-composer').evaluate((form) => {
    const main = form.closest('.main-content')
    main.scrollTop += form.getBoundingClientRect().top - main.getBoundingClientRect().top - 16
  })
  const bounds = await page.evaluate(() => {
    const rect = (selector) => {
      const r = document.querySelector(selector).getBoundingClientRect()
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width }
    }
    return { main: rect('.main-content'), deck: rect('.deck-companion'), form: rect('.thread-composer'),
      width: document.documentElement.scrollWidth, rootScroll: document.querySelector('#root').scrollTop }
  })
  assert.equal(bounds.rootScroll, 0)
  assert.ok(bounds.width <= width)
  assert.ok(bounds.form.left >= bounds.main.left && bounds.form.right <= bounds.main.right)
  assert.ok(width > 1240 ? bounds.main.right <= bounds.deck.left : bounds.main.bottom <= bounds.deck.top)
  const audit = await auditDesignSystem(page, `Scrittura ${name} ${width}`)
  console.log(`${name} ${width}: contrasto minimo ${audit.minimumContrast.toFixed(2)}`)
  await page.screenshot({ path: join(workspace, 'node_modules', `composer-${name}-${width}.png`) })
}

try {
  application = await electron.launch({ executablePath: require('electron'), args: ['.'], cwd: workspace,
    env: { ...process.env, POKEGURU_DATA_DIR: profile, POKEGURU_CODEX_BIN: join(profile, 'missing-codex') }, timeout: 30000 })
  const page = await application.firstWindow()
  await createProjectFromStart(page, 'Scrittura Thread · fixture')
  await page.getByLabel('Testo lista').waitFor()
  const empty = await page.evaluate(async () => {
    const projects = await window.projectsApi.list()
    if (!projects.ok) throw new Error(projects.error)
    const result = await window.projectsApi.createDeckThread({ projectId: projects.value[0].id, title: 'Senza lista' })
    if (!result.ok) throw new Error(result.error)
    return result.value
  })
  await page.getByRole('button', { name: 'Thread', exact: true }).click()
  const input = page.getByLabel('Scrivi nel thread')
  await input.fill('Osservazione senza lista')
  assert.ok(await page.getByRole('button', { name: 'Invia a Codex' }).isEnabled())
  assert.equal(await page.locator('.thread-composer').getByRole('radio').count(), 0)
  assert.match(await page.locator('#thread-composer-help').innerText(), /importa prima una lista principale/)
  await page.getByRole('button', { name: 'Salva osservazione' }).click()
  await page.waitForFunction(() => document.querySelector('#thread-message').value === '')
  assert.match(await page.locator('.thread-message').innerText(), /Osservazione senza lista/)

  await page.getByRole('navigation', { name: 'Aree del progetto' }).getByRole('button', { name: 'Lista', exact: true }).click()
  await openDeckImport(page)
  await page.getByLabel('Testo lista').fill(readFileSync(join(workspace, 'examples/workspace-principale.txt'), 'utf8'))
  await page.getByRole('button', { name: 'Salva lista' }).click()
  await page.locator('#deck-import').waitFor({ state: 'detached' })
  const threads = await page.evaluate(async (projectId) => {
    const results = []
    for (const title of ['Piano A', 'Piano B']) {
      const result = await window.projectsApi.createDeckThread({ projectId, title })
      if (!result.ok) throw new Error(result.error)
      results.push(result.value)
    }
    return results
  }, empty.projectId)
  await page.getByRole('button', { name: 'Thread', exact: true }).click()
  await switchThread(page, /Piano A/)
  assert.equal(await page.locator('.thread-composer textarea').count(), 1)
  assert.equal(await page.locator('#thread-proposal-request').count(), 0)
  await input.fill('Conservare una ricerca per il finale.')
  assert.equal(await input.inputValue(), 'Conservare una ricerca per il finale.')
  await page.getByRole('button', { name: 'Vedi dati inviati a Codex' }).click()
  await page.getByText('Anteprima dei dati locali', { exact: true }).waitFor()
  for (const [width, height] of [[1440, 900], [1280, 720], [640, 720]]) await inspect(page, width, height, 'unico')

  database((db) => db.exec("CREATE TRIGGER fixture_message_failure BEFORE INSERT ON deck_thread_messages BEGIN SELECT RAISE(ABORT, 'Osservazione non salvata di prova'); END"))
  await page.getByRole('button', { name: 'Salva osservazione' }).click()
  await page.locator('.thread-composer').getByRole('alert').waitFor()
  assert.equal(await input.inputValue(), 'Conservare una ricerca per il finale.')
  database((db) => db.exec('DROP TRIGGER fixture_message_failure'))
  await page.getByRole('button', { name: 'Salva osservazione' }).click()
  await page.waitForFunction(() => document.querySelector('#thread-message').value === '')
  const persisted = await page.evaluate((id) => window.projectsApi.listDeckThreads(id), empty.projectId)
  assert.equal(persisted.ok, true)
  assert.equal(persisted.value.find(t => t.id === threads[0].id).messages[0].text, 'Conservare una ricerca per il finale.')
  assert.equal(persisted.value.find(t => t.id === threads[1].id).messages.length, 0)

  const packet = await page.evaluate(({ projectId, id }) => window.projectsApi.previewDeckThreadEvidence(projectId, id, 'Piano'), threads[0])
  assert.equal(packet.ok, true)
  // Delays and AI results below are declared UI fixtures; real AI is covered separately.
  await application.evaluate(({ ipcMain }) => {
    globalThis.composerFixture = { pending: [], calls: [] }
    for (const channel of ['deck:preview-evidence', 'deck:ask-thread']) {
      ipcMain.removeHandler(channel)
      ipcMain.handle(channel, (_event, projectId, threadId, text) => {
        globalThis.composerFixture.calls.push({ channel, projectId, threadId, text })
        return new Promise((resolve) => globalThis.composerFixture.pending.push(resolve))
      })
    }
  })
  async function finish(result) {
    await application.evaluate((_electron, response) => globalThis.composerFixture.pending.shift()(response), result)
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  }
  for (const change of ['text', 'thread']) {
    await input.fill(`Anteprima ${change}`)
    await page.getByRole('button', { name: 'Vedi dati inviati a Codex' }).click()
    await page.getByRole('button', { name: 'Preparo i dati…' }).waitFor()
    if (change === 'text') await input.fill('Richiesta modificata durante anteprima')
    if (change === 'thread') await switchThread(page, /Piano B/)
    await finish(change === 'thread' ? { ok: false, error: 'Errore tardivo da ignorare' } : packet)
    assert.equal(await page.getByText('Anteprima dei dati locali', { exact: true }).count(), 0)
    assert.equal(await page.locator('.thread-composer').getByRole('alert').count(), 0)
  }
  assert.equal(await input.inputValue(), '')
  await switchThread(page, /Piano A/)
  await input.fill('Richiesta discussione fixture')
  await page.getByRole('button', { name: 'Invia a Codex' }).click()
  await page.getByRole('button', { name: 'Risposta in corso…' }).waitFor()
  await auditLoading(page, workspace, 'thread')
  const before = await page.locator('.activity-elapsed').textContent()
  await page.locator('.sidebar').getByRole('button', { name: 'Catalogo', exact: true }).click()
  await page.getByRole('button', { name: 'Indietro', exact: true }).click()
  await page.getByRole('status').filter({ hasText: 'Codex sta rispondendo…' }).waitFor()
  assert.ok(await page.locator('.activity-elapsed').textContent() >= before, 'Timer non deve ripartire al ritorno')
  assert.ok(await input.isEnabled())
  assert.ok(await page.getByRole('button', { name: 'Salva osservazione' }).isDisabled())
  await input.fill('Nuova bozza durante risposta')
  await finish({ ok: true, value: persisted.value.find(t => t.id === threads[0].id) })
  await page.waitForFunction(() => document.querySelector('#thread-message').value === 'Nuova bozza durante risposta')
  await input.fill('Richiesta proposta fixture')
  await page.getByRole('button', { name: 'Invia a Codex' }).click()
  await page.getByRole('button', { name: 'Risposta in corso…' }).waitFor()
  await finish({ ok: false, error: 'Proposta non disponibile · errore di prova UI' })
  await page.locator('.thread-composer').getByRole('alert').waitFor()
  assert.equal(await input.inputValue(), 'Richiesta proposta fixture')
  const calls = await application.evaluate(() => globalThis.composerFixture.calls)
  assert.deepEqual(calls.slice(-2).map(({ channel, text }) => [channel, text]), [
    ['deck:ask-thread', 'Richiesta discussione fixture'], ['deck:ask-thread', 'Richiesta proposta fixture']
  ])
  const errorBox = await page.locator('.thread-composer').getByRole('alert').boundingBox()
  const mainBox = await page.locator('.main-content').boundingBox()
  assert.ok(errorBox.y >= mainBox.y && errorBox.y + errorBox.height <= mainBox.y + mainBox.height)
  await inspect(page, 640, 720, 'errore')
  await page.getByRole('button', { name: 'Salva osservazione' }).click()
  await page.waitForFunction(() => document.querySelector('#thread-message').value === '')
  assert.equal((await application.evaluate(() => globalThis.composerFixture.calls)).length, calls.length)
  assert.match(await page.locator('.thread-timeline').innerText(), /Richiesta proposta fixture/)
  console.log('APP-129 OK: compositore unico, osservazioni persistite e rollback, instradamento UI, errori, anteprime tardive e layout 1440/1280/640. Risposte AI simulate, nessuna integrazione AI certificata.')
  await threadAiPresentationScenarios(page, application, workspace)
} finally {
  if (application) await application.close()
  if (realpathSync(dirname(profile)) !== realpathSync(tmpdir()) || !basename(profile).startsWith('pokeguru-thread-composer-'))
    throw new Error('Percorso temporaneo inatteso: pulizia interrotta.')
  rmSync(profile, { recursive: true, force: true })
}
