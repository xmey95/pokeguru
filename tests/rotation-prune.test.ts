import { expect, it } from 'vitest'
import { copyFileSync, existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { CatalogStore, fetchStandardManifest } from '../src/main/catalog'
import { TournamentStore } from '../src/main/tournament-store'
import { syncTournamentBlock } from '../src/main/tournament-sync'
import { WESTERN_ROTATION_RULES } from '../src/shared/standard-rotation'
import type { CatalogPrint, CatalogSet } from '../src/shared/catalog'
import type { TournamentSnapshot } from '../src/shared/tournament'
import type { MainTournamentSnapshot } from '../src/shared/main-tournament'
import { parseDeck } from '../src/shared/deck-import'
import { suggestPrints } from '../src/shared/reconciliation'

const next = { ...WESTERN_ROTATION_RULES[1], version: 'play-2027-01-01',
  effectiveFrom: '2027-04-09', effectiveUntil: '2028-04-07', firstAllowedMark: 'I' }

function print(id: string, mark: string, detailAt: string | null, verified = true): CatalogPrint {
  const [setId, localId] = id.split('-')
  return { id, setId, setName: setId, localId, name: id, category: 'Trainer', rarity: 'Common',
    regulationMark: mark, identityId: verified ? `trainer-${id}` : id,
    identityBasis: verified ? 'trainer-text' : 'unverified', variants: null,
    gameplaySchemaVersion: 1,
    imageBase: null, thumbnail: null, highImageAvailable: null, sourceUpdated: null,
    sourceUrl: `https://api.tcgdex.net/v2/en/cards/${id}`, detailAt, error: null }
}

const sets: CatalogSet[] = ['sv05', 'me01'].map((id) => ({ id, name: id, sourceTotal: 3,
  sampleTotal: 3, fetchedAt: '2026-10-25T00:00:00Z',
  abbreviation: id === 'sv05' ? 'OLD' : 'MEG' }))

it('retires only verified old marks after a complete Catalog job and restores its pre-rotation backup', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'pokeguru-catalog-rotation-'))
  const path = join(folder, 'data.sqlite')
  let store: CatalogStore | null = null
  try {
    store = new CatalogStore(path)
    const old = print('sv05-001', 'H', '2026-10-24T00:00:00Z')
    const unverified = print('sv05-002', 'H', '2026-10-24T00:00:00Z', false)
    const uncited = print('sv05-003', 'H', '2026-10-24T00:00:00Z')
    const threadQuery = print('sv05-004', 'H', '2026-10-24T00:00:00Z')
    const reportQuery = print('sv05-005', 'H', '2026-10-24T00:00:00Z')
    const revisionQuery = print('sv05-006', 'H', '2026-10-24T00:00:00Z')
    const current = print('me01-001', 'I', '2026-10-24T00:00:00Z')
    const omitted = print('me01-003', 'I', '2026-10-24T00:00:00Z')
    store.save({ sets, prints: [old, unverified, uncited, threadQuery, reportQuery,
      revisionQuery, current, omitted], fetchedAt: '2026-10-24T00:00:00Z' }, 'standard-marks')
    const referenceDb = new DatabaseSync(path)
    referenceDb.exec(`CREATE TABLE deck_line_mappings (project_id TEXT NOT NULL DEFAULT 'fixture', line_number INTEGER NOT NULL DEFAULT 1, print_snapshot TEXT NOT NULL) STRICT;
      CREATE TABLE deck_thread_messages (id INTEGER PRIMARY KEY, evidence_json TEXT) STRICT;
      CREATE TABLE matchup_reports (project_id TEXT DEFAULT 'fixture', meta_id TEXT DEFAULT 'meta', opponent_id TEXT DEFAULT '1', deck_hash TEXT DEFAULT 'hash', payload TEXT) STRICT;
      CREATE TABLE matchup_turns (id INTEGER PRIMARY KEY, report_payload TEXT) STRICT`)
    referenceDb.prepare('INSERT INTO deck_line_mappings (print_snapshot) VALUES (?)').run(JSON.stringify({ id: old.id }))
    const catalogQuery = (id: string) => JSON.stringify({ aiQueries: { requests: [
      { query: { operation: 'catalog.search' }, data: { matches: [{ printId: id }] } }] } })
    referenceDb.prepare('INSERT INTO deck_thread_messages (evidence_json) VALUES (?)').run(catalogQuery(threadQuery.id))
    referenceDb.prepare('INSERT INTO matchup_reports (payload) VALUES (?)').run(catalogQuery(reportQuery.id))
    referenceDb.prepare('INSERT INTO matchup_turns (report_payload) VALUES (?)').run(catalogQuery(revisionQuery.id))
    referenceDb.close()
    const missing = print('me01-002', 'I', null)
    store.save({ sets, prints: [current, missing], fetchedAt: '2027-04-10T00:00:00Z' }, 'standard-marks', next)
    store.startJob('new', WESTERN_ROTATION_RULES[1].version)
    store.queueJob('new')
    const oldRunId = store.jobStatus().runId
    store.pauseJob(null)
    expect(store.resumeJob('new', next.version)).toBe(false)
    store.startJob('new', next.version)
    expect(store.jobStatus().runId).not.toBe(oldRunId)
    store.queueJob('new')
    await expect(store.completeJob(next)).rejects.toThrow('Dettagli ancora in coda')
    expect(store.getPrint(old.id)).not.toBeNull()
    expect(existsSync(join(folder, 'backups'))).toBe(false)
    store.commitJobBatch([{ ...missing, detailAt: '2027-04-10T01:00:00Z' }])
    await store.completeJob(next)
    expect(store.jobStatus()).toMatchObject({ state: 'done', rotationCleanup: {
      ruleVersion: next.version, removedPrints: 6, retainedReferences: 4 } })
    expect(store.getPrint(old.id)).toBeNull()
    expect(store.view().prints.map((item) => item.id).sort()).toEqual(['me01-001', 'me01-002', 'me01-003'])
    expect(store.view().referencePrints?.map((item) => item.id)).toContain(old.id)
    expect(store.view().referencePrints?.map((item) => item.id).sort()).toEqual([
      old.id, threadQuery.id, reportQuery.id, revisionQuery.id].sort())
    expect(store.view().referencePrints?.map((item) => item.id)).not.toContain(unverified.id)
    expect(store.view().referencePrints?.map((item) => item.id)).not.toContain(uncited.id)
    expect(store.view().referencePrints?.find((item) => item.id === old.id)?.historicalSetCode).toBe('OLD')
    const parsed = parseDeck('1 sv05-001 OLD 1').lines[0]
    expect(parsed).toMatchObject({ kind: 'card', name: 'sv05-001', setCode: 'OLD', cardNumber: '1' })
    expect(suggestPrints(parsed, store.view())[0])
      .toMatchObject({ reason: 'same-print', print: { id: old.id } })
    const backup = join(folder, 'backups', readdirSync(join(folder, 'backups'))
      .find((name) => name.endsWith('.sqlite'))!)
    expect(readdirSync(join(folder, 'backups'))).toContain(`${backup.split(/[\\/]/).at(-1)}.verified`)
    const restoredPath = join(folder, 'restored.sqlite')
    copyFileSync(backup, restoredPath)
    const restored = new CatalogStore(restoredPath)
    expect(restored.getPrint(old.id)).not.toBeNull()
    restored.close()
    const db = new DatabaseSync(path, { readOnly: true })
    expect(db.prepare('PRAGMA integrity_check').get()).toEqual({ integrity_check: 'ok' })
    expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([])
    db.close()
    const deleteReference = new DatabaseSync(path)
    deleteReference.exec(`DELETE FROM deck_line_mappings;
      DELETE FROM deck_thread_messages;
      DELETE FROM matchup_reports;
      DELETE FROM matchup_turns`)
    deleteReference.close()
    await store.completeJob(next)
    expect(store.view().referencePrints).toEqual([])
    expect(store.jobStatus().rotationCleanup?.retainedReferences).toBe(0)
  } finally { store?.close(); rmSync(folder, { recursive: true, force: true }) }
})

