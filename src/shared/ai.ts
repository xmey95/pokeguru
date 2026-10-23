export interface AiPreferences {
  model: string | null
  reasoningEffort: string | null
}

export interface AiModel {
  id: string
  name: string
  defaultReasoningEffort: string | null
  reasoningEfforts: { id: string; description: string }[]
  isDefault: boolean
}

export interface AiConnection {
  account: 'chatgpt' | 'apiKey' | 'other' | null
  plan: string | null
  models: AiModel[]
}

export interface AiRunConfig extends AiPreferences {
  provider: 'codex'
  source: 'global' | 'override'
}

export interface AiDataPreview {
  cardLines: string[]
  period: string
  metaSource: string
  opponent: string
  opponentSource: string
}
