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
  await page.getByRole('heading', { name: 'AI per Pokéguru' }).waitFor()
  await page.getByRole('alert').getByText('Codex CLI non trovato.', { exact: false }).waitFor()
  for (const [width, height] of [[1440, 900], [1280, 720]]) {
    await page.setViewportSize({ width, height })
    assert.equal(await page.locator('.main-content').evaluate((element) => element.scrollWidth > element.clientWidth + 1), false)
    await page.screenshot({ path: join(workspace, 'node_modules', `content-ai-${width}.png`) })
  }
  assert.match(await page.getByText('Codex non disponibile').textContent(), /Codex non disponibile/)
  assert.equal(await page.getByLabel('Modello', { exact: true }).inputValue(), '')
  assert.equal(await page.getByRole('button', { name: 'Esegui prova AI' }).isDisabled(), true)
  assert.deepEqual(await page.evaluate(() => window.projectsApi.getAiPreferences()),
    { ok: true, value: { model: null, reasoningEffort: null } })
  console.log('E2E Impostazioni AI offline OK: CLI assente, stato e preferenze locali.')
} finally {
  if (application) await application.close()
  if (realpathSync(dirname(temporary)) !== realpathSync(tmpdir()) || !basename(temporary).startsWith('pokeguru-ai-offline-')) {
    throw new Error('Percorso temporaneo inatteso: pulizia interrotta.')
  }
  if (existsSync(temporary)) rmSync(temporary, { recursive: true, force: true })
}
