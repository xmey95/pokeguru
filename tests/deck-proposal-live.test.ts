import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { expect, it } from 'vitest'
import { CodexControl } from '../src/main/codex-control'
import { ProjectStore } from '../src/main/project-store'
import { deckProposalPrompt, DECK_PROPOSAL_SCHEMA, validateDeckProposal } from '../src/main/deck-ai'
import type { CatalogPrint, CatalogView } from '../src/shared/catalog'
import type { AiRunConfig } from '../src/shared/ai'

const live = process.env.POKEGURU_CODEX_PROPOSAL_LIVE === '1' ? it : it.skip
const config: AiRunConfig = { provider: 'codex', source: 'global', model: null, reasoningEffort: null }

function print(id: string, name: string, category: string, stage: string | null = null): CatalogPrint {
  const [setId, localId] = id.split('-')
  return { id, setId, localId, name, setName: setId, category, stage,
    energyType: category === 'Energy' ? 'Normal' : null,
    rarity: null, regulationMark: 'I', variants: null, identityId: name,
    identityBasis: 'unverified', imageBase: null, thumbnail: null, highImageAvailable: null,
    sourceUpdated: null, sourceUrl: `https://api.tcgdex.net/v2/en/cards/${id}`,
    detailAt: '2026-10-23T00:00:00.000Z', error: null }
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
    const answers = await Promise.all([first, second].map(async (thread, index) => {
      const count = index + 1
      const question = `Prepara una candidata di prova: aggiungi esattamente ${count} Boss's Orders ME01 114, togli ${count} Psychic Energy SVE 005 e conserva Mega Absol ex. Restituisci l'intera lista di 60 carte usando i codici del catalogo; è una prova strutturale, non una raccomandazione competitiva.`
      const context = deckProposalPrompt(thread, base, question, [], catalog, null)
      const sessionId = await control.startThread(directory, config)
      store.assignDeckAiSession(project.id, thread.id, sessionId)
      const answer = await control.jsonTurn(sessionId, directory, context.prompt, config, DECK_PROPOSAL_SCHEMA)
      const proposal = validateDeckProposal(answer.value, project.id, catalog, [], context.sources)
      expect(proposal.outcome).toBe('candidate')
      const saved = store.saveDeckAiExchange(project.id, thread.id, sessionId,
        question, proposal.rationale, answer.turnId, config, {
          rawText: proposal.rawText, note: proposal.rationale,
          sources: proposal.sources, checks: proposal.checks })
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
