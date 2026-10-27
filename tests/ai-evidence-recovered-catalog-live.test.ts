import { DatabaseSync } from 'node:sqlite'
import { expect, it } from 'vitest'
import { createAiEvidenceEngine } from '../src/main/ai-evidence-engine'
import { runAiEvidenceQueries } from '../src/main/ai-evidence-queries'
import { CATALOG_SOURCE, type CatalogPrint, type CatalogView } from '../src/shared/catalog'

// Opt-in, read-only audit. The path is supplied by the operator and is never
// written to the test output or committed into a fixture.
it.skipIf(!process.env.POKEGURU_RECOVERED_CATALOG_DB)(
  'delivers Dragapult ex and Brave Bangle from a full local catalog', async () => {
    const database = new DatabaseSync(process.env.POKEGURU_RECOVERED_CATALOG_DB!, { readOnly: true })
    let prints: CatalogPrint[]
    try {
      prints = (database.prepare('SELECT payload FROM catalog_prints').all() as { payload: string }[])
        .map((row) => JSON.parse(row.payload) as CatalogPrint)
    } finally { database.close() }
    const catalog: CatalogView = { circuit: 'WESTERN', source: CATALOG_SOURCE,
      sourceLanguage: 'en', scope: { kind: 'standard-marks', setIds: [], names: [] },
      syncedAt: '2026-10-27T00:00:00Z', sets: [], prints }
    const engine = createAiEvidenceEngine(catalog, [], [],
      { from: '2026-10-01', to: '2026-10-27' })
    const trace = await runAiEvidenceQueries('Come cambiano le soglie?', {}, engine,
      async () => ({ queries: [], continueAfterResults: false }),
      { contextTexts: ['La proposta precedente confrontava Brave Bangle con Dragapult ex.'] })
    expect(trace.cardTargets?.map((target) => [target.name, target.status]))
      .toEqual(expect.arrayContaining([['Brave Bangle', 'supplied'],
        ['Dragapult ex', 'supplied']]))
    expect(trace.requests.flatMap((result) => result.sourceIds).length).toBeGreaterThanOrEqual(2)
    expect(trace.exhausted).toBe(false)
  })
