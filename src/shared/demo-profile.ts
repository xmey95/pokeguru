export interface DemoGuide {
  projectId: string
  opponentId: string
  metaId: string
  title: string
  promptVersion: string
  generatedAt: string
}

export interface DemoProfile {
  formatVersion: 1
  mode: 'pilot-readonly' | 'validated-readonly'
  guides: DemoGuide[]
}

export const DEMO_READONLY_MESSAGE = 'Demo offline: puoi consultare le guide e le loro liste. Modifiche, aggiornamenti e chiamate AI sono disabilitati.'
