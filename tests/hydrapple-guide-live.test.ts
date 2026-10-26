import { expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { fetchMeta, fetchOpponentSample } from '../src/main/limitless-meta'
import { completeMainTournament, fetchMainDecklist, fetchMainTournament,
  fetchMainTournamentIndex } from '../src/main/limitless-main-tournament'
import { extractCardGameplay, gameplaySummary } from '../src/shared/card-gameplay'
import { multiMatchupEvidence } from '../src/shared/matchup-evidence'
import { generateMatchup, reviseMatchup } from '../src/main/codex-matchup'
import type { CatalogView, CatalogPrint } from '../src/shared/catalog'
import type { MatchupDiscussion } from '../src/shared/meta-matchups'
import { OFFICIAL_SET_CODES } from '../src/shared/set-codes'
import type { TournamentCard } from '../src/shared/tournament'

it.skipIf(process.env.POKEGURU_HYDRAPPLE_GUIDE_LIVE !== '1')('generates and revises a sourced Hydrapple guide', async () => {
  const meta = await fetchMeta()
  const opponent = meta.decks.find((item) => item.id === '352')
  expect(opponent, 'Hydrapple assente dal Meta occidentale corrente').toBeDefined()
  const index = await fetchMainTournamentIndex()
  const entries = index.filter((item) => item.eventId === '582' || item.eventId === '581')
  expect(entries).toHaveLength(2)
  const mainEvents = []
  let ownCards: string[] = []
  let ownDeckCards: TournamentCard[] = []
  const opponentCards: TournamentCard[] = []
  for (const entry of entries) {
    const tournament = await fetchMainTournament(entry)
    const hydrapple = tournament.participants.find((item) => item.deckId === '352' && item.listId)
    expect(hydrapple).toBeDefined()
    const deck = await fetchMainDecklist(hydrapple!.listId!)
    expect(deck.total).toBe(60)
    opponentCards.push(...deck.cards)
    if (!ownCards.length) {
      const dragapultList = tournament.participants.find((item) =>
        /Dragapult/i.test(item.deckName ?? '') && item.listId)
      expect(dragapultList, 'Lista Dragapult del Regional assente').toBeDefined()
      const ownDeck = await fetchMainDecklist(dragapultList!.listId!)
      expect(ownDeck.total).toBe(60)
      ownDeckCards = ownDeck.cards
      ownCards = ownDeck.cards.map((card) => `${card.count} ${card.name} ${card.set} ${card.number}`)
    }
    mainEvents.push(completeMainTournament({ ...tournament, participants: tournament.participants.map((item) =>
      item === hydrapple ? { ...item, cards: deck.cards, cardTotal: deck.total } : item) }))
  }
  const details = async (id: string) => {
    const response = await fetch(`https://api.tcgdex.net/v2/en/cards/${id}`)
    expect(response.ok).toBe(true)
    return extractCardGameplay(await response.json())
  }
  const hydrapple = await details('sv07-014')
  const dragapult = await details('sv06-130')
  const dreepy = await details('sv06-128')
  const drakloak = await details('sv06-129')
  const rareCandy = await details('sv04.5-089')
  expect(hydrapple?.attacks.length).toBeGreaterThan(0)
  expect(dragapult?.attacks.length).toBeGreaterThan(0)
  expect(dreepy?.attacks.length).toBeGreaterThan(0)
  expect(drakloak?.abilities.length).toBeGreaterThan(0)
  expect(ownCards.some((line) => /Dragapult ex/i.test(line))).toBe(true)
  const setIds = new Map(Object.entries(OFFICIAL_SET_CODES).map(([id, code]) => [code, id]))
  const candidateIds = [...new Set([...ownDeckCards, ...opponentCards]
    .filter((card) => card.category !== 'energy' && setIds.has(card.set))
    .map((card) => `${setIds.get(card.set)}-${card.number.padStart(3, '0')}`))]
  const prints: CatalogPrint[] = []
  const missing: string[] = []
  for (const id of candidateIds) {
    const response = await fetch(`https://api.tcgdex.net/v2/en/cards/${id}`)
    if (!response.ok) { missing.push(id); continue }
    const card = await response.json() as { id: string; name: string; category: string;
      stage?: string; localId: string; regulationMark?: string }
    const gameplay = extractCardGameplay(card)
    if (!gameplay) continue
    prints.push({ id, setId: id.split('-')[0], setName: id.split('-')[0],
      localId: card.localId, name: card.name, category: card.category,
      stage: card.stage ?? null, energyType: null, rarity: null,
      regulationMark: card.regulationMark ?? null, isPromo: false, variants: null,
      identityId: createHash('sha256').update(`${card.name}:${JSON.stringify(gameplay)}`).digest('hex'),
      identityBasis: card.category === 'Trainer' ? 'trainer-text' : 'pokemon-text',
      gameplaySchemaVersion: 1, gameplay, imageBase: null, thumbnail: null,
      highImageAvailable: null, sourceUpdated: null,
      sourceUrl: `https://api.tcgdex.net/v2/en/cards/${id}`,
      detailAt: new Date().toISOString(), error: null })
  }
  expect(prints.some((item) => item.name === 'Hydrapple ex')).toBe(true)
  expect(prints.some((item) => item.name === 'Teal Mask Ogerpon ex')).toBe(true)
  expect(prints.some((item) => item.name === 'Dragapult ex')).toBe(true)
  console.log(`SCHEDE: ${prints.length}/${candidateIds.length}; non trovate: ${missing.join(', ') || 'nessuna'}`)
  const catalog: CatalogView = { circuit: 'WESTERN', source: 'TCGdex REST v2/en', sourceLanguage: 'en',
    scope: { setIds: [...new Set(prints.map((item) => item.setId))], names: [] },
    syncedAt: new Date().toISOString(),
    sets: [...new Set(prints.map((item) => item.setId))].map((id) => ({ id, name: id,
      abbreviation: OFFICIAL_SET_CODES[id], sourceTotal: 1, sampleTotal: 1,
      fetchedAt: new Date().toISOString() })), prints }
  const evidence = multiMatchupEvidence(meta, opponent!, [], mainEvents, catalog)
  expect(evidence.status).toBe('matched')
  expect(evidence.events?.filter((item) => item.source === 'main')).toHaveLength(2)
  expect(evidence.observedCards.find((item) => item.name === 'Hydrapple ex')?.gameplay).toContain('Attacco')
  const sample = await fetchOpponentSample(opponent!)
  const mechanics = [...new Set(sample.cards.map((line) => line.replace(/^\d+\s+/, '')))]
    .flatMap((name) => {
      const print = prints.find((item) => item.name === name && item.gameplay)
      return print ? [{ name, text: gameplaySummary(print.gameplay!), sourceUrl: print.sourceUrl }] : []
    })
  const ownContext = `LISTA CORRENTE DEL NOSTRO MAZZO (60 carte pubblicate in un Regional Standard occidentale):
${ownCards.join('\n')}
SCHEDE DI GIOCO VERIFICATE:
${prints.filter((item) => ownDeckCards.some((card) => card.name === item.name))
    .map((item) => `${item.name} (${item.sourceUrl}): ${gameplaySummary(item.gameplay!)}`).join('\n')}
Rare Candy (https://api.tcgdex.net/v2/en/cards/sv04.5-089): ${gameplaySummary(rareCandy!)}`
  const config = { provider: 'codex' as const, source: 'override' as const,
    model: 'gpt-6.1-sol', reasoningEffort: 'medium' }
  const report = await generateMatchup('live-hydrapple', 'deckhash', ownContext, meta, opponent!,
    { ...sample, mechanics },
    config, evidence)
  console.log(JSON.stringify({ strengths: report.strengths, weaknesses: report.weaknesses,
    ourKeyCards: report.ourKeyCards, theirKeyCards: report.theirKeyCards,
    strategy: report.strategy, limitations: report.limitations }, null, 2))
  expect(report.strategy.length).toBeGreaterThan(150)
  expect(report.strategy.toLowerCase()).toMatch(/dragapult|phantom dive/)
  expect(report.theirKeyCards.toLowerCase()).toMatch(/hydrapple/)
  expect(report.tournamentEvidence?.events?.length).toBe(2)
  const discussion: MatchupDiscussion = { id: 'discussion', projectId: 'live-hydrapple',
    metaId: meta.id, opponentId: opponent!.id, deckHash: 'deckhash', parentId: null,
    current: true, createdAt: report.generatedAt, contextSummary: '', summarizedThrough: -1,
    turns: [{ id: 'initial', feedback: null, createdAt: report.generatedAt, report, changeSummary: null }] }
  const revised = await reviseMatchup(discussion,
    'Penso di assegnare 4 dei 6 segnalini di Phantom Dive ad Applin da 40 PS per mandarlo KO e usare i 2 rimasti su un altro Pokémon in panchina. Valuta se questo piano regge contro le liste viste.',
    ownContext, meta, opponent!, { ...sample, mechanics }, config, evidence)
  expect(revised.report.strategy.length).toBeGreaterThan(150)
  expect(revised.changeSummary.length).toBeGreaterThan(30)
  expect(revised.report.tournamentEvidence?.evidenceHash).toBe(evidence.evidenceHash)
  console.log(`REVISIONE: ${revised.changeSummary}`)
}, 180_000)
