import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { DatabaseSync } from 'node:sqlite'
import { _electron as electron } from 'playwright-core'
import { auditDesignSystem } from './design-system-audit.mjs'
import { createProjectFromStart, startNewProject, switchProject, switchThread } from './project-ui-helper.mjs'

const require = createRequire(import.meta.url)
const workspace = resolve(import.meta.dirname, '..')
const profile = mkdtempSync(join(tmpdir(), 'pokeguru-thread-switcher-'))
const shots = join(workspace, 'node_modules')
let application
function database(action) {
  const db = new DatabaseSync(join(profile, 'data', 'pokeguru.sqlite'))
  try { return action(db) } finally { db.close() }
}
const threadCount = () => database((db) => db.prepare('SELECT COUNT(*) AS n FROM deck_threads').get().n)

async function geometry(page, width, height, selector) {
  await page.setViewportSize({ width, height })
  const boxes = await page.evaluate((selector) => {
    const rect = (s) => {
      const r = document.querySelector(s).getBoundingClientRect()
      return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }
    }
    return { main: rect('.main-content'), deck: rect('.deck-companion'), target: rect(selector),
      rootScroll: document.querySelector('#root').scrollTop, width: document.documentElement.scrollWidth }
  }, selector)
  assert.equal(boxes.rootScroll, 0, 'Il focus ha spostato la griglia')
  assert.ok(boxes.width <= width, 'Overflow orizzontale')
  assert.ok(boxes.target.left >= boxes.main.left && boxes.target.right <= boxes.main.right, 'Controllo fuori dal contenuto')
  if (selector === '.thread-picker') assert.ok(boxes.target.top >= boxes.main.top && boxes.target.bottom <= boxes.main.bottom, 'Menu fuori dal contenuto')
  assert.ok(width > 1240 ? boxes.main.right <= boxes.deck.left : boxes.main.bottom <= boxes.deck.top, 'Lista coperta')
  await auditDesignSystem(page, `Thread ${selector} ${width}`)
}

