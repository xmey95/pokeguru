import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { ProjectStore } from '../src/main/project-store'
import { AiJobStore } from '../src/main/ai-job-store'
import { AiEvidenceArchive, evidenceHash } from '../src/main/ai-evidence-archive'
import { collectArchivedEvidence } from '../src/main/ai-evidence-collection'
import type { AiEvidenceEngine } from '../src/main/ai-evidence-engine'

function fixture(remaining: (offset: number) => number = (offset) => 3 - offset) {
  const folder = mkdtempSync(join(tmpdir(), 'pokeguru-evidence-queue-'))
  const file = join(folder, 'data.sqlite')
  const projects = new ProjectStore(file), jobs = new AiJobStore(file)
  const project = projects.create({ name: 'Durable queue', format: 'STANDARD' })
  const job = jobs.start('thread-ask', project.id, 'resource')
  let archive = new AiEvidenceArchive(file, job)
  const executed: number[] = []
  const engine: AiEvidenceEngine = {
    describe: () => ({ operations: ['catalog.search'], catalog: { syncedAt: null, expected: 4, indexed: 4,
      gameplay: 4 }, eventWindow: { from: '2026-10-01', to: '2026-10-28' } }),
    cardTargets: () => [], eventTargets: () => [],
    execute(query) {
      const offset = (query as { offset: number }).offset
      executed.push(offset)
      const data = { matches: [{ printId: `card-${offset}`, name: `Card ${offset}` }],
        offset, remaining: remaining(offset) }
      return { query, status: 'ok', sourceIds: [`card:card-${offset}`], data, fingerprint: evidenceHash([query, data]) }
    } }
  return { engine, executed, get archive() { return archive },
    reopen() { archive.close(); archive = new AiEvidenceArchive(file, job) },
    close() { archive.close(); jobs.close(); projects.close(); rmSync(folder, { recursive: true, force: true }) } }
}
const query = { operation: 'catalog.search', terms: ['draw'], limit: 1 }

it('resumes at the committed cursor after interruption and never repeats completed pages', async () => {
  const f = fixture()
  try {
    const controller = new AbortController()
    await expect(collectArchivedEvidence(query, f.engine, f.archive, { signal: controller.signal,
      onPage: (_, search) => { if (search.pages === 2) controller.abort('pause') } })).rejects.toMatchObject({ code: 'paused' })
    expect(f.executed).toEqual([0, 1])
    f.reopen()
    const complete = await collectArchivedEvidence(query, f.engine, f.archive)
    expect(complete).toMatchObject({ cursor: null, pages: 4 })
    expect(f.executed).toEqual([0, 1, 2, 3])
    await collectArchivedEvidence({ ...query, offset: 900, limit: 20 }, f.engine, f.archive)
    expect(f.executed).toEqual([0, 1, 2, 3])
    expect(f.archive.counts()).toMatchObject({ searches: 1, cards: 4 })
  } finally { f.close() }
})

it('detects a source that stops advancing even across restart, preserving the last good cursor', async () => {
  const f = fixture(() => 50)
  try {
    await expect(collectArchivedEvidence(query, f.engine, f.archive)).rejects.toThrow('non avanza')
    expect(f.executed).toEqual([0, 1])
    expect(f.archive.search(query)).toMatchObject({ pages: 1, cursor: { offset: 1 } })
    f.reopen()
    await expect(collectArchivedEvidence(query, f.engine, f.archive)).rejects.toThrow('non avanza')
    expect(f.executed).toEqual([0, 1, 1])
    expect(f.archive.counts()).toMatchObject({ pages: 1, cards: 1 })
  } finally { f.close() }
})

it('keeps a completed page when an observer fails before the next page', async () => {
  const f = fixture()
  try {
    await expect(collectArchivedEvidence(query, f.engine, f.archive, {
      onPage: () => { throw new Error('observer interrupted') } })).rejects.toThrow('observer interrupted')
    f.reopen()
    await collectArchivedEvidence(query, f.engine, f.archive)
    expect(f.executed).toEqual([0, 1, 2, 3])
  } finally { f.close() }
})

it('keeps rejection evidence as a terminal search without an identical retry loop', async () => {
  const f = fixture()
  try {
    let calls = 0
    f.engine.execute = (query) => {
      calls++
      return { query, status: 'rejected', data: { error: 'Unsupported operation' }, sourceIds: [],
        fingerprint: evidenceHash(query) }
    }
    expect(await collectArchivedEvidence({ operation: 'unsupported' }, f.engine, f.archive))
      .toMatchObject({ pages: 1, cursor: null })
    await collectArchivedEvidence({ operation: 'unsupported' }, f.engine, f.archive)
    expect(calls).toBe(1)
    expect([...f.archive.pages()][0].status).toBe('rejected')
  } finally { f.close() }
})
