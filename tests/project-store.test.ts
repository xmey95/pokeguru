import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, describe, expect, it } from 'vitest'
import { ProjectStore } from '../src/main/project-store'
import { parseDeck } from '../src/shared/deck-import'

const tempDirectories: string[] = []

function databasePath(): string {
  const directory = mkdtempSync(join(tmpdir(), 'pokeguru-store-'))
  tempDirectories.push(directory)
  return join(directory, 'data', 'projects.sqlite')
}

afterEach(() => {
  for (const directory of tempDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

describe('ProjectStore', () => {
  it('mantiene due progetti distinti dopo la riapertura del database', () => {
    const path = databasePath()
    const firstSession = new ProjectStore(path)
    const absol = firstSession.create({ name: ' Mega Absol / Mega Audino ', format: 'STANDARD' })
    const second = firstSession.create({ name: 'Altro archetipo', format: 'STANDARD' })
    firstSession.close()

    const reopened = new ProjectStore(path)
    expect(reopened.list()).toHaveLength(2)
    expect(reopened.get(absol.id)).toMatchObject({ name: 'Mega Absol / Mega Audino', status: 'DA_COSTRUIRE' })
    expect(reopened.get(second.id)).toMatchObject({ name: 'Altro archetipo', status: 'DA_COSTRUIRE' })
    expect(reopened.get(absol.id)?.id).not.toBe(reopened.get(second.id)?.id)
    reopened.close()
  })

  it('non salva nomi vuoti o formati non supportati', () => {
    const store = new ProjectStore(databasePath())
    expect(() => store.create({ name: '  ', format: 'STANDARD' })).toThrow()
    expect(() => store.create({ name: 'Altro', format: 'EXPANDED' as 'STANDARD' })).toThrow()
    expect(store.list()).toEqual([])
    store.close()
  })

  it('salva baseline distinte, diagnostica e stati dopo la riapertura', () => {
    const path = databasePath()
    const firstSession = new ProjectStore(path)
    const first = firstSession.create({ name: 'Primo', format: 'STANDARD' })
    const second = firstSession.create({ name: 'Secondo', format: 'STANDARD' })
    const firstText = 'Pokémon: 2\n2 Mega Absol ex MEG 86\nTotal Cards: 60\nnota libera'
    firstSession.importDeck({ projectId: first.id, rawText: firstText, source: 'paste' })
    firstSession.importDeck({ projectId: second.id, rawText: '60 Carta senza stampa', source: 'file', fileName: 'secondo.txt' })
    expect(firstSession.get(first.id)).toMatchObject({ cardTotal: 2, status: 'BOZZA' })
    expect(firstSession.get(second.id)).toMatchObject({ cardTotal: 60, status: 'PRONTA_PER_CONTROLLO' })
    firstSession.close()

    const reopened = new ProjectStore(path)
    expect(reopened.getBaseline(first.id)).toMatchObject({ rawText: firstText, interpretedTotal: 2, source: 'paste' })
    expect(reopened.getBaseline(first.id)?.diagnostics.map(({ code }) => code)).toEqual(['UNPARSED', 'TOTAL_MISMATCH'])
    expect(reopened.getBaseline(second.id)).toMatchObject({ rawText: '60 Carta senza stampa', fileName: 'secondo.txt', interpretedTotal: 60 })
    expect(reopened.getBaseline(first.id)?.rawText).not.toBe(reopened.getBaseline(second.id)?.rawText)
    reopened.close()
  })

  it('migra un archivio I1 senza alterare lista e stato', () => {
    const path = databasePath()
    mkdirSync(dirname(path), { recursive: true })
    const legacy = new DatabaseSync(path)
    legacy.exec(`
      CREATE TABLE projects (id TEXT PRIMARY KEY, name TEXT NOT NULL, format TEXT NOT NULL,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL) STRICT;
      CREATE TABLE deck_baselines (project_id TEXT PRIMARY KEY, source TEXT NOT NULL, file_name TEXT,
        raw_text TEXT NOT NULL, parsed_json TEXT NOT NULL, interpreted_total INTEGER NOT NULL,
        problem_count INTEGER NOT NULL, imported_at TEXT NOT NULL) STRICT;
    `)
    const time = '2026-10-01T12:00:00.000Z'
    const rawText = '1 Carta italiana senza stampa\nTotal Cards: 1'
    legacy.prepare('INSERT INTO projects VALUES (?, ?, ?, ?, ?)')
      .run('legacy', 'Progetto precedente', 'STANDARD', time, time)
    legacy.prepare('INSERT INTO deck_baselines VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run('legacy', 'paste', null, rawText, JSON.stringify(parseDeck(rawText)), 1, 0, time)
    legacy.close()

    const migrated = new ProjectStore(path)
    expect(migrated.get('legacy')).toMatchObject({
      name: 'Progetto precedente', circuit: 'WESTERN', circuitAssignment: 'MIGRATED',
      status: 'BOZZA', cardTotal: 1, createdAt: time
    })
    expect(migrated.getBaseline('legacy')).toMatchObject({ rawText, interpretedTotal: 1 })
    migrated.close()

    const reopened = new ProjectStore(path)
    expect(reopened.get('legacy')?.circuitAssignment).toBe('MIGRATED')
    expect(reopened.getBaseline('legacy')?.rawText).toBe(rawText)
    reopened.close()
  })

  it('mantiene schede Matchup separate e segnala il cambio di lista', () => {
    const path = databasePath()
    const store = new ProjectStore(path)
    const first = store.create({ name: 'Primo', format: 'STANDARD' })
    const second = store.create({ name: 'Secondo', format: 'STANDARD' })
    expect(first).toMatchObject({ circuit: 'WESTERN', circuitAssignment: 'CREATED' })
    expect(() => store.saveMatchupNote({ projectId: first.id, opponent: 'Archetipo A', strengths: 'Veloce', weaknesses: '', ourKeyCards: '', theirKeyCards: '', strategy: '' })).toThrow('Importa una lista')
    store.importDeck({ projectId: first.id, rawText: '2 Carta A MEG 1', source: 'paste' })
    store.importDeck({ projectId: second.id, rawText: '2 Carta B MEG 2', source: 'paste' })
    const note = store.saveMatchupNote({ projectId: first.id, opponent: 'Archetipo A', strengths: 'Veloce', weaknesses: 'Poche risorse', ourKeyCards: 'Carta A', theirKeyCards: 'Carta B', strategy: 'Conservare le risorse.' })
    expect(note.linkedToCurrentList).toBe(true)
    expect(store.listMatchupNotes(second.id)).toEqual([])
    expect(() => store.saveMatchupNote({ projectId: first.id, opponent: 'archetipo a', strengths: 'Duplicato', weaknesses: '', ourKeyCards: '', theirKeyCards: '', strategy: '' })).toThrow('Esiste già')
    expect(() => store.saveMatchupNote({ id: note.id, projectId: second.id, opponent: 'Altro', strengths: 'No', weaknesses: '', ourKeyCards: '', theirKeyCards: '', strategy: '' })).toThrow('non trovata')
    store.importDeck({ projectId: first.id, rawText: '3 Carta A MEG 1', source: 'paste' })
    expect(store.listMatchupNotes(first.id)[0].linkedToCurrentList).toBe(false)
    store.close()

    const reopened = new ProjectStore(path)
    expect(reopened.listMatchupNotes(first.id)).toMatchObject([{ id: note.id, strategy: 'Conservare le risorse.', linkedToCurrentList: false }])
    const updated = reopened.saveMatchupNote({ id: note.id, projectId: first.id, opponent: 'Archetipo A', strengths: 'Nuovo punto forte', weaknesses: '', ourKeyCards: 'Carta A', theirKeyCards: '', strategy: 'Piano rivisto.' })
    expect(updated.linkedToCurrentList).toBe(true)
    expect(updated.createdAt).toBe(note.createdAt)
    expect(reopened.deleteMatchupNote(second.id, note.id)).toBe(false)
    expect(reopened.deleteMatchupNote(first.id, note.id)).toBe(true)
    expect(reopened.listMatchupNotes(first.id)).toEqual([])
    reopened.close()
  })

  it('conserva le analisi AI per lista e snapshot senza presentarle dopo un cambio di lista', () => {
    const path = databasePath()
    const store = new ProjectStore(path)
    const first = store.create({ name: 'Primo', format: 'STANDARD' })
    const second = store.create({ name: 'Secondo', format: 'STANDARD' })
    store.importDeck({ projectId: first.id, rawText: '2 Carta A MEG 1', source: 'paste' })
    store.importDeck({ projectId: second.id, rawText: '2 Carta B MEG 2', source: 'paste' })
    const snapshot = {
      id: 'a'.repeat(64), fetchedAt: '2026-10-23T00:00:00.000Z', sourceUrl: 'https://limitlesstcg.com/decks',
      period: 'Ultimo mese', circuit: 'WESTERN' as const, format: 'STANDARD' as const, cached: false,
      decks: [{ id: '284', name: 'Dragapult ex', points: 100, share: 12, url: 'https://limitlesstcg.com/decks/284' }]
    }
    store.saveMetaSnapshot(snapshot)
    const report = {
      projectId: first.id, metaId: snapshot.id, opponentId: '284', deckHash: store.getCurrentDeckHash(first.id)!,
      generatedAt: '2026-10-23T00:05:00.000Z', sampleDeckUrl: null,
      strengths: 'Ipotesi A', weaknesses: 'Ipotesi B', ourKeyCards: 'Carta A', theirKeyCards: '',
      strategy: 'Piano da verificare', limitations: 'Nessun risultato di match'
    }
    store.saveMatchupReport(report)
    expect(store.listMatchupReports(first.id, snapshot.id)).toEqual([report])
    expect(store.listMatchupReports(second.id, snapshot.id)).toEqual([])
    store.close()

    const reopened = new ProjectStore(path)
    expect(reopened.listMatchupReports(first.id, snapshot.id)).toEqual([report])
    reopened.importDeck({ projectId: first.id, rawText: '3 Carta A MEG 1', source: 'paste' })
    expect(reopened.listMatchupReports(first.id, snapshot.id)).toEqual([])
    expect(() => reopened.saveMatchupReport(report)).toThrow('lista è cambiata')
    reopened.close()
  })

  it('migra una guida precedente e conserva revisioni, commenti in attesa e prosecuzione sulla nuova base', () => {
    const path = databasePath()
    const store = new ProjectStore(path)
    const project = store.create({ name: 'Analisi iterative', format: 'STANDARD' })
    const other = store.create({ name: 'Altro progetto', format: 'STANDARD' })
    store.importDeck({ projectId: project.id, rawText: '2 Carta A MEG 1', source: 'paste' })
    store.importDeck({ projectId: other.id, rawText: '2 Carta A MEG 1', source: 'paste' })
    const snapshot = {
      id: 'a'.repeat(64), fetchedAt: '2026-10-23T00:00:00.000Z', sourceUrl: 'https://limitlesstcg.com/decks',
      period: 'Ultimo mese', circuit: 'WESTERN' as const, format: 'STANDARD' as const, cached: false,
      decks: [{ id: '284', name: 'Dragapult ex', points: 100, share: 12, url: 'https://limitlesstcg.com/decks/284' }]
    }
    store.saveMetaSnapshot(snapshot)
    const initial = {
      projectId: project.id, metaId: snapshot.id, opponentId: '284', deckHash: store.getCurrentDeckHash(project.id)!,
      generatedAt: '2026-10-23T00:05:00.000Z', sampleDeckUrl: null,
      strengths: 'Ipotesi A', weaknesses: 'Ipotesi B', ourKeyCards: 'Carta A', theirKeyCards: '',
      strategy: 'Piano iniziale', limitations: 'Nessun risultato di match'
    }
    store.saveMatchupReport(initial)
    const discussion = store.listMatchupDiscussions(project.id, '284')[0]
    expect(discussion.current).toBe(true)
    const pending = store.addMatchupFeedback(discussion.id, 'Secondo me bisogna andare secondi.')
    expect(pending.turns).toHaveLength(2)
    expect(pending.turns[1].report).toBeNull()
    expect(() => store.addMatchupFeedback(discussion.id, 'Duplicato')).toThrow('in attesa')
    expect(() => store.saveMatchupReport(initial)).toThrow('in attesa')
    store.close()

    const reopened = new ProjectStore(path)
    expect(reopened.listMatchupDiscussions(other.id, '284')).toEqual([])
    expect(reopened.getMatchupDiscussion(discussion.id)?.turns[1].feedback).toBe('Secondo me bisogna andare secondi.')
    const revision = { ...initial, generatedAt: '2026-10-23T00:06:00.000Z', strategy: 'Piano rivisto' }
    const completed = reopened.completeMatchupFeedback(discussion.id, pending.turns[1].id, revision, 'Rivalutata l’ipotesi di andare secondi.')
    expect(completed.turns.map((turn) => turn.report?.strategy)).toEqual(['Piano iniziale', 'Piano rivisto'])
    expect(reopened.listMatchupReports(project.id, snapshot.id)[0].strategy).toBe('Piano rivisto')
    reopened.saveMatchupReport({ ...revision, generatedAt: '2026-10-23T00:07:00.000Z', strategy: 'Rigenerazione' })
    expect(reopened.getMatchupDiscussion(discussion.id)?.turns).toHaveLength(3)
    reopened.saveMatchupContextSummary(discussion.id, 'Sintesi delle prime versioni', 0)
    expect(reopened.getMatchupDiscussion(discussion.id)?.turns[0].report?.strategy).toBe('Piano iniziale')

    reopened.importDeck({ projectId: project.id, rawText: '3 Carta A MEG 1', source: 'paste' })
    expect(reopened.getMatchupDiscussion(discussion.id)?.current).toBe(false)
    expect(reopened.listMatchupReports(project.id, snapshot.id)).toEqual([])
    expect(() => reopened.addMatchupFeedback(discussion.id, 'Nuovo commento')).toThrow('nuova base')
    const newReport = { ...revision, deckHash: reopened.getCurrentDeckHash(project.id)!, generatedAt: '2026-10-23T00:08:00.000Z' }
    const linked = reopened.saveContinuedMatchupReport(newReport, discussion.id)
    expect(linked.parentId).toBe(discussion.id)
    expect(linked.current).toBe(true)
    expect(reopened.getMatchupDiscussion(discussion.id)?.turns).toHaveLength(3)
    reopened.saveMetaSnapshot({ ...snapshot, id: 'c'.repeat(64), fetchedAt: '2026-10-23T01:00:00.000Z', decks: [] })
    expect(reopened.listHistoricalMatchupOpponents(project.id).map((deck) => deck.id)).toEqual(['284'])
    expect(reopened.getMatchupDiscussion(linked.id)?.current).toBe(false)
    reopened.close()

    const afterRestart = new ProjectStore(path)
    expect(afterRestart.listMatchupDiscussions(project.id, '284')).toHaveLength(2)
    expect(afterRestart.getMatchupDiscussion(linked.id)?.parentId).toBe(discussion.id)
    expect(afterRestart.getMatchupDiscussion(discussion.id)?.contextSummary).toBe('Sintesi delle prime versioni')
    afterRestart.close()
  })

  it('importa senza duplicati le vecchie guide Matchup salvate prima delle discussioni', () => {
    const path = databasePath()
    const store = new ProjectStore(path)
    const project = store.create({ name: 'Archivio precedente', format: 'STANDARD' })
    store.importDeck({ projectId: project.id, rawText: '1 Carta A', source: 'paste' })
    const snapshot = { id: 'b'.repeat(64), fetchedAt: '2026-10-23T00:00:00.000Z', sourceUrl: 'https://limitlesstcg.com/decks',
      period: 'Ultimo mese', circuit: 'WESTERN' as const, format: 'STANDARD' as const, cached: false,
      decks: [{ id: '284', name: 'Dragapult ex', points: 100, share: 12, url: 'https://limitlesstcg.com/decks/284' }] }
    store.saveMetaSnapshot(snapshot)
    const report = { projectId: project.id, metaId: snapshot.id, opponentId: '284', deckHash: store.getCurrentDeckHash(project.id)!,
      generatedAt: '2026-10-23T00:05:00.000Z', sampleDeckUrl: null, strengths: 'A', weaknesses: 'B',
      ourKeyCards: 'Carta A', theirKeyCards: '', strategy: 'Piano storico', limitations: 'Dati parziali' }
    store.saveMatchupReport(report)
    store.close()
    const legacy = new DatabaseSync(path)
    legacy.exec('DROP TABLE matchup_turns; DROP TABLE matchup_discussions;')
    legacy.close()

    const migrated = new ProjectStore(path)
    expect(migrated.listMatchupDiscussions(project.id, '284')[0].turns[0].report).toEqual(report)
    migrated.close()
    const again = new ProjectStore(path)
    expect(again.listMatchupDiscussions(project.id, '284')[0].turns).toHaveLength(1)
    again.close()
  })
})
