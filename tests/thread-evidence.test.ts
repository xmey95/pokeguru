import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { ProjectStore } from '../src/main/project-store'
import { buildThreadEvidence } from '../src/main/thread-evidence'
import { deckDiscussionPrompt, readDeckDiscussionSourceIds } from '../src/main/deck-ai'
import type { CatalogPrint, CatalogView, CardGameplay } from '../src/shared/catalog'
import type { TournamentSnapshot } from '../src/shared/tournament'
import type { MainTournamentSnapshot } from '../src/shared/main-tournament'
import type { AiRunConfig } from '../src/shared/ai'

const config: AiRunConfig = { provider: 'codex', source: 'global', model: null, reasoningEffort: null }
const gameplay: CardGameplay = { hp: 220, types: ['Darkness'], evolveFrom: null,
  attacks: [{ name: 'Assalto', cost: ['Darkness', 'Colorless'], damage: '180', effect: 'Effetto di prova.' }],
  abilities: [], effect: null, trainerType: null, weaknesses: [{ type: 'Fighting', value: '×2' }],
  resistances: [], retreat: 2 }

function print(id: string, name: string, rules: CardGameplay): CatalogPrint {
  const [setId, localId] = id.split('-')
  return { id, setId, localId, name, setName: setId, category: 'Pokemon', stage: 'Basic',
    rarity: 'Double rare', regulationMark: 'I', variants: null, identityId: id,
    identityBasis: 'pokemon-text', gameplaySchemaVersion: 1, gameplay: rules,
    imageBase: null, thumbnail: null, highImageAvailable: null, sourceUpdated: '2026-10-23',
    sourceUrl: `https://api.tcgdex.net/v2/en/cards/${id}`, detailAt: '2026-10-23T00:00:00.000Z', error: null }
}

function catalog(damage = '180'): CatalogView {
  return { circuit: 'WESTERN', source: 'TCGdex REST v2/en', sourceLanguage: 'en',
    scope: { setIds: ['me01'], names: [] }, syncedAt: '2026-10-23T00:00:00.000Z', sets: [],
    prints: [print('me01-086', 'Mega Absol ex', { ...gameplay,
      attacks: [{ ...gameplay.attacks[0], damage }] }),
      print('me01-200', 'Hydrapple ex', { ...gameplay, hp: 330 })] }
}

function play(id: string, date: string, deck = 'Hydrapple ex'): TournamentSnapshot {
  return { id: `snapshot-${id}`, eventId: id, fetchedAt: `${date}T12:00:00Z`, source: 'Limitless Play API',
    sourceUrl: `https://play.limitlesstcg.com/api/tournaments/${id}/standings`,
    publicUrl: `https://play.limitlesstcg.com/tournament/${id}`, name: `Online ${id.slice(-2)}`,
    date, circuit: 'WESTERN', format: 'STANDARD', platform: 'PTCGL', isOnline: true,
    reportedPlayers: 90, phases: [], cached: true,
    coverage: { returnedParticipants: 80, availableLists: 80, invalidLists: 0,
      missingLists: 0, complete60Lists: 80 },
    participations: [{ playerId: 'player', playerName: 'Player', country: null, placing: 2,
      record: { wins: 7, losses: 2, ties: 0 }, deck: { id: 'hydrapple-ex', name: deck },
      listStatus: 'available', cardTotal: 60,
      cards: [{ category: 'pokemon', count: 4, name: deck === 'Hydrapple ex' ? 'Hydrapple ex' : 'Pikachu ex', set: 'ME01', number: '200' },
        { category: 'energy', count: 56, name: 'Grass Energy', set: 'SVE', number: '001' }] }] }
}

function regional(): MainTournamentSnapshot {
  return { id: 'regional-snapshot', eventId: '1234', name: 'Regional', date: '2026-10-20',
    country: 'FR', players: 500, url: 'https://limitlesstcg.com/tournaments/1234',
    fetchedAt: '2026-10-21T00:00:00Z', source: 'Limitless tournament database',
    circuit: 'WESTERN', format: 'STANDARD', type: 'IN_PERSON', cached: true,
    coverage: { returnedParticipants: 500, listedDecks: 450, fetchedLists: 200,
      complete60Lists: 200, noListLink: 50 },
    participants: [{ placing: 3, playerName: 'Regional player', playerId: null, country: 'FR',
      deckId: 'hydrapple-ex', deckName: 'Hydrapple ex', listId: '999',
      listUrl: 'https://limitlesstcg.com/decks/list/999', cardTotal: 60,
      cards: [{ category: 'pokemon', count: 4, name: 'Hydrapple ex', set: 'ME01', number: '200' },
        { category: 'energy', count: 56, name: 'Grass Energy', set: 'SVE', number: '001' }] }] }
}

