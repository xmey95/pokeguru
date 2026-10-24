import assert from 'node:assert/strict'
import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { DatabaseSync } from 'node:sqlite'
import { _electron as electron } from 'playwright-core'

const require = createRequire(import.meta.url)
const directory = mkdtempSync(join(tmpdir(), 'pokeguru-ai-live-'))
let application
try {
  application = await electron.launch({ executablePath: require('electron'), args: ['.'],
    cwd: resolve(import.meta.dirname, '..'), env: { ...process.env, POKEGURU_DATA_DIR: directory } })
  const page = await application.firstWindow()
  await page.getByLabel('Nome progetto').fill('Prova analisi AI')
  await page.getByRole('button', { name: 'Crea progetto' }).click()
  await page.getByLabel('Testo lista').fill('Pokémon: 4\n4 Mega Absol ex MEG 86\nTrainer: 8\n4 Rare Candy\n4 Iono')
  await page.getByRole('button', { name: 'Salva lista' }).click()
  await page.getByTestId('card-total').filter({ hasText: '12 carte' }).waitFor()
  await page.getByRole('button', { name: 'Matchup' }).click()
  await page.locator('.meta-deck').first().waitFor({ timeout: 30000 })
  const deckCount = await page.locator('.meta-deck').count()
  const connection = await page.evaluate(() => window.projectsApi.getAiConnection())
  assert.equal(connection.ok, true, connection.ok ? '' : connection.error)
  await page.locator('.matchup-ai-details > summary').click()
  const model = connection.value.models.find((item) => item.id.includes('luna')) ??
    connection.value.models.find((item) => item.isDefault) ?? connection.value.models[0]
  assert.ok(model, 'Nessun modello Codex disponibile')
  const effort = model.reasoningEfforts.some((item) => item.id === 'low') ? 'low' :
    model.reasoningEfforts.find((item) => item.id === model.defaultReasoningEffort)?.id ?? null
  await page.getByLabel('Modello', { exact: true }).selectOption(model.id)
  if (effort) await page.getByLabel('Ragionamento', { exact: true }).selectOption(effort)
  assert.match(await page.locator('.ai-data-preview').textContent(), /Dati inviati a Codex/)
  await page.getByRole('button', { name: 'Genera analisi con Codex' }).click()
  await Promise.race([
    page.locator('.matchup-fields').getByText('Limiti dell’analisi').waitFor({ timeout: 200000 }),
    page.getByRole('alert').waitFor({ timeout: 200000 }).then(async () => {
      throw new Error(`Analisi non generata: ${await page.getByRole('alert').textContent()}`)
    })
  ])
  await page.locator('.matchup-report-meta > summary').click()
  assert.match(await page.locator('.meta-analysis').textContent(), /Analisi Codex generata/)
  assert.match(await page.locator('.meta-analysis').textContent(), new RegExp(`Modello: ${model.id}`))
  const observations = [
    'Valuta come ipotesi se andare secondi possa essere utile; non darlo per certo senza risultati di partita.',
    'Nella strategia considera anche il rischio di consumare troppe risorse nel primo turno.'
  ]
  for (let index = 0; index < observations.length; index += 1) {
    await page.getByLabel('Rispondi a questa analisi').fill(observations[index])
    await page.getByRole('button', { name: 'Rivedi analisi con Codex' }).click()
    await Promise.race([
      page.waitForFunction((count) => document.querySelectorAll('.discussion-timeline details').length === count,
        index + 2, { timeout: 200000 }),
      page.getByRole('alert').waitFor({ timeout: 200000 }).then(async () => {
        throw new Error(`Revisione non generata: ${await page.getByRole('alert').textContent()}`)
      })
    ])
    assert.match(await page.locator('.discussion-timeline').textContent(), /Cosa è cambiato/)
  }
  await page.getByRole('button', { name: 'Lista', exact: true }).click()
  await page.getByLabel('Testo lista').fill('Pokémon: 5\n4 Mega Absol ex MEG 86\n1 Mega Audino ex MEG 84\nTrainer: 8\n4 Rare Candy\n4 Iono')
  await page.getByRole('button', { name: 'Sostituisci lista' }).click()
  await page.getByTestId('card-total').filter({ hasText: '13 carte' }).waitFor()
  await page.getByRole('button', { name: 'Matchup' }).click()
  await page.getByRole('button', { name: 'Continua sulla nuova base' }).waitFor({ timeout: 30000 })
  await page.getByRole('button', { name: 'Continua sulla nuova base' }).click()
  await Promise.race([
    page.getByRole('button', { name: /Base attuale/ }).waitFor({ timeout: 200000 }),
    page.getByRole('alert').waitFor({ timeout: 200000 }).then(async () => {
      throw new Error(`Prosecuzione non generata: ${await page.getByRole('alert').textContent()}`)
    })
  ])
  assert.equal(await page.locator('.discussion-switcher button').count(), 2)
  await application.close()
  application = undefined
  const database = new DatabaseSync(join(directory, 'data', 'pokeguru.sqlite'))
  const row = database.prepare('SELECT payload FROM matchup_reports LIMIT 1').get()
  const report = JSON.parse(row.payload)
  assert.deepEqual(report.ai, { provider: 'codex', model: model.id, reasoningEffort: effort, source: 'override' })
  const original = database.prepare('SELECT id FROM matchup_discussions WHERE parent_id IS NULL').get()
  const turns = database.prepare('SELECT feedback, report_payload, change_summary FROM matchup_turns WHERE discussion_id = ? ORDER BY turn_no').all(original.id)
  assert.equal(turns.length, 3)
  assert.equal(turns[0].feedback, null)
  assert.equal(turns[1].feedback, observations[0])
  assert.equal(turns[2].feedback, observations[1])
  assert.ok(turns.every((turn) => turn.report_payload))
  assert.ok(turns.slice(1).every((turn) => turn.change_summary))
  assert.equal(database.prepare('SELECT COUNT(*) AS total FROM matchup_discussions').get().total, 2)
  assert.equal(database.prepare('SELECT parent_id FROM matchup_discussions WHERE parent_id IS NOT NULL').get().parent_id, original.id)
  database.close()
  console.log(`LIVE OK: ${deckCount} archetipi Limitless; analisi, due revisioni e prosecuzione sulla nuova lista persistite.`)
} finally {
  if (application) await application.close()
  if (realpathSync(dirname(directory)) !== realpathSync(tmpdir()) || !basename(directory).startsWith('pokeguru-ai-live-')) {
    throw new Error('Percorso temporaneo inatteso: pulizia interrotta.')
  }
  rmSync(directory, { recursive: true, force: true })
}
