import { cpSync, existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { expect, it } from 'vitest'
import { ProjectStore } from '../src/main/project-store'
import { AiJobStore } from '../src/main/ai-job-store'
import { TournamentStore } from '../src/main/tournament-store'
import { CURRENT_SCHEMA_VERSION, completeDatabaseMigration, prepareDatabaseMigration,
  verifyDatabase } from '../src/main/database-migrations'

it('upgrades an APP-109 v3 archive with a verified backup, then restores the full project after reopening', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'pokeguru-project-archive-'))
  const path = join(folder, 'pokeguru.sqlite')
  try {
    const first = new ProjectStore(path)
    const project = first.create({ name: 'Archivio', format: 'STANDARD' })
    first.importDeck({ projectId: project.id, source: 'paste', rawText: '60 Carta A MEG 1' })
    const thread = first.createDeckThread({ projectId: project.id, title: 'Proposta',
      openingNote: 'Conservare', startWithAi: true })
    expect(thread.openingAiMessageId).toBe(thread.messages[0].id)
    first.saveDeckCandidate({ projectId: project.id, threadId: thread.id, rawText: '60 Carta B MEG 2' })
    first.close()
    const old = new DatabaseSync(path)
    old.exec('ALTER TABLE projects DROP COLUMN archived_at; PRAGMA user_version = 3')
    old.close()

    const preparation = await prepareDatabaseMigration(path)
    expect(preparation).toMatchObject({ fromVersion: 3, needsMigration: true })
    expect(existsSync(`${preparation.backupPath}.verified`)).toBe(true)
    const recoveredPath = join(folder, 'recovered.sqlite')
    cpSync(preparation.backupPath!, recoveredPath)
    verifyDatabase(recoveredPath)
    const backup = new DatabaseSync(recoveredPath, { readOnly: true })
    expect((backup.prepare('PRAGMA table_info(projects)').all() as { name: string }[])
      .some((column) => column.name === 'archived_at')).toBe(false)
    backup.close()

    const upgraded = new ProjectStore(path)
    const jobs = new AiJobStore(path)
    completeDatabaseMigration(path, preparation)
    expect(upgraded.get(project.id)?.archivedAt).toBeNull()
    expect(upgraded.archive(project.id).archivedAt).not.toBeNull()
    expect(upgraded.list()).toEqual([])
    expect(upgraded.get(project.id)).toBeNull()
    expect(upgraded.getBaseline(project.id)).toBeNull()
    expect(() => upgraded.listDeckVersions(project.id)).toThrow('Progetto non trovato')
    jobs.close(); upgraded.close()

    const reopened = new ProjectStore(path)
    expect(reopened.listArchived().map((item) => item.id)).toEqual([project.id])
    expect(reopened.restore(project.id).archivedAt).toBeNull()
    expect(reopened.getBaseline(project.id)?.rawText).toBe('60 Carta A MEG 1')
    expect(reopened.getDeckThread(project.id, thread.id)).toMatchObject({
      openingAiMessageId: thread.openingAiMessageId,
      messages: [{ text: 'Conservare' }], candidates: [{ rawText: '60 Carta B MEG 2' }]
    })
    const versionDb = new DatabaseSync(path, { readOnly: true })
    expect((versionDb.prepare('PRAGMA user_version').get() as { user_version: number }).user_version)
      .toBe(CURRENT_SCHEMA_VERSION)
    versionDb.close()
    reopened.close()
    verifyDatabase(path)
  } finally { rmSync(folder, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }) }
}, 30_000)

