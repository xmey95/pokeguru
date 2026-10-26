import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { expect, it } from 'vitest'
import { CodexControl } from '../src/main/codex-control'
import { ProjectStore } from '../src/main/project-store'
import { deckThreadPrompt, DECK_THREAD_SCHEMA, readDeckThreadTurn } from '../src/main/deck-ai'
import { buildThreadEvidence } from '../src/main/thread-evidence'
import { createAiEvidenceEngine } from '../src/main/ai-evidence-engine'
import { runAiEvidenceQueries, threadEvidenceWithQueries } from '../src/main/ai-evidence-queries'
import { planEvidenceQueriesWithCodex } from '../src/main/codex-evidence-plan'
import type { CatalogPrint, CatalogView } from '../src/shared/catalog'
import type { AiRunConfig } from '../src/shared/ai'

const live = process.env.POKEGURU_CODEX_PROPOSAL_LIVE === '1' ? it : it.skip
const config: AiRunConfig = { provider: 'codex', source: 'global', model: null, reasoningEffort: null }

function print(id: string, name: string, category: string, stage: string | null = null): CatalogPrint {
  const [setId, localId] = id.split('-')
  const gameplay = name === "Boss's Orders" ? { hp: null, types: [], evolveFrom: null,
    attacks: [], abilities: [], effect: "Switch one of your opponent's Benched Pokémon with their Active Pokémon.",
    trainerType: 'Supporter', weaknesses: [], resistances: [], retreat: null } : null
  return { id, setId, localId, name, setName: setId, category, stage,
    energyType: category === 'Energy' ? 'Normal' : null,
    rarity: null, regulationMark: 'I', variants: null, identityId: name,
    identityBasis: 'unverified', imageBase: null, thumbnail: null, highImageAvailable: null,
    sourceUpdated: null, sourceUrl: `https://api.tcgdex.net/v2/en/cards/${id}`,
    detailAt: '2026-10-23T00:00:00.000Z', gameplay, error: null }
}

live('produce due candidate complete in sessioni Codex isolate', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'pokeguru-proposal-live-'))
  const store = new ProjectStore(join(directory, 'projects.sqlite'))
  const control = new CodexControl()
  try {
    const project = store.create({ name: 'Proposte reali', format: 'STANDARD' })
    const rawText = '1 Mega Absol ex ME01 086\n59 Psychic Energy SVE 005'
    store.importDeck({ projectId: project.id, rawText, source: 'paste' })
    const first = store.createDeckThread({ projectId: project.id, title: 'Uno' })
    const second = store.createDeckThread({ projectId: project.id, title: 'Due' })
    const base = store.listDeckVersions(project.id)[0]
    const catalog: CatalogView = { circuit: 'WESTERN', source: 'TCGdex REST v2/en',
      sourceLanguage: 'en', scope: { setIds: ['me01', 'sve'], names: [] },
      syncedAt: '2026-10-23T00:00:00.000Z', sets: [],
      prints: [print('me01-086', 'Mega Absol ex', 'Pokemon', 'Basic'),
        print('sve-005', 'Psychic Energy', 'Energy'),
        print('me01-114', "Boss's Orders", 'Trainer')] }
    const discussion = 'Spiega in una frase perché una modifica alla lista richiede il confronto con la base; non proporre una lista.'
    const discussionEvidence = buildThreadEvidence(first, base, discussion, [], catalog, [], [])
    const discussionContext = deckThreadPrompt(first, base, discussion, [], catalog, discussionEvidence)
    const discussionResult = await control.jsonTurn(null, directory, discussionContext.prompt, config, DECK_THREAD_SCHEMA)
    const discussionTurn = readDeckThreadTurn(discussionResult.value, project.id, base, catalog, [],
      discussionEvidence, discussionContext.sources)
    expect(discussionTurn.answer.length).toBeGreaterThan(0)
    expect(discussionTurn.proposal).toBeUndefined()
    store.assignDeckAiSession(project.id, first.id, discussionResult.sessionId)
    store.saveDeckAiExchange(project.id, first.id, discussionResult.sessionId, discussion,
      discussionTurn.answer, discussionResult.turnId, config, undefined, discussionEvidence,
      discussionTurn.citedSourceIds)
    const answers = await Promise.all([first, second].map(async (thread, index) => {
      const current = store.getDeckThread(project.id, thread.id)!
      const count = index + 1
      const question = index === 0
        ? `Vorrei provare ${count} Boss's Orders ME01 114 al posto di ${count} Psychic Energy SVE 005, lasciando Mega Absol ex. Come cambieresti il mio mazzo? È una prova strutturale, non una raccomandazione competitiva.`
        : `Vorrei che il mazzo potesse scegliere più spesso un bersaglio avversario, con due copie della carta adatta. Con le carte disponibili, come lo miglioreresti mantenendo Mega Absol ex? È una prova strutturale, non una raccomandazione competitiva.`
      const initialEvidence = buildThreadEvidence(current, base, question, [], catalog, [], [])
      const today = new Date().toISOString().slice(0, 10)
      const trace = await runAiEvidenceQueries(question, initialEvidence,
        createAiEvidenceEngine(catalog, [], [], { from: today, to: today }),
        (prompt) => planEvidenceQueriesWithCodex(prompt, config))
      const evidence = threadEvidenceWithQueries(initialEvidence, trace)
      const context = deckThreadPrompt(current, base, question, [], catalog, evidence)
      const answer = await control.jsonTurn(current.aiSessionRef, directory, context.prompt, config, DECK_THREAD_SCHEMA)
      const sessionId = answer.sessionId
      if (!current.aiSessionRef) store.assignDeckAiSession(project.id, thread.id, sessionId)
      const turn = readDeckThreadTurn(answer.value, project.id, base, catalog, [], evidence,
        context.sources)
      expect(turn.proposal, JSON.stringify({ question, response: answer.value, interpreted: turn.answer })).toBeDefined()
      const saved = store.saveDeckAiExchange(project.id, thread.id, sessionId,
        question, turn.answer, answer.turnId, config, turn.proposal, evidence, turn.citedSourceIds)
      expect(saved.candidates).toHaveLength(1)
      expect(saved.candidates[0].parsed.interpretedTotal).toBe(60)
      return { sessionId, rawText: saved.candidates[0].rawText }
    }))
    expect(answers[0].sessionId).not.toBe(answers[1].sessionId)
    expect(answers[0].rawText).not.toBe(answers[1].rawText)
    expect(store.getBaseline(project.id)?.rawText).toBe(rawText)
    store.close()
    const reopened = new ProjectStore(join(directory, 'projects.sqlite'))
    expect(reopened.listDeckThreads(project.id).map((thread) => thread.candidates.length)).toEqual([1, 1])
    reopened.close()
    console.log('Proposte Codex reali OK: due liste da 60 distinte, fonti validate e lista principale invariata.')
  } finally {
    await control.stop()
    try { store.close() } catch { /* already closed */ }
    if (realpathSync(dirname(directory)) !== realpathSync(tmpdir()) ||
      !basename(directory).startsWith('pokeguru-proposal-live-')) throw new Error('Percorso temporaneo inatteso.')
    rmSync(directory, { recursive: true, force: true })
  }
}, 240_000)
