import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { DatabaseSync } from 'node:sqlite'
import { gzipSync } from 'node:zlib'
import { _electron as electron } from 'playwright-core'
import { createProjectFromStart, switchProject, switchThread } from './project-ui-helper.mjs'

const require = createRequire(import.meta.url), workspace = resolve(import.meta.dirname, '..')
const profile = mkdtempSync(join(tmpdir(), 'pokeguru-evidence-history-'))
const now = new Date().toISOString(), jobId = randomUUID(), searchKey = 'a'.repeat(64)
let application
const launch = () => electron.launch({ executablePath: require('electron'), args: ['.'], cwd: workspace,
  env: { ...process.env, POKEGURU_DATA_DIR: profile, POKEGURU_AUTO_SYNC: '0',
    POKEGURU_CODEX_BIN: join(profile, 'missing-codex') }, timeout: 30000 })

try {
  application = await launch()
  let page = await application.firstWindow()
  await createProjectFromStart(page, 'Archivio prove')
  const ids = await page.evaluate(async () => {
    const project = (await window.projectsApi.list()).value[0]
    const thread = await window.projectsApi.createDeckThread({ projectId: project.id, title: 'Analisi archiviata' })
    const other = await window.projectsApi.create({ name: 'Altro progetto', format: 'STANDARD' })
    return { projectId: project.id, threadId: thread.value.id, otherId: other.value.id }
  })
  await application.close(); application = undefined
  const db = new DatabaseSync(join(profile, 'data', 'pokeguru.sqlite'))
  try {
    db.exec('PRAGMA foreign_keys = ON')
    db.prepare(`INSERT INTO ai_jobs (id, kind, project_id, resource_id, status, created_at, updated_at)
      VALUES (?, 'thread-ask', ?, ?, 'applied', ?, ?)`).run(jobId, ids.projectId, ids.threadId, now, now)
    db.prepare('INSERT INTO ai_evidence_runs VALUES (?, 1)').run(jobId)
    const query = { operation: 'catalog.search', terms: ['Fixture'], limit: 1 }
    db.prepare('INSERT INTO ai_evidence_searches VALUES (?, ?, ?, NULL, 2, 2000)')
      .run(jobId, searchKey, JSON.stringify(query))
    const put = (value) => {
      const body = Buffer.from(JSON.stringify(value)), hash = createHash('sha256').update(body).digest('hex')
      db.prepare('INSERT INTO ai_evidence_objects VALUES (?, ?)').run(hash, body.length)
      db.prepare('INSERT INTO ai_evidence_chunks VALUES (?, 0, ?)').run(hash, gzipSync(body))
      return hash
    }
    for (let i = 0; i < 2; i++) {
      const card = { printId: `fixture-${i}`, name: `Fixture ${i + 1}`, gameplay: { effect: `Originale ${i + 1}` } }
      const object = put(card), sourceId = `card:${card.printId}`
      db.prepare('INSERT INTO ai_evidence_records VALUES (?, ?, ?, ?, NULL, ?)')
        .run(jobId, sourceId, 'card', sourceId, object)
      const hash = put({ envelope: { query: { ...query, offset: i }, status: 'ok', sourceIds: [sourceId],
        fingerprint: `page-${i}` }, data: { offset: i, remaining: 1 - i, totalMatches: 2 }, cards: [{ object }] })
      db.prepare('INSERT INTO ai_evidence_links VALUES (?, ?)').run(hash, object)
      db.prepare('INSERT INTO ai_evidence_pages VALUES (?, ?, ?, ?, ?, ?)')
        .run(jobId, searchKey, String(i), i, `page-${i}`, hash)
    }
    const trace = { schemaVersion: 1, engine: { operations: ['catalog.search'], catalog: {
      syncedAt: now, expected: 2, indexed: 2, gameplay: 2 }, eventWindow: { from: '2026-10-01', to: '2026-10-28' } },
      requests: [{ query, status: 'ok', sourceIds: [], fingerprint: searchKey,
        data: { pages: 2, remaining: 0, totalMatches: 2 } }], durationMs: 10, responseBytes: 2000,
      planningRounds: 1, exhausted: false, archive: { version: 1, jobId, projectId: ids.projectId,
        resourceId: ids.threadId, searches: 1, completedSearches: 1, pages: 2, responseBytes: 2000,
        cards: 2, decks: 0, occurrences: 0, pairings: 0 } }
    const packet = { schemaVersion: 1, capturedAt: now, baseVersionId: null, candidateId: null,
      catalogSyncedAt: now, cardCoverage: { selected: 0, withGameplay: 0, omitted: 0 },
      cards: [], events: [], sources: [], change: { updated: [], added: [], removed: [] }, aiQueries: trace }
    db.prepare(`INSERT INTO deck_thread_messages (id, thread_id, author, text, created_at, evidence_json)
      VALUES (?, ?, 'assistant', 'Risposta illustrativa: consulta gli originali.', ?, ?)`)
      .run(randomUUID(), ids.threadId, now, JSON.stringify(packet))
  } finally { db.close() }
  application = await launch(); page = await application.firstWindow()
  const denied = await page.evaluate(async ({ ids, jobId, searchKey }) => ({
    project: await window.projectsApi.getAiEvidencePage(ids.otherId, ids.threadId, jobId, searchKey, 0),
    resource: await window.projectsApi.getAiEvidencePage(ids.projectId, 'wrong', jobId, searchKey, 0),
    sequence: await window.projectsApi.getAiEvidencePage(ids.projectId, ids.threadId, jobId, searchKey, -1)
  }), { ids, jobId, searchKey })
  assert.equal(denied.project.ok, false); assert.equal(denied.resource.ok, false); assert.equal(denied.sequence.ok, false)
  await switchProject(page, /Archivio prove/)
  await page.getByRole('button', { name: 'Strategie', exact: true }).click()
  await switchThread(page, /Analisi archiviata/)
  const message = page.locator('.thread-message').filter({ hasText: 'Risposta illustrativa' })
  await message.getByText('Fonti e dettagli', { exact: false }).click()
  await message.locator('.ai-diagnostics > summary').click()
  await message.locator('.ai-query-trace > summary').click()
  await message.getByText('Dati originali archiviati · 2 pagine', { exact: true }).click()
  await message.getByRole('button', { name: 'Apri la prima pagina' }).click()
  const original = message.getByRole('textbox', { name: 'Dati originali della ricerca' })
  await original.waitFor()
  assert.match(await original.inputValue(), /Originale 1/)
  await message.getByRole('button', { name: 'Pagina successiva' }).click()
  await page.waitForFunction(() => document.querySelector('textarea[aria-label="Dati originali della ricerca"]')?.value.includes('Originale 2'))
  assert.equal(await message.getByRole('button', { name: 'Pagina successiva' }).isDisabled(), true)
  await message.getByRole('button', { name: 'Pagina precedente' }).click()
  await page.waitForFunction(() => document.querySelector('textarea[aria-label="Dati originali della ricerca"]')?.value.includes('Originale 1'))
  console.log('Archive history Electron: original pages after reopen, paging and project/resource isolation passed (fixture, no Codex call).')
} finally {
  await application?.close()
  const resolved = realpathSync(profile)
  assert.equal(dirname(resolved).toLowerCase(), realpathSync(tmpdir()).toLowerCase())
  assert.ok(basename(resolved).startsWith('pokeguru-evidence-history-'))
  rmSync(resolved, { recursive: true, force: true })
}
