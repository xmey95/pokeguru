import { expect, it } from 'vitest'
import { generateMatchup, reviseMatchup } from '../src/main/codex-matchup'
import { hasStrategyPhases, type MatchupDiscussion, type MetaSnapshot, type MatchupTournamentEvidence } from '../src/shared/meta-matchups'
import type { AiRunConfig } from '../src/shared/ai'

const live = process.env.POKEGURU_CODEX_PHASES_LIVE === '1' ? it : it.skip

// Real Codex calls; deliberately synthetic context verifies the contract, not competitive quality or data sources.
live('generates and revises three phases through the real isolated Codex runner', async () => {
  const opponent = { id: 'contract-fixture', name: 'Avversario di prova senza lista disponibile',
    share: 0, points: 0, url: 'https://limitlesstcg.com/decks' }
  const snapshot: MetaSnapshot = { id: 'contract-fixture', fetchedAt: new Date().toISOString(),
    period: 'Fixture sintetica del contratto, non metagame reale', sourceUrl: opponent.url,
    circuit: 'WESTERN', format: 'STANDARD', cached: false, decks: [opponent] }
  const evidence: MatchupTournamentEvidence = { status: 'unavailable', detail: 'Fixture: nessun dato di torneo fornito.',
    eventId: null, eventName: null, eventDate: null, eventUrl: null, eventLists: null, eventParticipants: null,
    matchedDeckId: null, matchedCompleteLists: 0, observedCards: [], sampleLists: [] }
  const config: AiRunConfig = { provider: 'codex', model: null, reasoningEffort: null, source: 'global' }
  const context = 'Fixture sintetica: nessuna lista o scheda verificata. CONTROLLO STANDARD: non determinabile. Fornisci solo un piano condizionato e dichiara i limiti, senza suggerire carte specifiche.'
  const sample = { url: null, cards: [] }
  const report = await generateMatchup('contract-test', 'fixture', context, snapshot, opponent, sample, config, evidence)
  expect(hasStrategyPhases(report.strategyPhases)).toBe(true)
  expect(report.promptAudit?.text).toBeDefined()
  const discussion: MatchupDiscussion = { id: 'contract-discussion', projectId: report.projectId, metaId: report.metaId,
    opponentId: opponent.id, deckHash: report.deckHash, parentId: null, current: true, createdAt: report.generatedAt,
    contextSummary: '', summarizedThrough: -1, turns: [{ id: 'first', feedback: null, changeSummary: null,
      createdAt: report.generatedAt, report }] }
  const revised = await reviseMatchup(discussion, 'Rendi esplicito quando rinunciare al piano senza dati sufficienti.',
    context, snapshot, opponent, sample, config, evidence)
  expect(hasStrategyPhases(revised.report.strategyPhases)).toBe(true)
  expect(revised.changeSummary.trim().length).toBeGreaterThan(0)
  expect(revised.report.strategy).toContain(revised.report.strategyPhases!.closing)
}, 400_000)
