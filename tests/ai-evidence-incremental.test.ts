import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { expect, it, vi } from 'vitest'
import { ProjectStore } from '../src/main/project-store'
import { AiJobStore } from '../src/main/ai-job-store'
import { AiEvidenceArchive, evidenceHash, exactDeckIdentity } from '../src/main/ai-evidence-archive'
import { prepareEvidenceManifest, readEvidenceBatch, validateEvidenceManifest } from '../src/main/ai-evidence-manifest'
import { evidenceBatches, type EvidenceRecord } from '../src/main/ai-evidence-partition'
import { AiAnalysisWork, analyzeLargeEvidence } from '../src/main/ai-analysis-work'
import { bindEvidenceArchive, refreshEvidenceArchive } from '../src/main/ai-evidence-access'
import { AiFailure } from '../src/main/ai-failure'
import type { AiEvidenceQueryTrace } from '../src/shared/ai-evidence'
import type { AiRunConfig } from '../src/shared/ai'

function fixture() {
  const folder = mkdtempSync(join(tmpdir(), 'pokeguru-incremental-'))
  const file = join(folder, 'data.sqlite')
  const projects = new ProjectStore(file), jobs = new AiJobStore(file)
  const project = projects.create({ name: 'Incremental', format: 'STANDARD' })
  const job = jobs.start('thread-ask', project.id, 'resource')
  let archive = new AiEvidenceArchive(file, job)
  let sequence = 0
  return { folder, file, projects, jobs, job, get archive() { return archive },
    addCards(ids: string[], effect = 'rule '.repeat(1500)) {
      const query = { operation: 'catalog.search', fixture: sequence++ }
      const search = archive.search(query)
      const data = { matches: ids.map((printId) => ({ printId, name: printId, gameplay: { effect } })), remaining: 0 }
      archive.appendPage(search.key, search.cursor, { query, status: 'ok', data,
        sourceIds: ids.map((id) => `card:${id}`), fingerprint: evidenceHash(data) }, null)
    },
    addEvent(player: string) {
      const query = { operation: 'events.search', fixture: sequence++ }
      const search = archive.search(query)
      const cards = ['4 Example Card MEG 001', '56 Basic Energy SVE 001']
      const occurrence = { id: 'event', participationId: player, listUrl: `https://example.test/${player}`,
        date: '2026-10-29', placing: player === 'a' ? 1 : 8, record: { wins: 3, losses: 1, ties: 0 } }
      const data = { lists: [{ ...occurrence, deck: 'Example', cards, occurrences: [occurrence] }], remaining: 0 }
      archive.appendPage(search.key, search.cursor, { query, status: 'ok', data, sourceIds: ['list:example'],
        fingerprint: evidenceHash(data) }, null)
      return exactDeckIdentity(cards)
    },
    reopen() { archive.close(); archive = new AiEvidenceArchive(file, job) },
    close() { archive.close(); jobs.close(); projects.close(); rmSync(folder, { recursive: true, force: true }) }
  }
}

it('keeps the first partition unchanged, seals old batches, and appends early keys without reading old originals', () => {
  const f = fixture()
  try {
    f.addCards(Array.from({ length: 60 }, (_, index) => `card-${String(index).padStart(3, '0')}`))
    const inventory = f.archive.analysisInventory()
    const expected = [...evidenceBatches(inventory.inputs.map((input) => f.archive.readAnalysisInput(input)), 60_000)]
    const first = prepareEvidenceManifest(f.archive, 60_000, inventory)
    expect(first.batches.map((batch) => readEvidenceBatch(f.archive, batch))).toEqual(expected)
    const hydrate = vi.spyOn(f.archive, 'readAnalysisInput')
    f.addCards(['000-early'])
    const next = prepareEvidenceManifest(f.archive, 60_000)
    expect(next.batches.slice(0, first.batches.length)).toEqual(first.batches)
    expect(next.batches.length).toBe(first.batches.length + 1)
    expect(hydrate.mock.calls.map(([input]) => input.key)).toEqual(expect.arrayContaining(['card:000-early']))
    expect(hydrate.mock.calls.every(([input]) => input.key === 'card:000-early' || input.type === 'search')).toBe(true)
    validateEvidenceManifest(next)
    expect(next.inputs.length).toBe(first.inputs.length + 2)
    hydrate.mockRestore()
    f.reopen()
    const noRead = vi.spyOn(f.archive, 'readAnalysisInput').mockImplementation(() => { throw new Error('Unchanged original read') })
    expect(prepareEvidenceManifest(f.archive, 60_000)).toEqual(next)
    expect(noRead).not.toHaveBeenCalled()
  } finally { f.close() }
})

