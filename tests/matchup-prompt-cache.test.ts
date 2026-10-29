import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative, resolve } from 'node:path'
import { expect, it, vi } from 'vitest'
import { AiAnalysisWork } from '../src/main/ai-analysis-work'
import { AiJobStore } from '../src/main/ai-job-store'
import { ProjectStore } from '../src/main/project-store'
import { bindEvidenceArchive } from '../src/main/ai-evidence-access'
import { draftNeedsEvidenceReview, prepareEvidenceDelivery } from '../src/main/ai-evidence-delivery'
import { matchupGenerationPrompt, matchupRevisionPrompt, matchupHistoryContext } from '../src/main/codex-matchup'
import type { AiEvidenceEngine } from '../src/main/ai-evidence-engine'
import type { CatalogEvidenceMatch } from '../src/main/catalog-evidence-search'
import type { AiEvidenceQueryTrace } from '../src/shared/ai-evidence'
import type { AiRunConfig } from '../src/shared/ai'
import type { AiJobKind } from '../src/shared/ai-job'
import type { MatchupDiscussion, MatchupReport, MetaDeck, MetaSnapshot } from '../src/shared/meta-matchups'
import { matchupTournamentEvidence } from '../src/shared/matchup-evidence'

const config: AiRunConfig = { provider: 'codex', model: null, reasoningEffort: null, source: 'global' }
const opponent: MetaDeck = { id: 'fixture', name: 'Synthetic archetype', points: 10, share: 5,
  url: 'https://example.test/meta/fixture' }
const meta: MetaSnapshot = { id: 'meta', fetchedAt: '2026-10-29T00:00:00.000Z',
  sourceUrl: 'https://example.test/meta', period: 'Synthetic fixture', circuit: 'WESTERN',
  format: 'STANDARD', decks: [opponent], cached: false }
const sample = { url: null, cards: ['1 Card a QA 1'] }
const tournament = matchupTournamentEvidence(meta, opponent, null)
const gameplay = { hp: null, types: [], evolveFrom: null, attacks: [], abilities: [],
  effect: 'Draw 2 cards.', trainerType: 'Item', weaknesses: [], resistances: [], retreat: null }
const original: CatalogEvidenceMatch = { printId: 'a', identityId: 'a', name: 'Card a',
  sourceUrl: 'https://example.test/card/a', detailAt: '2026-10-29T00:00:00.000Z',
  comparableGameplay: true, gameplay, printedGameplay: structuredClone(gameplay),
  errataStatus: 'no-correction', errataSourceUrl: null, rarity: 'Common', variants: null,
  reason: 'exact-print', matchedTerms: [] }
const engine: AiEvidenceEngine = { describe: () => ({ operations: ['catalog.search'],
  catalog: { syncedAt: null, expected: 1, indexed: 1, gameplay: 1 },
  eventWindow: { from: '2026-10-01', to: '2026-10-29' } }),
cardTargets: (text) => text.includes('Card a') ? [{ name: 'Card a', printIds: ['a'] }] : [],
eventTargets: () => [], execute: () => { throw new Error('No extra collection is needed in this cache replay fixture.') } }

function trace(work: AiAnalysisWork): AiEvidenceQueryTrace {
  const value: AiEvidenceQueryTrace = { schemaVersion: 1, requests: [], responseBytes: 0,
    durationMs: 0, planningRounds: 1, exhausted: false, engine: engine.describe(),
    analysis: { schemaVersion: 1, records: 1, batches: 1, sourceCount: 1,
      summary: 'Card a draws 2 cards.', limitations: 'Synthetic fixture.', sourceIds: ['card:a'] } }
  bindEvidenceArchive(value, work.archive)
  prepareEvidenceDelivery(value, engine, ['1 Card a QA 1'])
  return value
}

