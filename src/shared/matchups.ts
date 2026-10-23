export interface MatchupNote {
  id: string
  projectId: string
  opponent: string
  strengths: string
  weaknesses: string
  ourKeyCards: string
  theirKeyCards: string
  strategy: string
  createdAt: string
  updatedAt: string
  linkedToCurrentList: boolean
}

export interface SaveMatchupNoteInput {
  id?: string
  projectId: string
  opponent: string
  strengths: string
  weaknesses: string
  ourKeyCards: string
  theirKeyCards: string
  strategy: string
}
