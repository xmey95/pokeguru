import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { AiAnalysisWork, analyzeLargeEvidence } from '../src/main/ai-analysis-work'
import { AiJobStore } from '../src/main/ai-job-store'
import { ProjectStore } from '../src/main/project-store'
import type { AiEvidenceQueryTrace } from '../src/shared/ai-evidence'

it.skipIf(process.env.POKEGURU_LIVE_CODEX !== '1')('batches and synthesizes a large fixture using real Codex', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'pokeguru-real-batches-'))
  const projects = new ProjectStore(join(folder, 'data.sqlite'))
  const jobs = new AiJobStore(join(folder, 'data.sqlite'))
  try {
    const project = projects.create({ name: 'Synthetic batch test', format: 'STANDARD' })
    const job = jobs.start('thread-ask', project.id, 'fixture')
    const matches = [1, 2, 3].map((index) => ({ printId: `fixture-${index}`,
      name: `Carta illustrativa ${index}`, note: 'Fixture sintetica: non è una carta reale.',
      observedCount: index * 10, padding: 'dato illustrativo ripetuto '.repeat(1600) }))
    const requests = [{ query: { operation: 'catalog.search' }, status: 'ok' as const, data: { matches },
      sourceIds: matches.map((card) => `card:${card.printId}`), fingerprint: 'real-fixture' }]
    const trace: AiEvidenceQueryTrace = { schemaVersion: 1, requests,
      responseBytes: Buffer.byteLength(JSON.stringify(requests)), durationMs: 0, planningRounds: 1,
      exhausted: false, engine: { operations: [], catalog: { syncedAt: null, expected: 3, indexed: 3,
        gameplay: 0 }, eventWindow: { from: '2026-10-01', to: '2026-10-28' } } }
    expect(trace.responseBytes).toBeGreaterThan(120_000)
    const question = 'Test su fixture sintetiche. Riassumi in due frasi tutti e tre gli observedCount con i rispettivi sourceIds. Il padding ripetuto non contiene fatti aggiuntivi. Non discutere vere regole del gioco.'
    const config = { provider: 'codex' as const, model: null, reasoningEffort: null, source: 'global' as const }
    const work = new AiAnalysisWork(join(folder, job.id), jobs, job.id, new AbortController().signal)
    await analyzeLargeEvidence(trace, question, config, work)
    expect(trace.analysis).toMatchObject({ sourceCount: 3, records: 3, batches: 4 })
    expect(new Set(trace.analysis?.sourceIds)).toEqual(new Set(requests[0].sourceIds))
    expect(jobs.get(job.id)?.progress?.diagnostics?.calls?.every((call) => call.status === 'succeeded')).toBe(true)
    await analyzeLargeEvidence(trace, question, config, work)
    expect(jobs.get(job.id)?.progress?.diagnostics?.cacheHits).toBe(4)
    console.log('Real Codex: three complete batches, one synthesis, four cached calls reused.')
  } finally { jobs.close(); projects.close(); rmSync(folder, { recursive: true, force: true }) }
}, 600_000)
