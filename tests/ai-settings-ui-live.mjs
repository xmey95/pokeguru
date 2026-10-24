import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { _electron as electron } from 'playwright-core'
import { auditDesignSystem } from './design-system-audit.mjs'
import { installAiFixture } from './ai-settings-fixture.mjs'

const require = createRequire(import.meta.url)
const workspace = resolve(import.meta.dirname, '..')
const temporary = mkdtempSync(join(tmpdir(), 'pokeguru-ai-ui-'))
const preferencesPath = join(temporary, 'ai-preferences.json')
let application
try {
  application = await electron.launch({ executablePath: require('electron'), args: ['.'], cwd: workspace,
    env: { ...process.env, POKEGURU_DATA_DIR: temporary, POKEGURU_CODEX_BIN: join(temporary, 'missing-codex') }, timeout: 30000 })
  const page = await application.firstWindow()
  await installAiFixture(application)
  const ready = async () => {
    await page.waitForFunction(() => !document.querySelector('[data-nav-loading="true"]'))
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(resolve)))))
  }
  const refresh = async () => { await page.getByRole('button', { name: 'Aggiorna stato' }).click(); await ready() }
  const leave = async () => { await page.locator('.sidebar').getByRole('button', { name: 'Catalogo', exact: true }).click(); await ready() }
  const back = async () => { await page.getByRole('button', { name: 'Indietro', exact: true }).click(); await ready() }
  const model = page.getByLabel('Modello', { exact: true })
  const effort = page.getByLabel('Livello di ragionamento')
  const save = page.getByRole('button', { name: 'Salva preferenze', exact: true })
  const test = page.getByRole('button', { name: 'Esegui prova AI', exact: true })
  await page.getByRole('button', { name: 'Impostazioni AI', exact: true }).click(); await ready()
  assert.ok(await save.isDisabled())
  assert.ok(await test.isEnabled())
  assert.equal(await page.getByRole('button', { name: 'Disconnetti Codex' }).isVisible(), false)
  let minimumContrast = Infinity
  for (const [width, height] of [[1440, 900], [1280, 720], [640, 720]]) {
    await page.setViewportSize({ width, height })
    await page.locator('.main-content').evaluate(el => { el.scrollTop = 0 })
    assert.equal(await page.locator('.main-content').evaluate(el => el.scrollWidth > el.clientWidth + 1), false)
    minimumContrast = Math.min(minimumContrast, (await auditDesignSystem(page, 'AI ' + width)).minimumContrast)
    if (width > 640) {
      const bounds = await test.boundingBox()
      assert.ok(bounds.y + bounds.height <= height, 'Prova fuori dalla prima schermata desktop')
    }
    await page.screenshot({ path: join(workspace, 'node_modules', 'ai-settings-' + width + '.png') })
  }
  await page.setViewportSize({ width: 1280, height: 720 })
  // Native keyboard controls, disclosure and draft survive navigation.
  await model.focus(); await page.keyboard.press('ArrowDown'); await page.keyboard.press('Tab')
  assert.equal(await model.inputValue(), 'demo-a')
  assert.ok(await effort.evaluate(el => el === document.activeElement))
  await effort.selectOption('high')
  assert.ok(await test.isDisabled())
  await page.getByText('Salva le modifiche prima della prova.').waitFor()
  await page.locator('.main-content').evaluate(el => { el.scrollTop = 0 })
  await page.screenshot({ path: join(workspace, 'node_modules/ai-settings-dirty-1280.png') })
  const account = page.locator('.ai-account-details')
  await account.locator('summary').focus(); await page.keyboard.press('Enter')
  assert.ok(await account.evaluate(el => el.open))
  await leave(); await back()
  assert.equal(await model.inputValue(), 'demo-a'); assert.equal(await effort.inputValue(), 'high')
  assert.ok(await account.evaluate(el => el.open))
  await page.getByRole('button', { name: 'Annulla modifiche' }).click()
  assert.equal(await model.inputValue(), '')
  assert.deepEqual(await application.evaluate(() => globalThis.aiUi.calls), [])
  // Save failure stays visible after the automatic connection refresh.
  await model.selectOption('demo-a'); await effort.selectOption('high')
  await application.evaluate(() => { globalThis.aiUi.saveError = 'Fixture: salvataggio non riuscito.' })
  await save.click(); await ready()
  await page.getByRole('alert').getByText('Fixture: salvataggio non riuscito.').waitFor()
  assert.equal(await effort.inputValue(), 'high')
  assert.equal(existsSync(preferencesPath), false)
  // Pending save can finish while away. Reopening reads the temporary file.
  await application.evaluate(() => { globalThis.aiUi.saveError = null; globalThis.aiUi.hold = 'save' })
  await save.click()
  await page.getByRole('button', { name: 'Salvataggio…' }).waitFor()
  assert.ok(await model.isDisabled())
  await leave()
  await application.evaluate(() => { globalThis.aiUi.hold = null; globalThis.aiUi.release() })
  await back()
  assert.equal(await effort.inputValue(), 'high')
  assert.deepEqual(JSON.parse(readFileSync(preferencesPath, 'utf8')), { model: 'demo-a', reasoningEffort: 'high' })
  assert.ok(await save.isDisabled())
  // Test must use saved configuration; authentication alone is not success.
  await application.evaluate(() => { globalThis.aiUi.hold = 'test' })
  await test.click(); await page.getByRole('button', { name: 'Prova in corso…' }).waitFor()
  assert.equal(await page.getByText('Prova AI riuscita', { exact: false }).count(), 0)
  await leave()
  await page.getByRole('button', { name: 'Indietro', exact: true }).click()
  assert.ok(await model.isDisabled())
  await application.evaluate(() => { globalThis.aiUi.hold = null; globalThis.aiUi.release() })
  await ready()
  await page.getByText('Prova AI riuscita · Modello demo A · high.').waitFor()
  const calls = await application.evaluate(() => globalThis.aiUi.calls)
  assert.deepEqual(calls.find(call => call[0] === 'test')[1], { model: 'demo-a', reasoningEffort: 'high' })
  await application.evaluate(() => { globalThis.aiUi.testError = 'Fixture: limite AI raggiunto.' })
  await test.click(); await ready()
  await page.getByRole('alert').getByText('Fixture: limite AI raggiunto.').waitFor()
  await refresh()
  await page.getByRole('alert').getByText('Fixture: limite AI raggiunto.').waitFor()
  // Model change resets effort and success/error feedback.
  await model.selectOption('demo-b'); assert.equal(await effort.inputValue(), '')
  assert.equal(await page.getByRole('alert').count(), 0)
  await page.getByRole('button', { name: 'Annulla modifiche' }).click()
  // Missing model/effort must remain recognizable, never silently show Automatico.
  await application.evaluate(() => { globalThis.aiUi.connection.models[0].reasoningEfforts = [{ id: 'low', description: '' }] })
  await refresh()
  assert.equal(await effort.inputValue(), 'high'); assert.ok(await test.isDisabled())
  await page.getByText('La scelta attuale non è tra quelle disponibili.', { exact: false }).waitFor()
  await effort.selectOption('low')
  await application.evaluate(() => { globalThis.aiUi.connection.models = [] })
  await refresh()
  assert.equal(await model.inputValue(), 'demo-a')
  assert.ok(await save.isDisabled())
  // Automatico uses the actual backend save even with no models.
  await model.selectOption(''); await save.click(); await ready()
  assert.deepEqual(JSON.parse(readFileSync(preferencesPath, 'utf8')), { model: null, reasoningEffort: null })
  // Corrupt file is not presented as saved defaults; recovery uses the real store.
  writeFileSync(preferencesPath, '{invalid')
  await leave(); await back()
  await page.getByRole('alert').getByText('Impossibile leggere le preferenze AI locali.').waitFor()
  assert.ok(await model.isDisabled()); assert.ok(await test.isDisabled())
  writeFileSync(preferencesPath, JSON.stringify({ model: null, reasoningEffort: null }))
  await page.getByRole('button', { name: 'Ricarica preferenze' }).click(); await ready()
  assert.ok(await model.isEnabled())
  // Unsupported access, disconnected/login and unavailable CLI.
  await application.evaluate(() => { globalThis.aiUi.connection.account = 'other' })
  await refresh(); await page.getByText('Accesso non supportato', { exact: true }).waitFor()
  assert.ok(await test.isDisabled())
  await application.evaluate(() => { globalThis.aiUi.connection.account = null })
  await refresh()
  await application.evaluate(() => { globalThis.aiUi.loginError = 'Fixture: browser non disponibile.' })
  await page.getByRole('button', { name: 'Accedi con ChatGPT' }).click(); await ready()
  await page.locator('.ai-connection-panel').getByRole('alert').getByText('Fixture: browser non disponibile.').waitFor()
  await application.evaluate(() => { globalThis.aiUi.loginError = null })
  await page.getByRole('button', { name: 'Accedi con ChatGPT' }).click(); await ready()
  await page.getByText('Completa l’accesso nel browser.', { exact: false }).waitFor()
  assert.ok(await page.getByRole('button', { name: 'Accedi con ChatGPT' }).isDisabled())
  await application.evaluate(() => { globalThis.aiUi.connection.account = 'apiKey' })
  await page.getByText('Connesso con chiave API', { exact: true }).waitFor()
  assert.equal(await page.getByText('Completa l’accesso nel browser.', { exact: false }).count(), 0)
  if (!await account.evaluate(el => el.open)) await account.locator('summary').click()
  const beforeLogout = (await application.evaluate(() => globalThis.aiUi.calls)).length
  page.once('dialog', dialog => dialog.dismiss())
  await page.getByRole('button', { name: 'Disconnetti Codex' }).click()
  assert.equal((await application.evaluate(() => globalThis.aiUi.calls)).length, beforeLogout)
  page.once('dialog', async dialog => { assert.match(dialog.message(), /condiviso/); await dialog.accept() })
  await page.getByRole('button', { name: 'Disconnetti Codex' }).click(); await ready()
  await page.getByText('Accesso richiesto', { exact: true }).waitFor()
  await application.evaluate(() => { globalThis.aiUi.connectionError = 'Fixture: Codex non raggiungibile.' })
  await refresh(); await page.getByRole('alert').getByText('Fixture: Codex non raggiungibile.').waitFor()
  assert.equal(await page.getByRole('button', { name: 'Accedi con ChatGPT' }).count(), 0)
  console.log('AI UI OK: layout, tastiera, bozza/storico, salvataggio/prova pendenti, errori, opzioni mancanti, account simulati. Contrasto minimo: ' + minimumContrast.toFixed(2))
} finally {
  if (application) await application.close()
  if (realpathSync(dirname(temporary)) !== realpathSync(tmpdir()) || !basename(temporary).startsWith('pokeguru-ai-ui-')) throw new Error('Percorso temporaneo inatteso.')
  if (existsSync(temporary)) rmSync(temporary, { recursive: true, force: true })
}
