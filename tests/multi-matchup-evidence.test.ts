import { expect, it } from 'vitest'
import { multiMatchupEvidence } from '../src/shared/matchup-evidence'
import type { MetaDeck, MetaSnapshot } from '../src/shared/meta-matchups'
import type { TournamentSnapshot } from '../src/shared/tournament'
import type { MainTournamentSnapshot } from '../src/shared/main-tournament'
import type { CatalogView } from '../src/shared/catalog'

const opponent: MetaDeck = { id: '352', name: 'Hydrapple', points: 408, share: 3.7,
  url: 'https://limitlesstcg.com/decks/352' }
const meta: MetaSnapshot = { id: 'meta', fetchedAt: '2026-10-24T12:00:00.000Z',
  sourceUrl: 'https://limitlesstcg.com/decks?format=standard', period: 'Ultimo mese',
  circuit: 'WESTERN', format: 'STANDARD', decks: [opponent], cached: false }
const cards = [
  { category: 'pokemon' as const, count: 4, name: 'Hydrapple ex', set: 'SCR', number: '14' },
  { category: 'energy' as const, count: 56, name: 'Grass Energy', set: 'MEE', number: '9' }
]
const play = (eventId: string, date: string, winner: string): TournamentSnapshot => ({
  id: eventId, eventId, fetchedAt: meta.fetchedAt, source: 'Limitless Play API',
  sourceUrl: `https://play.limitlesstcg.com/api/tournaments/${eventId}/standings`,
  publicUrl: `https://play.limitlesstcg.com/tournament/${eventId}`, name: `Play ${eventId}`,
  date, circuit: 'WESTERN', format: 'STANDARD', platform: 'PTCGL', isOnline: true,
  reportedPlayers: 2, phases: [], cached: false,
  participations: [
    { playerId: 'apple', playerName: 'Apple', country: 'US', placing: 1, record: null,
      deck: { id: 'hydrapple', name: 'Hydrapple' }, listStatus: 'available', cards, cardTotal: 60 },
    { playerId: 'other', playerName: 'Other', country: 'CA', placing: 2, record: null,
      deck: { id: 'dragapult', name: 'Dragapult' }, listStatus: 'missing', cards: [], cardTotal: null }
  ],
  pairings: [{ phase: 1, round: 1, table: 1, match: null, player1: 'apple', player2: 'other', winner }],
  coverage: { returnedParticipants: 2, availableLists: 1, invalidLists: 0, missingLists: 1, complete60Lists: 1 }
})
const main = (eventId: string, date: string): MainTournamentSnapshot => ({
  id: eventId, eventId, fetchedAt: meta.fetchedAt, source: 'Limitless tournament database',
  url: `https://limitlesstcg.com/tournaments/${eventId}`, name: `Regional ${eventId}`,
  date, country: 'FR', players: 2000, circuit: 'WESTERN', format: 'STANDARD', type: 'IN_PERSON',
  participants: [{ placing: 3, playerName: 'Apple Regional', playerId: '310', country: 'PT',
    deckId: '352', deckName: 'Hydrapple', listId: `30${eventId}`,
    listUrl: `https://limitlesstcg.com/decks/list/30${eventId}`, cards, cardTotal: 60 }],
  coverage: { returnedParticipants: 400, listedDecks: 400, fetchedLists: 1,
    complete60Lists: 1, noListLink: 0 }, cached: true
})
const catalog: CatalogView = { circuit: 'WESTERN', source: 'TCGdex REST v2/en', sourceLanguage: 'en',
  scope: { setIds: ['sv07'], names: [] }, syncedAt: meta.fetchedAt, sets: [], prints: [{
    id: 'sv07-014', setId: 'sv07', setName: 'Stellar Crown', localId: '014', name: 'Hydrapple ex',
    category: 'Pokemon', stage: 'Stage2', rarity: 'Double rare', regulationMark: 'H', isPromo: false,
    variants: null, identityId: 'pokemon-hydrapple', identityBasis: 'pokemon-text',
    gameplaySchemaVersion: 1, gameplay: { hp: 330, types: ['Grass'], evolveFrom: 'Dipplin',
      attacks: [{ name: 'Syrup Storm', cost: ['Grass', 'Grass'], damage: '30+', effect: 'Damage grows.' }],
      abilities: [], effect: null, trainerType: null, weaknesses: [], resistances: [], retreat: 3 },
    imageBase: null, thumbnail: null, highImageAvailable: null, sourceUpdated: null,
    sourceUrl: 'https://api.tcgdex.net/v2/en/cards/sv07-014', detailAt: meta.fetchedAt, error: null
  }] }