try {
  application = await electron.launch({ executablePath: require('electron'), args: ['.'], cwd: workspace,
    env: { ...process.env, POKEGURU_DATA_DIR: profile }, timeout: 30000 })
  const page = await application.firstWindow()
  await createProjectFromStart(page, 'Thread UI · fixture')
  await page.getByLabel('Testo lista').fill(readFileSync(join(workspace, 'examples/workspace-principale.txt'), 'utf8'))
  await page.getByRole('button', { name: 'Salva lista' }).click()
  await page.locator('#deck-import').waitFor({ state: 'detached' })
  await page.getByRole('button', { name: 'Thread', exact: true }).click()
  await page.locator('#thread-switcher-trigger').waitFor()
  assert.ok(await page.locator('#thread-switcher-trigger').isDisabled())

  const newThread = page.getByRole('button', { name: 'Nuovo thread', exact: true })
  await newThread.focus()
  await page.keyboard.press('Enter')
  await page.waitForFunction(() => document.activeElement?.id === 'thread-title')
  await page.getByLabel('Titolo', { exact: true }).fill('Bozza da annullare')
  await page.getByLabel('Prima osservazione (facoltativa)').fill('Non salvare')
  await page.keyboard.press('Escape')
  await page.locator('#new-thread-form').waitFor({ state: 'detached' })
  assert.equal(threadCount(), 0)
  assert.ok(await newThread.evaluate((el) => el === document.activeElement))
  await newThread.click()
  assert.equal(await page.getByLabel('Titolo', { exact: true }).inputValue(), '')
  assert.equal(await page.getByLabel('Prima osservazione (facoltativa)').inputValue(), '')
  await page.getByLabel('Titolo', { exact: true }).fill('Piano più rapido')
  await page.getByLabel('Prima osservazione (facoltativa)').fill('Conservare una ricerca per il turno finale.')

  for (const [width, height] of [[1440, 900], [1280, 720], [640, 720]]) {
    await geometry(page, width, height, '#new-thread-form')
    await page.locator('.main-content').evaluate((el) => { el.scrollTop = 0 })
    await page.screenshot({ path: join(shots, `thread-create-${width}.png`) })
  }
  database((db) => db.exec("CREATE TRIGGER fixture_thread_failure BEFORE INSERT ON deck_threads BEGIN SELECT RAISE(ABORT, 'Creazione fallita di prova'); END"))
  await page.getByRole('button', { name: 'Crea thread', exact: true }).click()
  await page.locator('#new-thread-form').getByRole('alert').waitFor()
  const errorBox = await page.locator('#new-thread-form').getByRole('alert').boundingBox()
  const mainBox = await page.locator('.main-content').boundingBox()
  assert.ok(errorBox.y >= mainBox.y && errorBox.y + errorBox.height <= mainBox.y + mainBox.height, 'Errore fuori vista')
  assert.equal(threadCount(), 0)
  assert.equal(await page.getByLabel('Titolo', { exact: true }).inputValue(), 'Piano più rapido')
  assert.match(await page.getByLabel('Prima osservazione (facoltativa)').inputValue(), /Conservare/)
  database((db) => db.exec('DROP TRIGGER fixture_thread_failure'))
  await page.getByRole('button', { name: 'Crea thread', exact: true }).click()
  await page.locator('#new-thread-form').waitFor({ state: 'detached' })
  await page.waitForFunction(() => document.activeElement?.id === 'new-thread-trigger')
  assert.ok(await newThread.evaluate((el) => el === document.activeElement))
  assert.equal(threadCount(), 1)
  const returnedFocus = await newThread.boundingBox()
  const workspaceBox = await page.locator('.main-content').boundingBox()
  assert.ok(returnedFocus.y >= workspaceBox.y && returnedFocus.y + returnedFocus.height <= workspaceBox.y + workspaceBox.height, 'Focus restituito fuori vista')

  // Real local threads, seeded via the existing API only to exercise a long chooser.
  await page.evaluate(async () => {
    const projects = await window.projectsApi.list()
    if (!projects.ok) throw new Error(projects.error)
    for (let index = 0; index < 12; index++) {
      const result = await window.projectsApi.createDeckThread({ projectId: projects.value[0].id,
        title: index === 0 ? 'Una strategia con un titolo molto lungo per valutare gli attaccanti e il recupero delle energie nel finale della partita' : `Variante di prova ${index}` })
      if (!result.ok) throw new Error(result.error)
    }
  })
  await page.getByRole('button', { name: 'Lista', exact: true }).click()
  await page.getByRole('button', { name: 'Thread', exact: true }).click()
  await switchThread(page, /Piano più rapido/)
  const trigger = page.locator('#thread-switcher-trigger')
  const picker = page.getByRole('dialog', { name: 'Scegli thread' })
  for (const [width, height] of [[1440, 900], [1280, 720], [640, 720]]) {
    await page.setViewportSize({ width, height })
    await page.locator('.main-content').evaluate((el) => { el.scrollTop = 0 })
    await trigger.focus()
    await page.keyboard.press('Enter')
    await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'Cerca thread')
    await geometry(page, width, height, '.thread-picker')
    await page.screenshot({ path: join(shots, `thread-picker-${width}.png`) })
    assert.equal(await picker.getByRole('button').count(), 13)
    assert.ok(await picker.locator('.project-picker-results').evaluate((el) => el.scrollHeight > el.clientHeight))
    await page.keyboard.press('ArrowUp')
    assert.ok(await picker.getByRole('button').last().evaluate((el) => el === document.activeElement))
    await geometry(page, width, height, '.thread-picker')
    await page.keyboard.press('ArrowDown')
    await page.getByLabel('Cerca thread').fill('inesistente')
    await picker.getByText('Nessun thread trovato.').waitFor()
    await page.keyboard.press('ArrowDown')
    await page.getByLabel('Cerca thread').fill('UNA STRATEGIA')
    assert.equal(await picker.getByRole('button').count(), 1)
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Enter')
    await picker.waitFor({ state: 'hidden' })
    await page.waitForFunction(() => document.activeElement?.id === 'thread-switcher-trigger' && !document.querySelector('[data-nav-loading="true"]'))
    assert.match(await trigger.innerText(), /Una strategia/)
    assert.ok(await trigger.evaluate((el) => el === document.activeElement))
    await geometry(page, width, height, '#thread-switcher-trigger')
    await trigger.click()
    assert.equal(await page.getByLabel('Cerca thread').inputValue(), '')
    await page.keyboard.press('Escape')
    await picker.waitFor({ state: 'hidden' })
    assert.ok(await trigger.evaluate((el) => el === document.activeElement))
    await switchThread(page, /Piano più rapido/)
  }
  await trigger.click()
  await page.getByLabel('Cerca thread').fill('Piano più rapido')
  await page.keyboard.press('Tab')
  assert.ok(await picker.getByRole('button').evaluate((el) => el === document.activeElement), await page.evaluate(() => document.activeElement?.outerHTML))
  await page.keyboard.press('Tab')
  await picker.waitFor({ state: 'hidden' })

  await newThread.click()
  await page.getByLabel('Titolo', { exact: true }).fill('Non deve passare al secondo progetto')
  await startNewProject(page)
  await page.getByLabel('Nome progetto').fill('Altro progetto Thread')
  await page.getByRole('button', { name: 'Crea progetto' }).click()
  await page.getByTestId('selected-project-name').getByText('Altro progetto Thread').waitFor()
  await page.getByRole('button', { name: 'Thread', exact: true }).click()
  await page.locator('#thread-switcher-trigger').waitFor()
  assert.ok(await trigger.isDisabled())
  assert.equal(await page.locator('#new-thread-form').count(), 0)
  assert.equal(threadCount(), 13)
  await switchProject(page, /Thread UI · fixture/)
  await page.getByRole('button', { name: 'Thread', exact: true }).click()
  assert.equal(await page.getByLabel('Titolo', { exact: true }).inputValue(), 'Non deve passare al secondo progetto', 'La bozza resta nel progetto di origine')
  await page.locator('#new-thread-form').getByRole('button', { name: 'Annulla', exact: true }).click()
  await switchThread(page, /Piano più rapido/)
  assert.match(await page.locator('.thread-detail').innerText(), /Conservare una ricerca/)
  console.log('APP-067 UI OK: ricerca, nomi lunghi, tastiera/focus, annullamento, errore SQLite e recupero, isolamento e layout 1440/1280/640.')
} finally {
  if (application) await application.close()
  if (realpathSync(dirname(profile)) !== realpathSync(tmpdir()) || !basename(profile).startsWith('pokeguru-thread-switcher-'))
    throw new Error('Percorso temporaneo inatteso: pulizia interrotta.')
  rmSync(profile, { recursive: true, force: true })
}
