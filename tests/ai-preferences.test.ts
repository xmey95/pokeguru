import { mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs'
import { basename, join, sep } from 'node:path'
import { describe, expect, it } from 'vitest'
import { AiPreferencesStore, resolveAiConfig } from '../src/main/ai-preferences'

const models = [{ id: 'example-model', name: 'Example', defaultReasoningEffort: 'medium',
  reasoningEfforts: [{ id: 'low', description: 'Short' }, { id: 'medium', description: 'Balanced' }], isDefault: true }]

describe('preferenze AI', () => {
  it('salva soltanto modello e profondità e li ritrova alla riapertura', () => {
    const directory = mkdtempSync(join(process.cwd(), '.pokeguru-ai-settings-'))
    try {
      const store = new AiPreferencesStore(directory)
      expect(store.read()).toEqual({ model: null, reasoningEffort: null })
      store.write({ model: 'example-model', reasoningEffort: 'medium' })
      expect(new AiPreferencesStore(directory).read()).toEqual({ model: 'example-model', reasoningEffort: 'medium' })
      expect(JSON.parse(readFileSync(join(directory, 'ai-preferences.json'), 'utf8')))
        .toEqual({ model: 'example-model', reasoningEffort: 'medium' })
    } finally {
      if (!realpathSync(directory).startsWith(`${realpathSync(process.cwd())}${sep}`) ||
        !basename(directory).startsWith('.pokeguru-ai-settings-')) throw new Error('Percorso temporaneo inatteso.')
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it('rifiuta modelli e profondità non presenti nel catalogo attuale', () => {
    expect(resolveAiConfig({ model: 'example-model', reasoningEffort: 'low' }, models, 'global'))
      .toEqual({ provider: 'codex', model: 'example-model', reasoningEffort: 'low', source: 'global' })
    expect(() => resolveAiConfig({ model: 'missing', reasoningEffort: null }, models, 'override')).toThrow('non è più disponibile')
    expect(() => resolveAiConfig({ model: 'example-model', reasoningEffort: 'high' }, models, 'override')).toThrow('non è disponibile')
    expect(() => resolveAiConfig({ model: null, reasoningEffort: 'low' }, models, 'global')).toThrow('Seleziona un modello')
  })
})
