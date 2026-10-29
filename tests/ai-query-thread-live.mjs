import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { DatabaseSync } from 'node:sqlite'
import { _electron as electron } from 'playwright-core'
import { createProjectFromStart } from './project-ui-helper.mjs'

const require = createRequire(import.meta.url)
const workspace = resolve(import.meta.dirname, '..')
const temporary = mkdtempSync(join(tmpdir(), 'pokeguru-ai-query-'))
const profile = join(temporary, 'profile')
let application

async function launch() {
  return electron.launch({ executablePath: require('electron'), args: ['.'], cwd: workspace,
    env: { ...process.env, POKEGURU_DATA_DIR: profile }, timeout: 30000 })
}

function seedCatalog() {
  const db = new DatabaseSync(join(profile, 'data', 'pokeguru.sqlite'))
  const now = '2026-10-25T00:00:00.000Z'
  db.prepare('INSERT INTO catalog_sets (id, name, source_total, sample_total, fetched_at, release_date) VALUES (?, ?, ?, ?, ?, NULL)')
    .run('me01', 'Mega Evolution', 1, 1, now)
  const print = { id: 'me01-114', setId: 'me01', setName: 'Mega Evolution', localId: '114',
    name: "Boss's Orders", category: 'Trainer', stage: null, energyType: null,
    rarity: 'Rare', regulationMark: 'I', variants: null,
    identityId: 'boss-orders', identityBasis: 'trainer-text', gameplaySchemaVersion: 1,
    gameplay: { hp: null, types: [], evolveFrom: null, attacks: [], abilities: [],
      effect: "Switch 1 of your opponent's Benched Pokémon with their Active Pokémon.",
      trainerType: 'Supporter', weaknesses: [], resistances: [], retreat: null },
    imageBase: null, thumbnail: null, highImageAvailable: null, sourceUpdated: null,
    sourceUrl: 'https://api.tcgdex.net/v2/en/cards/me01-114', detailAt: now, error: null }
  db.prepare('INSERT INTO catalog_prints (id, set_id, payload) VALUES (?, ?, ?)')
    .run(print.id, print.setId, JSON.stringify(print))
  db.prepare('INSERT INTO catalog_sync (id, fetched_at) VALUES (1, ?)').run(now)
  db.close()
}

try {
  application = await launch()
  let page = await application.firstWindow()
  await createProjectFromStart(page, 'Query locali AI')
  const project = await page.evaluate(async () => (await window.projectsApi.list()).value[0])
  await application.close()
  application = undefined
  seedCatalog()
  application = await launch()
  page = await application.firstWindow()
  await page.getByRole('button', { name: 'Strategie', exact: true }).click()
  await page.getByRole('button', { name: 'Nuova strategia', exact: true }).click()
  await page.getByLabel('Titolo').fill('Interroga la stampa')
  await page.getByRole('button', { name: 'Salva nota senza AI' }).click()
  await page.locator('#new-thread-form').waitFor({ state: 'detached' })
  await page.getByLabel('Scrivi nella strategia').fill('Consulta la stampa me01-114 nel catalogo locale e descrivi il suo effetto esatto.')
  await page.getByRole('button', { name: 'Invia a Codex' }).click()
  await Promise.race([
    page.locator('.thread-message').filter({ has: page.locator('small', { hasText: 'Codex' }) })
      .waitFor({ timeout: 180000 }),
    page.getByRole('alert').waitFor({ timeout: 180000 }).then(async () => {
      throw new Error(`Risposta non generata: ${await page.getByRole('alert').textContent()}`)
    })
  ])
  const result = await page.evaluate((id) => window.projectsApi.listDeckThreads(id), project.id)
  assert.equal(result.ok, true)
  const message = result.value.find((thread) => thread.title === 'Interroga la stampa')?.messages[1]
  assert.ok(message?.evidence?.aiQueries)
  assert.ok(message.evidence.aiQueries.archive
    ? message.evidence.aiQueries.references.some((item) => item.id === 'card:me01-114')
    : message.evidence.aiQueries.requests.some((item) => item.status === 'ok' && item.sourceIds.includes('card:me01-114')),
  `Codex non ha interrogato la stampa: ${JSON.stringify(message.evidence.aiQueries.requests.map((item) => item.query))}`)
  assert.match(message.evidence.promptAudit?.text ?? '', /card:me01-114/)
  assert.equal(message.evidence.promptAudit?.utf8Bytes > 0, true)
  await page.locator('.thread-message[data-author=assistant] .candidate-evidence > summary').last().click()
  await page.locator('.thread-message[data-author=assistant] .ai-diagnostics > summary').last().click()
  await page.locator('.ai-query-trace > summary').last().waitFor()
  await application.close()
  application = undefined
  application = await launch()
  page = await application.firstWindow()
  const reopened = await page.evaluate((id) => window.projectsApi.listDeckThreads(id), project.id)
  assert.equal(reopened.ok, true)
  assert.deepEqual(reopened.value.find((thread) => thread.title === 'Interroga la stampa')
    .messages[1].evidence.aiQueries, message.evidence.aiQueries)
  console.log('LIVE query AI OK: stampa fuori dal contesto iniziale trovata automaticamente, fonte, prompt e transcript riaperti.',
    { plannerUsage: message.evidence.aiQueries.plannerUsage,
      finalUsage: message.evidence.promptAudit?.usage,
      plannerMs: message.evidence.aiQueries.durationMs,
      finalMs: message.evidence.promptAudit?.durationMs })
} finally {
  if (application) await application.close()
  if (realpathSync(dirname(temporary)) !== realpathSync(tmpdir()) ||
    !basename(temporary).startsWith('pokeguru-ai-query-'))
    throw new Error('Percorso temporaneo inatteso: pulizia interrotta.')
  if (existsSync(temporary)) rmSync(temporary, { recursive: true, force: true })
}
