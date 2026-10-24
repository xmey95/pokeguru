import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { DatabaseSync } from 'node:sqlite'
import { _electron as electron } from 'playwright-core'
import { createProjectFromStart, openDeckImport, switchThread } from './project-ui-helper.mjs'

const require = createRequire(import.meta.url)
const workspace = resolve(import.meta.dirname, '..')
const temporary = mkdtempSync(join(tmpdir(), 'pokeguru-threads-ai-'))
const offline = process.argv.includes('--offline')
const profile = join(temporary, 'profile')
const baseText = offline ? '60 Carta A MEG 1' : '1 Mega Absol ex ME01 086\n59 Psychic Energy SVE 005'
let application

function seedCatalog() {
  const db = new DatabaseSync(join(profile, 'data', 'pokeguru.sqlite'))
  const now = '2026-10-23T00:00:00.000Z'
  for (const [id, name] of [['me01', 'Mega Evolution'], ['sve', 'Scarlet & Violet Energies']]) {
    db.prepare('INSERT INTO catalog_sets (id, name, source_total, sample_total, fetched_at, release_date) VALUES (?, ?, ?, ?, ?, NULL)')
      .run(id, name, 300, 3, now)
  }
  for (const [id, setId, localId, name, category, stage] of [
    ['me01-086', 'me01', '086', 'Mega Absol ex', 'Pokemon', 'Basic'],
    ['sve-005', 'sve', '005', 'Psychic Energy', 'Energy', null],
    ['me01-114', 'me01', '114', "Boss's Orders", 'Trainer', null]
  ]) {
    const print = { id, setId, setName: setId, localId, name, category, stage,
      energyType: category === 'Energy' ? 'Normal' : null,
      rarity: null, regulationMark: 'I', variants: null, identityId: name,
      identityBasis: 'unverified',
      ...(id === 'me01-086' ? { gameplaySchemaVersion: 1,
        gameplay: { hp: 270, types: ['Darkness'], evolveFrom: null,
          attacks: [{ name: 'Test Attack', cost: ['Darkness'], damage: '100', effect: 'Test fixture.' }],
          abilities: [], effect: null, trainerType: null, weaknesses: [], resistances: [], retreat: 2 } } : {}),
      imageBase: null, thumbnail: null,
      highImageAvailable: null, sourceUpdated: null,
      sourceUrl: `https://api.tcgdex.net/v2/en/cards/${id}`, detailAt: now, error: null }
    db.prepare('INSERT INTO catalog_prints (id, set_id, payload) VALUES (?, ?, ?)')
      .run(id, setId, JSON.stringify(print))
  }
  db.prepare('INSERT INTO catalog_sync (id, fetched_at) VALUES (1, ?)').run(now)
  db.close()
}

async function launch() {
  return electron.launch({ executablePath: require('electron'), args: ['.'], cwd: workspace,
    env: { ...process.env, POKEGURU_DATA_DIR: profile,
      ...(offline ? { POKEGURU_CODEX_BIN: join(temporary, 'missing-codex') } : {}) }, timeout: 30000 })
}

async function openThread(page, name) {
  await page.getByRole('button', { name: 'Thread', exact: true }).click()
  await switchThread(page, new RegExp(name))
}

