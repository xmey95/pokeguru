import assert from 'node:assert/strict'
import { auditLoading } from './loading-ui-audit.mjs'
import { join } from 'node:path'
import { auditDesignSystem } from './design-system-audit.mjs'

// Snapshot reads use real temporary SQLite. Sync responses are controlled and never call the network.
export async function eventWorkspaceScenarios(page, application, workspace) {
  const ready = async () => {
    await page.waitForFunction(() => !document.querySelector('[data-nav-loading="true"]'))
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(resolve)))))
  }
  await application.evaluate(({ ipcMain, shell }) => {
    globalThis.eventUiOriginals = new Map()
    globalThis.eventUiRequests = []
    globalThis.eventUiSources = []
    globalThis.eventUiSourceError = false
    globalThis.eventUiShell = shell.openExternal
    shell.openExternal = async url => {
      if (globalThis.eventUiSourceError) throw new Error('Fixture: browser indisponibile.')
      globalThis.eventUiSources.push(url)
    }
    const idle = { mode: null, status: 'idle', page: 1, pending: [], inspected: 0, saved: 0, skipped: 0,
      pendingEvents: [], pendingLists: [], inspectedEvents: 0, fetchedLists: 0, cooldownUntil: null, lastError: null }
    globalThis.eventUiProgress = { play: { ...idle }, main: { ...idle } }
    globalThis.eventUiNext = null
    globalThis.eventUiError = false
    for (const [source, status, sync] of [['play', 'tournament:sync-status', 'tournament:sync'], ['main', 'tournament:main-sync-status', 'tournament:main-sync']]) {
      for (const route of [status, sync]) globalThis.eventUiOriginals.set(route, ipcMain._invokeHandlers.get(route))
      ipcMain.removeHandler(status); ipcMain.handle(status, () => ({ ok: true, value: globalThis.eventUiProgress[source] }))
      ipcMain.removeHandler(sync); ipcMain.handle(sync, async (_event, mode) => {
        globalThis.eventUiRequests.push([source, mode])
        if (globalThis.eventUiError) return { ok: false, error: 'Fixture: aggiornamento non riuscito.' }
        globalThis.eventUiProgress[source] = { ...globalThis.eventUiProgress[source], mode, ...globalThis.eventUiNext }
        if (globalThis.eventUiHold) await new Promise(resolve => { globalThis.eventUiRelease = resolve })
        return { ok: true, value: globalThis.eventUiProgress[source] }
      })
    }
  })
  const search = page.getByLabel('Filtra giocatore o mazzo')
  const trigger = page.getByRole('button', { name: 'Gestisci eventi', exact: true })
  const coverage = page.locator('.event-coverage')
  let minimumContrast = Infinity
  for (const source of ['play', 'main']) {
    await page.getByRole('button', { name: source === 'play' ? 'Play online' : 'Regional', exact: true }).click()
    await ready()
    await search.fill('')
    assert.equal(await trigger.getAttribute('aria-expanded'), 'false')
    assert.equal(await page.getByRole('button', { name: 'Scansione completa', exact: true }).count(), 0)
    assert.equal(await coverage.evaluate(el => el.open), false)
    assert.ok(await coverage.getByText('Copertura parziale').isVisible())
    const groups = page.locator('.event-deck-group h3')
    assert.deepEqual(await groups.allTextContents(), ['Pokémon16', 'Allenatori33', 'Energie11'])
    for (const [width, height] of [[1440, 900], [1280, 720], [640, 720]]) {
      await page.setViewportSize({ width, height })
      await page.locator('.main-content').evaluate(el => { el.scrollTop = 0 })
      assert.equal(await page.locator('.main-content').evaluate(el => el.scrollWidth > el.clientWidth + 1), false)
      const first = await page.locator('.tournament-players button').first().boundingBox()
      assert.ok(first && first.y + first.height <= height, 'Primo giocatore fuori dalla prima schermata')
      if (width > 640) {
        const card = await page.locator('.event-deck li').first().boundingBox()
        assert.ok(card && card.y + card.height <= height, 'Prime carte fuori dalla prima schermata desktop')
      }
      minimumContrast = Math.min(minimumContrast, (await auditDesignSystem(page, `Eventi ${source} ${width}`)).minimumContrast)
      await page.screenshot({ path: join(workspace, 'node_modules', `events-${source}-${width}.png`) })
    }
    await page.setViewportSize({ width: 1280, height: 720 })
    await coverage.locator('summary').focus(); await page.keyboard.press('Enter')
    await page.getByRole('button', { name: source === 'play' ? 'Apri fonte ↗' : 'Apri evento ↗', exact: true }).click()
    const urls = await application.evaluate(() => globalThis.eventUiSources)
    assert.ok(urls.at(-1).startsWith(source === 'play' ? 'https://play.limitlesstcg.com/tournament/' : 'https://limitlesstcg.com/tournaments/'))
    if (source === 'main') {
      await page.getByRole('button', { name: 'Apri lista originale ↗', exact: true }).click()
      assert.equal((await application.evaluate(() => globalThis.eventUiSources)).at(-1), 'https://limitlesstcg.com/decks/list/12345')
      await application.evaluate(() => { globalThis.eventUiSourceError = true })
      await page.getByRole('button', { name: 'Apri evento ↗', exact: true }).click()
      await page.getByRole('alert').waitFor()
      await application.evaluate(() => { globalThis.eventUiSourceError = false })
    }
    await trigger.focus(); await page.keyboard.press('Enter')
    await page.locator('.sidebar').getByRole('button', { name: 'Impostazioni AI', exact: true }).click()
    await ready()
    await page.getByRole('button', { name: 'Indietro', exact: true }).click()
    await ready()
    assert.equal(await trigger.getAttribute('aria-expanded'), 'true')
    assert.equal(await coverage.evaluate(el => el.open), true)
    await page.getByRole('button', { name: 'Scansione completa', exact: true }).focus()
    await page.keyboard.press('Escape')
    assert.equal(await trigger.getAttribute('aria-expanded'), 'false')
    assert.ok(await trigger.evaluate(el => el === document.activeElement))
    await coverage.locator('summary').click()
    for (const [query, expected] of [['Marta', source === 'play' ? 'Lista assente' : 'Lista non pubblicata'],
      ['Luca', source === 'play' ? 'Lista non interpretabile' : 'Lista da acquisire'], ['Sara', '5 carte · Lista incompleta'], ['inesistente', 'Nessun giocatore o mazzo']]) {
      await search.fill(query)
      await page.locator(query === 'inesistente' ? '.search-empty' : '.tournament-detail').getByText(expected, { exact: false }).waitFor()
    }
    assert.equal(await page.locator('.tournament-detail').count(), 0)
    await page.getByRole('button', { name: 'Azzera filtri' }).focus()
    await page.keyboard.press('Enter')
    assert.equal(await search.inputValue(), '')
    assert.ok(await search.evaluate(el => el === document.activeElement))
    const update = page.getByRole('button', { name: source === 'play' ? 'Aggiorna nuovi tornei' : 'Aggiorna nuovi Regional', exact: true })
    const resume = page.getByRole('button', { name: source === 'play' ? 'Continua blocco' : 'Continua blocco Regional', exact: true })
    await application.evaluate(() => { globalThis.eventUiHold = true; globalThis.eventUiNext = { status: 'running', inspected: 3, saved: 2, inspectedEvents: 3, fetchedLists: 2 } })
    await update.click()
    await page.getByRole('status').filter({ hasText: 'Acquisizione del blocco in corso' }).waitFor()
    await page.locator('.activity-status').filter({ hasText: source === 'play' ? '2 eventi archiviati' : '2 liste scaricate' }).waitFor()
    assert.equal(await page.getByRole('progressbar').count(), 0, 'Totale eventi ignoto: nessuna percentuale')
    await auditLoading(page, workspace, 'eventi-' + source)
    await page.locator('.sidebar').getByRole('button', { name: 'Catalogo', exact: true }).click()
    await ready()
    await page.getByRole('button', { name: 'Indietro', exact: true }).click()
    await ready()
    await page.getByRole('status').filter({ hasText: 'Acquisizione del blocco in corso' }).waitFor()
    assert.ok(await page.getByRole('button', { name: 'Acquisizione…', exact: true }).isDisabled())
    assert.ok(await page.locator('.event-deck').isVisible())
    await application.evaluate(() => { globalThis.eventUiHold = false; globalThis.eventUiRelease() })
    await page.getByRole('status').filter({ hasText: 'Scansione da continuare' }).waitFor()
    await trigger.click()
    assert.ok(await page.getByRole('button', { name: 'Scansione completa', exact: true }).isDisabled())
    await page.getByRole('button', { name: 'Chiudi gestione' }).click()
    await application.evaluate(() => { globalThis.eventUiNext = { status: 'complete' } })
    await resume.click(); await update.waitFor()
    await trigger.click()
    await application.evaluate(() => { globalThis.eventUiNext = { status: 'rate-limited', cooldownUntil: new Date(Date.now() + 2500).toISOString(), lastError: 'Fixture: limite temporaneo.' } })
    await page.getByRole('button', { name: 'Scansione completa', exact: true }).click()
    await page.getByRole('button', { name: 'Chiudi gestione' }).click()
    await page.locator('.activity-status').filter({ hasText: 'Ripresa disponibile dopo' }).waitFor()
    assert.ok(await resume.isDisabled())
    assert.ok(await page.getByRole('status').filter({ hasText: 'Fixture: limite temporaneo.' }).isVisible())
    await page.waitForFunction(() => !document.querySelector('.tournament-section .primary-button')?.disabled)
    await application.evaluate(() => { globalThis.eventUiNext = { status: 'complete', cooldownUntil: null, lastError: null } })
    await resume.click(); await update.waitFor()
    await application.evaluate(() => { globalThis.eventUiError = true })
    await update.click()
    await page.getByRole('alert').filter({ hasText: 'Fixture: aggiornamento non riuscito.' }).waitFor()
    assert.equal(await trigger.getAttribute('aria-expanded'), 'false')
    assert.ok(await page.locator('.event-deck').isVisible())
    await application.evaluate(() => { globalThis.eventUiError = false })
    await trigger.click()
    await page.setViewportSize({ width: 640, height: 720 })
    minimumContrast = Math.min(minimumContrast, (await auditDesignSystem(page, 'Gestione eventi ' + source)).minimumContrast)
    await page.screenshot({ path: join(workspace, 'node_modules', `events-${source}-management-640.png`) })
    await page.getByRole('button', { name: 'Chiudi gestione' }).click()
    const requests = await application.evaluate((_electron, source) => globalThis.eventUiRequests.filter(item => item[0] === source).map(item => item[1]), source)
    assert.deepEqual(requests, ['new', 'new', 'full', 'full', 'new'])
  }
  await application.evaluate(({ ipcMain, shell }) => {
    for (const [route, handler] of globalThis.eventUiOriginals) { ipcMain.removeHandler(route); ipcMain.handle(route, handler) }
    shell.openExternal = globalThis.eventUiShell
  })
  await page.getByRole('button', { name: 'Play online', exact: true }).click()
  await ready()
  await search.fill('')
  if (await coverage.evaluate(el => el.open)) await coverage.locator('summary').click()
  console.log('EVENT WORKSPACE OK: both sources, lists/counts/filter, missing/partial data, keyboard/history, new/full/resume/cooldown/errors; 1440/1280/640; minimum contrast ' + minimumContrast.toFixed(2))
}