it('seleziona schede e liste pertinenti da più eventi, conserva i dati del turno e segnala le modifiche', () => {
  const directory = mkdtempSync(join(tmpdir(), 'pokeguru-thread-evidence-'))
  const path = join(directory, 'projects.sqlite')
  let store: ProjectStore | null = null
  try {
    store = new ProjectStore(path)
    const project = store.create({ name: 'Assoluto', format: 'STANDARD' })
    const other = store.create({ name: 'Altro', format: 'STANDARD' })
    store.importDeck({ projectId: project.id, rawText: '1 Mega Absol ex ME01 086\n59 Psychic Energy SVE 005', source: 'paste' })
    const created = store.createDeckThread({ projectId: project.id, title: 'Hydrapple' })
    const otherThread = store.createDeckThread({ projectId: other.id, title: 'Altro' })
    const base = store.listDeckVersions(project.id)[0]
    const first = buildThreadEvidence(created, base, 'Come giochiamo contro Hydrapple ex?', [], catalog(),
      [play('0123456789abcdef01234567', '2026-10-23'), play('0123456789abcdef01234568', '2026-10-22'),
        play('0123456789abcdef01234569', '2026-10-21', 'Altro mazzo')], [regional()])
    expect(first.cards.find((card) => card.name === 'Mega Absol ex')?.gameplayText).toContain('danno 180')
    expect(first.events).toHaveLength(3)
    expect(first.events.flatMap((event) => event.lists)).toHaveLength(3)
    expect(first.sources.some((source) => source.url === 'https://limitlesstcg.com/decks/list/999')).toBe(true)
    expect(first.events.some((event) => event.name.includes('69'))).toBe(false)
    expect(deckDiscussionPrompt(created, base, 'Hydrapple', first)).toContain('Assalto')
    const explicitCatalog = catalog()
    explicitCatalog.prints.push({ ...print('me01-114', "Boss's Orders", gameplay),
      category: 'Trainer', gameplay: undefined, identityBasis: 'unverified' })
    const explicit = buildThreadEvidence(created, base,
      "Aggiungi Boss's Orders ME01 114 anche se il testo di gioco manca", [], explicitCatalog, [], [])
    expect(explicit.cards.find((card) => card.name === "Boss's Orders")).toMatchObject({
      printId: 'me01-114', identityStatus: 'exact', gameplay: null })
    expect(readDeckDiscussionSourceIds({ sourceIds: ['base', 'base'] }, first)).toEqual(['base'])
    expect(() => readDeckDiscussionSourceIds({ sourceIds: ['inventata'] }, first)).toThrow()
    store.assignDeckAiSession(project.id, created.id, 'session')
    const saved = store.saveDeckAiExchange(project.id, created.id, 'session', 'Hydrapple', 'Piano motivato.',
      'turn-1', config, undefined, first, ['base', 'card:me01-086'])
    expect(saved.messages.at(-1)?.evidence?.events).toHaveLength(3)
    expect(store.listDeckThreads(other.id).find((item) => item.id === otherThread.id)?.messages).toEqual([])
    store.close()
    store = new ProjectStore(path)
    const restored = store.listDeckThreads(project.id)[0]
    expect(store.listDeckThreadSummaries(project.id)[0]).not.toHaveProperty('messages')
    expect(store.getDeckThread(other.id, created.id)).toBeNull()
    expect(store.getDeckThread(project.id, created.id)?.messages.at(-1)?.evidence?.events).toHaveLength(3)
    expect(restored.messages.at(-1)?.evidence?.cards.find((card) => card.name === 'Mega Absol ex')?.gameplayText)
      .toContain('danno 180')
    expect(restored.messages.at(-1)?.citedSourceIds).toContain('card:me01-086')
    const second = buildThreadEvidence(restored, base, 'Hydrapple', [], catalog('190'),
      [play('0123456789abcdef01234567', '2026-10-23'), play('0123456789abcdef01234570', '2026-10-24')], [regional()])
    expect(second.change.updated).toContain('Mega Absol ex · me01 086')
    expect(second.change.added.some((label) => label.includes('70'))).toBe(true)
    expect(second.cards.find((card) => card.name === 'Mega Absol ex')?.gameplayText).toContain('danno 190')
    expect(restored.messages.at(-1)?.evidence?.cards.find((card) => card.name === 'Mega Absol ex')?.gameplayText)
      .toContain('danno 180')
  } finally { store?.close(); rmSync(directory, { recursive: true, force: true }) }
})