it('deletes old Event payloads while retaining only cited metadata and a recoverable backup', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'pokeguru-events-rotation-'))
  const path = join(folder, 'data.sqlite')
  try {
    const store = new TournamentStore(path)
    const play = (id: string, date: string) => ({ id, eventId: id, date, name: id,
      fetchedAt: '2027-04-10T00:00:00Z', source: 'Limitless Play API',
      publicUrl: `https://play.limitlesstcg.com/tournament/${id}`,
      circuit: 'WESTERN', format: 'STANDARD', cached: false }) as unknown as TournamentSnapshot
    const main = (id: string, date: string) => ({ id, eventId: id, date, name: id,
      fetchedAt: '2027-04-10T00:00:00Z', source: 'Limitless tournament database',
      url: `https://limitlesstcg.com/tournaments/${id}`,
      circuit: 'WESTERN', format: 'STANDARD', cached: false }) as unknown as MainTournamentSnapshot
    store.save(play('aaaaaaaaaaaaaaaaaaaaaaaa', '2027-04-08T12:00:00Z'))
    store.save(play('bbbbbbbbbbbbbbbbbbbbbbbb', '2027-04-10T12:00:00Z'))
    store.saveMain(main('101', '2027-04-08'), true)
    store.saveMain(main('102', '2027-04-10'), true)
    const evidenceDb = new DatabaseSync(path)
    evidenceDb.exec(`CREATE TABLE deck_thread_messages (id INTEGER PRIMARY KEY, evidence_json TEXT) STRICT;
      CREATE TABLE matchup_turns (id INTEGER PRIMARY KEY, report_payload TEXT) STRICT`)
    evidenceDb.prepare('INSERT INTO deck_thread_messages (evidence_json) VALUES (?)').run(JSON.stringify({ events: [
      { snapshotId: 'aaaaaaaaaaaaaaaaaaaaaaaa' }] }))
    evidenceDb.prepare('INSERT INTO matchup_turns (report_payload) VALUES (?)').run(JSON.stringify({ aiQueries: { requests: [
      { query: { operation: 'events.search' }, data: { lists: [{ snapshotId: '101' }] } }] } }))
    evidenceDb.close()
    store.saveProgress({ ...store.progress(), mode: 'new', status: 'running', pending: [
      { id: 'aaaaaaaaaaaaaaaaaaaaaaaa', date: '2027-04-08T12:00:00Z' }] })
    await store.ensureRotation(WESTERN_ROTATION_RULES[1])
    // The first installation records the current period; a later verified rule changes it.
    await store.ensureRotation(next)
    expect(store.list().map((item) => item.eventId)).toEqual(['bbbbbbbbbbbbbbbbbbbbbbbb'])
    expect(store.listMain().map((item) => item.eventId)).toEqual(['102'])
    expect(store.getEvent('aaaaaaaaaaaaaaaaaaaaaaaa')).toBeNull()
    expect(store.getMain('101')).toBeNull()
    expect(() => store.save(play('dddddddddddddddddddddddd', '2027-04-08T12:00:00Z')))
      .toThrow('rotazione precedente')
    expect(() => store.saveMain(main('103', '2027-04-08'))).toThrow('rotazione precedente')
    expect(store.historicalReference('aaaaaaaaaaaaaaaaaaaaaaaa')).toMatchObject({
      eventId: 'aaaaaaaaaaaaaaaaaaaaaaaa', source: 'play' })
    expect(store.historicalReference('101')).toMatchObject({ eventId: '101', source: 'main' })
    expect(store.progress()).toMatchObject({ status: 'idle', pending: [], rotationStart: next.effectiveFrom,
      rotationCleanup: { removedPlay: 1, removedMain: 1 } })
    await store.ensureRotation(next)
    expect(store.progress().rotationCleanup).toMatchObject({ removedPlay: 1, removedMain: 1 })
    const third = { ...next, version: 'play-2028-01-01', effectiveFrom: '2028-04-07',
      effectiveUntil: '2029-04-06', firstAllowedMark: 'J' }
    await store.ensureRotation(third)
    expect(store.list()).toEqual([])
    expect(store.listMain()).toEqual([])
    const activeDb = new DatabaseSync(path, { readOnly: true })
    expect((activeDb.prepare('SELECT COUNT(*) AS n FROM historical_event_references').get() as { n: number }).n).toBe(2)
    expect((activeDb.prepare('SELECT COALESCE(SUM(length(payload)), 0) AS bytes FROM tournament_snapshots').get() as
      { bytes: number }).bytes).toBe(0)
    expect((activeDb.prepare('SELECT COALESCE(SUM(length(payload)), 0) AS bytes FROM main_tournament_snapshots').get() as
      { bytes: number }).bytes).toBe(0)
    expect(activeDb.prepare("SELECT name FROM sqlite_master WHERE name LIKE 'historical_%snapshots'").all()).toEqual([])
    activeDb.close()
    const backup = join(folder, 'backups', readdirSync(join(folder, 'backups'))
      .find((name) => name.includes('pre-events-rotation-2027') && name.endsWith('.sqlite'))!)
    const restoredPath = join(folder, 'restored.sqlite')
    copyFileSync(backup, restoredPath)
    const restored = new TournamentStore(restoredPath)
    expect(restored.list().map((item) => item.eventId)).toContain('aaaaaaaaaaaaaaaaaaaaaaaa')
    restored.close()
    const unlinkEvidence = new DatabaseSync(path)
    unlinkEvidence.exec('DELETE FROM deck_thread_messages; DELETE FROM matchup_turns')
    unlinkEvidence.close()
    const backupsBeforeGc = readdirSync(join(folder, 'backups')).filter((name) => name.endsWith('.sqlite')).length
    await store.ensureRotation({ ...third, version: 'play-2029-01-01',
      effectiveFrom: '2029-04-07', effectiveUntil: '2030-04-06' })
    expect(store.historicalReference('aaaaaaaaaaaaaaaaaaaaaaaa')).toBeNull()
    expect(store.historicalReference('101')).toBeNull()
    expect(readdirSync(join(folder, 'backups')).filter((name) => name.endsWith('.sqlite')))
      .toHaveLength(backupsBeforeGc + 1)
    store.close()
  } finally { rmSync(folder, { recursive: true, force: true }) }
})

it('keeps the old Event archive when the new index fails and rejects dates without bundled rules', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'pokeguru-rotation-failure-'))
  try {
    const store = new TournamentStore(join(folder, 'data.sqlite'))
    const event: TournamentSnapshot = { id: 'cccccccccccccccccccccccc', eventId: 'cccccccccccccccccccccccc',
      date: '2025-10-01T12:00:00Z', name: 'Old event', fetchedAt: '2025-10-02T00:00:00Z',
      source: 'Limitless Play API', circuit: 'WESTERN', format: 'STANDARD', cached: false } as TournamentSnapshot
    store.save(event)
    await expect(syncTournamentBlock(store, 'new',
      (async () => { throw new Error('source unavailable') }) as typeof fetch,
      new Date('2026-10-25T12:00:00Z'))).rejects.toThrow('source unavailable')
    expect(store.list().map((item) => item.id)).toEqual([event.id])
    expect(store.getEvent(event.eventId)?.id).toBe(event.id)
    expect(existsSync(join(folder, 'backups'))).toBe(false)
    await expect(fetchStandardManifest(undefined, '2027-01-01')).rejects.toThrow('Nessuna rotazione')
    store.close()
  } finally { rmSync(folder, { recursive: true, force: true }) }
})
