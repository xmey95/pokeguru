import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, expect, it } from 'vitest'
import { ProjectStore } from '../src/main/project-store'
import { deckDiscussionPrompt, deckProposalPrompt, readDeckDiscussionReply, validateDeckProposal } from '../src/main/deck-ai'
import { buildThreadEvidence } from '../src/main/thread-evidence'
import { createAiEvidenceEngine } from '../src/main/ai-evidence-engine'
import { makeAiPromptAudit, runAiEvidenceQueries,
  threadEvidenceWithQueries } from '../src/main/ai-evidence-queries'
import type { AiRunConfig } from '../src/shared/ai'
import type { CatalogPrint, CatalogView } from '../src/shared/catalog'
import type { DeckConstraint } from '../src/shared/constraints'
import type { TournamentSnapshot } from '../src/shared/tournament'

const directories: string[] = []
const config: AiRunConfig = { provider: 'codex', source: 'global', model: 'sample-model', reasoningEffort: 'medium' }

function openStore(): { store: ProjectStore; path: string } {
  const directory = mkdtempSync(join(tmpdir(), 'pokeguru-deck-ai-store-'))
  directories.push(directory)
  const path = join(directory, 'projects.sqlite')
  return { store: new ProjectStore(path), path }
}

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

it('salva lo scambio AI nel solo thread associato e conserva la provenienza alla riapertura', () => {
  const { store, path } = openStore()
  const first = store.create({ name: 'Primo', format: 'STANDARD' })
  const second = store.create({ name: 'Secondo', format: 'STANDARD' })
  store.importDeck({ projectId: first.id, rawText: '60 Carta A MEG 1', source: 'paste' })
  const a = store.createDeckThread({ projectId: first.id, title: 'A' })
  const b = store.createDeckThread({ projectId: first.id, title: 'B' })
  const foreign = store.createDeckThread({ projectId: second.id, title: 'Altro' })
  expect(() => store.assignDeckAiSession(second.id, a.id, 'remote-a')).toThrow('Thread non trovato')
  store.assignDeckAiSession(first.id, a.id, 'remote-a')
  store.assignDeckAiSession(first.id, b.id, 'remote-b')
  expect(() => store.assignDeckAiSession(first.id, a.id, 'remote-b')).toThrow('sessione Codex diversa')
  expect(() => store.saveDeckAiExchange(first.id, a.id, 'remote-b', 'Domanda', 'Risposta', 'turn-1', config))
    .toThrow('Sessione Codex non associata')
  const result = store.saveDeckAiExchange(first.id, a.id, 'remote-a', 'Che ne pensi?', 'Tieni la base.', 'turn-1', config)
  expect(result.messages).toHaveLength(2)
  expect(result.messages[1]).toMatchObject({ author: 'assistant', text: 'Tieni la base.', aiTurnId: 'turn-1', aiConfig: config })
  expect(() => store.saveDeckAiExchange(first.id, a.id, 'remote-a', 'Ancora', ' ', 'turn-2', config))
    .toThrow('Risposta Codex non valida')
  expect(() => store.saveDeckAiExchange(first.id, a.id, 'remote-a', 'Ancora', 'Risposta', 'turn-1', config))
    .toThrow()
  expect(store.listDeckThreads(first.id).find((thread) => thread.id === a.id)?.messages).toHaveLength(2)
  expect(store.listDeckThreads(first.id).find((thread) => thread.id === b.id)?.messages).toEqual([])
  expect(store.listDeckThreads(second.id).find((thread) => thread.id === foreign.id)?.messages).toEqual([])
  expect(store.listDeckVersions(first.id)[0].rawText).toBe('60 Carta A MEG 1')
  store.close()
  const reopened = new ProjectStore(path)
  expect(reopened.listDeckThreads(first.id).find((thread) => thread.id === a.id)).toMatchObject({
    aiSessionRef: 'remote-a', messages: [{ author: 'user' }, { author: 'assistant', aiTurnId: 'turn-1', aiConfig: config }]
  })
  reopened.close()
})

