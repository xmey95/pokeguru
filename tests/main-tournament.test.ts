import { describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { parseMainTournamentIndex, parseMainTournament, parseMainDecklist,
  fetchMainTournamentIndexPage, inspectMainTournamentIndex } from '../src/main/limitless-main-tournament'
import { syncMainTournamentBlock } from '../src/main/main-tournament-sync'
import { TournamentStore } from '../src/main/tournament-store'
import { ProjectStore } from '../src/main/project-store'

const index = `<div data-selection><span data-key="format" data-value="standard"></span></div>
  <ul class="pagination" data-max="1"></ul><table>
  <tr><th>Date</th><th>Country</th><th>Name</th><th>Format</th><th>Players</th></tr>
  <tr><td>17 Oct 26</td><td><img class="flag" alt="FR"></td><td><a href="/tournaments/582">Regional Nice</a></td>
    <td><img alt="standard"></td><td>2336</td></tr>
  <tr><td>10 Oct 26</td><td><img class="flag" alt="US"></td><td><a href="/tournaments/581">Regional Louisville, KY</a></td>
    <td><img alt="standard"></td><td>2927</td></tr>
  <tr><td>20 Sep 26</td><td><img class="flag" alt="JP"></td><td><a href="/tournaments/579">Champions League Yokohama</a></td>
    <td><img alt="standard-jp"></td><td>5000</td></tr></table>`

const event = (name: string, first: string, second: string) => `<title>${name} – Limitless</title><table>
  <tr><th>#</th><th>Player</th><th>Country</th><th>Deck</th><th>List</th></tr>
  <tr><td>3</td><td><a href="/players/310">Paulo Mimoso</a></td><td><img class="flag" alt="PT"></td>
    <td><a href="/decks/352"><span data-tooltip="Hydrapple"></span></a></td>
    <td><a href="/decks/list/${first}">List</a></td></tr>
  <tr><td>7</td><td><a href="/players/3995">Riley McKay</a></td><td><img class="flag" alt="CA"></td>
    <td><a href="/decks/284"><span data-tooltip="Dragapult"></span></a></td>
    <td><a href="/decks/list/${second}">List</a></td></tr></table>`

const list = `<div data-text-decklist><div class="decklist-column"><div class="decklist-column-heading">Pokémon (4)</div>
  <div class="decklist-card" data-set="TWM" data-number="25"><a class="card-link"><span class="card-count">4</span>
    <span class="card-name">Teal Mask Ogerpon ex</span></a></div></div>
  <div class="decklist-column"><div class="decklist-column-heading">Energy (56)</div>
  <div class="decklist-card" data-set="MEE" data-number="9"><a class="card-link"><span class="card-count">56</span>
    <span class="card-name">Grass Energy</span></a></div></div></div>`

describe('main Limitless tournament archive', () => {
  it('filters to Western Standard, parses result coverage and exact cards', () => {
    const entries = parseMainTournamentIndex(index)
    expect(entries.map((item) => item.eventId)).toEqual(['582', '581'])
    const snapshot = parseMainTournament(event(entries[0].name, '30518', '30519'), entries[0])
    expect(snapshot.coverage).toMatchObject({ returnedParticipants: 2, listedDecks: 2, fetchedLists: 0 })
    expect(snapshot.participants[0]).toMatchObject({ placing: 3, deckId: '352', listId: '30518' })
    expect(parseMainDecklist(list)).toMatchObject({ total: 60,
      cards: [{ category: 'pokemon', count: 4, name: 'Teal Mask Ogerpon ex', set: 'TWM', number: '25' },
        { category: 'energy', count: 56, name: 'Grass Energy', set: 'MEE', number: '9' }] })
    expect(() => parseMainTournamentIndex(index.replace('data-value="standard"', 'data-value="expanded"'))).toThrow()
    expect(inspectMainTournamentIndex(index.replace('alt="FR"', 'alt=""'))).toMatchObject({
      indexedRows: 3, ineligibleRows: 1, unavailableRows: 1 })
    expect(() => parseMainTournamentIndex(index.replace('17 Oct 26', '1 Sep 26')))
      .toThrow('Ordine temporale')
  })

  it('saves two Regional and representative lists across blocks and reopens offline', async () => {
    const folder = mkdtempSync(join(tmpdir(), 'pokeguru-main-event-'))
    try {
      const path = join(folder, 'data.sqlite')
      const calls: string[] = []
      const fetcher = async (input: string | URL | Request): Promise<Response> => {
        const url = String(input)
        calls.push(url)
        if (url.includes('/tournaments?')) return new Response(index)
        if (url.endsWith('/tournaments/582')) return new Response(event('Regional Nice', '30518', '30519'))
        if (url.endsWith('/tournaments/581')) return new Response(event('Regional Louisville, KY', '30520', '30521'))
        return new Response(list)
      }
      const store = new TournamentStore(path)
      const first = await syncMainTournamentBlock(store, 'new', fetcher as typeof fetch,
        new Date('2026-10-24T12:00:00.000Z'))
      expect(first).toMatchObject({ status: 'running', inspectedEvents: 2, fetchedLists: 4 })
      expect(store.pruneMainIntermediates(new Set())).toBeGreaterThan(0)
      store.close()
      const reopened = new TournamentStore(path)
      const done = await syncMainTournamentBlock(reopened, 'new', fetcher as typeof fetch,
        new Date('2026-10-24T12:00:00.000Z'))
      expect(done.status).toBe('complete')
      expect(reopened.mainSummaries()).toHaveLength(2)
      expect(reopened.mainSummaries()).toEqual(reopened.listMain().map(({ eventId, name, date,
        country, players, url, coverage }) => ({ eventId, name, date, country, players, url, coverage })))
      expect(reopened.getMain('582')?.coverage).toMatchObject({ fetchedLists: 2, complete60Lists: 2 })
      const before = calls.filter((url) => url.includes('/decks/list/')).length
      await syncMainTournamentBlock(reopened, 'new', fetcher as typeof fetch,
        new Date('2026-10-24T12:00:00.000Z'))
      expect(calls.filter((url) => url.includes('/decks/list/'))).toHaveLength(before)
      reopened.close()
    } finally { rmSync(folder, { recursive: true, force: true }) }
  })

  it('scans the bundled rotation across pages and distinguishes archived, ineligible and older rows', async () => {
    const folder = mkdtempSync(join(tmpdir(), 'pokeguru-main-rotation-'))
    const store = new TournamentStore(join(folder, 'data.sqlite'))
    try {
      const older = `<tr><td>9 Apr 26</td><td><img class="flag" alt="FR"></td><td><a href="/tournaments/580">Regional Paris</a></td><td><img alt="standard"></td><td>800</td></tr>`
      const page2 = index.replace('data-max="1"', 'data-max="2"')
        .replace(/<tr><td>17 Oct 26[\s\S]*<\/table>/, `${older}</table>`)
      const calls: string[] = []
      store.saveMain(parseMainTournament(event('Regional Louisville, KY', '30520', '30521'),
        parseMainTournamentIndex(index)[1]))
      store.saveMainProgress({ ...store.mainProgress(), mode: 'new', status: 'complete',
        watermark: '2026-10-01T00:00:00.000Z' }) // legacy 90-day scan must not suppress backfill
      const fetcher = async (input: string | URL | Request): Promise<Response> => {
        const url = String(input)
        calls.push(url)
        if (url.includes('page=2')) return new Response(page2)
        if (url.includes('/tournaments?')) return new Response(index.replace('data-max="1"', 'data-max="2"'))
        if (url.endsWith('/tournaments/582')) return new Response(event('Regional Nice', '30518', '30519'))
        return new Response(list)
      }
      const result = await syncMainTournamentBlock(store, 'new', fetcher as typeof fetch,
        new Date('2026-10-25T12:00:00.000Z'))
      expect(result).toMatchObject({ status: 'complete', rotationStart: '2026-04-10',
        scannedPages: 2, indexedRows: 4, eligibleEvents: 2, ineligibleEvents: 1,
        outsideRotationEvents: 1, alreadyAcquiredEvents: 1, inspectedEvents: 1 })
      expect(calls.some((url) => url.endsWith('/tournaments/581'))).toBe(false)
      expect(calls.some((url) => url.endsWith('/tournaments/580'))).toBe(false)
      expect(store.mainSummaries()).toHaveLength(2)
      const highPage = await fetchMainTournamentIndexPage(101,
        (async () => new Response(index.replace('data-max="1"', 'data-max="125"'))) as typeof fetch)
      expect(highPage.maxPages).toBe(125)
    } finally { store.close(); rmSync(folder, { recursive: true, force: true }) }
  })

  it('persists unavailable events and lists, then retries them on the next scan', async () => {
    const folder = mkdtempSync(join(tmpdir(), 'pokeguru-main-unavailable-'))
    const path = join(folder, 'data.sqlite')
    try {
      let available = false
      const fetcher = async (input: string | URL | Request): Promise<Response> => {
        const url = String(input)
        if (url.includes('/tournaments?')) return new Response(index)
        if (url.endsWith('/tournaments/582')) return available
          ? new Response(event('Regional Nice', '30518', '30519')) : new Response('', { status: 404 })
        if (url.endsWith('/tournaments/581')) return new Response(event('Regional Louisville, KY', '30520', '30521'))
        if (url.endsWith('/decks/list/30520')) return available ? new Response(list) : new Response('', { status: 410 })
        return new Response(list)
      }
      const store = new TournamentStore(path)
      const first = await syncMainTournamentBlock(store, 'new', fetcher as typeof fetch,
        new Date('2026-10-25T12:00:00.000Z'))
      expect(first).toMatchObject({ status: 'complete', inspectedEvents: 1,
        unavailableEvents: [{ eventId: '582' }], unavailableLists: [{ eventId: '581', listId: '30520' }] })
      expect(store.getMain('581')?.participants[0].listUnavailable).toBe(true)
      store.close()
      available = true
      const reopened = new TournamentStore(path)
      try {
        const retry = await syncMainTournamentBlock(reopened, 'new', fetcher as typeof fetch,
          new Date('2026-10-25T12:00:00.000Z'))
        expect(retry.unavailableEvents).toHaveLength(0)
        expect(reopened.getMain('582')?.coverage.complete60Lists).toBe(2)
        expect(reopened.mainSummaries()).toHaveLength(2)
        let full = await syncMainTournamentBlock(reopened, 'full', fetcher as typeof fetch,
          new Date('2026-10-25T12:00:00.000Z'))
        if (full.status === 'running') full = await syncMainTournamentBlock(reopened, 'full', fetcher as typeof fetch,
          new Date('2026-10-25T12:00:00.000Z'))
        expect(full.status).toBe('complete')
        expect(full.unavailableLists).toHaveLength(0)
        expect(reopened.getMain('581')?.participants[0]).toMatchObject({ cardTotal: 60, listUnavailable: false })
      } finally { reopened.close() }
    } finally { rmSync(folder, { recursive: true, force: true }) }
  })

  it('resumes after a persisted 429 without losing the index cursor', async () => {
    const folder = mkdtempSync(join(tmpdir(), 'pokeguru-main-rate-'))
    const path = join(folder, 'data.sqlite')
    try {
      let limited = true
      const fetcher = async (input: string | URL | Request): Promise<Response> => {
        const url = String(input)
        if (url.includes('/tournaments?') && limited) return new Response('', {
          status: 429, headers: { 'retry-after': '1' } })
        if (url.includes('/tournaments?')) return new Response(index)
        if (url.endsWith('/tournaments/582')) return new Response(event('Regional Nice', '30518', '30519'))
        if (url.endsWith('/tournaments/581')) return new Response(event('Regional Louisville, KY', '30520', '30521'))
        return new Response(list)
      }
      const store = new TournamentStore(path)
      const limitedProgress = await syncMainTournamentBlock(store, 'new', fetcher as typeof fetch,
        new Date('2026-10-25T12:00:00.000Z'))
      expect(limitedProgress).toMatchObject({ status: 'rate-limited', page: 1, scannedPages: 0 })
      store.close()
      limited = false
      const reopened = new TournamentStore(path)
      try {
        const resumed = await syncMainTournamentBlock(reopened, 'new', fetcher as typeof fetch,
          new Date(Date.now() + 2_000))
        expect(resumed).toMatchObject({ status: 'running', page: 2, scannedPages: 1,
          inspectedEvents: 2, fetchedLists: 4 })
        expect((await syncMainTournamentBlock(reopened, 'new', fetcher as typeof fetch,
          new Date(Date.now() + 2_000))).status).toBe('complete')
      } finally { reopened.close() }
    } finally { rmSync(folder, { recursive: true, force: true }) }
  })

  it('keeps completed and cited Regional snapshots while reclaiming only new intermediate revisions', () => {
    const folder = mkdtempSync(join(tmpdir(), 'pokeguru-main-retention-'))
    const path = join(folder, 'data.sqlite')
    const store = new TournamentStore(path)
    const db = new DatabaseSync(path)
    try {
      const snapshot = (id: string, fetchedLists: number) => ({ id, eventId: '582',
        name: 'Regional Nice', date: '2026-10-17', country: 'FR', players: 20,
        url: 'https://limitlesstcg.com/tournaments/582', fetchedAt: '2026-10-24T12:00:00Z',
        source: 'Limitless tournament database' as const, circuit: 'WESTERN' as const,
        format: 'STANDARD' as const, type: 'IN_PERSON' as const, participants: [], cached: false,
        coverage: { returnedParticipants: 20, listedDecks: 20, fetchedLists,
          complete60Lists: fetchedLists, noListLink: 0 } })
      store.saveMain(snapshot('intermediate-a', 0))
      store.saveMain(snapshot('cited-b', 1))
      store.saveMain(snapshot('final-c', 2), true)
      const projects = new ProjectStore(path)
      try {
        const project = projects.create({ name: 'Evidenza', format: 'STANDARD' })
        const thread = projects.createDeckThread({ projectId: project.id, title: 'Citazione' })
        db.prepare(`INSERT INTO deck_thread_messages
          (id, thread_id, author, text, created_at, evidence_json)
          VALUES ('citation', ?, 'assistant', 'Evidence', '2026-10-24', ?)`)
          .run(thread.id, JSON.stringify({ schemaVersion: 1, events: [{ snapshotId: 'cited-b' }] }))
        expect(projects.referencedTournamentSnapshotIds()).toEqual(new Set(['cited-b']))
        expect(store.pruneMainIntermediates(projects.referencedTournamentSnapshotIds())).toBe(1)
        expect(db.prepare('SELECT id FROM main_tournament_snapshots ORDER BY rowid').all())
          .toMatchObject([{ id: 'cited-b' }, { id: 'final-c' }])
        expect(store.getMain('582')?.id).toBe('final-c')
      } finally { projects.close() }
    } finally { db.close(); store.close(); rmSync(folder, { recursive: true, force: true }) }
  })

  it('pins all Regional snapshots found before the retention schema is installed', () => {
    const folder = mkdtempSync(join(tmpdir(), 'pokeguru-main-legacy-'))
    const path = join(folder, 'legacy.sqlite')
    const db = new DatabaseSync(path)
    try {
      db.exec(`CREATE TABLE main_tournament_snapshots (
        id TEXT PRIMARY KEY, event_id TEXT NOT NULL, fetched_at TEXT NOT NULL,
        payload TEXT NOT NULL) STRICT`)
      const insert = db.prepare(`INSERT INTO main_tournament_snapshots
        (id, event_id, fetched_at, payload) VALUES (?, '582', '2026-10-24', '{}')`)
      insert.run('old-1')
      insert.run('old-2')
      db.close()
      const store = new TournamentStore(path)
      try {
        expect(store.pruneMainIntermediates(new Set())).toBe(0)
      } finally { store.close() }
      const reopened = new DatabaseSync(path)
      try {
        expect(reopened.prepare('SELECT id FROM main_tournament_snapshot_pins ORDER BY id').all())
          .toMatchObject([{ id: 'old-1' }, { id: 'old-2' }])
      } finally { reopened.close() }
    } finally { if (db.isOpen) db.close(); rmSync(folder, { recursive: true, force: true }) }
  })
})
