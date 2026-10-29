import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { performance } from 'node:perf_hooks'
import { expect, it } from 'vitest'
import { ProjectStore } from '../src/main/project-store'
import { AiJobStore } from '../src/main/ai-job-store'
import { AiAnalysisWork } from '../src/main/ai-analysis-work'
import { createArchivedEvidenceEngine } from '../src/main/ai-evidence-snapshot'
import { runAiEvidenceQueries } from '../src/main/ai-evidence-queries'
import { CATALOG_SOURCE, type CatalogPrint, type CatalogView } from '../src/shared/catalog'
import type { TournamentSnapshot } from '../src/shared/tournament'

// Actual SQLite, compression, pagination and card dependency lookups; no model or network.
it.skipIf(process.env.POKEGURU_PERF !== '1')('measures broad local collection independently of model time', async () => {
  const count = Number(process.env.POKEGURU_PERF_ROWS ?? 2000)
  const folder = mkdtempSync(join(tmpdir(), 'pokeguru-collection-perf-'))
  const file = join(folder, 'data.sqlite')
  const projects = new ProjectStore(file), jobs = new AiJobStore(file)
  const project = projects.create({ name: 'Collection performance', format: 'STANDARD' })
  const job = jobs.start('thread-ask', project.id, 'thread')
  const work = new AiAnalysisWork(join(folder, job.id), jobs, job.id, new AbortController().signal)
  try {
    const prints: CatalogPrint[] = Array.from({ length: 500 }, (_, i) => ({
      id: `sv10-${i}`, setId: 'sv10', setName: 'Fixture', localId: String(i), name: `Fixture Card ${i}`,
      category: 'Trainer', rarity: 'Common', regulationMark: 'I', variants: null,
      identityId: `fixture-${i}`, identityBasis: 'trainer-text',
      gameplay: { hp: null, types: [], evolveFrom: null, attacks: [], abilities: [],
        effect: `Draw ${i % 4 + 1} cards.`, trainerType: 'Item', weaknesses: [], resistances: [], retreat: null },
      imageBase: null, thumbnail: null, highImageAvailable: null, sourceUpdated: null,
      sourceUrl: `https://example.test/cards/${i}`, detailAt: '2026-10-28T00:00:00Z', error: null
    }))
    const catalog: CatalogView = { circuit: 'WESTERN', source: CATALOG_SOURCE, sourceLanguage: 'en',
      scope: { kind: 'standard-marks', setIds: ['sv10'], names: [] }, syncedAt: '2026-10-28T00:00:00Z', sets: [], prints }
    const event: TournamentSnapshot = {
      id: 'snapshot', eventId: 'event', fetchedAt: '2026-10-28T00:00:00Z', source: 'Limitless Play API',
      sourceUrl: 'https://example.test/event', publicUrl: 'https://example.test/event', name: 'Fixture',
      date: '2026-10-20', circuit: 'WESTERN', format: 'STANDARD', platform: 'PTCGL', isOnline: true,
      reportedPlayers: count, phases: [], cached: true,
      coverage: { returnedParticipants: count, availableLists: count, invalidLists: 0, missingLists: 0, complete60Lists: count },
      participations: Array.from({ length: count }, (_, i) => ({
        playerId: `p${i}`, playerName: 'Fixture', country: null, placing: i + 1,
        record: { wins: 3, losses: 1, ties: 1 }, deck: { id: 'fixture', name: 'Fixture Deck' },
        listStatus: 'available', cardTotal: 60,
        cards: Array.from({ length: 20 }, (_, c) => ({ category: 'trainer' as const, count: 3,
          name: `Fixture Card ${(i + c) % 500}`, set: 'SV10', number: String((i + c) % 500) }))
      }))
    }
    const snapshotStart = performance.now()
    const { engine } = createArchivedEvidenceEngine(work.archive, () => ({ catalog,
      window: { from: '2026-10-01', to: '2026-10-28' }, play: [event], main: [] }))
    const snapshotMs = performance.now() - snapshotStart
    const metrics = { eventQueryMs: 0, cardQueryMs: 0, persistMs: 0, cardReadMs: 0, cardsRead: 0,
      searchSummaryMs: 0, searchSummaries: 0, eventPages: 0 }
    const execute = engine.execute.bind(engine)
    engine.execute = (query) => {
      const start = performance.now(), result = execute(query)
      if ((query as { operation: string }).operation === 'events.search') {
        metrics.eventQueryMs += performance.now() - start; metrics.eventPages++
      } else metrics.cardQueryMs += performance.now() - start
      return result
    }
    const archive = work.archive, append = archive.appendPage.bind(archive)
    archive.appendPage = (...args) => {
      const start = performance.now(), result = append(...args)
      metrics.persistMs += performance.now() - start; return result
    }
    const records = archive.records.bind(archive)
    archive.records = function* (...args) {
      const iterator = records(...args)
      while (true) {
        const start = performance.now(), item = iterator.next()
        if (args[0] === 'card') { metrics.cardReadMs += performance.now() - start; if (!item.done) metrics.cardsRead++ }
        if (item.done) return
        yield item.value
      }
    }
    const summary = archive.searchSummary.bind(archive)
    archive.searchSummary = (...args) => {
      const start = performance.now(), result = summary(...args)
      metrics.searchSummaryMs += performance.now() - start; metrics.searchSummaries++; return result
    }
    let plans = 0
    const start = performance.now()
    const trace = await runAiEvidenceQueries('Study the local event field', {}, engine, async () => {
      return { queries: plans++ ? [] : [{ operation: 'events.search', deckName: 'Fixture Deck', limit: 4 }],
        continueAfterResults: false }
    }, { archive, onTrace: (trace) => work.evidence(trace),
      onCollection: (progress, force) => work.collecting(progress, force) })
    const collectionMs = performance.now() - start
    expect(archive.counts()).toMatchObject({ occurrences: count, cards: 500, completedSearches: trace.requests.length })
    expect([...archive.deckStatistics()].reduce((total, deck) => total + deck.occurrences, 0)).toBe(count)
    const result = { rows: count, snapshotMs, collectionMs, ...metrics, counts: archive.counts() }
    console.log(JSON.stringify(result))
    if (process.env.POKEGURU_PERF_OUTPUT) writeFileSync(process.env.POKEGURU_PERF_OUTPUT, JSON.stringify(result, null, 2))
  } finally { work.close(); jobs.close(); projects.close(); rmSync(folder, { recursive: true, force: true }) }
}, 300_000)
