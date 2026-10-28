export type AiJobKind = 'thread-ask' | 'thread-propose' | 'matchup-generate' |
  'matchup-revise' | 'matchup-continue'
export type AiJobStatus = 'running' | 'ready' | 'applied' | 'interrupted' | 'cancelled' | 'failed'

export type AiJobPhase = 'preparing' | 'catalog' | 'events' | 'planning' |
  'analysis' | 'verification' | 'saving'

export interface AiJobProgress {
  phase: AiJobPhase
  detail: string
  summary: string | null
  updatedAt: string
  steps: { phase: AiJobPhase; detail: string; at: string }[]
}

export interface AiJobSummary {
  id: string
  kind: AiJobKind
  projectId: string
  resourceId: string
  status: AiJobStatus
  createdAt: string
  updatedAt: string
  error: string | null
  progress?: AiJobProgress | null
}
