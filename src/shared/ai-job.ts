export type AiJobKind = 'thread-ask' | 'thread-propose' | 'matchup-generate' |
  'matchup-revise' | 'matchup-continue'
export type AiJobStatus = 'running' | 'ready' | 'applied' | 'interrupted' | 'cancelled' | 'failed'

export interface AiJobSummary {
  id: string
  kind: AiJobKind
  projectId: string
  resourceId: string
  status: AiJobStatus
  createdAt: string
  updatedAt: string
  error: string | null
}
