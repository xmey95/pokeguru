import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { _electron as electron } from 'playwright-core'
import { createProjectFromStart, openDeckImport, seedStoredCandidate, switchThread } from './project-ui-helper.mjs'

const require = createRequire(import.meta.url)
const workspace = resolve(import.meta.dirname, '..')
const profile = mkdtempSync(join(tmpdir(), 'pokeguru-candidate-access-'))
let application

async function checkAccess(page, width) {
  await page.setViewportSize({ width, height: 720 })
  const main = page.locator('.main-content')
  await main.evaluate((element) => { element.scrollTop = element.scrollHeight })
  const before = await main.evaluate((element) => element.scrollTop)
  const access = page.locator('.candidate-access')
  const bounds = await page.evaluate(() => {
    const box = (selector) => {
      const r = document.querySelector(selector)?.getBoundingClientRect()
      return r && { top: r.top, bottom: r.bottom, left: r.left, right: r.right }
    }
    return { main: box('.main-content'), access: box('.candidate-access'), deck: box('.deck-companion') }
  })
  assert.ok(bounds.access.top >= bounds.main.top && bounds.access.bottom <= bounds.main.bottom,
    `${width}: richiamo fuori dal contenuto`)
  if (width > 1240) assert.ok(bounds.access.right < bounds.deck.left, `${width}: richiamo sopra la lista`)
  else assert.ok(bounds.access.bottom <= bounds.deck.top, `${width}: richiamo sopra il dock`)
  await page.screenshot({ path: join(workspace, 'node_modules', `candidate-access-${width}.png`) })
  await access.getByRole('button', { name: 'Apri proposta e confronto' }).click()
  const comparison = page.locator('.thread-candidate.featured .candidate-comparison')
  assert.notEqual(await comparison.getAttribute('open'), null)
  await page.waitForTimeout(100) // Native details toggle is dispatched asynchronously.
  const brief = await page.evaluate(() => {
    const main = document.querySelector('.main-content').getBoundingClientRect()
    const candidate = document.querySelector('.thread-candidate.featured .candidate-brief').getBoundingClientRect()
    return { mainTop: main.top, mainBottom: main.bottom, top: candidate.top, bottom: candidate.bottom }
  })
  assert.ok(brief.top >= brief.mainTop && brief.bottom <= brief.mainBottom, `${width}: riepilogo candidato tagliato`)
  assert.equal(await page.locator('.thread-candidate.featured .candidate-brief-heading h3').evaluate((element) => document.activeElement === element), true)
  assert.equal(await page.locator('.thread-candidate.featured .comparison-list').count(), 2)
  await page.screenshot({ path: join(workspace, 'node_modules', `candidate-comparison-from-access-${width}.png`) })
  await page.getByRole('button', { name: 'Torna alla conversazione' }).click()
  assert.equal(await comparison.getAttribute('open'), null)
  assert.equal(await main.evaluate((element) => element.scrollTop), before, `${width}: posizione di lettura persa`)
  assert.equal(await access.getByRole('button', { name: 'Apri proposta e confronto' }).evaluate((element) => document.activeElement === element), true)
  assert.equal(await page.getByLabel('Scrivi nel thread').inputValue(), 'Bozza di discussione conservata')
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false)
}