try {
  application = await launch()
  let page = await application.firstWindow()
  page.on('pageerror', (error) => console.error('Renderer error:', error))
  page.on('console', (message) => { if (message.type() === 'error') console.error('Renderer console:', message.text()) })
  await createProjectFromStart(page, 'Discussioni AI')
  const project = await page.evaluate(async () => {
    const result = await window.projectsApi.list()
    if (!result.ok) throw new Error(result.error)
    return result.value[0]
  })
  if (!offline) seedCatalog()
  await page.getByRole('button', { name: 'Lista', exact: true }).click()
  await openDeckImport(page)
  await page.getByLabel('Testo lista').fill(baseText)
  await page.getByRole('button', { name: 'Salva lista' }).click()
  await page.locator('#deck-import').waitFor({ state: 'detached' })
  await page.getByTestId('card-total').getByText('60 carte').waitFor()
  await page.getByRole('button', { name: 'Thread', exact: true }).click()
  await page.getByRole('button', { name: 'Nuovo thread', exact: true }).click()
  await page.getByLabel('Titolo').fill('Thread A')
  await page.getByRole('button', { name: 'Crea thread' }).click()
  await page.locator('#new-thread-form').waitFor({ state: 'detached' })
  await page.getByRole('button', { name: 'Nuovo thread', exact: true }).click()
  await page.getByLabel('Titolo').fill('Thread B')
  await page.getByRole('button', { name: 'Crea thread' }).click()
  await page.locator('#new-thread-form').waitFor({ state: 'detached' })

  if (offline) {
    await page.getByLabel('Scrivi nel thread').fill('Valuta questa idea')
    await page.getByRole('button', { name: 'Vedi dati inviati a Codex' }).first().click()
    await page.getByText('Anteprima dei dati locali').waitFor()
    await page.locator('.thread-review').last().locator('summary').first().click()
    assert.match(await page.locator('.thread-review').last().innerText(), /Carta A/)
    await page.getByRole('button', { name: 'Chiedi a Codex' }).click()
    await page.getByRole('alert').getByText('Codex CLI non trovato.', { exact: false }).waitFor()
    assert.equal(await page.getByLabel('Scrivi nel thread').inputValue(), 'Valuta questa idea')
    const result = await page.evaluate((id) => window.projectsApi.listDeckThreads(id), project.id)
    assert.equal(result.ok, true)
    assert.equal(result.value.every((thread) => thread.aiSessionRef === null && thread.messages.length === 0), true)
    await page.getByLabel('Modifica da valutare').fill('Migliora la consistenza')
    await page.getByRole('button', { name: 'Vedi dati inviati a Codex' }).last().click()
    await page.getByText('Anteprima dei dati locali').waitFor()
    await page.getByRole('button', { name: 'Genera proposta Codex' }).click()
    await page.getByRole('alert').getByText('Codex CLI non trovato.', { exact: false }).waitFor()
    assert.equal(await page.getByLabel('Modifica da valutare').inputValue(), 'Migliora la consistenza')
    const afterProposal = await page.evaluate((id) => window.projectsApi.listDeckThreads(id), project.id)
    assert.equal(afterProposal.ok, true)
    assert.equal(afterProposal.value.every((thread) => thread.candidates.length === 0), true)
    console.log('E2E APP-040/041 offline OK: errori visibili, richieste preservate, nessuna candidata fittizia.')
  } else {
    for (const [name, code] of [['Thread A', 'ALFA'], ['Thread B', 'BETA']]) {
      await switchThread(page, new RegExp(name))
      await page.getByLabel('Scrivi nel thread').fill(`Rispondi brevemente includendo il codice ${code}.`)
      await page.getByRole('button', { name: 'Chiedi a Codex' }).click()
      try {
        await page.locator('.thread-message')
          .filter({ has: page.locator('small', { hasText: 'Codex' }) })
          .filter({ hasText: code }).waitFor({ timeout: 240000 })
      } catch (error) {
        console.error('Thread UI after AI wait:', (await page.locator('body').innerText()).slice(-3000))
        throw error
      }
    }
    const initial = await page.evaluate((id) => window.projectsApi.listDeckThreads(id), project.id)
    assert.equal(initial.ok, true)
    const a = initial.value.find((thread) => thread.title === 'Thread A')
    const b = initial.value.find((thread) => thread.title === 'Thread B')
    assert.ok(a.aiSessionRef)
    assert.ok(b.aiSessionRef)
    assert.notEqual(a.aiSessionRef, b.aiSessionRef)
    assert.equal(a.messages.length, 2)
    assert.equal(b.messages.length, 2)
    assert.ok(a.messages[1].aiConfig)
    assert.ok(b.messages[1].aiConfig)
    assert.ok(a.messages[1].evidence.cards.some((card) => card.gameplayText?.includes('Test Attack')))
    assert.ok(b.messages[1].evidence.sources.some((source) => source.id === 'card:me01-086'))
    await application.close()
    application = undefined

    application = await launch()
    page = await application.firstWindow()
    await openThread(page, 'Thread A')
    await page.getByLabel('Scrivi nel thread').fill('Continua questa conversazione in una frase.')
    await page.getByRole('button', { name: 'Chiedi a Codex' }).click()
    await page.locator('.thread-message').nth(3).waitFor({ timeout: 180000 })
    const after = await page.evaluate((id) => window.projectsApi.listDeckThreads(id), project.id)
    assert.equal(after.ok, true)
    assert.equal(after.value.find((thread) => thread.title === 'Thread A').aiSessionRef, a.aiSessionRef)
    assert.equal(after.value.find((thread) => thread.title === 'Thread A').messages.length, 4)
    assert.equal(after.value.find((thread) => thread.title === 'Thread A').messages[1].evidence.cards
      .some((card) => card.gameplayText?.includes('Test Attack')), true)
    assert.equal(after.value.find((thread) => thread.title === 'Thread B').messages.length, 2)
    const main = await page.evaluate((id) => window.projectsApi.getBaseline(id), project.id)
    assert.equal(main.ok, true)
    assert.equal(main.value.rawText, baseText)
    for (const [name, count] of [['Thread A', 1], ['Thread B', 2]]) {
      await switchThread(page, new RegExp(name))
      if (name === 'Thread B') {
        const connection = await page.evaluate(() => window.projectsApi.getAiConnection())
        assert.equal(connection.ok, true)
        const chosen = connection.value.models.find((model) => model.isDefault && model.reasoningEfforts.length > 1)
          ?? connection.value.models.find((model) => model.reasoningEfforts.length > 1)
        assert.ok(chosen, 'Nessun modello con due livelli di ragionamento disponibile per la prova.')
        await page.locator('.thread-ai-options > summary').click()
        await page.locator(`#thread-ai-model option[value="${chosen.id}"]`).waitFor({ state: 'attached' })
        await page.getByLabel('Modello Codex per questo thread').selectOption(chosen.id)
        const effort = chosen.reasoningEfforts.find((item) => item.id !== chosen.defaultReasoningEffort)
          ?? chosen.reasoningEfforts[0]
        await page.getByLabel('Ragionamento per questo thread').selectOption(effort.id)
      }
      await page.getByLabel('Modifica da valutare').fill(
        `Prepara una candidata di prova: aggiungi esattamente ${count} Boss's Orders ME01 114, togli ${count} Psychic Energy SVE 005 e conserva Mega Absol ex. Restituisci l'intera lista di 60 carte usando i codici del catalogo; è una prova strutturale.`)
      await page.getByRole('button', { name: 'Genera proposta Codex' }).click()
      try {
        await page.locator('.thread-candidate').first().waitFor({ timeout: 180000 })
      } catch (error) {
        console.error('Proposal UI:', (await page.locator('body').innerText()).slice(-4500))
        const current = await page.evaluate((id) => window.projectsApi.listDeckThreads(id), project.id)
        console.error('Proposal thread state:', JSON.stringify(current.ok ? current.value
          .map((thread) => ({ title: thread.title, messages: thread.messages.map((item) =>
            ({ author: item.author, text: item.text.slice(0, 500) })), candidates: thread.candidates.length })) : current))
        throw error
      }
      await page.locator('.thread-candidate.featured .candidate-comparison > summary').click()
      await page.locator('.thread-candidate.featured .candidate-evidence > summary').click()
      await page.locator('.thread-candidate.featured').getByRole('button', { name: /Mega Absol ex.*↗/ }).first().waitFor()
    }
    const proposed = await page.evaluate((id) => window.projectsApi.listDeckThreads(id), project.id)
    assert.equal(proposed.ok, true)
    assert.equal(proposed.value.every((thread) => thread.candidates.length === 1), true)
    assert.notEqual(proposed.value[0].candidates[0].rawText, proposed.value[1].candidates[0].rawText)
    assert.equal(proposed.value.find((thread) => thread.title === 'Thread A').candidates[0].aiConfig.source, 'global')
    assert.equal(proposed.value.find((thread) => thread.title === 'Thread B').candidates[0].aiConfig.source, 'override')
    const unchanged = await page.evaluate((id) => window.projectsApi.getBaseline(id), project.id)
    assert.equal(unchanged.value.rawText, baseText)
    console.log('E2E APP-040/041 live OK: due sessioni Codex e due proposte complete isolate; ripresa e lista principale invariata.')
  }
} finally {
  if (application) await application.close()
  if (realpathSync(dirname(temporary)) !== realpathSync(tmpdir()) || !basename(temporary).startsWith('pokeguru-threads-ai-'))
    throw new Error('Percorso temporaneo inatteso: pulizia interrotta.')
  if (existsSync(temporary)) rmSync(temporary, { recursive: true, force: true })
}