it.each(['matchup-generate', 'matchup-revise', 'matchup-continue'] as const)(
  '%s recreates delivered originals before a persistent cache hit, without a second invocation', async (kind: AiJobKind) => {
    const tempRoot = resolve(tmpdir())
    const folder = mkdtempSync(join(tempRoot, 'pokeguru-matchup-prompt-cache-'))
    const database = join(folder, 'data.sqlite')
    const projects = new ProjectStore(database)
    let jobs = new AiJobStore(database)
    let work: AiAnalysisWork | undefined
    try {
      const project = projects.create({ name: 'Matchup cache fixture', format: 'STANDARD' })
      const job = jobs.start(kind, project.id, 'fixture')
      const directory = join(folder, job.id)
      work = new AiAnalysisWork(directory, jobs, job.id, new AbortController().signal)
      const query = { operation: 'catalog.search', printIds: ['a'] }
      const search = work.archive.search(query)
      work.archive.appendPage(search.key, search.cursor, { query, status: 'ok',
        data: { matches: [original], remaining: 0 }, sourceIds: ['card:a'], fingerprint: 'source-v1' }, null)
      const report: MatchupReport = { projectId: project.id, metaId: meta.id, opponentId: opponent.id,
        deckHash: 'deck', generatedAt: '2026-10-29T00:00:00.000Z', sampleDeckUrl: null,
        strengths: 'Card a draws 2 cards.', weaknesses: '', ourKeyCards: 'Card a', theirKeyCards: '',
        strategy: 'Card a draws 2 cards.', limitations: 'Synthetic fixture.' }
      const discussion: MatchupDiscussion = { id: 'discussion', projectId: project.id,
        metaId: meta.id, opponentId: opponent.id, deckHash: 'deck', parentId: null, current: true,
        createdAt: report.generatedAt, contextSummary: '', summarizedThrough: -1,
        turns: [{ id: 'turn', turnNo: 0, feedback: null, createdAt: report.generatedAt,
          report, changeSummary: null }] }
      const makePrompt = (input: AiEvidenceQueryTrace) => kind === 'matchup-revise'
        ? matchupRevisionPrompt(discussion, 'Check Card a.', '1 Card a QA 1', meta, opponent, sample, tournament, input)
        : matchupGenerationPrompt('1 Card a QA 1', meta, opponent, sample, tournament,
          kind === 'matchup-continue' ? matchupHistoryContext(discussion) : undefined, input)
      const first = trace(work)
      expect(first.deliveredCards).toBeUndefined()
      const prompt = makePrompt(first)
      expect(first.deliveredCards?.map((card) => card.printId)).toEqual(['a'])
      expect(prompt).toContain('Draw 2 cards.')
      expect(prompt).not.toContain('deliveredCards')
      const execute = vi.fn(async () => report)
      expect(await work.run('analysis', prompt, config, execute)).toEqual(report)
      expect(draftNeedsEvidenceReview(first, engine, report.strategy)).toBe(false)
      jobs.suspend(job.id, 'Controlled pause after a completed answer.')
      work.close()
      jobs.close()
      jobs = new AiJobStore(database)
      jobs.resume(job.id)
      work = new AiAnalysisWork(directory, jobs, job.id, new AbortController().signal)

      // Reopening creates a fresh trace. Merely selecting a source cannot satisfy delivery.
      const replay = trace(work)
      expect(replay.deliveredCards).toBeUndefined()
      expect(draftNeedsEvidenceReview(replay, engine, report.strategy)).toBe(true)
      const replayPrompt = makePrompt(replay)
      expect(replayPrompt).toBe(prompt)
      expect(replay.deliveredCards).toEqual(first.deliveredCards)
      expect(await work.run('analysis', replayPrompt, config, execute)).toEqual(report)
      expect(execute).toHaveBeenCalledTimes(1)
      expect(draftNeedsEvidenceReview(replay, engine, report.strategy)).toBe(false)
      expect(jobs.callMetrics(job.id)?.totals).toMatchObject({ attempts: 1, succeeded: 1, cacheHits: 1 })
    } finally {
      work?.close(); jobs.close(); projects.close()
      // Check the resolved deletion target stays inside the intended temp directory.
      const child = relative(tempRoot, resolve(folder))
      if (!child.startsWith('..') && !child.includes(':') && child.startsWith('pokeguru-matchup-prompt-cache-'))
        rmSync(folder, { recursive: true, force: true })
    }
  })