try {
  application = await electron.launch({ executablePath: require('electron'), args: ['.'], cwd: workspace,
    env: { ...process.env, POKEGURU_DATA_DIR: profile, POKEGURU_CODEX_BIN: join(profile, 'missing-codex') }, timeout: 30000 })
  const page = await application.firstWindow()
  await createProjectFromStart(page, 'Accesso candidata')
  await openDeckImport(page)
  await page.getByLabel('Testo lista').fill('1 Mega Absol ex MEG 86\n59 Basic Psychic Energy')
  await page.getByRole('button', { name: 'Salva lista' }).click()
  await page.locator('#deck-import').waitFor({ state: 'detached' })
  await page.getByRole('button', { name: 'Thread', exact: true }).click()
  await page.getByRole('button', { name: 'Nuovo thread', exact: true }).click()
  await page.getByLabel('Titolo').fill('Piano A')
  await page.getByRole('button', { name: 'Salva nota senza AI' }).click()
  await page.locator('#new-thread-form').waitFor({ state: 'detached' })
  assert.equal(await page.locator('.candidate-access').count(), 0)
  await seedStoredCandidate(page, '1 Mega Absol ex MEG 86\n58 Basic Psychic Energy\n1 Mega Audino ex ME02.5 172')
  await page.locator('.candidate-access').waitFor()
  const threadId = await page.evaluate(async () => {
    const projects = await window.projectsApi.list()
    if (!projects.ok) throw new Error(projects.error)
    const threads = await window.projectsApi.listDeckThreadSummaries(projects.value[0].id)
    if (!threads.ok) throw new Error(threads.error)
    for (let i = 0; i < 120; i++) {
      const result = await window.projectsApi.addDeckThreadMessage(projects.value[0].id, threads.value[0].id,
        `Osservazione ${i + 1}: ${'confronta la proposta con il piano corrente. '.repeat(6)}`)
      if (!result.ok) throw new Error(result.error)
    }
    return threads.value[0].id
  })
  assert.ok(threadId)
  await page.getByRole('navigation', { name: 'Aree del progetto' }).getByRole('button', { name: 'Lista', exact: true }).click()
  await page.getByRole('button', { name: 'Thread', exact: true }).click()
  await page.locator('.thread-message').last().waitFor()
  assert.equal(await page.locator('.thread-message').count(), 50)
  await page.getByLabel('Scrivi nel thread').fill('Bozza di discussione conservata')
  await page.getByRole('button', { name: /Mostra 50 precedenti/ }).click()
  await page.waitForFunction(() => document.querySelectorAll('.thread-message').length === 100)
  assert.equal(await page.getByLabel('Scrivi nel thread').inputValue(), 'Bozza di discussione conservata')
  await checkAccess(page, 1440)
  await checkAccess(page, 640)
  assert.equal(await page.locator('.thread-candidate').count(), 1, 'Candidata duplicata nella cronologia')
  await seedStoredCandidate(page, '1 Mega Absol ex MEG 86\n57 Basic Psychic Energy\n2 Mega Audino ex ME02.5 172')
  await page.getByText('Candidata 2', { exact: true }).first().waitFor()
  for (let i = 0; i < 3 && !await page.locator('.thread-candidate:not(.featured)').count(); i++) {
    await page.getByRole('button', { name: /Mostra .* precedenti/ }).click()
  }
  await page.locator('.thread-candidate:not(.featured)').waitFor()
  assert.equal(await page.locator('.thread-candidate').count(), 2)
  assert.match(await page.locator('.candidate-access').innerText(), /Candidata 2/)
  assert.match(await page.locator('.thread-candidate:not(.featured) > summary').innerText(), /Candidata 1/)
  await page.locator('.thread-candidate:not(.featured) > summary').click()
  assert.ok(await page.locator('.thread-candidate:not(.featured) .comparison-list').first().isVisible())
  await page.getByRole('button', { name: 'Nuovo thread', exact: true }).click()
  await page.getByLabel('Titolo').fill('Piano B')
  await page.getByRole('button', { name: 'Salva nota senza AI' }).click()
  await page.locator('#new-thread-form').waitFor({ state: 'detached' })
  assert.equal(await page.locator('.candidate-access').count(), 0, 'Richiamo rimasto nel thread senza candidata')
  await switchThread(page, /Piano A/)
  assert.equal(await page.locator('.candidate-access').count(), 1)
  console.log('APP-112 Electron: richiamo, confronto, ritorno esatto, bozza, thread, desktop/dock: passed')
} finally {
  if (application) await application.close()
  rmSync(profile, { recursive: true, force: true })
}