it('invia la lista di partenza e il pacchetto aggiornato a ogni turno', () => {
  const { store } = openStore()
  const project = store.create({ name: 'Prova', format: 'STANDARD' })
  store.importDeck({ projectId: project.id, rawText: '60 Carta A MEG 1', source: 'paste' })
  const thread = store.createDeckThread({ projectId: project.id, title: 'Variante', openingNote: 'Più consistenza' })
  const base = store.listDeckVersions(project.id)[0]
  const catalog: CatalogView = { circuit: 'WESTERN', source: 'TCGdex REST v2/en', sourceLanguage: 'en',
    scope: { setIds: [], names: [] }, syncedAt: null, sets: [], prints: [] }
  const firstEvidence = buildThreadEvidence(thread, base, 'Valuta il motore', [], catalog, [], [])
  expect(deckDiscussionPrompt(thread, base, 'Valuta il motore', firstEvidence)).toContain('60 Carta A MEG 1')
  store.assignDeckAiSession(project.id, thread.id, 'session')
  store.saveDeckAiExchange(project.id, thread.id, 'session', 'Valuta il motore', 'Possibile miglioria.', 'turn', config)
  const continued = store.addDeckThreadMessage(project.id, thread.id, 'Considera anche il tempo.')
  const prompt = deckDiscussionPrompt(continued, base, 'E ora?',
    buildThreadEvidence(continued, base, 'E ora?', [], catalog, [], []))
  expect(prompt).toContain('Considera anche il tempo.')
  expect(prompt).toContain('60 Carta A MEG 1')
  expect(readDeckDiscussionReply({ reply: ' Sì. ' })).toBe('Sì.')
  expect(() => readDeckDiscussionReply({ reply: '' })).toThrow()
  store.close()
})

it('conserva le query automatiche e le fonti nel solo thread che le ha ricevute', async () => {
  const { store, path } = openStore()
  const project = store.create({ name: 'Query', format: 'STANDARD' })
  const other = store.create({ name: 'Altro', format: 'STANDARD' })
  const thread = store.createDeckThread({ projectId: project.id, title: 'Carta' })
  const catalog: CatalogView = { circuit: 'WESTERN', source: 'TCGdex REST v2/en',
    sourceLanguage: 'en', scope: { kind: 'standard-marks', setIds: ['me01'], names: [] },
    syncedAt: '2026-10-25T00:00:00Z', sets: [], prints: [{ id: 'me01-001',
      setId: 'me01', setName: 'Mega Evolution', localId: '001', name: 'Rare Candy',
      category: 'Trainer', rarity: null, regulationMark: 'I', variants: null,
      identityId: 'rare-candy', identityBasis: 'trainer-text',
      gameplay: { hp: null, types: [], evolveFrom: null, attacks: [], abilities: [],
        effect: 'Search your deck.', trainerType: 'Item', weaknesses: [], resistances: [], retreat: null },
      imageBase: null, thumbnail: null, highImageAvailable: null, sourceUpdated: null,
      sourceUrl: 'https://api.tcgdex.net/v2/en/cards/me01-001',
      detailAt: '2026-10-25T00:00:00Z', error: null }] }
  const initial = buildThreadEvidence(thread, null, 'Spiegami Rare Candy', [], catalog, [], [])
  const engine = createAiEvidenceEngine(catalog, [], [],
    { from: '2026-10-01', to: '2026-10-25' })
  const trace = await runAiEvidenceQueries('Spiegami Rare Candy', initial, engine,
    async () => ({ continueAfterResults: false,
      queries: [{ operation: 'catalog.search', printIds: ['me01-001'] }] }))
  const evidence = threadEvidenceWithQueries(initial, trace)
  const prompt = deckDiscussionPrompt(thread, null, 'Spiegami Rare Candy', evidence)
  expect(prompt).toContain('Search your deck.')
  evidence.promptAudit = makeAiPromptAudit(prompt, 2300,
    { inputTokens: 123, cachedInputTokens: 10, outputTokens: 45 })
  store.assignDeckAiSession(project.id, thread.id, 'session-query')
  store.saveDeckAiExchange(project.id, thread.id, 'session-query', 'Spiegami Rare Candy',
    'Permette la ricerca.', 'turn-query', config, undefined, evidence, ['card:me01-001'])
  store.close()
  const reopened = new ProjectStore(path)
  const saved = reopened.getDeckThread(project.id, thread.id)!.messages[1]
  expect(saved.citedSourceIds).toEqual(['card:me01-001'])
  expect(saved.evidence?.aiQueries?.requests[0].sourceIds).toEqual(['card:me01-001'])
  expect(saved.evidence?.promptAudit?.text).toBe(prompt)
  expect(saved.evidence?.promptAudit?.usage?.outputTokens).toBe(45)
  expect(reopened.listDeckThreads(other.id)).toEqual([])
  reopened.close()
})

it('migra i messaggi esistenti senza perdere le osservazioni manuali', () => {
  const { store, path } = openStore()
  const project = store.create({ name: 'Archivio precedente', format: 'STANDARD' })
  const thread = store.createDeckThread({ projectId: project.id, title: 'Storico', openingNote: 'Nota iniziale' })
  store.close()
  const legacy = new DatabaseSync(path)
  legacy.exec('DROP INDEX deck_thread_messages_ai_turn')
  legacy.exec('ALTER TABLE deck_thread_messages DROP COLUMN ai_config_json')
  legacy.exec('ALTER TABLE deck_thread_messages DROP COLUMN ai_turn_id')
  legacy.close()
  const migrated = new ProjectStore(path)
  expect(migrated.listDeckThreads(project.id).find((item) => item.id === thread.id)?.messages)
    .toMatchObject([{ text: 'Nota iniziale', aiConfig: null, aiTurnId: null }])
  migrated.assignDeckAiSession(project.id, thread.id, 'session')
  migrated.saveDeckAiExchange(project.id, thread.id, 'session', 'Domanda', 'Risposta', 'turn', config)
  expect(migrated.listDeckThreads(project.id).find((item) => item.id === thread.id)?.messages).toHaveLength(3)
  migrated.close()
})

