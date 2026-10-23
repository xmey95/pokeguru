import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { _electron as electron } from 'playwright-core'

const require = createRequire(import.meta.url)
const workspace = resolve(import.meta.dirname, '..')
const temporary = mkdtempSync(join(tmpdir(), 'pokeguru-threads-ai-'))
const offline = process.argv.includes('--offline')
const profile = join(temporary, 'profile')
let application

async function launch() {
  return electron.launch({ executablePath: require('electron'), args: ['.'], cwd: workspace,
    env: { ...process.env, POKEGURU_DATA_DIR: profile,
      ...(offline ? { POKEGURU_CODEX_BIN: join(temporary, 'missing-codex') } : {}) }, timeout: 30000 })
}

async function openThread(page, name) {
  await page.getByRole('button', { name: 'Thread', exact: true }).click()
  await page.locator('.thread-picker').getByRole('button', { name: new RegExp(name) }).click()
}

try {
  application = await launch()
  let page = await application.firstWindow()
  await page.getByLabel('Nome progetto').fill('Discussioni AI')
  await page.getByRole('button', { name: 'Crea progetto' }).click()
  const project = await page.evaluate(async () => {
    const result = await window.projectsApi.list()
    if (!result.ok) throw new Error(result.error)
    return result.value[0]
  })
  await page.getByRole('button', { name: 'Lista', exact: true }).click()
  await page.getByLabel('Testo lista').fill('60 Carta A MEG 1')
  await page.getByRole('button', { name: 'Salva lista' }).click()
  await page.getByTestId('card-total').getByText('60 carte').waitFor()
  await page.getByRole('button', { name: 'Thread', exact: true }).click()
  await page.getByLabel('Titolo').fill('Thread A')
  await page.getByRole('button', { name: 'Crea thread' }).click()
  await page.getByLabel('Titolo').fill('Thread B')
  await page.getByRole('button', { name: 'Crea thread' }).click()

  if (offline) {
    await page.getByLabel('Scrivi nel thread').fill('Valuta questa idea')
    await page.getByRole('button', { name: 'Chiedi a Codex' }).click()
    await page.getByRole('alert').getByText('Codex CLI non trovato.', { exact: false }).waitFor()
    assert.equal(await page.getByLabel('Scrivi nel thread').inputValue(), 'Valuta questa idea')
    const result = await page.evaluate((id) => window.projectsApi.listDeckThreads(id), project.id)
    assert.equal(result.ok, true)
    assert.equal(result.value.every((thread) => thread.aiSessionRef === null && thread.messages.length === 0), true)
    console.log('E2E APP-040 offline OK: errore visibile, domanda preservata, nessuna modifica ai thread.')
  } else {
    for (const [name, code] of [['Thread A', 'ALFA'], ['Thread B', 'BETA']]) {
      await page.locator('.thread-picker').getByRole('button', { name: new RegExp(name) }).click()
      await page.getByLabel('Scrivi nel thread').fill(`Rispondi brevemente includendo il codice ${code}.`)
      await page.getByRole('button', { name: 'Chiedi a Codex' }).click()
      await page.locator('.thread-message').filter({ hasText: new RegExp(code) }).last().waitFor({ timeout: 180000 })
      await page.getByText('Sessione Codex collegata').waitFor()
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
    assert.equal(after.value.find((thread) => thread.title === 'Thread B').messages.length, 2)
    const main = await page.evaluate((id) => window.projectsApi.getBaseline(id), project.id)
    assert.equal(main.ok, true)
    assert.equal(main.value.rawText, '60 Carta A MEG 1')
    console.log('E2E APP-040 live OK: due sessioni Codex distinte, provenienza e ripresa dopo riavvio, lista invariata.')
  }
} finally {
  if (application) await application.close()
  if (realpathSync(dirname(temporary)) !== realpathSync(tmpdir()) || !basename(temporary).startsWith('pokeguru-threads-ai-'))
    throw new Error('Percorso temporaneo inatteso: pulizia interrotta.')
  if (existsSync(temporary)) rmSync(temporary, { recursive: true, force: true })
}
