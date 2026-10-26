import { expect, it } from 'vitest'
import { createAiEvidenceEngine } from '../src/main/ai-evidence-engine'
import { runAiEvidenceQueries } from '../src/main/ai-evidence-queries'
import { generateMatchup } from '../src/main/codex-matchup'
import { CATALOG_SOURCE, type CatalogView } from '../src/shared/catalog'
import type { AiPromptAudit } from '../src/shared/ai-evidence'
import type { MatchupTournamentEvidence, MetaSnapshot } from '../src/shared/meta-matchups'

it.skipIf(process.env.POKEGURU_LIVE_CODEX !== '1')('generates a Matchup with exact local query results and prompt audit', async () => {
  const catalog: CatalogView = { circuit: 'WESTERN', source: CATALOG_SOURCE,
    sourceLanguage: 'en', scope: { kind: 'standard-marks', setIds: ['me01'], names: [] },
    syncedAt: '2026-10-25T00:00:00Z', sets: [], prints: [{ id: 'me01-114',
      setId: 'me01', setName: 'Mega Evolution', localId: '114', name: "Boss's Orders",
      category: 'Trainer', rarity: 'Rare', regulationMark: 'I', variants: null,
      identityId: 'boss-orders', identityBasis: 'trainer-text',
      gameplay: { hp: null, types: [], evolveFrom: null, attacks: [], abilities: [],
        effect: "Switch 1 of your opponent's Benched Pokémon with their Active Pokémon.",
        trainerType: 'Supporter', weaknesses: [], resistances: [], retreat: null },
      imageBase: null, thumbnail: null, highImageAvailable: null, sourceUpdated: null,
      sourceUrl: 'https://api.tcgdex.net/v2/en/cards/me01-114',
      detailAt: '2026-10-25T00:00:00Z', error: null }] }
  const engine = createAiEvidenceEngine(catalog, [], [],
    { from: '2026-10-01', to: '2026-10-25' })
  const aiQueries = await runAiEvidenceQueries('Valuta Boss’s Orders ME01 114', {}, engine,
    async () => ({ continueAfterResults: false,
      queries: [{ operation: 'catalog.search', printIds: ['me01-114'] }] }))
  const meta: MetaSnapshot = { id: 'm'.repeat(64), fetchedAt: '2026-10-25T00:00:00Z',
    sourceUrl: 'https://limitlesstcg.com/decks', period: 'Ultimo mese', circuit: 'WESTERN',
    format: 'STANDARD', cached: true,
    decks: [{ id: '284', name: 'Mazzo avversario', points: 100, share: 10,
      url: 'https://limitlesstcg.com/decks/284' }] }
  const evidence: MatchupTournamentEvidence = { status: 'unavailable',
    detail: 'Nessuna lista evento locale pertinente.', eventId: null, eventName: null,
    eventDate: null, eventUrl: null, eventLists: null, eventParticipants: null,
    matchedDeckId: null, matchedCompleteLists: 0, observedCards: [], sampleLists: [] }
  const prepared: { current: AiPromptAudit | null } = { current: null }
  const report = await generateMatchup('project', 'hash',
    'CARTE NOSTRE: 2 Boss’s Orders ME01 114. CONTROLLO STANDARD: dati insufficienti.',
    meta, meta.decks[0], { url: null, cards: [], mechanics: [] },
    { provider: 'codex', source: 'global', model: null, reasoningEffort: null },
    evidence, undefined, { aiQueries, onPrompt: (audit) => { prepared.current = audit } })
  expect(report.strategy.length).toBeGreaterThan(20)
  expect(report.aiQueries?.requests[0].sourceIds).toEqual(['card:me01-114'])
  expect(report.promptAudit?.text).toBe(prepared.current?.text)
  expect(report.promptAudit?.sha256).toBe(prepared.current?.sha256)
  expect(report.promptAudit?.durationMs).toBeGreaterThan(0)
  console.log('Matchup final token usage:', report.promptAudit?.usage ?? 'not exposed')
}, 240_000)
