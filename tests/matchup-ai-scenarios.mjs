import assert from 'node:assert/strict'
import { auditLoading } from './loading-ui-audit.mjs'
import { join } from 'node:path'
import { auditDesignSystem } from './design-system-audit.mjs'

// Controlled model/evidence/AI responses; project, guide and history reads use real IPC/SQLite.
export async function matchupAiScenarios(page, application, workspace) {
  const ready = async () => {
    await page.waitForFunction(() => !document.querySelector('[data-nav-loading="true"]'))
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(resolve)))))
  }
  const remount = async () => {
    await page.locator('.sidebar').getByRole('button', { name: 'Catalogo', exact: true }).click()
    await ready()
    await page.getByRole('button', { name: 'Indietro', exact: true }).click()
    await ready()
  }
  const select = async (name) => {
    await page.locator('#matchup-switcher-trigger').click()
    await page.getByLabel('Cerca avversario').fill(name)
    await page.getByRole('dialog', { name: 'Scegli avversario' }).getByRole('button', { name: new RegExp(name) }).click()
    await ready()
  }
  const config = page.locator('#matchup-config-trigger')
  const data = page.locator('#matchup-data-trigger')
  const preview = page.locator('#matchup-data-panel')
  const input = page.getByLabel('Aggiungi un’osservazione')
  await application.evaluate(({ ipcMain }) => {
    globalThis.aiUiOriginal = new Map()
    globalThis.aiUiRequests = []
    globalThis.aiUiConnectionFails = false
    globalThis.aiUiEvidenceFails = false
    const handlers = {
      'ai:get-connection': () => globalThis.aiUiConnectionFails
        ? { ok: false, error: 'Fixture: modelli non leggibili.' }
        : { ok: true, value: { account: null, plan: null, models: [
          { id: 'ui-model-a', name: 'Modello A · fixture', defaultReasoningEffort: 'medium', isDefault: true,
            reasoningEfforts: [{ id: 'medium', description: '' }, { id: 'high', description: '' }] },
          { id: 'ui-model-b', name: 'Modello B · fixture', defaultReasoningEffort: 'low', isDefault: false,
            reasoningEfforts: [{ id: 'low', description: '' }] }
        ] } },
      'matchups:evidence-preview': () => globalThis.aiUiEvidenceFails
        ? { ok: false, error: 'Fixture: archivio torneo non leggibile.' }
        : { ok: true, value: { schemaVersion: 2, status: 'matched', detail: 'Archivio corrente di prova.',
          matchedCompleteLists: 7, observedCards: [], sampleLists: [],
          events: [{ source: 'main', eventId: '123', name: 'Evento corrente · fixture', date: new Date().toISOString(),
            url: 'https://limitlesstcg.com/tournaments/123', completeLists: 20, matchedLists: 7 }] } }
    }
    for (const route of ['matchups:generate', 'matchups:revise', 'matchups:continue']) handlers[route] = async (_event, ...args) => {
      globalThis.aiUiRequests.push({ route, args })
      if (globalThis.generationHold && route === 'matchups:generate') await new Promise(resolve => { globalThis.generationRelease = resolve })
      return { ok: false, error: 'Fixture: invio AI non eseguito.' }
    }
    for (const [route, handler] of Object.entries(handlers)) {
      globalThis.aiUiOriginal.set(route, ipcMain._invokeHandlers.get(route))
      ipcMain.removeHandler(route)
      ipcMain.handle(route, handler)
    }
  })
  await page.setViewportSize({ width: 1280, height: 720 })
  await remount()
  assert.equal(await page.locator('#matchup-model').count(), 0)
  assert.match(await page.locator('.matchup-ai-summary').innerText(), /Preferenze globali/)
  await config.focus()
  await page.keyboard.press('Enter')
  await page.locator('#matchup-model').selectOption('ui-model-a')
  await page.locator('#matchup-effort').selectOption('high')
  await config.focus()
  await page.keyboard.press('Escape')
  assert.ok(await config.evaluate((el) => el === document.activeElement))
  assert.equal(await config.getAttribute('aria-expanded'), 'false')
  assert.match(await page.locator('.matchup-ai-summary').innerText(), /Modello A.*high.*Personalizzata/s)
  await data.click()
  assert.match(await preview.innerText(), /Per aggiornare la guida/)
  assert.match(await preview.innerText(), /1 lista completa · evidenze salvate/)
  assert.doesNotMatch(await preview.innerText(), /7 liste/)
  await preview.locator('summary').first().click()
  assert.match(await preview.innerText(), /2 Gardevoir ex SV1 245/)
  assert.ok(await preview.getByRole('link', { name: 'Regional di prova', exact: true }).isVisible())
  await input.fill('Osservazione UI: conservare la ricerca.')
  await remount()
  assert.equal(await input.inputValue(), 'Osservazione UI: conservare la ricerca.')
  assert.equal(await data.getAttribute('aria-expanded'), 'true')
  assert.match(await page.locator('.matchup-ai-summary').innerText(), /Modello A.*high/s)
  await page.getByRole('button', { name: 'Aggiorna guida', exact: true }).click()
  await page.locator('.feedback-form').getByRole('alert').waitFor()
  let request = await application.evaluate(() => globalThis.aiUiRequests.at(-1))
  assert.equal(request.route, 'matchups:revise')
  assert.equal(request.args[1], 'Osservazione UI: conservare la ricerca.')
  assert.deepEqual(request.args[2], { model: 'ui-model-a', reasoningEffort: 'high' })
  await config.click()
  await page.locator('#matchup-model').selectOption('ui-model-b')
  assert.equal(await page.locator('#matchup-effort').inputValue(), '')
  await page.locator('#matchup-model').selectOption('')
  await page.getByRole('button', { name: 'Aggiorna guida', exact: true }).click()
  await page.locator('.feedback-form').getByRole('alert').waitFor()
  assert.equal((await application.evaluate(() => globalThis.aiUiRequests.at(-1))).args[2], null)
  await input.fill('')
  await config.click()
  const regeneration = page.locator('.matchup-regenerate-data')
  await regeneration.locator(':scope > summary').click()
  assert.match(await regeneration.innerText(), /Per generare una nuova guida/)
  assert.match(await regeneration.innerText(), /7 liste complete · archivio attuale/)
  assert.doesNotMatch(await regeneration.innerText(), /Discussione|evidenze salvate/)
  const savedStrategy = await page.locator('.strategy-field p').first().innerText()
  await application.evaluate(() => { globalThis.generationHold = true })
  await page.getByRole('button', { name: 'Rigenera guida', exact: true }).click()
  await page.getByRole('status').filter({ hasText: 'Codex sta analizzando…' }).waitFor()
  assert.equal(await page.locator('.strategy-field p').first().innerText(), savedStrategy)
  await auditLoading(page, workspace, 'analisi')
  await remount()
  await page.getByRole('status').filter({ hasText: 'Codex sta analizzando…' }).waitFor()
  assert.equal(await page.getByRole('progressbar').count(), 0)
  await application.evaluate(() => { globalThis.generationHold = false; globalThis.generationRelease() })
  await page.getByRole('alert').filter({ hasText: 'invio AI non eseguito' }).waitFor()
  request = await application.evaluate(() => globalThis.aiUiRequests.at(-1))
  assert.equal(request.route, 'matchups:generate')
  assert.equal(request.args[3], null)
  await regeneration.locator(':scope > summary').click()

  await application.evaluate(() => { globalThis.aiUiConnectionFails = true; globalThis.aiUiEvidenceFails = true })
  await remount()
  await config.click()
  await page.getByRole('alert').filter({ hasText: 'modelli non leggibili' }).waitFor()
  await application.evaluate(() => { globalThis.aiUiConnectionFails = false })
  await page.getByRole('button', { name: 'Ricarica modelli' }).click()
  await page.waitForFunction(() => !document.querySelector('#matchup-model')?.disabled)
  await page.locator('#matchup-model').selectOption('ui-model-a')
  await data.click()
  assert.match(await preview.innerText(), /1 lista completa · evidenze salvate/)
  assert.equal(await preview.getByRole('alert').count(), 0, 'La revisione dispone di evidenze salvate')
  await regeneration.locator(':scope > summary').click()
  await regeneration.getByRole('alert').filter({ hasText: 'archivio torneo non leggibile' }).waitFor()
  await regeneration.locator(':scope > summary').click()
  await application.evaluate(() => { globalThis.aiUiEvidenceFails = false })
  await remount()
  // Native disclosure state is restored across navigation; leave details closed for the compact summary.
  if (await preview.locator('.matchup-data-details').evaluate((el) => el.open)) await preview.locator('summary').first().click()

  let minimumContrast = Infinity
  for (const [width, height] of [[1440, 900], [1280, 720], [640, 720]]) {
    await page.setViewportSize({ width, height })
    for (const state of ['data', 'config', 'compact']) {
      if (state === 'data' && await data.getAttribute('aria-expanded') !== 'true') await data.click()
      if (state === 'config' || state === 'compact') await config.click()
      await page.locator('.matchup-ai-controls').evaluate((el) => {
        const main = document.querySelector('.main-content')
        main.scrollTop += el.getBoundingClientRect().top - main.getBoundingClientRect().top - 16
      })
      const geometry = await page.evaluate(() => {
        const main = document.querySelector('.main-content')
        const m = main.getBoundingClientRect(), d = document.querySelector('.deck-companion').getBoundingClientRect()
        return { overflow: main.scrollWidth > main.clientWidth + 1 || document.documentElement.scrollWidth > innerWidth,
          separate: innerWidth > 1240 ? m.right <= d.left : m.bottom <= d.top,
          controlsInside: [...document.querySelectorAll('.matchup-ai-controls button, .matchup-ai-controls select')].every((el) => {
            const r = el.getBoundingClientRect(); return r.left >= m.left && r.right <= m.right
          }) }
      })
      assert.ok(!geometry.overflow && geometry.separate && geometry.controlsInside, JSON.stringify({ width, state, geometry }))
      minimumContrast = Math.min(minimumContrast, (await auditDesignSystem(page, `AI ${state} ${width}`)).minimumContrast)
      await page.screenshot({ path: join(workspace, 'node_modules', `matchup-ai-${state}-${width}.png`) })
    }
  }
  await page.setViewportSize({ width: 1280, height: 720 })
  await select('Charizard')
  await data.click()
  assert.match(await preview.innerText(), /Per generare una nuova guida/)
  assert.match(await preview.innerText(), /Preferenze globali|Lista pubblica cercata/)
  await data.click()
  await select('Dragapult')
  await data.click()
  assert.match(await preview.innerText(), /Per continuare sulla nuova base/)
  assert.match(await preview.innerText(), /7 liste complete · archivio attuale/)
  assert.doesNotMatch(await preview.innerText(), /evidenze salvate/)
  await page.getByRole('button', { name: 'Continua sulla nuova base' }).click()
  await page.getByRole('alert').filter({ hasText: 'invio AI non eseguito' }).waitFor()
  assert.equal((await application.evaluate(() => globalThis.aiUiRequests.at(-1))).route, 'matchups:continue')
  await data.click()
  await select('Gardevoir')
  await config.click()
  await page.locator('#matchup-model').selectOption('')
  await config.click()
  await application.evaluate(({ ipcMain }) => {
    for (const [route, handler] of globalThis.aiUiOriginal) {
      ipcMain.removeHandler(route); ipcMain.handle(route, handler)
    }
  })
  await remount()
  console.log('MATCHUP AI OK: config/override routing, reset, saved vs current evidence, generation/revision/continuation, retry model discovery, navigation/drafts, keyboard; 1440/1280/640; minimum contrast ' + minimumContrast.toFixed(2))
}
