import assert from 'node:assert/strict'
import { auditLoading } from './loading-ui-audit.mjs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { auditDesignSystem } from './design-system-audit.mjs'

// AI responses are controlled fixtures. Reads, saved versions and project context use SQLite + IPC.
export async function discussionScenarios(page, application, workspace, profile) {
  const ready = async () => {
    await page.waitForFunction(() => !document.querySelector('[data-nav-loading="true"]'))
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(resolve)))))
  }
  const input = page.getByLabel('Aggiungi un’osservazione')
  const submit = page.getByRole('button', { name: 'Aggiorna guida', exact: true })
  const latest = page.getByRole('article', { name: 'Ultimo scambio' })
  const history = page.locator('.discussion-history')
  await ready()
  const initialStrategy = await page.locator('.strategy-field p').first().innerText()
  assert.equal(await history.evaluate((el) => el.open), false)
  assert.equal(await page.locator('.discussion-history-item').count(), 1)
  assert.equal(await latest.locator('details').count(), 0)
  assert.match(await latest.innerText(), /Rivedi le risorse finali/)
  assert.match(await latest.innerText(), /Cosa cambia · Codex/)
  assert.equal(await page.getByRole('button', { name: 'Rigenera guida', exact: true }).getAttribute('class'), 'secondary-button matchup-regenerate')

  let minimumContrast = Infinity
  for (const [width, height] of [[1440, 900], [1280, 720], [640, 720]]) {
    await page.setViewportSize({ width, height })
    await page.locator('.matchup-discussion').evaluate((el) => {
      const main = document.querySelector('.main-content')
      main.scrollTop += el.getBoundingClientRect().top - main.getBoundingClientRect().top - 20
    })
    const geometry = await page.evaluate(() => {
      const main = document.querySelector('.main-content').getBoundingClientRect()
      const deck = document.querySelector('.deck-companion').getBoundingClientRect()
      const textarea = document.querySelector('#matchup-feedback').getBoundingClientRect()
      return { main: { right: main.right, bottom: main.bottom }, deck: { left: deck.left, top: deck.top },
        contained: textarea.left >= main.left && textarea.right <= main.right,
        overflow: document.documentElement.scrollWidth > innerWidth,
        fontSize: getComputedStyle(document.querySelector('.discussion-observation p')).fontSize }
    })
    assert.ok(geometry.contained && !geometry.overflow)
    assert.ok(width > 1240 ? geometry.main.right <= geometry.deck.left : geometry.main.bottom <= geometry.deck.top)
    assert.equal(geometry.fontSize, '15px')
    minimumContrast = Math.min(minimumContrast, (await auditDesignSystem(page, `Discussione ${width}`)).minimumContrast)
    await page.screenshot({ path: join(workspace, 'node_modules', `discussion-${width}.png`) })
  }

  await page.setViewportSize({ width: 1280, height: 720 })
  await history.locator(':scope > summary').focus()
  await page.keyboard.press('Enter')
  await page.locator('.discussion-version > summary').first().focus()
  await page.keyboard.press('Space')
  const version = page.locator('.discussion-version').first()
  assert.equal(await version.evaluate((el) => el.open), true)
  assert.equal(await version.evaluate((el) => getComputedStyle(el).maxHeight), 'none')
  assert.equal(await version.evaluate((el) => getComputedStyle(el).overflowY), 'visible')
  assert.equal(await version.getByRole('link', { name: 'Gardevoir ex', exact: true }).first().getAttribute('href'), '#catalog-card-fixture-gardevoir-historic')
  await history.locator(':scope > summary').click()

  await application.evaluate(({ ipcMain }) => {
    globalThis.originalRevision = ipcMain._invokeHandlers.get('matchups:revise')
    globalThis.originalRetry = ipcMain._invokeHandlers.get('matchups:retry-turn')
    ipcMain.removeHandler('matchups:revise')
    ipcMain.handle('matchups:revise', () => ({ ok: false, error: 'Fixture: salvataggio non disponibile.' }))
  })
  const comment = 'Terrei una carta di ricerca per il turno successivo. Valuta anche il rischio di lasciare un Pokémon esposto.'
  await input.fill(comment)
  await submit.click()
  await page.locator('.feedback-form').getByRole('alert').waitFor()
  assert.equal(await input.inputValue(), comment, 'Errore prima del salvataggio: bozza persa')
  assert.equal(await page.getByRole('alert').count(), 1, 'Errore duplicato')
  await application.evaluate(({ ipcMain }) => {
    globalThis.discussionRequests = []
    for (const route of ['matchups:revise', 'matchups:retry-turn']) {
      ipcMain.removeHandler(route)
      ipcMain.handle(route, (_event, discussionId, value) => {
        globalThis.discussionRequests.push({ route, discussionId, value })
        return new Promise((resolve) => { globalThis.finishDiscussionRequest = resolve })
      })
    }
  })
  await submit.click()
  await latest.getByRole('status').filter({ hasText: 'Codex sta aggiornando' }).waitFor()
  await auditLoading(page, workspace, 'revisione')
  await page.waitForFunction(() => document.activeElement?.id === 'matchup-discussion-heading')
  assert.equal(await page.getByText(comment, { exact: true }).count(), 1, 'Commento ripetuto durante invio')
  assert.equal(await input.count(), 0)
  const request = await application.evaluate(() => globalThis.discussionRequests.at(-1))
  assert.equal(request.value, comment)
  const db = new DatabaseSync(join(profile, 'data', 'pokeguru.sqlite'))
  try {
    const discussion = db.prepare('SELECT * FROM matchup_discussions WHERE id = ?').get(request.discussionId)
    const count = Number(db.prepare('SELECT count(*) AS n FROM matchup_turns WHERE discussion_id = ?').get(discussion.id).n)
    const previousReport = JSON.parse(db.prepare('SELECT report_payload FROM matchup_turns WHERE discussion_id = ? ORDER BY turn_no DESC LIMIT 1').get(discussion.id).report_payload)
    db.prepare('INSERT INTO matchup_turns (id, discussion_id, turn_no, feedback, created_at) VALUES (?, ?, ?, ?, ?)')
      .run('discussion-ui-pending', discussion.id, count, comment, new Date().toISOString())
    // Leave and return while the saved pending turn exists, then fail the controlled AI response.
    await page.locator('.sidebar').getByRole('button', { name: 'Catalogo', exact: true }).click()
    await ready()
    await page.getByRole('button', { name: 'Indietro', exact: true }).click()
    await ready()
    await latest.getByRole('status').filter({ hasText: 'Codex sta aggiornando' }).waitFor()
    assert.equal(await page.getByText(comment, { exact: true }).count(), 1)
    assert.ok(await page.getByRole('button', { name: 'Riprova la revisione' }).isDisabled())
    await application.evaluate(() => globalThis.finishDiscussionRequest({ ok: false, error: 'Fixture: risposta AI interrotta.' }))
    await latest.getByRole('alert').filter({ hasText: 'risposta AI interrotta' }).waitFor()
    assert.equal(await page.getByRole('alert').count(), 1)
    assert.equal(await page.getByText(comment, { exact: true }).count(), 1)
    assert.equal(await page.locator('.strategy-field p').first().innerText(), initialStrategy, 'Revisione fallita: ultima guida valida cambiata')
    await page.screenshot({ path: join(workspace, 'node_modules', 'discussion-error-1280.png') })
    await page.getByRole('button', { name: 'Riprova la revisione' }).click()
    await latest.getByRole('status').filter({ hasText: 'Codex sta aggiornando' }).waitFor()
    const retry = await application.evaluate(() => globalThis.discussionRequests.at(-1))
    assert.deepEqual(retry, { route: 'matchups:retry-turn', discussionId: discussion.id, value: 'discussion-ui-pending' })
    const revised = { ...previousReport, generatedAt: new Date().toISOString(), strategy: 'Piano aggiornato · fixture UI. Conserva una carta di ricerca.' }
    db.prepare('UPDATE matchup_turns SET report_payload = ?, change_summary = ? WHERE id = ?')
      .run(JSON.stringify(revised), 'Il piano ora conserva una risorsa di ricerca per il turno successivo.', retry.value)
    db.prepare('UPDATE matchup_reports SET payload = ?, generated_at = ? WHERE project_id = ? AND meta_id = ? AND opponent_id = ? AND deck_hash = ?')
      .run(JSON.stringify(revised), revised.generatedAt, revised.projectId, revised.metaId, revised.opponentId, revised.deckHash)
    // Complete while another view is mounted: returning must clear the pending UI and sent draft.
    await page.locator('.sidebar').getByRole('button', { name: 'Catalogo', exact: true }).click()
    await ready()
    const result = await page.evaluate(async ({ projectId, opponentId, id }) => {
      const loaded = await window.projectsApi.listMatchupDiscussions(projectId, opponentId)
      return { ok: true, value: loaded.value.find((item) => item.id === id) }
    }, { projectId: discussion.project_id, opponentId: discussion.opponent_id, id: discussion.id })
    await application.evaluate((_electron, result) => globalThis.finishDiscussionRequest(result), result)
    await page.getByRole('button', { name: 'Indietro', exact: true }).click()
    await ready()
    await input.waitFor()
    assert.equal(await input.inputValue(), '')
    assert.equal(await page.getByRole('alert').count(), 0)
    assert.match(await latest.innerText(), /Guida attuale/)
    assert.equal(await page.locator('.strategy-field p').first().innerText(), revised.strategy)
    assert.equal(await page.locator('.discussion-history-item').count(), count)
    assert.equal(Number(db.prepare('SELECT count(*) AS n FROM matchup_turns WHERE discussion_id = ?').get(discussion.id).n), count + 1, 'Riprova ha duplicato il turno')

    // A first guide has no empty exchange/history. Add only a declared fixture to this isolated DB.
    const initial = { ...previousReport, opponentId: '900002', strategy: 'Guida iniziale · fixture UI.' }
    db.prepare('INSERT INTO matchup_discussions (id, project_id, meta_id, opponent_id, deck_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run('initial-discussion-ui', initial.projectId, initial.metaId, initial.opponentId, initial.deckHash, initial.generatedAt)
    db.prepare('INSERT INTO matchup_turns (id, discussion_id, turn_no, created_at, report_payload) VALUES (?, ?, 0, ?, ?)')
      .run('initial-turn-ui', 'initial-discussion-ui', initial.generatedAt, JSON.stringify(initial))
    await page.locator('#matchup-switcher-trigger').click()
    await page.getByLabel('Cerca avversario').fill('Charizard')
    await page.getByRole('dialog', { name: 'Scegli avversario' }).getByRole('button', { name: /Charizard/ }).click()
    await ready()
    await input.waitFor()
    assert.equal(await history.count(), 0)
    assert.equal(await latest.locator('.discussion-observation, .discussion-change').count(), 0)
    assert.match(await latest.innerText(), /Guida iniziale/)
    db.prepare('DELETE FROM matchup_turns WHERE discussion_id = ?').run('initial-discussion-ui')
    db.prepare('DELETE FROM matchup_discussions WHERE id = ?').run('initial-discussion-ui')
    await page.locator('#matchup-switcher-trigger').click()
    await page.getByLabel('Cerca avversario').fill('Gardevoir')
    await page.getByRole('dialog', { name: 'Scegli avversario' }).getByRole('button', { name: /Gardevoir/ }).click()
    await ready()
  } finally { db.close() }
  await application.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler('matchups:revise')
    ipcMain.handle('matchups:revise', globalThis.originalRevision)
    ipcMain.removeHandler('matchups:retry-turn')
    ipcMain.handle('matchups:retry-turn', globalThis.originalRetry)
  })
  console.log('DISCUSSION OK: latest/history, initial guide, readable versions/own references, draft/error/pending/retry, unchanged valid guide, navigation during requests, same saved turn; 1440/1280/640; minimum contrast ' + minimumContrast.toFixed(2))
}
