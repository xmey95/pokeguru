import { DatabaseSync } from 'node:sqlite'
import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { performance } from 'node:perf_hooks'
import { it } from 'vitest'
import { TournamentStore } from '../src/main/tournament-store'
import { completeMainTournament } from '../src/main/limitless-main-tournament'
import type { MainTournamentSnapshot } from '../src/shared/main-tournament'

const benchmark = process.env.POKEGURU_REGIONAL_PERF === '1' ? it : it.skip

benchmark('measures 16 intermediate Regional list revisions', () => {
  const folder = mkdtempSync(join(tmpdir(), 'pokeguru-regional-perf-'))
  const path = join(folder, 'events.sqlite')
  const store = new TournamentStore(path)
  const db = new DatabaseSync(path)
  try {
    const cards = Array.from({ length: 20 }, (_, index) => ({ category: 'pokemon' as const,
      count: 3, name: `Card ${index}`, set: 'MEG', number: String(index) }))
    let participants: MainTournamentSnapshot['participants'] = Array.from({ length: 300 }, (_, index) => ({
      placing: index + 1, playerName: `Player ${index}`, playerId: String(index), country: 'IT',
      deckId: String(index), deckName: `Deck ${index}`, listId: String(index),
      listUrl: `https://limitlesstcg.com/decks/list/${index}`, cards: null, cardTotal: null
    }))
    const base: MainTournamentSnapshot = { id: '', eventId: '582', name: 'Regional fixture',
      date: '2026-10-24', country: 'IT', players: 300, url: 'https://limitlesstcg.com/tournaments/582',
      fetchedAt: '2026-10-25T00:00:00Z', source: 'Limitless tournament database', circuit: 'WESTERN',
      format: 'STANDARD', type: 'IN_PERSON', participants, cached: false,
      coverage: { returnedParticipants: 300, listedDecks: 300, fetchedLists: 0,
        complete60Lists: 0, noListLink: 0 } }
    store.saveMain(completeMainTournament(base))
    for (let index = 0; index < 16; index++) {
      participants = participants.map((item, number) => number === index
        ? { ...item, cards, cardTotal: 60 } : item)
      store.saveMain(completeMainTournament({ ...base, participants }), index === 15)
    }
    const stats = () => db.prepare(`SELECT COUNT(*) AS revisions,
      SUM(length(payload)) AS logicalBytes FROM main_tournament_snapshots`).get() as {
        revisions: number; logicalBytes: number
      }
    const before = stats()
    const started = performance.now()
    const removed = store.pruneMainIntermediates(new Set())
    const pruneMs = performance.now() - started
    const after = stats()
    console.log(JSON.stringify({ before, after, removed, pruneMs: +pruneMs.toFixed(2),
      pageCount: db.prepare('PRAGMA page_count').get(),
      freePages: db.prepare('PRAGMA freelist_count').get() }))
  } finally {
    db.close()
    store.close()
    if (realpathSync(dirname(folder)) !== realpathSync(tmpdir()) ||
      !basename(folder).startsWith('pokeguru-regional-perf-')) throw new Error('Percorso temporaneo inatteso.')
    rmSync(folder, { recursive: true, force: true })
  }
}, 120_000)
