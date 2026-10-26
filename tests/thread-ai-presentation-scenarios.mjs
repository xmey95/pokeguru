import assert from 'node:assert/strict'
import { join } from 'node:path'
import { auditDesignSystem } from './design-system-audit.mjs'

// Only the model catalogue response is controlled; navigation and draft state are real.
export async function threadAiPresentationScenarios(page, application, workspace) {
  await application.evaluate(({ ipcMain }) => {
    const models = [{ id: 'ui-model', name: 'Modello esempio UI', defaultReasoningEffort: 'high', isDefault: true,
      reasoningEfforts: [{ id: 'high', description: 'Esempio UI' }, { id: 'low', description: 'Esempio UI' }] }]
    globalThis.threadAiUi = { models, error: null }
    ipcMain.removeHandler('ai:get-connection')
    ipcMain.handle('ai:get-connection', () => globalThis.threadAiUi.error
      ? { ok: false, error: globalThis.threadAiUi.error }
      : { ok: true, value: { account: 'chatgpt', plan: 'Demo UI', models: globalThis.threadAiUi.models } })
  })
  const ready = () => page.waitForFunction(() => !document.querySelector('[data-nav-loading="true"]'))
  const detail = page.locator('.thread-ai-options')
  const model = page.locator('#thread-ai-model')
  const effort = page.locator('#thread-ai-effort')
  await page.setViewportSize({ width: 1280, height: 720 })
  await detail.locator('summary').focus(); await page.keyboard.press('Enter')
  await detail.getByRole('button', { name: 'Ricarica modelli' }).click()
  await page.waitForFunction(() => document.querySelector('#thread-ai-model option[value="ui-model"]'))
  await model.selectOption('ui-model'); await effort.selectOption('high')
  await detail.locator('summary').getByText('Personalizzata', { exact: false }).waitFor()
  await page.locator('.sidebar').getByRole('button', { name: 'Impostazioni AI', exact: true }).click(); await ready()
  await application.evaluate(() => { globalThis.threadAiUi.models = [] })
  await page.getByRole('button', { name: 'Indietro', exact: true }).click(); await ready()
  assert.equal(await model.inputValue(), 'ui-model')
  assert.equal(await effort.inputValue(), 'high')
  assert.match(await model.locator('option:checked').textContent(), /disponibilità da verificare/)
  await detail.getByRole('status').getByText('Disponibilità della scelta personalizzata da verificare.').waitFor()
  await application.evaluate(() => { globalThis.threadAiUi.error = 'Fixture: elenco modelli non raggiungibile.' })
  await detail.getByRole('button', { name: 'Ricarica modelli' }).click()
  await detail.getByRole('alert').waitFor()
  for (const [width, height] of [[1280, 720], [640, 720]]) {
    await page.setViewportSize({ width, height })
    await detail.evaluate(el => {
      const main = el.closest('.main-content')
      main.scrollTop += el.getBoundingClientRect().top - main.getBoundingClientRect().top - 12
    })
    assert.equal(await page.locator('.main-content').evaluate(el => el.scrollWidth > el.clientWidth + 1), false)
    await auditDesignSystem(page, 'Thread AI non disponibile ' + width)
    await page.screenshot({ path: join(workspace, 'node_modules', 'final-thread-ai-' + width + '.png') })
  }
  await application.evaluate(() => {
    globalThis.threadAiUi.error = null
    globalThis.threadAiUi.models = [{ id: 'ui-model', name: 'Modello esempio UI', defaultReasoningEffort: 'low', isDefault: true,
      reasoningEfforts: [{ id: 'low', description: '' }] }]
  })
  await detail.getByRole('button', { name: 'Ricarica modelli' }).click()
  await page.waitForFunction(() => !document.querySelector('#thread-ai-effort').disabled)
  assert.equal(await effort.inputValue(), 'high')
  assert.match(await effort.locator('option:checked').textContent(), /disponibilità da verificare/)
  await effort.selectOption('low')
  assert.equal(await detail.locator('.warning-banner').count(), 0)
  await model.selectOption('')
  assert.equal(await effort.inputValue(), '')
  assert.equal(await detail.locator('summary').getByText('Personalizzata', { exact: false }).count(), 0)
  console.log('Thread AI presentation OK: scelta conservata, modello/livello assenti, errore/riprova, globale, tastiera e Indietro; fixture dichiarata.')
}