const config: AiRunConfig = { provider: 'codex', model: null, reasoningEffort: null, source: 'global' }
function traceFor(archive: AiEvidenceArchive): AiEvidenceQueryTrace {
  const trace: AiEvidenceQueryTrace = { schemaVersion: 1, requests: [], responseBytes: 0, durationMs: 0,
    planningRounds: 1, exhausted: false, engine: { operations: [],
      catalog: { syncedAt: null, expected: 60, indexed: 60, gameplay: 60 }, eventWindow: { from: '2026-10-01', to: '2026-10-29' } } }
  bindEvidenceArchive(trace, archive)
  return trace
}
function promptRecords(prompt: string): EvidenceRecord[] {
  return JSON.parse(prompt.split('\nDATI: ')[1].split('\nRestituisci')[0])
}
function answer(prompt: string) {
  return { summary: 'Sintesi controllata delle prove ricevute.', limitations: 'Campione locale, non winrate.',
    sourceIds: [...new Set(promptRecords(prompt).flatMap((record) => record.sourceIds))].slice(0, 20),
    __usage: { inputTokens: 100, cachedInputTokens: 0, outputTokens: 20 } }
}

it('reuses a final checkpoint without original reads and analyzes only appended records, preserving model and effort', async () => {
  const f = fixture(), work = new AiAnalysisWork(join(f.folder, f.job.id), f.jobs, f.job.id, new AbortController().signal)
  try {
    f.addCards(Array.from({ length: 60 }, (_, index) => `card-${String(index).padStart(3, '0')}`))
    const trace = traceFor(f.archive)
    let calls = 0, leaves = 0
    const model = async (prompt: string) => { calls++; if (prompt.includes('LIVELLO: 0\n')) leaves++; return answer(prompt) }
    await analyzeLargeEvidence(trace, 'Confronta tutto', config, work, model)
    const initialCalls = calls, initialLeaves = leaves
    expect(initialLeaves).toBe(prepareEvidenceManifest(f.archive, 60_000).batches.length)
    const analysis = structuredClone(trace.analysis)
    const reads = vi.spyOn(f.archive, 'readAnalysisInput').mockImplementation(() => { throw new Error('Unexpected original read') })
    const scans = vi.spyOn(f.archive, 'records').mockImplementation(function* () { throw new Error('Unexpected scan') })
    await analyzeLargeEvidence(trace, 'Confronta tutto', config, work, model)
    expect(calls).toBe(initialCalls)
    expect(trace.analysis).toEqual(analysis)
    expect(reads).not.toHaveBeenCalled(); expect(scans).not.toHaveBeenCalled()
    reads.mockRestore(); scans.mockRestore()
    f.addCards(['000-before']); refreshEvidenceArchive(trace)
    await analyzeLargeEvidence(trace, 'Confronta tutto', config, work, model)
    expect(leaves - initialLeaves).toBe(1)
    expect(calls - initialCalls).toBe(2)
    expect(trace.analysis?.records).toBe(63) // 61 cards and two query summaries.
    const beforeConfig = leaves
    await analyzeLargeEvidence(trace, 'Confronta tutto', { ...config, model: 'gpt-test', reasoningEffort: 'high' }, work, model)
    expect(leaves - beforeConfig).toBe(initialLeaves + 1)
    const beforeQuestion = leaves
    await analyzeLargeEvidence(trace, 'Confronta tutte le alternative', config, work, model)
    expect(leaves - beforeQuestion).toBe(initialLeaves + 1)
    expect(config).toEqual({ provider: 'codex', model: null, reasoningEffort: null, source: 'global' })
    const lineage = [...f.archive.values<{ inputRecords: string[] }>(`analysis:${trace.analysis!.generation}`)]
    expect(new Set(lineage.flatMap((entry) => entry.value.inputRecords))).toEqual(
      new Set(f.archive.analysisInventory().inputs.map((input) => input.key)))
  } finally { work.close(); f.close() }
})