it('salva una candidata AI atomica solo con 60 carte, stampe e fonti verificabili', () => {
  const { store, path } = openStore()
  const project = store.create({ name: 'Proposta', format: 'STANDARD' })
  store.importDeck({ projectId: project.id, rawText: '1 Mew ex SV04.5 216\n59 Psychic Energy SVE 005', source: 'paste' })
  const thread = store.createDeckThread({ projectId: project.id, title: 'Nuovo piano' })
  store.assignDeckAiSession(project.id, thread.id, 'session')
  function print(id: string, name: string, category: string, stage: string | null = null): CatalogPrint {
    const [setId, localId] = id.split('-')
    return { id, setId, localId, name, setName: setId, category, stage,
      energyType: category === 'Energy' ? 'Normal' : null,
      rarity: null, regulationMark: 'H', variants: null, identityId: name,
      identityBasis: 'unverified', imageBase: null, thumbnail: null, highImageAvailable: null,
      sourceUpdated: null, sourceUrl: `https://api.tcgdex.net/v2/en/cards/${id}`,
      detailAt: '2026-10-23T00:00:00.000Z', error: null }
  }
  const catalog: CatalogView = { circuit: 'WESTERN', source: 'TCGdex REST v2/en',
    sourceLanguage: 'en', scope: { setIds: ['sv04.5', 'sve'], names: [] },
    syncedAt: '2026-10-23T00:00:00.000Z', sets: [],
    prints: [print('sv04.5-216', 'Mew ex', 'Pokemon', 'Basic'),
      print('sve-005', 'Psychic Energy', 'Energy')] }
  const sources = [{ id: 'base', label: 'Lista iniziale', url: null },
    { id: 'catalog', label: 'TCGdex', url: 'https://api.tcgdex.net/v2/en' }]
  const constraint: DeckConstraint = { id: 'c', projectId: project.id, identityId: 'Mew ex',
    identityName: 'Mew ex', printId: null, kind: 'required', quantity: 1,
    createdAt: '2026-10-23T00:00:00.000Z', updatedAt: '2026-10-23T00:00:00.000Z' }
  const rawText = '1 Mew ex SV04.5 216\n59 Psychic Energy SVE 005'
  const parsed = validateDeckProposal({ outcome: 'candidate', rawText,
    rationale: 'Mantieni la carta Base.', sourceIds: ['base', 'catalog'] }, project.id, catalog,
  [constraint], sources)
  expect(parsed.checks.some((check) => check.includes('Legalità Standard'))).toBe(true)
  expect(() => validateDeckProposal({ outcome: 'candidate', rawText: '59 Psychic Energy SVE 005',
    rationale: 'Incompleto', sourceIds: ['catalog'] }, project.id, catalog, [], sources)).toThrow('60 carte')
  expect(() => validateDeckProposal({ outcome: 'candidate', rawText: '1 Carta inventata XXX 1\n59 Psychic Energy SVE 005',
    rationale: 'Inventata', sourceIds: ['catalog'] }, project.id, catalog, [], sources)).toThrow('Stampa non verificabile')
  expect(() => validateDeckProposal({ outcome: 'candidate', rawText,
    rationale: 'Fonti inventate', sourceIds: ['event'] }, project.id, catalog, [], sources)).toThrow('fonte non presente')
  expect(validateDeckProposal({ outcome: 'no_change', rawText: '',
    rationale: 'Dati insufficienti.', sourceIds: ['base'] }, project.id, catalog, [], sources))
    .toMatchObject({ outcome: 'no_change', rawText: '', rationale: 'Dati insufficienti.' })
  expect(() => validateDeckProposal({ outcome: 'no_change', rawText,
    rationale: 'Contraddittorio.', sourceIds: ['base'] }, project.id, catalog, [], sources))
    .toThrow('lista allegata')
  expect(() => validateDeckProposal({ outcome: 'candidate', rawText: '60 Psychic Energy SVE 005',
    rationale: 'Viola il vincolo', sourceIds: ['base'] }, project.id, catalog, [constraint], sources)).toThrow('costruzione')
  const aceCatalog: CatalogView = { ...catalog, prints: [...catalog.prints,
    { ...print('sv05-154', 'Maximum Belt', 'Trainer'), rarity: 'ACE SPEC Rare' },
    { ...print('sv05-157', 'Prime Catcher', 'Trainer'), rarity: 'ACE SPEC Rare' }] }
  expect(() => validateDeckProposal({ outcome: 'candidate',
    rawText: '1 Mew ex SV04.5 216\n1 Maximum Belt SV05 154\n1 Prime Catcher SV05 157\n57 Psychic Energy SVE 005',
    rationale: 'Troppe ACE SPEC', sourceIds: ['base'] }, project.id, aceCatalog, [], sources))
    .toThrow('costruzione')
  const rotated: CatalogView = { ...catalog, prints: catalog.prints.map((item) =>
    item.id === 'sv04.5-216' ? { ...item, regulationMark: 'G' } : item) }
  expect(() => validateDeckProposal({ outcome: 'candidate', rawText,
    rationale: 'Vecchio marchio', sourceIds: ['base'] }, project.id, rotated, [], sources))
    .toThrow('marchio ruotato')
  const future: CatalogView = { ...catalog, sets: [{ id: 'sv04.5', name: 'Futuro',
    sourceTotal: 1, sampleTotal: 1, fetchedAt: '2026-10-23T00:00:00.000Z', releaseDate: '2099-01-01' }] }
  expect(() => validateDeckProposal({ outcome: 'candidate', rawText,
    rationale: 'Futuro', sourceIds: ['base'] }, project.id, future, [], sources))
    .toThrow('non ancora rilasciato')
  const saved = store.saveDeckAiExchange(project.id, thread.id, 'session', 'Proponi', parsed.rationale,
    'turn-proposal', config, { rawText: parsed.rawText, note: parsed.rationale,
      sources: parsed.sources, checks: parsed.checks })
  expect(saved.candidates).toMatchObject([{ origin: 'ai', sequence: 1, aiTurnId: 'turn-proposal', rawText }])
  expect(saved.candidates[0].sources).toEqual(expect.arrayContaining(sources))
  expect(saved.candidates[0].sources.some((source) => source.url?.endsWith('/cards/sv04.5-216'))).toBe(true)
  expect(saved.messages).toHaveLength(2)
  store.saveDeckCandidate({ projectId: project.id, threadId: thread.id, rawText,
    note: 'Bozza manuale' })
  expect(store.listDeckThreads(project.id).find((item) => item.id === thread.id)?.candidates
    .map((item) => item.sequence)).toEqual([1, 2])
  expect(store.getBaseline(project.id)?.rawText).toBe(rawText)
  store.close()
  const reopened = new ProjectStore(path)
  expect(reopened.listDeckThreads(project.id).find((item) => item.id === thread.id)?.candidates)
    .toMatchObject([{ origin: 'ai', aiTurnId: 'turn-proposal' }, { origin: 'manual' }])
  reopened.close()
})

