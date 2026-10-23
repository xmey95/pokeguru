import assert from 'node:assert/strict'
import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { _electron as electron } from 'playwright-core'

const require = createRequire(import.meta.url)
const directory = mkdtempSync(join(tmpdir(), 'pokeguru-reconcile-ai-'))
let application
try {
  application = await electron.launch({ executablePath: require('electron'), args: ['.'],
    cwd: resolve(import.meta.dirname, '..'), env: { ...process.env, POKEGURU_DATA_DIR: directory } })
  const page = await application.firstWindow()
  await page.getByLabel('Nome progetto').fill('Prova AI riconciliata')
  await page.getByRole('button', { name: 'Crea progetto' }).click()
  await page.getByRole('button', { name: 'Catalogo', exact: true }).click()
  await page.getByRole('button', { name: 'Sincronizza campione' }).click()
  await page.getByText('28/28', { exact: true }).first().waitFor({ timeout: 90000 })
  await page.getByRole('button', { name: 'Lista', exact: true }).click()
  await page.getByLabel('Testo lista').fill('2 Iono PAL 185\n1 Iono PAL 254\n1 Rare Candy PAF 089')
  await page.getByRole('button', { name: 'Salva lista' }).click()
  for (const lineNumber of [1, 2]) {
    const row = page.getByTestId(`reconcile-line-${lineNumber}`)
    await row.getByRole('button', { name: 'Scegli carta e stampa' }).click()
    await row.locator('.reconciliation-candidate').first().getByRole('button', { name: 'Usa questa stampa' }).click()
    await row.locator('.mapped-print').waitFor()
  }
  await page.getByRole('button', { name: 'Matchup' }).click()
  await page.locator('.meta-deck').first().waitFor({ timeout: 30000 })
  const connection = await page.evaluate(() => window.projectsApi.getAiConnection())
  assert.equal(connection.ok, true, connection.ok ? '' : connection.error)
  const fastModel = connection.value.models.find((model) => model.id.includes('luna'))
  if (fastModel) {
    await page.getByLabel('Modello', { exact: true }).selectOption(fastModel.id)
    if (fastModel.reasoningEfforts.some((effort) => effort.id === 'low')) {
      await page.getByLabel('Ragionamento', { exact: true }).selectOption('low')
    }
  }
  console.log(`Codex test model: ${fastModel?.id ?? 'automatico'}`)
  await page.locator('.ai-data-preview summary').click()
  assert.match(await page.locator('.ai-data-preview pre').textContent(), /3 Iono \(sv02-185, sv02-254\)/)
  await page.getByRole('button', { name: 'Genera analisi con Codex' }).click()
  await Promise.race([
    page.locator('.matchup-fields').getByText('Limiti dell’analisi').waitFor({ timeout: 200000 }),
    page.getByRole('alert').waitFor({ timeout: 200000 }).then(async () => {
      throw new Error(`Analisi non generata: ${await page.getByRole('alert').textContent()}`)
    })
  ])
  await page.getByRole('button', { name: 'Lista', exact: true }).click()
  await page.getByTestId('reconcile-line-2').getByRole('button', { name: 'Lascia irrisolta' }).click()
  await page.getByTestId('reconcile-line-2').getByRole('button', { name: 'Scegli carta e stampa' }).waitFor()
  await page.getByRole('button', { name: 'Matchup' }).click()
  await page.getByText('Questa discussione riguarda una lista o uno snapshot precedente.').waitFor({ timeout: 30000 })
  console.log('LIVE AI APP-006 OK: contesto riconciliato inviato a Codex; la guida diventa storica dopo cambio mapping.')
} finally {
  if (application) await application.close()
  if (realpathSync(dirname(directory)) !== realpathSync(tmpdir()) || !basename(directory).startsWith('pokeguru-reconcile-ai-')) {
    throw new Error('Percorso temporaneo inatteso: pulizia interrotta.')
  }
  rmSync(directory, { recursive: true, force: true })
}