it('resumes adaptive splits and completed incremental leaves after a pause without temporary stage files', async () => {
  const f = fixture(), controller = new AbortController()
  let work = new AiAnalysisWork(join(f.folder, f.job.id), f.jobs, f.job.id, controller.signal)
  try {
    f.addCards(Array.from({ length: 22 }, (_, index) => `card-${String(index).padStart(3, '0')}`))
    const trace = traceFor(f.archive), completed = new Set<string>(), failed = new Set<string>()
    let pause = true, successfulLeaves = 0
    const model = async (prompt: string) => {
      const records = promptRecords(prompt)
      if (Buffer.byteLength(JSON.stringify(records)) > 9000) {
        expect(failed.has(prompt)).toBe(false); failed.add(prompt)
        throw new AiFailure('context-limit', 'Controlled context limit')
      }
      if (pause && successfulLeaves === 3) { controller.abort('pause'); throw new Error('pause') }
      if (prompt.includes('LIVELLO: 0\n')) {
        expect(completed.has(prompt)).toBe(false)
        completed.add(prompt); successfulLeaves++
      }
      return answer(prompt)
    }
    await expect(analyzeLargeEvidence(trace, 'Tutte le prove', config, work, model)).rejects.toMatchObject({ code: 'paused' })
    expect(completed.size).toBe(3)
    work.close(); f.jobs.suspend(f.job.id, 'Pausa test'); f.reopen(); f.jobs.resume(f.job.id)
    work = new AiAnalysisWork(join(f.folder, f.job.id), f.jobs, f.job.id, new AbortController().signal)
    const resumed = traceFor(f.archive)
    pause = false
    await analyzeLargeEvidence(resumed, 'Tutte le prove', config, work, model)
    expect(resumed.analysis?.records).toBe(23)
    expect(failed.size).toBeGreaterThan(0)
    expect(f.jobs.diagnostics(f.job.id)?.cacheHits).toBeGreaterThanOrEqual(3)
    const noCall = vi.fn(async () => { throw new Error('Completed checkpoint must not execute') })
    await analyzeLargeEvidence(resumed, 'Tutte le prove', config, work, noCall)
    expect(noCall).not.toHaveBeenCalled()
  } finally { work.close(); f.close() }
})

it('fingerprints metadata without decompressing originals and includes query pages, completion and statistics', () => {
  const f = fixture()
  try {
    f.addCards(['card-one'])
    const deckKey = f.addEvent('a')
    const first = f.archive.analysisInventory()
    const noGet = vi.spyOn(f.archive as unknown as { get: () => unknown }, 'get').mockImplementation(() => {
      throw new Error('Metadata must not decompress originals')
    })
    expect(f.archive.analysisInventory()).toEqual(first)
    noGet.mockRestore()
    f.addEvent('b')
    const next = f.archive.analysisInventory()
    const fingerprint = (inventory: typeof first, key: string) => inventory.inputs.find((input) => input.key === key)?.fingerprint
    expect(fingerprint(next, 'card:card-one')).toBe(fingerprint(first, 'card:card-one'))
    expect(fingerprint(next, `deck:${deckKey}`)).toBe(fingerprint(first, `deck:${deckKey}`))
    expect(fingerprint(next, `statistics:${deckKey}`)).not.toBe(fingerprint(first, `statistics:${deckKey}`))
    const stats = f.archive.readAnalysisInput(next.inputs.find((input) => input.key === `statistics:${deckKey}`)!)
    expect(stats.data).toMatchObject({ occurrences: 2, fieldRecord: { wins: 6, losses: 2, denominator: 8 } })
    const query = { operation: 'catalog.search', terms: ['empty'] }
    const search = f.archive.search(query)
    const pending = f.archive.analysisInventory().inputs.find((input) => input.key === `search:${search.key}`)!
    f.archive.appendPage(search.key, search.cursor, { query, status: 'ok', data: { matches: [], remaining: 0 },
      sourceIds: [], fingerprint: evidenceHash('empty') }, null)
    const complete = f.archive.analysisInventory().inputs.find((input) => input.key === pending.key)!
    expect(complete.fingerprint).not.toBe(pending.fingerprint)
    expect(f.archive.readAnalysisInput(complete).data).toMatchObject({ data: { completed: true, pages: 1 } })
  } finally { f.close() }
})

it('invalidates changed or removed inputs without shifting unrelated batches and rejects stale hydration', () => {
  const f = fixture()
  try {
    f.addCards(Array.from({ length: 40 }, (_, index) => `card-${String(index).padStart(3, '0')}`))
    const first = prepareEvidenceManifest(f.archive, 60_000)
    const changedKey = 'card:card-001'
    const touched = first.batches.find((batch) => batch.members.some((member) => member.input.key === changedKey))!
    f.archive.saveValue('test-correction', 'one', { printId: 'card-001', name: 'Corrected', gameplay: { effect: 'corrected '.repeat(900) } })
    const db = new DatabaseSync(f.file)
    try {
      db.prepare(`UPDATE ai_evidence_records SET object_hash = (SELECT object_hash FROM ai_evidence_values
        WHERE job_id = ? AND role = 'test-correction' AND key = 'one') WHERE job_id = ? AND key = ?`)
        .run(f.job.id, f.job.id, changedKey)
      db.prepare('DELETE FROM ai_evidence_records WHERE job_id = ? AND key = ?').run(f.job.id, 'card:card-039')
    } finally { db.close() }
    expect(() => readEvidenceBatch(f.archive, touched)).toThrow('non corrisponde')
    const changed = prepareEvidenceManifest(f.archive, 60_000)
    expect(changed.fingerprint).not.toBe(first.fingerprint)
    expect(changed.inputs.some((input) => input.key === 'card:card-039')).toBe(false)
    expect(changed.batches.some((batch) => batch.id === touched.id)).toBe(false)
    for (const batch of first.batches.filter((batch) => batch.members.every((member) =>
      ![changedKey, 'card:card-039'].includes(member.input.key))))
      expect(changed.batches).toContainEqual(batch)
    validateEvidenceManifest(changed)
  } finally { f.close() }
})

