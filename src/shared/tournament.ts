export interface TournamentCard {
  category: 'pokemon' | 'trainer' | 'energy'
  count: number
  name: string
  set: string
  number: string
}

export interface TournamentParticipation {
  playerId: string
  playerName: string
  country: string | null
  placing: number | null
  record: { wins: number; losses: number; ties: number } | null
  deck: { id: string; name: string } | null
  listStatus: 'available' | 'missing' | 'invalid'
  cards: TournamentCard[]
  cardTotal: number | null
}

export interface TournamentSnapshot {
  id: string
  eventId: string
  fetchedAt: string
  source: 'Limitless Play API'
  sourceUrl: string
  publicUrl: string
  name: string
  date: string
  circuit: 'WESTERN'
  format: 'STANDARD'
  platform: 'PTCGL'
  isOnline: true
  reportedPlayers: number
  phases: { phase: number; type: string; rounds: number; mode: string }[]
  participations: TournamentParticipation[]
  coverage: {
    returnedParticipants: number
    availableLists: number
    invalidLists: number
    missingLists: number
    complete60Lists: number
  }
  cached: boolean
}
