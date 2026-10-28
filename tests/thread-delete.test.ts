import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { DatabaseSync } from 'node:sqlite'
import { expect, it } from 'vitest'
import { ProjectStore } from '../src/main/project-store'
import { AiJobStore } from '../src/main/ai-job-store'
import { AiEvidenceArchive } from '../src/main/ai-evidence-archive'
import { completeDatabaseMigration, prepareDatabaseMigration, verifyDatabase } from '../src/main/database-migrations'

it('deletes only the confirmed thread, retaining adopted decks, child seeds and other job evidence after reopen', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'pokeguru-delete-thread-')), path = join(folder, 'db.sqlite')
  let store = new ProjectStore(path)
  const jobs = new AiJobStore(path)
  try {
    const p = store.create({ name: 'A', format: 'STANDARD' }), other = store.create({ name: 'B', format: 'STANDARD' })
    store.importDeck({ projectId: p.id, source: 'paste', rawText: '60 A MEG 1' })
    const thread = store.createDeckThread({ projectId: p.id, title: 'Delete', openingNote: 'Private note' })
    const survivor = store.createDeckThread({ projectId: other.id, title: 'Keep', openingNote: 'Keep note' })
    const candidate = store.saveDeckCandidate({ projectId: p.id, threadId: thread.id, rawText: '60 B MEG 2' }).candidates[0]
    store.adoptDeckCandidate({ projectId: p.id, threadId: thread.id, candidateId: candidate.id,
      expectedHeadId: store.listDeckVersions(p.id)[0].id })
    const child = store.continueDeckThread({ projectId: p.id, threadId: thread.id, candidateId: candidate.id, title: 'Child' })
    const job = jobs.start('thread-ask', p.id, thread.id), keep = jobs.start('thread-ask', other.id, survivor.id)
    const archive = new AiEvidenceArchive(path, job), keptArchive = new AiEvidenceArchive(path, keep)
    archive.saveValue('input', 'same', { proof: 'shared' }); keptArchive.saveValue('input', 'same', { proof: 'shared' })
    archive.close(); keptArchive.close()
    expect(() => store.deleteDeckThread(other.id, thread.id, thread.title)).toThrow(/non trovato/)
    expect(() => store.deleteDeckThread(p.id, thread.id, 'wrong')).toThrow(/titolo/)
    expect(() => store.deleteDeckThread(p.id, thread.id, thread.title)).toThrow(/analisi/)
    jobs.transition(job.id, 'cancelled')
    // A failure after dependent deletions rolls everything back.
    const db = new DatabaseSync(path)
    db.exec("CREATE TRIGGER reject_thread_delete BEFORE DELETE ON deck_threads BEGIN SELECT RAISE(ABORT, 'test rollback'); END")
    expect(() => store.deleteDeckThread(p.id, thread.id, thread.title)).toThrow('test rollback')
    expect(jobs.get(job.id)).not.toBeNull()
    expect(store.getDeckThread(p.id, child.id)?.seedCandidateText).toBe(candidate.rawText)
    db.exec('DROP TRIGGER reject_thread_delete'); db.close()
    expect(store.deleteDeckThread(p.id, thread.id, thread.title)).toEqual([job.id])
    expect(jobs.get(job.id)).toBeNull()
    store.close(); store = new ProjectStore(path)
    expect(store.getDeckThread(p.id, thread.id)).toBeNull()
    expect(store.getBaseline(p.id)?.rawText).toBe(candidate.rawText)
    expect(store.listDeckVersions(p.id)).toHaveLength(2)
    expect(store.getDeckThread(p.id, child.id)).toMatchObject({ parentThreadId: null, seedCandidateId: null, seedCandidateText: candidate.rawText })
    expect(store.getDeckThread(other.id, survivor.id)?.messages[0].text).toBe('Keep note')
    const kept = new AiEvidenceArchive(path, keep)
    expect(kept.value('input', 'same')).toEqual({ proof: 'shared' }); kept.close()
    verifyDatabase(path)
  } finally { jobs.close(); store.close(); rmSync(folder, { recursive: true, force: true }) }
})

it('backs up a v13 archive before the seed-text migration', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'pokeguru-thread-migration-')), path = join(folder, 'db.sqlite')
  try {
    new ProjectStore(path).close(); new AiJobStore(path).close()
    const old = new DatabaseSync(path)
    old.exec('ALTER TABLE deck_threads DROP COLUMN seed_candidate_text; PRAGMA user_version=13'); old.close()
    const migration = await prepareDatabaseMigration(path)
    expect(migration).toMatchObject({ fromVersion: 13, needsMigration: true })
    expect(migration.backupPath).toBeTruthy()
    new ProjectStore(path).close()
    completeDatabaseMigration(path, migration)
    verifyDatabase(path)
  } finally { rmSync(folder, { recursive: true, force: true }) }
})
