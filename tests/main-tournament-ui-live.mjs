import assert from 'node:assert/strict'
import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { _electron as electron } from 'playwright-core'

const require = createRequire(import.meta.url)
const workspace = resolve(import.meta.dirname, '..')
const directory = mkdtempSync(join(tmpdir(), 'pokeguru-main-event-ui-'))
let application
const launch = () => electron.launch({ executablePath: require('electron'), args: ['.'], cwd: workspace,
  env: { ...process.env, POKEGURU_DATA_DIR: directory }, timeout: 30_000 })

try {
  application = await launch()
  let page = await application.firstWindow()
  await page.getByRole('button', { name: 'Eventi' }).click()
  await page.getByRole('button', { name: 'Regional', exact: true }).click()
  await page.getByRole('heading', { name: 'Regional e grandi eventi' }).waitFor()
  await page.getByRole('button', { name: 'Aggiorna nuovi Regional' }).click()
  for (let block = 0; block < 10; block++) {
    const button = page.getByRole('button', { name: 'Continua blocco Regional' })
    await button.waitFor({ timeout: 120_000 })
    await page.waitForFunction(() => {
      const target = [...document.querySelectorAll('button')].find((item) => item.textContent?.includes('Continua blocco Regional'))
      return target && !target.disabled
    }, null, { timeout: 120_000 })
    const state = await page.evaluate(async () => {
      const listed = await window.projectsApi.listMainTournaments()
      if (!listed.ok) return { count: 0, good: false }
      const two = listed.value.filter((item) => item.eventId === '582' || item.eventId === '581')
      const events = await Promise.all(two.map((item) => window.projectsApi.getMainTournament(item.eventId)))
      return { count: two.length, good: two.length === 2 && events.every((result) => result.ok &&
        result.value?.participants.some((item) => item.deckId === '352' && item.cardTotal === 60)) }
    })
    if (state.good) break
    if (block === 9) throw new Error(`Hydrapple non coperto in due Regional dopo dieci blocchi: ${JSON.stringify(state)}`)
    await button.click()
  }
  await page.getByText('Liste da 60 acquisite').waitFor()
  await application.close()
  application = undefined

  application = await launch()
  page = await application.firstWindow()
  await page.getByRole('button', { name: 'Eventi' }).click()
  await page.getByRole('button', { name: 'Regional', exact: true }).click()
  await page.locator('option[value="582"]').waitFor({ state: 'attached' })
  const listed = await page.evaluate(() => window.projectsApi.listMainTournaments())
  assert.equal(listed.ok, true)
  assert.ok(listed.value.length >= 2)
  console.log(`LIVE Regional OK: ${listed.value.length} eventi globali; Hydrapple da 60 carte in Nice e Louisville; riapertura offline.`)
} finally {
  if (application) await application.close()
  if (realpathSync(dirname(directory)) !== realpathSync(tmpdir()) || !basename(directory).startsWith('pokeguru-main-event-ui-'))
    throw new Error('Percorso temporaneo inatteso: pulizia interrotta.')
  rmSync(directory, { recursive: true, force: true })
}
