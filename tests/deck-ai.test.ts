import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, expect, it } from 'vitest'
import { ProjectStore } from '../src/main/project-store'
import { deckDiscussionPrompt, readDeckDiscussionReply } from '../src/main/deck-ai'
import type { AiRunConfig } from '../src/shared/ai'

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

it('invia la lista di partenza al primo turno e solo note nuove nei successivi', () => {
  const { store } = openStore()
  const project = store.create({ name: 'Prova', format: 'STANDARD' })
  store.importDeck({ projectId: project.id, rawText: '60 Carta A MEG 1', source: 'paste' })
  const thread = store.createDeckThread({ projectId: project.id, title: 'Variante', openingNote: 'Più consistenza' })
  const base = store.listDeckVersions(project.id)[0]
  expect(deckDiscussionPrompt(thread, base, 'Valuta il motore')).toContain('60 Carta A MEG 1')
  store.assignDeckAiSession(project.id, thread.id, 'session')
  store.saveDeckAiExchange(project.id, thread.id, 'session', 'Valuta il motore', 'Possibile miglioria.', 'turn', config)
  const continued = store.addDeckThreadMessage(project.id, thread.id, 'Considera anche il tempo.')
  const prompt = deckDiscussionPrompt(continued, base, 'E ora?')
  expect(prompt).toContain('Considera anche il tempo.')
  expect(prompt).not.toContain('60 Carta A MEG 1')
  expect(readDeckDiscussionReply({ reply: ' Sì. ' })).toBe('Sì.')
  expect(() => readDeckDiscussionReply({ reply: '' })).toThrow()
  store.close()
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