it('combines Play pairings and two Regional lists with explicit denominators and mechanics', () => {
  const evidence = multiMatchupEvidence(meta, opponent,
    [play('aaaaaaaaaaaaaaaaaaaaaaaa', '2026-10-20T12:00:00.000Z', 'apple'),
      play('bbbbbbbbbbbbbbbbbbbbbbbb', '2026-10-18T12:00:00.000Z', 'other')],
    [main('582', '2026-10-17T00:00:00.000Z'), main('581', '2026-10-10T00:00:00.000Z')], catalog)
  expect(evidence).toMatchObject({ schemaVersion: 2, status: 'matched', matchedCompleteLists: 4 })
  expect(evidence.events).toHaveLength(4)
  expect(evidence.events?.filter((item) => item.source === 'main')).toHaveLength(2)
  expect(evidence.sampleLists).toHaveLength(4)
  expect(evidence.sampleLists.filter((item) => item.source === 'main')).toHaveLength(2)
  expect(evidence.observedCards.find((item) => item.name === 'Hydrapple ex')).toMatchObject({
    lists: 4, catalogStatus: 'recognized', catalogIdentityId: 'pokemon-hydrapple' })
  expect(evidence.observedCards.find((item) => item.name === 'Hydrapple ex')?.gameplay).toContain('Syrup Storm')
  expect(evidence.opponentFieldRecord).toMatchObject({ wins: 1, losses: 1, ties: 0,
    denominator: 2, eligiblePairings: 2, events: 2, scope: 'opponent-versus-field' })
  expect(evidence.evidenceHash).toMatch(/^[a-f0-9]{32}$/)
})

it('does not merge old rotations, near-named variants or unlinked Regional archetypes', () => {
  const old = play('aaaaaaaaaaaaaaaaaaaaaaaa', '2026-08-01T12:00:00.000Z', 'apple')
  const other = play('bbbbbbbbbbbbbbbbbbbbbbbb', '2026-10-20T12:00:00.000Z', 'apple')
  other.participations[0].deck = { id: 'hydrapple-dusknoir', name: 'Hydrapple Dusknoir' }
  const regional = main('582', '2026-10-17T00:00:00.000Z')
  regional.participants[0].deckId = '999'
  const evidence = multiMatchupEvidence(meta, opponent, [old, other], [regional], catalog)
  expect(evidence).toMatchObject({ status: 'unavailable', matchedCompleteLists: 0, events: [] })
  expect(evidence.opponentFieldRecord).toBeUndefined()
})

it('matches a new printing through the official set code saved by catalog update', () => {
  const nextCatalog: CatalogView = { ...catalog,
    sets: [{ id: 'me05', name: 'Future Set', abbreviation: 'FUT',
      sourceTotal: 100, sampleTotal: 1, fetchedAt: meta.fetchedAt }],
    prints: catalog.prints.map((print) => ({ ...print, id: 'me05-014',
      setId: 'me05', setName: 'Future Set' })) }
  const regional = main('582', '2026-10-17T00:00:00.000Z')
  regional.participants[0].cards = cards.map((card) => ({ ...card, set: 'FUT' }))
  const evidence = multiMatchupEvidence(meta, opponent, [], [regional], nextCatalog)
  expect(evidence.observedCards.find((item) => item.name === 'Hydrapple ex'))
    .toMatchObject({ catalogStatus: 'recognized', cardSourceUrl: catalog.prints[0].sourceUrl })
})
