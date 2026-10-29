import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { expect, it } from 'vitest'
import { ProjectStore } from '../src/main/project-store'
import { AiJobStore } from '../src/main/ai-job-store'
import { AiAnalysisWork, analyzeLargeEvidence } from '../src/main/ai-analysis-work'
import { evidenceHash } from '../src/main/ai-evidence-archive'
import { bindEvidenceArchive, refreshEvidenceArchive } from '../src/main/ai-evidence-access'
import type { AiEvidenceQueryTrace } from '../src/shared/ai-evidence'

it.skipIf(process.env.POKEGURU_AI_AUDIT !== '1')('audits real orchestration with synthetic model output and no network', async () => {
  mkdirSync(resolve('.verify'), { recursive: true })
  const folder = mkdtempSync(resolve('.verify/app178-audit-'))
  const file = join(folder, 'data.sqlite')
  const projects = new ProjectStore(file), jobs = new AiJobStore(file)
  const project = projects.create({ name: 'Synthetic audit', format: 'STANDARD' })
  const job = jobs.start('thread-ask', project.id, 'audit')
  const work = new AiAnalysisWork(join(folder, job.id), jobs, job.id, new AbortController().signal)
  const archive = work.archive
  const config = { provider: 'codex' as const, model: null, reasoningEffort: null, source: 'global' as const }
  const trace: AiEvidenceQueryTrace = { schemaVersion: 1, requests: [], responseBytes: 0,
    durationMs: 0, planningRounds: 1, exhausted: false,
    engine: { operations: [], catalog: { syncedAt: null, expected: 302, indexed: 302, gameplay: 302 },
      eventWindow: { from: '2026-10-01', to: '2026-10-29' } } }
  const addCards = (ids: string[]) => {
    const query = { operation: 'catalog.search', names: ids, limit: 12 }
    const search = archive.search(query)
    const data = { matches: ids.map((id) => ({ printId: id, name: `Card ${id}`,
      gameplay: { effect: 'rule '.repeat(1500) }, sourceUrl: `https://example.test/${id}` })), remaining: 0 }
    archive.appendPage(search.key, search.cursor, { query, status: 'ok', data,
      sourceIds: ids.map((id) => `card:${id}`), fingerprint: evidenceHash([query, data]) }, null)
  }
  const rows: unknown[] = []
  const run = async (label: string) => {
    refreshEvidenceArchive(trace)
    let calls = 0, batches = 0, syntheses = 0, inputBytes = 0, outputBytes = 0, recordReads = 0, recordPasses = 0
    let objectReads = 0, decodedJsonBytes = 0
    const storage = archive as unknown as { get(hash: string): unknown }
    const originalGet = storage.get.bind(archive)
    storage.get = (key: string) => {
      const value = originalGet(key)
      objectReads++; decodedJsonBytes += Buffer.byteLength(JSON.stringify(value))
      return value
    }
    const delivered = new Set<string>()
    const previousHits = jobs.diagnostics(job.id)?.cacheHits ?? 0
    const originalRecords = archive.records.bind(archive)
    archive.records = function* (...args: Parameters<typeof originalRecords>) {
      recordPasses++
      for (const record of originalRecords(...args)) { recordReads++; yield record }
    }
    const started = performance.now()
    try {
      await analyzeLargeEvidence(trace, 'Confronta tutte le regole e segnala le lacune.', config, work, async (prompt) => {
        calls++; inputBytes += Buffer.byteLength(prompt)
        const leaf = prompt.includes('LIVELLO: 0\n')
        if (leaf) batches++; else syntheses++
        const group = JSON.parse(prompt.split('\nDATI: ')[1].split('\nRestituisci')[0]) as {sourceIds:string[]}[]
        const ids = [...new Set(group.flatMap((record) => record.sourceIds))]
        if (leaf) ids.forEach((id) => delivered.add(id))
        const value = { summary: 'Risposta sintetica per misurare la sola orchestrazione.',
          limitations: 'Non è una valutazione di qualità o latenza Codex.', sourceIds: ids.slice(0, 32),
          __usage: { inputTokens: 100, cachedInputTokens: 0, outputTokens: 20 } }
        outputBytes += Buffer.byteLength(JSON.stringify(value))
        return value
      })
    } finally { archive.records = originalRecords; storage.get = originalGet }
    const row = { label, cards: archive.counts().cards, responseBytes: trace.responseBytes,
      calls, batches, syntheses, cacheHits: (jobs.diagnostics(job.id)?.cacheHits ?? 0) - previousHits,
      inputBytes, outputBytes, recordReads, recordPasses, objectReads, decodedJsonBytes, newlyDeliveredSources: delivered.size,
      recordedCalls: jobs.diagnostics(job.id)?.calls?.length ?? 0,
      localElapsedMs: Math.round((performance.now() - started) * 100) / 100 }
    rows.push(row)
    return row
  }
  try {
    addCards(Array.from({length:300}, (_, i) => `card-${String(i).padStart(4, '0')}`))
    bindEvidenceArchive(trace, archive)
    const first = await run('initial_300_cards')
    expect(first.newlyDeliveredSources).toBe(300)
    expect(first.calls).toBeGreaterThan(40)
    const identical = await run('identical_replay')
    expect(identical.calls).toBe(0)
    addCards(['zzzz-late'])
    const late = await run('append_one_late_key')
    expect(late.cards).toBe(301)
    addCards(['0000-early'])
    const early = await run('append_one_early_key')
    expect(early.cards).toBe(302)
    if (process.env.POKEGURU_AI_AUDIT_BASELINE === '1') expect(early.batches).toBeGreaterThan(late.batches)
    else { expect(early.batches).toBe(1); expect(early.syntheses).toBe(1) }
    writeFileSync(process.env.POKEGURU_AI_AUDIT_OUTPUT ?? '.verify/app178-ai-audit-metrics.json', JSON.stringify({
      audit: 'APP-178', date: '2026-10-29', node: process.version, platform: process.platform,
      kind: 'Real SQLite/archive/partition/cache with synthetic model output; no Codex or network calls',
      fixture: '300 distinct cards, 7500 ASCII effect characters each; then one late and one early ordered key',
      limits: 'Single local instrumented run. Bytes are not tokens. Timings exclude real model latency. No quality claim.',
      rows }, null, 2) + '\n')
    console.log(JSON.stringify(rows))
  } finally { work.close(); jobs.close(); projects.close() }
}, 60_000)
