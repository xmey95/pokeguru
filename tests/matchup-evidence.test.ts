import { expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseTournament } from '../src/main/limitless-event'
import { ProjectStore } from '../src/main/project-store'
import { matchupTournamentEvidence } from '../src/shared/matchup-evidence'
import type { MetaDeck, MetaSnapshot } from '../src/shared/meta-matchups'
import type { CatalogView } from '../src/shared/catalog'

const opponent: MetaDeck = { id: '284', name: 'Dragapult ex', points: 100, share: 10,
  url: 'https://limitlesstcg.com/decks/284' }
const meta: MetaSnapshot = { id: 'meta', fetchedAt: '2026-10-24T12:00:00.000Z',
  sourceUrl: 'https://limitlesstcg.com/decks?format=standard', period: 'Ultimo mese',
  circuit: 'WESTERN', format: 'STANDARD', decks: [opponent], cached: false }
const details = { id: '6ad92350115c12b73a5a9419', game: 'PTCG', format: 'STANDARD', platform: 'PTCGL',
  isOnline: true, isPublic: true, decklists: true, name: 'Evento campione',
  date: '2026-10-22T20:00:00.000Z', players: 3,
  phases: [{ phase: 1, type: 'SWISS', rounds: 3, mode: 'BO1' }] }
const cards = { pokemon: [{ count: 4, name: 'Dragapult ex', set: 'TWM', number: '130' }],
  trainer: [{ count: 56, name: 'Rare Candy', set: 'MEG', number: '125' }], energy: [] }
const standings = [
  { player: 'one', name: 'One', placing: 2, deck: { id: 'dragapult-ex', name: 'Dragapult' }, decklist: cards },
  { player: 'two', name: 'Two', placing: 5, deck: { id: 'dragapult-ex', name: 'Dragapult' }, decklist: cards },
  { player: 'three', name: 'Three', placing: 1, deck: { id: 'dragapult-dusknoir', name: 'Dragapult Dusknoir' }, decklist: cards }
]

it('collega solo lo slug esatto, conta liste complete e conserva fonti senza dedurre winrate', () => {
  const event = parseTournament(details, standings)
  const evidence = matchupTournamentEvidence(meta, opponent, event)
  expect(evidence.status).toBe('matched')
  expect(evidence.matchedDeckId).toBe('dragapult-ex')
  expect(evidence.matchedCompleteLists).toBe(2)
  expect(evidence.eventLists).toBe(3)
  expect(evidence.observedCards).toContainEqual({ name: 'Rare Candy', lists: 2,
    catalogIdentityId: null, catalogStatus: 'not-in-catalog' })
  expect(evidence.sampleLists[0].url).toContain('/player/one/decklist')
  expect(JSON.stringify(evidence)).not.toMatch(/winrate|wins|losses/)
})

it('non collega eventi vecchi, varianti e ID ambigui', () => {
  const event = parseTournament(details, standings)
  expect(matchupTournamentEvidence(meta, opponent, { ...event, date: '2026-08-01T00:00:00.000Z' }).status)
    .toBe('incompatible')
  expect(matchupTournamentEvidence(meta, { ...opponent, name: 'Slowking Seek Inspiration' }, event).status)
    .toBe('unavailable')
  const ambiguous = parseTournament(details, [...standings, { player: 'four', name: 'Four', placing: 6,
    deck: { id: 'Dragapult EX', name: 'Dragapult' }, decklist: cards }])
  expect(matchupTournamentEvidence(meta, opponent, ambiguous).detail).toMatch(/ambigua/)
  expect(matchupTournamentEvidence(meta, opponent, null).detail).toMatch(/Nessun torneo/)
})

it('distingue una identità Trainer risolta da un Pokémon non verificato nel Catalogo', () => {
  const event = parseTournament(details, standings)
  const template = { setId: 'me01', setName: 'Mega Evolution', localId: '125', category: 'Trainer',
    rarity: 'Common', regulationMark: 'I', isPromo: false, variants: null, imageBase: null,
    thumbnail: null, highImageAvailable: null, sourceUpdated: null,
    sourceUrl: 'https://api.tcgdex.net/v2/en/cards/me01-125',
    detailAt: '2026-10-23T00:00:00.000Z', error: null }
  const catalog: CatalogView = { circuit: 'WESTERN', source: 'TCGdex REST v2/en', sourceLanguage: 'en',
    scope: { setIds: ['me01'], names: [] }, syncedAt: '2026-10-23T00:00:00.000Z', sets: [],
    prints: [
      { ...template, id: 'me01-125', name: 'Rare Candy', identityId: 'trainer-candy',
        identityBasis: 'trainer-text' },
      { ...template, id: 'me01-001', name: 'Dragapult ex', category: 'Pokemon',
        identityId: 'me01-001', identityBasis: 'unverified' }
    ] }
  const evidence = matchupTournamentEvidence(meta, opponent, event, catalog)
  expect(evidence.observedCards.find((card) => card.name === 'Rare Candy')).toMatchObject({
    catalogIdentityId: 'trainer-candy', catalogStatus: 'recognized' })
  expect(evidence.observedCards.find((card) => card.name === 'Dragapult ex')).toMatchObject({
    catalogIdentityId: null, catalogStatus: 'ambiguous' })
})

it('conserva le evidenze della guida nel progetto e nello storico dopo la riapertura', () => {
  const directory = mkdtempSync(join(tmpdir(), 'pokeguru-matchup-evidence-'))
  const database = join(directory, 'data.sqlite')
  let store = new ProjectStore(database)
  try {
    const project = store.create({ name: 'Guida', format: 'STANDARD' })
    store.importDeck({ projectId: project.id, rawText: '60 Basic Grass Energy MEE 9', source: 'paste' })
    const storedMeta = { ...meta, id: 'a'.repeat(64) }
    store.saveMetaSnapshot(storedMeta)
    const evidence = matchupTournamentEvidence(storedMeta, opponent, parseTournament(details, standings))
    store.saveMatchupReport({ projectId: project.id, metaId: storedMeta.id, opponentId: opponent.id,
      deckHash: store.getCurrentDeckHash(project.id)!, generatedAt: '2026-10-24T13:00:00.000Z',
      sampleDeckUrl: null, strengths: 'Ipotesi', weaknesses: 'Ipotesi', ourKeyCards: '',
      theirKeyCards: 'Rare Candy', strategy: 'Piano condizionato', limitations: 'Un evento online',
      tournamentEvidence: evidence })
    expect(store.listMatchupReports(project.id, storedMeta.id)[0].tournamentEvidence).toEqual(evidence)
    const second = store.create({ name: 'Altro progetto', format: 'STANDARD' })
    store.importDeck({ projectId: second.id, rawText: '60 Basic Fire Energy MEE 2', source: 'paste' })
    expect(store.listMatchupReports(second.id, storedMeta.id)).toEqual([])
    expect(store.listMatchupDiscussions(second.id, opponent.id)).toEqual([])
    store.importDeck({ projectId: project.id, rawText: '59 Basic Grass Energy MEE 9\n1 Iono MEG 125', source: 'paste' })
    store.close()
    store = new ProjectStore(database)
    expect(store.listMatchupReports(project.id, storedMeta.id)).toEqual([])
    expect(store.listMatchupDiscussions(project.id, opponent.id)[0].turns[0].report?.tournamentEvidence)
      .toEqual(evidence)
    expect(store.listMatchupDiscussions(project.id, opponent.id)[0].current).toBe(false)
  } finally {
    store.close()
    rmSync(directory, { recursive: true, force: true })
  }
})