it('inserisce dati e link soltanto per un evento pertinente al thread', () => {
  const { store } = openStore()
  const project = store.create({ name: 'Evento', format: 'STANDARD' })
  store.importDeck({ projectId: project.id, rawText: '60 Psychic Energy SVE 005', source: 'paste' })
  const thread = store.createDeckThread({ projectId: project.id, title: 'Con evento' })
  const base = store.listDeckVersions(project.id)[0]
  const catalog: CatalogView = { circuit: 'WESTERN', source: 'TCGdex REST v2/en',
    sourceLanguage: 'en', scope: { setIds: [], names: [] }, syncedAt: null, sets: [], prints: [] }
  const event = { id: 'snapshot-1', eventId: '0123456789abcdef01234567', circuit: 'WESTERN', format: 'STANDARD',
    name: 'Campione Limitless', date: '2026-10-22', platform: 'PTCGL',
    publicUrl: 'https://play.limitlesstcg.com/tournament/0123456789abcdef01234567',
    coverage: { returnedParticipants: 1, complete60Lists: 1 },
    participations: [{ listStatus: 'available', cardTotal: 60, placing: 1,
      playerId: 'player', deck: { id: 'a', name: 'Mega Absol ex' }, cards: [{ count: 2, name: 'Mega Absol ex',
        set: 'ME01', number: '086', category: 'pokemon' }] }] } as TournamentSnapshot
  const evidence = buildThreadEvidence(thread, base, 'Valuta Mega Absol', [], catalog, [event], [])
  const context = deckProposalPrompt(thread, base, 'Valuta Mega Absol', [], catalog, evidence)
  expect(context.sources.find((item) => item.id === `event:play:${event.eventId}`)?.url).toBe(event.publicUrl)
  expect(context.prompt).toContain('2 Mega Absol ex ME01 086')
  expect(context.prompt).toContain('Campione Limitless')
  store.close()
})
