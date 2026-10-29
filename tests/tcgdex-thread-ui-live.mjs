import assert from 'node:assert/strict'
import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { DatabaseSync } from 'node:sqlite'
import { _electron as electron } from 'playwright-core'
import { createProjectFromStart, switchThread } from './project-ui-helper.mjs'

const require = createRequire(import.meta.url)
const workspace = resolve(import.meta.dirname, '..')
const profile = mkdtempSync(join(tmpdir(), 'pokeguru-tcgdex-thread-'))
const sourceUrl = 'https://api.tcgdex.net/v2/en/cards/me01-086'
const now = new Date().toISOString()
let application

try {
  application = await electron.launch({ executablePath: require('electron'), args: ['.'], cwd: workspace,
    env: { ...process.env, POKEGURU_DATA_DIR: profile }, timeout: 30000 })
  const page = await application.firstWindow()
  await createProjectFromStart(page, 'Thread · fonte locale')
  await page.getByLabel('Testo lista').fill('1 Mega Absol ex ME01 086')
  await page.getByRole('button', { name: 'Salva lista', exact: true }).click()
  await page.locator('#deck-import').waitFor({ state: 'detached' })
  const seeded = await page.evaluate(async () => {
    const projects = await window.projectsApi.list()
    const project = projects.value.find((item) => item.name === 'Thread · fonte locale')
    const baseline = await window.projectsApi.getBaseline(project.id)
    const thread = await window.projectsApi.createDeckThread({ projectId: project.id, title: 'Fonte locale' })
    return { projectId: project.id, threadId: thread.value.id, baseline: baseline.value }
  })
  const source = { id: 'card:me01-086', label: 'Mega Absol ex · ME01 086', url: sourceUrl, fingerprint: 'fixture' }
  const packet = { schemaVersion: 1, capturedAt: now, baseVersionId: null, candidateId: null,
    catalogSyncedAt: now, cardCoverage: { selected: 1, withGameplay: 1, omitted: 0 },
    cards: [], events: [], sources: [source], change: { updated: [], added: [], removed: [] } }
  const { lines, interpretedTotal, declaredTotal, diagnostics } = seeded.baseline
  const print = { id: 'me01-086', setId: 'me01', setName: 'Mega Evolution · fixture', localId: '086',
    name: 'Mega Absol ex', category: 'Pokemon', stage: 'Basic', energyType: null,
    rarity: null, regulationMark: 'I', variants: null, identityId: 'fixture-absol', identityBasis: 'unverified',
    imageBase: null, thumbnail: null, highImageAvailable: null, sourceUpdated: null, sourceUrl,
    detailAt: now, error: null }
  const db = new DatabaseSync(join(profile, 'data', 'pokeguru.sqlite'))
  try {
    db.prepare('INSERT INTO catalog_sets (id, name, source_total, sample_total, fetched_at, release_date) VALUES (?, ?, 1, 1, ?, NULL)')
      .run('me01', 'Mega Evolution · fixture', now)
    db.prepare('INSERT INTO catalog_prints VALUES (?, ?, ?)').run(print.id, print.setId, JSON.stringify(print))
    db.prepare('INSERT INTO catalog_sync VALUES (1, ?)').run(now)
    db.prepare(`INSERT INTO deck_thread_messages (id, thread_id, author, text, created_at, evidence_json, cited_source_ids_json)
      VALUES (?, ?, 'assistant', 'Scheda citata nella risposta di prova.', ?, ?, ?)`).run(
      'fixture-message', seeded.threadId, now, JSON.stringify(packet), JSON.stringify([source.id]))
    db.prepare(`INSERT INTO deck_ai_candidates (id, thread_id, sequence, raw_text, parsed_json, note,
      sources_json, checks_json, ai_config_json, ai_turn_id, created_at)
      VALUES (?, ?, 1, ?, ?, '', ?, '[]', '{}', ?, ?)`).run(
      'fixture-candidate', seeded.threadId, seeded.baseline.rawText, JSON.stringify({ lines, interpretedTotal, declaredTotal, diagnostics }),
      JSON.stringify([source, { id: 'meta', label: 'Meta Limitless', url: 'https://limitlesstcg.com/decks?format=standard' }]),
      'fixture-turn', now)
  } finally { db.close() }

  await application.evaluate(({ shell }) => {
    globalThis.openedSources = []
    shell.openExternal = async (url) => { globalThis.openedSources.push(url) }
  })
  await page.getByRole('button', { name: 'Strategie', exact: true }).click()
  await switchThread(page, /Fonte locale/)
  const message = page.locator('.thread-message').filter({ hasText: 'Scheda citata nella risposta di prova.' })
  await message.getByText('Fonti e dettagli', { exact: false }).click()
  await message.getByRole('button', { name: 'Mega Absol ex · ME01 086 · Catalogo' }).click()
  await page.locator('.catalog-detail').getByRole('heading', { name: 'Mega Absol ex', exact: true }).waitFor({ timeout: 30000 })
  assert.deepEqual(await application.evaluate(() => globalThis.openedSources), [])

  await page.getByRole('button', { name: 'Strategie', exact: true }).click()
  await switchThread(page, /Fonte locale/)
  const candidate = page.locator('.thread-candidate.featured')
  await candidate.locator('.candidate-comparison > summary').click()
  await candidate.getByRole('button', { name: 'Meta Limitless ↗' }).click()
  assert.deepEqual(await application.evaluate(() => globalThis.openedSources), ['https://limitlesstcg.com/decks?format=standard'])
  await candidate.getByRole('button', { name: 'Mega Absol ex · ME01 086 · Catalogo' }).first().click()
  await page.locator('.catalog-detail').getByRole('heading', { name: 'Mega Absol ex', exact: true }).waitFor({ timeout: 30000 })
  const stored = await page.evaluate((id) => window.projectsApi.listDeckThreads(id), seeded.projectId)
  assert.equal(stored.value[0].messages[0].evidence.sources[0].url, sourceUrl)
  assert.equal(stored.value[0].candidates[0].sources[0].url, sourceUrl)
  await page.getByRole('navigation', { name: 'Aree del progetto' }).getByRole('button', { name: 'Lista', exact: true }).click()
  await page.locator('.deck-card-toggle').filter({ hasText: 'Mega Absol ex' }).click()
  const deckDetail = page.locator('.deck-card-detail')
  await deckDetail.getByText('Scheda TCGdex', { exact: false }).waitFor()
  assert.equal(await deckDetail.getByRole('button', { name: /TCGdex|Apri scheda fonte/ }).count(), 0)
  await deckDetail.locator('.deck-print-details > summary').click()
  assert.equal(await deckDetail.locator('a[href^="https://api.tcgdex.net/"]').count(), 0)
  assert.deepEqual(await application.evaluate(() => globalThis.openedSources), ['https://limitlesstcg.com/decks?format=standard'])
  console.log('APP-107 Thread/Lista UI OK: scheda locale da messaggio e candidata, nessun JSON, fonte tecnica conservata.')
} finally {
  await application?.close()
  const resolved = realpathSync(profile)
  assert.equal(dirname(resolved).toLowerCase(), realpathSync(tmpdir()).toLowerCase())
  assert.ok(basename(resolved).startsWith('pokeguru-tcgdex-thread-'))
  rmSync(resolved, { recursive: true, force: true })
}