it('requires archival and an exact name; deletes dependent records but keeps other projects and global data', () => {
  const folder = mkdtempSync(join(tmpdir(), 'pokeguru-project-delete-'))
  const path = join(folder, 'pokeguru.sqlite')
  try {
    const store = new ProjectStore(path)
    const events = new TournamentStore(path)
    const jobs = new AiJobStore(path)
    const target = store.create({ name: 'Da eliminare', format: 'STANDARD' })
    const survivor = store.create({ name: 'Da conservare', format: 'STANDARD' })
    store.importDeck({ projectId: target.id, source: 'paste', rawText: '60 Carta A MEG 1' })
    store.importDeck({ projectId: survivor.id, source: 'paste', rawText: '60 Carta B MEG 2' })
    const thread = store.createDeckThread({ projectId: target.id, title: 'Thread', openingNote: 'Messaggio' })
    const candidate = store.saveDeckCandidate({ projectId: target.id, threadId: thread.id,
      rawText: '60 Carta C MEG 3' }).candidates[0]
    store.adoptDeckCandidate({ projectId: target.id, threadId: thread.id,
      candidateId: candidate.id, expectedHeadId: store.listDeckVersions(target.id)[0].id })
    const snapshot = { id: 'a'.repeat(64), fetchedAt: '2026-10-23T00:00:00.000Z',
      sourceUrl: 'https://limitlesstcg.com/decks', period: 'Ultimo mese', circuit: 'WESTERN' as const,
      format: 'STANDARD' as const, cached: false,
      decks: [{ id: '284', name: 'Dragapult ex', points: 100, share: 12, url: 'https://limitlesstcg.com/decks/284' }] }
    store.saveMetaSnapshot(snapshot)
    store.saveMatchupReport({ projectId: target.id, metaId: snapshot.id, opponentId: '284',
      deckHash: store.getCurrentDeckHash(target.id)!, generatedAt: '2026-10-23T00:05:00.000Z',
      sampleDeckUrl: null, strengths: 'A', weaknesses: 'B', ourKeyCards: 'C', theirKeyCards: 'D',
      strategy: 'Piano', limitations: 'Nessuno' })
    const db = new DatabaseSync(path)
    const parent = db.prepare('SELECT id FROM matchup_discussions WHERE project_id = ?').get(target.id) as { id: string }
    db.prepare(`INSERT INTO matchup_discussions
      (id, project_id, meta_id, opponent_id, deck_hash, parent_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`).run('child-discussion', target.id, snapshot.id, '284',
        'historical-deck-hash', parent.id, '2026-10-23T01:00:00.000Z')
    db.prepare('INSERT INTO tournament_snapshots VALUES (?, ?, ?, ?)')
      .run('global', 'event', '2026-10-23T00:00:00.000Z', '{}')
    db.close()
    const job = jobs.start('thread-ask', target.id, thread.id)
    expect(() => store.deleteArchived(target.id, target.name)).toThrow('archiviato')
    store.archive(target.id)
    expect(() => store.deleteArchived(target.id, 'Da conservare')).toThrow('nome di conferma')
    expect(() => store.deleteArchived(target.id, target.name)).toThrow('job AI')
    jobs.transition(job.id, 'cancelled')
    expect(store.deleteArchived(target.id, target.name)).toEqual([job.id])
    expect(store.listArchived()).toEqual([])
    expect(store.get(survivor.id)?.name).toBe('Da conservare')
    expect(store.getBaseline(survivor.id)?.rawText).toBe('60 Carta B MEG 2')
    expect(store.getLatestMetaSnapshot()?.id).toBe(snapshot.id)
    jobs.close(); events.close(); store.close()
    verifyDatabase(path)
    const check = new DatabaseSync(path, { readOnly: true })
    for (const table of ['projects', 'deck_baselines', 'deck_versions', 'deck_threads',
      'matchup_reports', 'matchup_discussions', 'ai_jobs']) {
      const column = table === 'projects' ? 'id' : 'project_id'
      expect((check.prepare(`SELECT count(*) AS n FROM ${table} WHERE ${column} = ?`).get(target.id) as { n: number }).n)
        .toBe(0)
    }
    for (const table of ['deck_adoptions', 'deck_thread_messages', 'deck_thread_candidates', 'matchup_turns']) {
      expect((check.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }).n).toBe(0)
    }
    expect((check.prepare('SELECT count(*) AS n FROM tournament_snapshots').get() as { n: number }).n).toBe(1)
    check.close()
  } finally { rmSync(folder, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }) }
})
