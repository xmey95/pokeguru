import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { basename, join, resolve, sep } from 'node:path'
import { createRequire } from 'node:module'
import { _electron as electron } from 'playwright-core'

const require = createRequire(import.meta.url)
const workspace = resolve(import.meta.dirname, '..')
const directory = mkdtempSync(join(workspace, '.pokeguru-ai-live-'))
let application

async function launch(extraEnvironment = {}) {
  return electron.launch({ executablePath: require('electron'), args: ['.'], cwd: workspace,
    env: { ...process.env, POKEGURU_DATA_DIR: directory, ...extraEnvironment }, timeout: 30000 })
}

try {
  application = await launch()
  let page = await application.firstWindow()
  await page.getByRole('button', { name: 'Impostazioni AI' }).click()
  await page.getByRole('heading', { name: 'AI per Pokéguru' }).waitFor()
  const connection = await page.evaluate(() => window.projectsApi.getAiConnection())
  assert.equal(connection.ok, true, connection.ok ? '' : connection.error)
  assert.ok(connection.value.account === 'chatgpt' || connection.value.account === 'apiKey', 'Accesso Codex necessario per la prova live')
  assert.ok(connection.value.models.length > 0, 'Catalogo modelli vuoto')
  const preference = await page.evaluate(() => window.projectsApi.getAiPreferences())
  assert.equal(preference.ok, true)
  if (process.env.POKEGURU_SKIP_AI_TEST !== '1') {
    await page.getByRole('button', { name: 'Esegui prova AI' }).click()
    await page.getByText('Prova riuscita: Codex ha completato').waitFor({ timeout: 180000 })
  }
  const chosen = connection.value.models.find((model) => model.isDefault) ?? connection.value.models[0]
  await page.getByLabel('Modello', { exact: true }).selectOption(chosen.id)
  await page.getByRole('button', { name: 'Salva preferenze' }).click()
  await page.getByText('Preferenze salvate.').waitFor()
  await page.screenshot({ path: join(workspace, 'out', 'ai-settings.png'), fullPage: true })
  await application.close()
  application = await launch()
  page = await application.firstWindow()
  await page.getByRole('button', { name: 'Impostazioni AI' }).click()
  assert.equal(await page.getByLabel('Modello', { exact: true }).inputValue(), chosen.id)
  await application.close()
  application = await launch({ POKEGURU_CODEX_BIN: join(workspace, 'codex-non-presente.exe') })
  page = await application.firstWindow()
  await page.getByRole('button', { name: 'Impostazioni AI' }).click()
  await page.getByRole('alert').getByText('Codex CLI non trovato.', { exact: false }).waitFor()
  await application.close()
  const isolatedCodexHome = join(directory, 'codex-home')
  mkdirSync(isolatedCodexHome)
  application = await launch({ CODEX_HOME: isolatedCodexHome })
  page = await application.firstWindow()
  const isolatedConnection = await page.evaluate(() => window.projectsApi.getAiConnection())
  assert.equal(isolatedConnection.ok, true, isolatedConnection.ok ? '' : isolatedConnection.error)
  assert.equal(isolatedConnection.value.account, null)
  console.log(`AI live OK: accesso ${connection.value.account}, ${connection.value.models.length} modelli, preferenze persistenti, CLI assente e profilo non autenticato${process.env.POKEGURU_SKIP_AI_TEST === '1' ? '' : ', prova AI reale'}.`)
} finally {
  if (application) await application.close()
  if (!realpathSync(directory).startsWith(`${realpathSync(workspace)}${sep}`) || !basename(directory).startsWith('.pokeguru-ai-live-')) {
    throw new Error('Percorso temporaneo inatteso: pulizia interrotta.')
  }
  rmSync(directory, { recursive: true, force: true })
}
