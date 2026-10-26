import assert from 'node:assert/strict'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { randomUUID } from 'node:crypto'

// UI fixture only. Persistence, navigation and drafts use the actual renderer and IPC.
export async function phaseScenarios(page, application, workspace, profile) {
  const plan = page.locator('.strategy-field')
  const input = page.getByLabel('Aggiungi un’osservazione')
  const db = new DatabaseSync(join(profile, 'data', 'pokeguru.sqlite'))
  const turnCount = () => db.prepare('SELECT count(*) AS n FROM matchup_turns').get().n
  const before = turnCount()
  try {
    const saved = db.prepare("SELECT payload FROM matchup_reports WHERE opponent_id = '900000'").get().payload
    const fields = ['strengths', 'weaknesses', 'ourKeyCards', 'theirKeyCards']
    const lists = page.locator('.matchup-fields .guide-list')
    assert.equal(await lists.count(), 4)
    for (const [index, field] of fields.entries()) {
      assert.ok(await lists.nth(index).getByRole('listitem').count() >= 2)
      assert.equal((await lists.nth(index).getByRole('listitem').allTextContents()).join(' '), JSON.parse(saved)[field])
    }
    await input.fill('Bozza conservata fra le fasi.')
    const opening = plan.getByRole('tab', { name: 'Apertura', exact: true })
    assert.deepEqual(await plan.getByRole('tabpanel').locator('.matchup-plan-part h4').allTextContents(),
      ['Piano', 'Fatti', 'Ipotesi'])
    const labeledParts = plan.getByRole('tabpanel').locator('.matchup-plan-part')
    assert.equal(await labeledParts.count(), 3)
    assert.match(await labeledParts.nth(0).innerText(), /Piano di prova contro Gardevoir ex/)
    assert.match(await labeledParts.nth(1).innerText(), /Mega Absol ex è nella nostra lista/)
    assert.match(await labeledParts.nth(2).innerText(), /conserva una carta di ricerca/)
    const positions = await labeledParts.evaluateAll((parts) => parts.map((part) => part.getBoundingClientRect().top))
    assert.ok(positions[0] < positions[1] && positions[1] < positions[2], 'Le sezioni del piano non vanno a capo')
    await opening.press('ArrowRight')
    await page.waitForFunction(() => document.activeElement?.textContent === 'Sviluppo')
    assert.equal(await plan.getByRole('tabpanel').count(), 1)
    assert.match(await plan.getByRole('tabpanel').innerText(), /Sviluppo di prova/)
    await plan.getByRole('tab', { name: 'Sviluppo' }).press('End')
    assert.equal(await plan.getByRole('tab', { name: 'Chiusura' }).getAttribute('aria-selected'), 'true')
    await plan.getByRole('tab', { name: 'Chiusura' }).press('ArrowRight')
    assert.equal(await opening.getAttribute('aria-selected'), 'true')
    await opening.press('ArrowLeft')
    await plan.getByRole('tab', { name: 'Chiusura' }).press('Home')
    assert.equal(await input.inputValue(), 'Bozza conservata fra le fasi.')
    assert.equal(turnCount(), before, 'Cambiare fase ha creato una revisione')
    await opening.press('ArrowRight')
    await page.locator('.sidebar').getByRole('button', { name: 'Catalogo', exact: true }).evaluate((el) => el.click())
    await page.getByRole('button', { name: 'Indietro', exact: true }).click()
    await opening.waitFor()
    await page.waitForFunction(() => document.activeElement?.textContent === 'Sviluppo')
    assert.equal(await plan.getByRole('tab', { name: 'Sviluppo' }).getAttribute('aria-selected'), 'true')
    await plan.getByRole('tab', { name: 'Sviluppo' }).press('Home')
    assert.equal(await input.inputValue(), 'Bozza conservata fra le fasi.')
    await page.locator('.guide-sources > summary').click()
    assert.equal(await page.locator('.guide-sources .ai-diagnostics').getAttribute('open'), null)
    assert.ok(!(await page.locator('.guide-sources .ai-prompt-audit').isVisible()))
    assert.match(await page.locator('.matchup-report-meta').innerText(), /Versione della lista non disponibile/)
    await page.locator('.guide-sources .ai-diagnostics > summary').click()
    await page.locator('.guide-sources .ai-prompt-audit > summary').click()
    assert.match(await page.locator('.guide-sources .ai-prompt-audit').innerText(), /Prompt di prova APP-135/)
    await page.locator('.guide-sources > summary').click()
    await page.locator('.discussion-history > summary').click()
    const historical = page.locator('.discussion-version').first()
    await historical.locator(':scope > summary').click()
    assert.equal(await historical.getByRole('tab').count(), 0)
    assert.match(await historical.locator('.legacy-plan').innerText(), /Piano di prova contro Gardevoir ex/)
    assert.deepEqual(await historical.locator('.legacy-plan .matchup-plan-part h4').allTextContents(),
      ['Piano', 'Fatti', 'Ipotesi'])
    assert.equal(await historical.locator('.guide-list').count(), 4)
    assert.equal(await historical.locator('.guide-list').first().getByRole('listitem').count(), 3)
    await page.locator('.discussion-history > summary').click()
    for (const [width, height] of [[1920, 1080], [1440, 900], [1280, 720], [640, 720], [640, 580]]) {
      await page.setViewportSize({ width, height })
      await plan.evaluate((el) => {
        const main = document.querySelector('.main-content')
        main.scrollTop += el.getBoundingClientRect().top - main.getBoundingClientRect().top - 16
      })
      assert.ok(await opening.isVisible())
      const geometry = await page.evaluate(() => {
        const main = document.querySelector('.main-content')
        const bounds = main.getBoundingClientRect()
        const deck = document.querySelector('.deck-companion').getBoundingClientRect()
        return { overflow: main.scrollWidth > main.clientWidth + 1,
          separated: innerWidth > 1240 ? bounds.right <= deck.left : bounds.bottom <= deck.top }
      })
      assert.deepEqual(geometry, { overflow: false, separated: true })
      const paragraph = await plan.getByRole('tabpanel').locator('p').first().boundingBox()
      const panel = await plan.getByRole('tabpanel').boundingBox()
      assert.ok(Math.abs(paragraph.width - panel.width) < 1, 'Il testo lascia spazio inutilizzato a destra')
      await page.screenshot({ path: join(workspace, 'node_modules', `matchup-phases-${width}-${height}.png`) })
    }
    assert.equal(db.prepare("SELECT payload FROM matchup_reports WHERE opponent_id = '900000'").get().payload, saved,
      'La presentazione a elenco ha modificato il report salvato')
    const row = db.prepare("SELECT payload FROM matchup_reports WHERE opponent_id = '900000'").get()
    const previous = JSON.parse(row.payload)
    const jobId = randomUUID()
    const timestamp = new Date().toISOString()
    const report = { ...previous, jobId, generatedAt: timestamp, strategyPhases: {
      ...previous.strategyPhases, closing: 'Finale recuperato senza nuova analisi.' } }
    // A completed AI result is staged in the real job store; the real recovery API persists it.
    db.prepare(`INSERT INTO ai_jobs (id, kind, project_id, resource_id, status, request_json,
      result_json, created_at, updated_at, error) VALUES (?, 'matchup-generate', ?, ?, 'ready', ?, ?, ?, ?, NULL)`)
      .run(jobId, report.projectId, `matchup:${report.projectId}`, JSON.stringify({ analysisVersion: 2, base: report }),
        JSON.stringify({ report }), timestamp, timestamp)
    await page.getByText('La guida è pronta, ma non è stata salvata.', { exact: true }).waitFor()
    assert.equal(turnCount(), before)
    assert.equal(await input.inputValue(), 'Bozza conservata fra le fasi.')
    await page.getByRole('button', { name: 'Completa salvataggio', exact: true }).click()
    await page.getByText('La guida è pronta, ma non è stata salvata.', { exact: true }).waitFor({ state: 'detached' })
    assert.equal(db.prepare('SELECT status FROM ai_jobs WHERE id = ?').get(jobId).status, 'applied')
    assert.equal(turnCount(), before + 1)
    assert.equal(JSON.parse(db.prepare("SELECT payload FROM matchup_reports WHERE opponent_id = '900000'").get().payload)
      .strategyPhases.closing, report.strategyPhases.closing)
    await input.fill('')
    console.log('MATCHUP PHASES OK: tastiera, focus, pannello unico, bozza, storico, elenchi senza riscrittura, piano a tutta larghezza, diagnostica, recupero persistito senza AI, 1920/1440/1280/640 px')
  } finally { db.close() }
}
