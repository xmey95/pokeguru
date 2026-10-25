import { DatabaseSync } from 'node:sqlite'
import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { performance } from 'node:perf_hooks'
import { it } from 'vitest'
import { ProjectStore } from '../src/main/project-store'
import { TournamentStore } from '../src/main/tournament-store'
import type { TournamentSnapshot } from '../src/shared/tournament'
import type { MainTournamentSnapshot } from '../src/shared/main-tournament'

const benchmark = process.env.POKEGURU_SUMMARY_PERF === '1' ? it : it.skip

function measure<T>(run: () => T): { ms: number; bytes: number; value: T } {
  const start = performance.now()
  const value = run()
  return { ms: +(performance.now() - start).toFixed(2),
    bytes: Buffer.byteLength(JSON.stringify(value)), value }
}

benchmark('measures event and thread summaries with substantial local evidence', () => {
  const temporary = mkdtempSync(join(tmpdir(), 'pokeguru-summary-perf-'))
  const eventsPath = join(temporary, 'events.sqlite')
  const projectsPath = join(temporary, 'projects.sqlite')
  const events = new TournamentStore(eventsPath)
  const projects = new ProjectStore(projectsPath)
  let db: DatabaseSync | null = null
  try {
    const date = '2026-10-24'
    const cards = Array.from({ length: 20 }, (_, number) => ({ category: 'pokemon' as const,
      count: 3, name: `Card ${number}`, set: 'MEG', number: String(number) }))
    for (let index = 0; index < 120; index++) {
      const id = String(index).padStart(24, '0')
      const participants = Array.from({ length: 120 }, (_, number) => ({
        playerId: `${id}-${number}`, playerName: `Player ${number}`, country: 'IT', placing: number + 1,
        record: null, deck: { id: 'deck', name: 'Test deck' }, listStatus: 'available' as const,
        cards, cardTotal: 60
      }))
      events.save({ id: `play-${id}`, eventId: id, fetchedAt: `${date}T00:00:00Z`,
        source: 'Limitless Play API', sourceUrl: '', publicUrl: '', name: `Event ${index}`, date,
        circuit: 'WESTERN', format: 'STANDARD', platform: 'PTCGL', isOnline: true,
        reportedPlayers: 120, phases: [], participations: participants,
        coverage: { returnedParticipants: 120, availableLists: 120, invalidLists: 0,
          missingLists: 0, complete60Lists: 120 }, cached: true } satisfies TournamentSnapshot)
    }
    for (let index = 0; index < 60; index++) {
      const participants = Array.from({ length: 300 }, (_, number) => ({
        placing: number + 1, playerName: `Player ${number}`, playerId: String(number), country: 'IT',
        deckId: 'deck', deckName: 'Test deck', listId: String(number), listUrl: null, cards, cardTotal: 60
      }))
      events.saveMain({ id: `main-${index}`, eventId: String(index), name: `Regional ${index}`, date,
        country: 'IT', players: 300, url: '', fetchedAt: `${date}T00:00:00Z`,
        source: 'Limitless tournament database', circuit: 'WESTERN', format: 'STANDARD',
        type: 'IN_PERSON', participants, cached: true,
        coverage: { returnedParticipants: 300, listedDecks: 300, fetchedLists: 300,
          complete60Lists: 300, noListLink: 0 } } satisfies MainTournamentSnapshot)
    }
    const project = projects.create({ name: 'Benchmark', format: 'STANDARD' })
    db = new DatabaseSync(projectsPath)
    const addThread = db.prepare(`INSERT INTO deck_threads
      (id, project_id, title, base_version_id, ai_session_ref, created_at, updated_at)
      VALUES (?, ?, ?, NULL, NULL, ?, ?)`)
    const addMessage = db.prepare(`INSERT INTO deck_thread_messages
      (id, thread_id, author, text, created_at, evidence_json) VALUES (?, ?, 'assistant', ?, ?, ?)`)
    const addCandidate = db.prepare(`INSERT INTO deck_thread_candidates
      (id, thread_id, sequence, raw_text, parsed_json, note, origin, created_at)
      VALUES (?, ?, 1, ?, ?, '', 'manual', ?)`)
    const evidence = JSON.stringify({ sources: [], cards: [], payload: 'x'.repeat(32_000) })
    const rawText = '60 Synthetic Card MEG 1'
    const parsed = JSON.stringify({ interpretedTotal: 60, diagnostics: [], lines: [] })
    db.exec('BEGIN IMMEDIATE')
    for (let thread = 0; thread < 160; thread++) {
      const id = `thread-${thread}`
      addThread.run(id, project.id, `Thread ${thread}`, date, date)
      for (let message = 0; message < 5; message++) addMessage.run(
        `${id}-message-${message}`, id, `Answer ${message}`, date, evidence)
      addCandidate.run(`${id}-candidate`, id, rawText, parsed, date)
    }
    db.exec('COMMIT')
    const oldPlay = measure(() => events.list().map(({ eventId, name, date, circuit, platform,
      isOnline, reportedPlayers, coverage, pairingCoverage }) => ({ eventId, name, date,
      circuit, platform, isOnline, reportedPlayers, coverage, pairingCoverage })))
    const newPlay = measure(() => events.summaries())
    const oldMain = measure(() => events.listMain().map(({ eventId, name, date, country,
      players, url, coverage }) => ({ eventId, name, date, country, players, url, coverage })))
    const newMain = measure(() => events.mainSummaries())
    const oldThreads = measure(() => projects.listDeckThreads(project.id))
    const newThreads = measure(() => projects.listDeckThreadSummaries(project.id))
    const detail = measure(() => projects.getDeckThread(project.id, 'thread-80'))
    console.log(JSON.stringify({ play: { count: 120, oldMs: oldPlay.ms, newMs: newPlay.ms,
      bytes: newPlay.bytes }, main: { count: 60, oldMs: oldMain.ms, newMs: newMain.ms,
      bytes: newMain.bytes }, threads: { count: 160, oldMs: oldThreads.ms,
      oldBytes: oldThreads.bytes, newMs: newThreads.ms, newBytes: newThreads.bytes,
      detailMs: detail.ms, detailBytes: detail.bytes } }))
  } finally {
    db?.close()
    projects.close()
    events.close()
    if (realpathSync(dirname(temporary)) !== realpathSync(tmpdir()) ||
      !basename(temporary).startsWith('pokeguru-summary-perf-')) throw new Error('Percorso temporaneo inatteso.')
    rmSync(temporary, { recursive: true, force: true })
  }
}, 120_000)