it('recupera dal contesto del thread le schede italiane e stampe con la stessa regola', () => {
  const directory = mkdtempSync(join(tmpdir(), 'pokeguru-thread-context-'))
  const store = new ProjectStore(join(directory, 'projects.sqlite'))
  try {
    const project = store.create({ name: 'Prova', format: 'STANDARD' })
    store.importDeck({ projectId: project.id,
      rawText: '1 Mega Absol ex ME01 086\n59 Basic Psychic Energy SVE 005', source: 'paste' })
    const created = store.createDeckThread({ projectId: project.id, title: 'Contro Mega Lucario ex',
      openingNote: 'Mega Lucario ex usa Compassione di Lino per curarsi.' })
    const thread = store.addDeckThreadMessage(project.id, created.id, 'Fatico a chiudere il KO.')
    const base = store.listDeckVersions(project.id)[0]
    const lucario = { ...gameplay, hp: 340,
      weaknesses: [{ type: 'Psychic', value: '×2' }] }
    const wally = { ...gameplay, hp: null, attacks: [], weaknesses: [],
      effect: 'Heal all damage from 1 of your Mega Evolution Pokémon ex.', trainerType: 'Supporter' }
    const example = catalog()
    example.prints.push(print('sv07-082', 'Lucario ex', gameplay),
      print('30th-083', 'Lucario', gameplay),
      { ...print('me01-077', 'Mega Lucario ex', lucario), identityId: 'lucario-glyph-a' },
      { ...print('mep-012', 'Mega Lucario ex', { ...lucario,
        weaknesses: [{ type: 'Psychic', value: 'x2' }] }), identityId: 'lucario-glyph-b' },
      { ...print('me01-132', "Wally's Compassion", wally), category: 'Trainer' })
    const packet = buildThreadEvidence(thread, base, 'Come posso arginare questa cosa?', [], example,
      [play('0123456789abcdef01234567', '2026-10-23', 'Mega Lucario ex')], [])
    expect(packet.cards.find((card) => card.name === 'Mega Lucario ex')).toMatchObject({
      identityStatus: 'same-gameplay', printId: expect.any(String), gameplay: expect.any(Object) })
    expect(packet.cards.find((card) => card.name === "Wally's Compassion")).toMatchObject({
      mentionedAs: 'Compassione di Lino', printId: 'me01-132', gameplay: expect.any(Object) })
    expect(packet.cards.some((card) => card.name === 'Lucario ex' || card.name === 'Lucario')).toBe(false)
    expect(packet.events.flatMap((event) => event.lists)).toHaveLength(1)
    expect(deckDiscussionPrompt(thread, base, 'Come posso arginare questa cosa?', packet))
      .toContain('Compassione di Lino')

    const different = { ...example, prints: [...example.prints,
      { ...print('mep-099', 'Mega Lucario ex', { ...lucario, hp: 330 }),
        identityId: 'truly-different' }] }
    expect(buildThreadEvidence(thread, base, 'E adesso?', [], different, [], [])
      .cards.find((card) => card.name === 'Mega Lucario ex')).toMatchObject({
        identityStatus: 'ambiguous', printId: null })

    const crowdedBase = { ...base, rawText: Array.from({ length: 36 }, (_, index) =>
      `1 Carta di prova ${index + 1} ME05 ${String(index + 1).padStart(3, '0')}`).join('\n') }
    const crowded = buildThreadEvidence(thread, crowdedBase, 'Come posso arginare questa cosa?',
      [], example, [], [])
    expect(crowded.cards).toHaveLength(36)
    expect(crowded.cards.some((card) => card.name === 'Mega Lucario ex')).toBe(true)
    expect(crowded.cards.some((card) => card.name === "Wally's Compassion")).toBe(true)
    expect(crowded.cardCoverage.omitted).toBe(2)
  } finally {
    store.close()
    rmSync(directory, { recursive: true, force: true })
  }
})
