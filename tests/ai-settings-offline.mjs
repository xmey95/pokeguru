import { auditDesignSystem } from './design-system-audit.mjs'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { _electron as electron } from 'playwright-core'

const require = createRequire(import.meta.url)
const workspace = resolve(import.meta.dirname, '..')
const temporary = mkdtempSync(join(tmpdir(), 'pokeguru-ai-offline-'))
let application

try {
  application = await electron.launch({ executablePath: require('electron'), args: ['.'], cwd: workspace,
    env: { ...process.env, POKEGURU_DATA_DIR: temporary,
      POKEGURU_CODEX_BIN: join(temporary, 'codex-not-installed') }, timeout: 30000 })
  const page = await application.firstWindow()
  await page.getByRole('button', { name: 'Impostazioni AI' }).click()
  await page.getByRole('heading', { name: 'Impostazioni AI' }).waitFor()
  await page.getByRole('alert').getByText('Codex non disponibile.', { exact: false }).waitFor()
  for (const [width, height] of [[1440, 900], [1280, 720]]) {
    await page.setViewportSize({ width, height })
    assert.equal(await page.locator('.main-content').evaluate((element) => element.scrollWidth > element.clientWidth + 1), false)
    await auditDesignSystem(page, 'Design system '+width)
    await page.screenshot({ path: join(workspace, 'node_modules', `content-ai-${width}.png`) })
  }
  assert.match(await page.getByRole('heading', { name: 'Codex non disponibile' }).textContent(), /Codex non disponibile/)
  await page.getByText('La CLI ufficiale non si avvia.', { exact: false }).waitFor()
  assert.equal(await page.getByLabel('Modello', { exact: true }).inputValue(), '')
  assert.equal(await page.getByRole('button', { name: 'Esegui prova AI' }).isDisabled(), true)
  assert.deepEqual(await page.evaluate(() => window.projectsApi.getAiPreferences()),
    { ok: true, value: { model: null, reasoningEffort: null } })
  await application.evaluate(({ ipcMain }) => {
    for (const name of ['ai:setup-status', 'ai:get-connection']) ipcMain.removeHandler(name)
    ipcMain.handle('ai:setup-status', () => ({ ok: true, value: {
      cliAvailable: true, version: 'codex-cli 0.164.0', bundled: true } }))
    ipcMain.handle('ai:get-connection', () => ({ ok: true, value: { account: null, plan: null, models: [] } }))
  })
  await page.getByRole('button', { name: 'Aggiorna stato' }).click()
  await page.getByText('Codex incluso in Pokéguru: codex-cli 0.164.0').waitFor()
  await page.getByRole('button', { name: 'Accedi con ChatGPT' }).waitFor()
  console.log('E2E Impostazioni AI offline OK: CLI assente, stato e preferenze locali.')
} finally {
  if (application) await application.close()
  if (realpathSync(dirname(temporary)) !== realpathSync(tmpdir()) || !basename(temporary).startsWith('pokeguru-ai-offline-')) {
    throw new Error('Percorso temporaneo inatteso: pulizia interrotta.')
  }
  if (existsSync(temporary)) rmSync(temporary, { recursive: true, force: true })
}
