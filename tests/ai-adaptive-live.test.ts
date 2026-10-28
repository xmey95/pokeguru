import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { AiAnalysisWork, analyzeLargeEvidence } from '../src/main/ai-analysis-work'
import { runAiEvidenceQueries } from '../src/main/ai-evidence-queries'
import { evidenceHash } from '../src/main/ai-evidence-archive'
import { AiJobStore } from '../src/main/ai-job-store'
import { ProjectStore } from '../src/main/project-store'
import type { AiEvidenceEngine } from '../src/main/ai-evidence-engine'

it.skipIf(process.env.POKEGURU_LIVE_CODEX !== '1')('analyzes all local fixture records with real Codex and verified hierarchy', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'pokeguru-adaptive-live-')), file = join(folder, 'data.sqlite')
  const projects = new ProjectStore(file), jobs = new AiJobStore(file)
  let work: AiAnalysisWork | undefined
  try {
    const project = projects.create({ name: 'Live isolated analysis', format: 'STANDARD' })
    const job = jobs.start('thread-ask', project.id, 'thread')
    work = new AiAnalysisWork(join(folder, job.id), jobs, job.id, new AbortController().signal)
    const engine: AiEvidenceEngine = {
      describe: () => ({ operations: ['catalog.search'], catalog: { syncedAt: null, expected: 30, indexed: 30, gameplay: 30 },
        eventWindow: { from: '2026-10-01', to: '2026-10-28' } }),
      cardTargets: () => [], eventTargets: () => [],
      execute(input) {
        const query = { offset: 0, limit: 4, ...input as object }
        const matches = Array.from({ length: Math.min(query.limit, 30 - query.offset) }, (_, i) => {
          const index = query.offset + i
          return { printId: `fixture-${index}`, name: `Campione illustrativo ${index}`, comparableGameplay: true,
            sourceUrl: null, gameplay: { effect: `Valore osservato: ${index}. Dati sintetici di test, non una carta reale. ` +
              'Descrizione illustrativa ripetuta senza nuove osservazioni. '.repeat(75) } }
        })
        const data = { totalMatches: 30, offset: query.offset, remaining: Math.max(0, 30 - query.offset - matches.length), matches }
        return { query, data, sourceIds: matches.map((card) => `card:${card.printId}`), status: 'ok', fingerprint: evidenceHash(data) }
      }
    }
    const trace = await runAiEvidenceQueries('Riepiloga i campioni illustrativi.', {}, engine,
      async () => ({ queries: [{ operation: 'catalog.search', terms: ['fixture'], limit: 4 }], continueAfterResults: false }),
      { archive: work.archive })
    expect(trace.responseBytes).toBeGreaterThan(120_000)
    await analyzeLargeEvidence(trace, 'Confronta tutti i 30 campioni illustrativi, preservando intervallo dei valori e limiti; non sono carte reali.',
      { provider: 'codex', source: 'global', model: null, reasoningEffort: null }, work)
    expect(trace.analysis).toMatchObject({ records: 31, sourceCount: 30 })
    expect(trace.analysis!.batches).toBeGreaterThan(1)
    const lineage = [...work.archive.values<{ inputRecords: string[] }>(`analysis:${trace.analysis!.generation}`)]
    const covered = new Set(lineage.flatMap((entry) => entry.value.inputRecords).filter((key) => key.startsWith('card:')))
    expect(covered.size).toBe(30)
    expect(trace.analysis!.sourceIds.every((id) => /^card:fixture-\d+$/.test(id))).toBe(true)
    console.log('Real Codex adaptive analysis:', JSON.stringify({ records: trace.analysis!.records,
      batches: trace.analysis!.batches, originalBytes: trace.responseBytes, cited: trace.analysis!.sourceIds.length,
      summary: trace.analysis!.summary, limitations: trace.analysis!.limitations }))
  } finally { work?.close(); jobs.close(); projects.close(); rmSync(folder, { recursive: true, force: true }) }
}, 600_000)