it('preserves exact Unicode fragment coverage and detects missing, overlapping and duplicated members', () => {
  const f = fixture()
  try {
    const effect = '中文 🐉\n"'.repeat(12_000)
    f.addCards(['huge'], effect)
    const manifest = prepareEvidenceManifest(f.archive, 9000)
    const delivered = manifest.batches.flatMap((batch) => readEvidenceBatch(f.archive, batch))
    const fragments = delivered.filter((record) => (record.data as { recordKey?: string }).recordKey === 'card:huge')
      .map((record) => record.data as { start: number; text: string })
    expect(JSON.parse(fragments.sort((a, b) => a.start - b.start).map((fragment) => fragment.text).join('')))
      .toMatchObject({ original: { gameplay: { effect } } })
    const missing = structuredClone(manifest)
    missing.batches.shift()
    expect(() => validateEvidenceManifest(missing)).toThrow('frammenti')
    const duplicate = structuredClone(manifest)
    duplicate.batches.push(duplicate.batches[0])
    expect(() => validateEvidenceManifest(duplicate)).toThrow('frammenti')
    const overlap = structuredClone(manifest)
    overlap.batches.flatMap((batch) => batch.members).find((member) => member.fragment && member.fragment.start > 0)!.fragment!.start--
    expect(() => validateEvidenceManifest(overlap)).toThrow('frammenti')
    f.addCards(['000-before-huge'])
    const next = prepareEvidenceManifest(f.archive, 9000)
    expect(next.batches.slice(0, manifest.batches.length)).toEqual(manifest.batches)
    validateEvidenceManifest(next)
  } finally { f.close() }
})

it('keeps manifests isolated by job and budget without overwriting legacy analysis checkpoints', () => {
  const f = fixture()
  try {
    f.addCards(['card-one', 'card-two'])
    f.archive.saveValue('analysis:legacy', '0:0', { summary: 'Legacy completed output' })
    const first = prepareEvidenceManifest(f.archive, 60_000)
    const smaller = prepareEvidenceManifest(f.archive, 9000)
    expect(smaller.fingerprint).not.toBe(first.fingerprint)
    expect(f.archive.value('analysis:legacy', '0:0')).toEqual({ summary: 'Legacy completed output' })
    const other = f.jobs.start('thread-ask', f.job.projectId, 'other-resource')
    const isolated = new AiEvidenceArchive(f.file, other)
    try {
      expect(isolated.latestValue('analysis-manifest:v1:60000')).toBeUndefined()
      expect(prepareEvidenceManifest(isolated, 60_000).inputs).toEqual([])
    } finally { isolated.close() }
  } finally { f.close() }
})

it.each(['lineage', 'calls-only'])('continues legacy %s checkpoints using completed calls after losing stage files', async (mode) => {
  const f = fixture(), directory = join(f.folder, f.job.id)
  let work = new AiAnalysisWork(directory, f.jobs, f.job.id, new AbortController().signal)
  try {
    f.addCards(Array.from({ length: 20 }, (_, index) => `legacy-${index}`))
    // Produce genuine adaptive-v2 prompts/cache results, then remove the new
    // policy marker to reproduce a job saved before the incremental algorithm.
    f.archive.saveValue('analysis-policy', 'algorithm', 'adaptive-v2')
    const trace = traceFor(f.archive)
    await analyzeLargeEvidence(trace, 'Legacy question', config, work, async (prompt) => answer(prompt))
    const original = structuredClone(trace.analysis)
    work.close()
    rmSync(directory, { recursive: true, force: true })
    const db = new DatabaseSync(f.file)
    try {
      db.prepare("DELETE FROM ai_evidence_values WHERE job_id = ? AND role = 'analysis-policy'").run(f.job.id)
      if (mode === 'calls-only') db.prepare("DELETE FROM ai_evidence_values WHERE job_id = ? AND role LIKE 'analysis:%'").run(f.job.id)
    } finally { db.close() }
    work = new AiAnalysisWork(directory, f.jobs, f.job.id, new AbortController().signal)
    const noCall = vi.fn(async () => { throw new Error('Legacy cache must be retained') })
    await analyzeLargeEvidence(trace, 'Legacy question', config, work, noCall)
    expect(noCall).not.toHaveBeenCalled()
    expect(f.archive.value('analysis-policy', 'algorithm')).toBe('adaptive-v2')
    expect(trace.analysis).toEqual(original)
    expect(f.archive.latestValue('analysis-manifest:v1:60000')).toBeUndefined()
  } finally { work.close(); f.close() }
})
