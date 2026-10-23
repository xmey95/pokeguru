import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { AiModel, AiPreferences, AiRunConfig } from '../shared/ai'

export const defaultAiPreferences: AiPreferences = { model: null, reasoningEffort: null }

export class AiPreferencesStore {
  private readonly path: string

  constructor(userData: string) {
    this.path = join(userData, 'ai-preferences.json')
  }

  read(): AiPreferences {
    if (!existsSync(this.path)) return { ...defaultAiPreferences }
    try {
      const value = JSON.parse(readFileSync(this.path, 'utf8')) as Partial<AiPreferences>
      if ((value.model !== null && typeof value.model !== 'string') ||
        (value.reasoningEffort !== null && typeof value.reasoningEffort !== 'string') ||
        (typeof value.model === 'string' && value.model.length > 100) ||
        (typeof value.reasoningEffort === 'string' && value.reasoningEffort.length > 30)) {
        throw new Error('invalid preferences')
      }
      return { model: value.model, reasoningEffort: value.reasoningEffort }
    } catch {
      throw new Error('Impossibile leggere le preferenze AI locali.')
    }
  }

  write(value: AiPreferences): AiPreferences {
    const temporary = `${this.path}.tmp`
    writeFileSync(temporary, JSON.stringify(value), { encoding: 'utf8', mode: 0o600 })
    renameSync(temporary, this.path)
    return value
  }
}

export function resolveAiConfig(value: unknown, models: AiModel[], source: AiRunConfig['source']): AiRunConfig {
  if (!value || typeof value !== 'object') throw new Error('Configurazione AI non valida.')
  const candidate = value as Partial<AiPreferences>
  if (candidate.model === null && candidate.reasoningEffort === null) {
    return { provider: 'codex', model: null, reasoningEffort: null, source }
  }
  if (typeof candidate.model !== 'string' || candidate.model.length > 100) throw new Error('Seleziona un modello disponibile.')
  const model = models.find((item) => item.id === candidate.model)
  if (!model) throw new Error('Il modello scelto non è più disponibile. Aggiorna Impostazioni AI.')
  if (candidate.reasoningEffort !== null &&
    (typeof candidate.reasoningEffort !== 'string' || !model.reasoningEfforts.some((item) => item.id === candidate.reasoningEffort))) {
    throw new Error('Il livello di ragionamento scelto non è disponibile per questo modello.')
  }
  return { provider: 'codex', model: model.id, reasoningEffort: candidate.reasoningEffort, source }
}
