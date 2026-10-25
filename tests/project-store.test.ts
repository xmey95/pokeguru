import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, describe, expect, it } from 'vitest'
import { ProjectStore } from '../src/main/project-store'
import { parseDeck } from '../src/shared/deck-import'
import { hydrappleItalianDeck } from './fixtures/hydrapple-italian'
import type { MatchupReport } from '../src/shared/meta-matchups'

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
  it('legge la cronologia del thread a pagine senza perdere messaggi con data identica', () => {
    const path = databasePath()
    const store = new ProjectStore(path)
    const project = store.create({ name: 'Cronologia lunga', format: 'STANDARD' })
    const other = store.create({ name: 'Altro progetto', format: 'STANDARD' })
    const thread = store.createDeckThread({ projectId: project.id, title: 'Prova',
      openingNote: 'Messaggio iniziale', startWithAi: true })
    const db = new DatabaseSync(path)
    const insert = db.prepare(`INSERT INTO deck_thread_messages
      (id, thread_id, author, text, created_at, evidence_json)
      VALUES (?, ?, 'assistant', ?, ?, ?)`)
    db.exec('BEGIN IMMEDIATE')
    for (let index = 1; index <= 120; index++) insert.run(`message-${index}`, thread.id,
      `Risposta ${index}`, '2099-10-25T00:00:00.000Z', JSON.stringify({ index }))
    db.exec('COMMIT')
    db.close()

    const recent = store.getDeckThreadWindow(project.id, thread.id)!
    expect(recent.messageCount).toBe(121)
    expect(recent.messages).toHaveLength(50)
    expect(recent.messages[0].id).toBe('message-71')
    expect(recent.openingAiMessage?.text).toBe('Messaggio iniziale')
    expect(recent.openingAiPending).toBe(false)
    const second = store.getDeckThreadMessagesBefore(project.id, thread.id, recent.oldestMessageCursor!)
    expect(second.messages).toHaveLength(50)
    expect(second.messages[0].id).toBe('message-21')
    const first = store.getDeckThreadMessagesBefore(project.id, thread.id, second.oldestCursor!)
    expect(first.messages.map((item) => item.id)).toEqual([
      thread.messages[0].id, ...Array.from({ length: 20 }, (_, index) => `message-${index + 1}`)
    ])
    expect(first.messages[1].evidence).toEqual({ index: 1 })
    expect(store.getDeckThread(project.id, thread.id)?.messages).toHaveLength(121)
    expect(store.hasDeckThread(project.id, thread.id)).toBe(true)
    expect(store.hasDeckThread(other.id, thread.id)).toBe(false)
    expect(store.getDeckThreadWindow(other.id, thread.id)).toBeNull()
    expect(() => store.getDeckThreadMessagesBefore(other.id, thread.id, recent.oldestMessageCursor!))
      .toThrow('Thread non trovato')
    store.close()
  })

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

  it('ripara le liste italiane già salvate senza creare una nuova versione', () => {
    const path = databasePath()
    const store = new ProjectStore(path)
    const project = store.create({ name: 'Hydrapple', format: 'STANDARD' })
    const baseline = store.importDeck({ projectId: project.id, rawText: hydrappleItalianDeck, source: 'paste' })
    const version = store.listDeckVersions(project.id)[0]
    store.close()

    const stale = parseDeck(hydrappleItalianDeck)
    for (const header of ['Carte Allenatore: 11', 'Energia: 1']) {
      const line = stale.lines.find((item) => item.raw === header)!
      line.kind = 'unparsed'
      stale.diagnostics.push({ lineNumber: line.lineNumber, code: 'UNPARSED', message: 'Riga non interpretata' })
    }
    const db = new DatabaseSync(path)
    db.prepare('UPDATE deck_baselines SET parsed_json = ?, problem_count = 2 WHERE project_id = ?')
      .run(JSON.stringify(stale), project.id)
    db.prepare('UPDATE deck_versions SET parsed_json = ? WHERE project_id = ?')
      .run(JSON.stringify(stale), project.id)
    db.close()

    const reopened = new ProjectStore(path)
    expect(reopened.get(project.id)?.status).toBe('PRONTA_PER_CONTROLLO')
    expect(reopened.getBaseline(project.id)).toMatchObject({ rawText: hydrappleItalianDeck,
      importedAt: baseline.importedAt, interpretedTotal: 60, diagnostics: [] })
    expect(reopened.getBaseline(project.id)?.lines.find((line) => line.raw === 'Carte Allenatore: 11')?.kind).toBe('section')
    expect(reopened.listDeckVersions(project.id)).toMatchObject([{
      id: version.id, createdAt: version.createdAt, parsed: { diagnostics: [] }
    }])
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
    expect(migrated.listDeckVersions('legacy')).toMatchObject([{
      sequence: 1, rawText, createdAt: time, parsed: { interpretedTotal: 1 }
    }])
    migrated.close()

    const reopened = new ProjectStore(path)
    expect(reopened.get('legacy')?.circuitAssignment).toBe('MIGRATED')
    expect(reopened.getBaseline('legacy')?.rawText).toBe(rawText)
    expect(reopened.listDeckVersions('legacy')).toHaveLength(1)
    reopened.close()
  })

  it('isola versioni, thread, messaggi e candidate e segnala una base superata', () => {
    const path = databasePath()
    const store = new ProjectStore(path)
    const first = store.create({ name: 'Primo', format: 'STANDARD' })
    const other = store.create({ name: 'Altro', format: 'STANDARD' })
    const noList = store.createDeckThread({ projectId: other.id, title: 'Partenza da zero' })
    expect(noList.baseVersionId).toBeNull()
    expect(noList.stale).toBe(false)
    const original = '60 Carta A MEG 1'
    store.importDeck({ projectId: first.id, rawText: original, source: 'paste' })
    const initial = store.listDeckVersions(first.id)[0]
    const a = store.createDeckThread({ projectId: first.id, title: 'Piano A', openingNote: 'Proviamo più pesca.' })
    const b = store.createDeckThread({ projectId: first.id, title: 'Piano B' })
    expect(a.baseVersionId).toBe(initial.id)
    expect(b.baseVersionId).toBe(initial.id)
    store.importDeck({ projectId: first.id, rawText: original, source: 'paste' })
    expect(store.listDeckVersions(first.id)).toHaveLength(1)
    expect(store.listDeckThreads(first.id).every((thread) => !thread.stale)).toBe(true)
    store.addDeckThreadMessage(first.id, a.id, 'Teniamo il motore iniziale.')
    store.saveDeckCandidate({ projectId: first.id, threadId: a.id, rawText: '60 Carta B MEG 2', note: 'Più veloce' })
    store.saveDeckCandidate({ projectId: first.id, threadId: b.id, rawText: '60 Carta C MEG 3' })
    expect(store.listDeckThreadSummaries(first.id).find((item) => item.id === a.id)).toMatchObject({
      title: 'Piano A', baseVersionId: initial.id,
      latestCandidateId: store.getDeckThread(first.id, a.id)?.candidates[0].id
    })
    expect(store.listDeckThreadSummaries(first.id).find((item) => item.id === a.id)).not.toHaveProperty('messages')
    expect(store.getDeckThread(other.id, a.id)).toBeNull()
    expect(store.listDeckThreadSummaries(other.id)).toHaveLength(1)
    expect(store.getBaseline(first.id)?.rawText).toBe(original)
    expect(store.listDeckThreads(first.id).find((item) => item.id === a.id)).toMatchObject({
      messages: [{ text: 'Proviamo più pesca.' }, { text: 'Teniamo il motore iniziale.' }],
      candidates: [{ sequence: 1, rawText: '60 Carta B MEG 2', note: 'Più veloce' }]
    })
    expect(store.listDeckThreads(first.id).find((item) => item.id === b.id)?.candidates[0].rawText).toBe('60 Carta C MEG 3')
    expect(() => store.saveDeckCandidate({ projectId: other.id, threadId: a.id, rawText: original })).toThrow('Thread non trovato')
    expect(store.listDeckThreads(other.id)).toHaveLength(1)
    store.importDeck({ projectId: first.id, rawText: '60 Carta D MEG 4', source: 'paste' })
    expect(store.listDeckVersions(first.id).map((version) => version.sequence)).toEqual([2, 1])
    expect(store.listDeckThreads(first.id).every((thread) => thread.stale)).toBe(true)
    expect(store.listDeckThreads(other.id)[0].stale).toBe(false)
    store.importDeck({ projectId: other.id, rawText: original, source: 'paste' })
    expect(store.listDeckThreads(other.id)[0].stale).toBe(true)
    store.close()

    const reopened = new ProjectStore(path)
    expect(reopened.listDeckVersions(first.id)[1]).toMatchObject({ id: initial.id, rawText: original })
    expect(reopened.listDeckThreads(first.id).find((item) => item.id === a.id)).toMatchObject({
      baseVersionId: initial.id, stale: true, candidates: [{ rawText: '60 Carta B MEG 2' }]
    })
    expect(reopened.listDeckThreadSummaries(first.id).find((item) => item.id === a.id)?.stale).toBe(true)
    expect(reopened.getBaseline(first.id)?.rawText).toBe('60 Carta D MEG 4')
    reopened.close()
  })

  it('adotta una candidata intera in modo atomico e mantiene l’altro thread', () => {
    const path = databasePath()
    const store = new ProjectStore(path)
    const project = store.create({ name: 'Adozione', format: 'STANDARD' })
    const other = store.create({ name: 'Altro', format: 'STANDARD' })
    store.importDeck({ projectId: project.id, rawText: '60 Carta A MEG 1', source: 'paste' })
    const original = store.listDeckVersions(project.id)[0]
    const first = store.createDeckThread({ projectId: project.id, title: 'Piano A' })
    const second = store.createDeckThread({ projectId: project.id, title: 'Piano B' })
    const a = store.saveDeckCandidate({ projectId: project.id, threadId: first.id,
      rawText: '59 Carta A MEG 1\n1 Carta B MEG 2' }).candidates[0]
    const b = store.saveDeckCandidate({ projectId: project.id, threadId: second.id,
      rawText: '58 Carta A MEG 1\n2 Carta C MEG 3' }).candidates[0]
    const request = { projectId: project.id, threadId: first.id, candidateId: a.id, expectedHeadId: original.id }
    expect(() => store.adoptDeckCandidate({ ...request, projectId: other.id })).toThrow()
    expect(store.getBaseline(project.id)?.rawText).toBe('60 Carta A MEG 1')
    const adopted = store.adoptDeckCandidate(request)
    expect(adopted.rawText).toBe(a.rawText)
    expect(store.listDeckVersions(project.id)[0]).toMatchObject({ sequence: 2,
      adoption: { threadId: first.id, candidateId: a.id } })
    expect(store.listDeckThreads(project.id).find((thread) => thread.id === second.id)).toMatchObject({
      stale: true, candidates: [{ id: b.id, rawText: b.rawText }]
    })
    expect(() => store.adoptDeckCandidate(request)).toThrow('lista principale è cambiata')
    expect(store.listDeckVersions(project.id)).toHaveLength(2)
    store.close()
    const reopened = new ProjectStore(path)
    expect(reopened.getBaseline(project.id)?.rawText).toBe(a.rawText)
    expect(reopened.listDeckVersions(project.id)[0].adoption?.candidateId).toBe(a.id)
    expect(reopened.listDeckThreads(project.id).find((thread) => thread.id === second.id)?.candidates[0].id).toBe(b.id)
    const fresh = reopened.createDeckThread({ projectId: project.id, title: 'ASC' })
    const dotted = reopened.saveDeckCandidate({ projectId: project.id, threadId: fresh.id,
      rawText: '59 Carta A MEG 1\n1 Mega Audino ex ME02.5 172' }).candidates[0]
    const beforeDotted = reopened.listDeckVersions(project.id)[0].id
    const converted = reopened.adoptDeckCandidate({ projectId: project.id, threadId: fresh.id,
      candidateId: dotted.id, expectedHeadId: beforeDotted })
    expect(converted.rawText).toBe('59 Carta A MEG 1\n1 Mega Audino ex ASC 172')
    expect(reopened.listDeckThreads(project.id).find((thread) => thread.id === fresh.id)?.candidates[0].rawText)
      .toBe(dotted.rawText)
    reopened.close()
  })

  it('conserva globalmente l’ultimo audit delle regole tra riavvii', () => {
    const path = databasePath()
    const store = new ProjectStore(path)
    expect(store.getStandardRuleAudit()).toBeNull()
    const audit = { packageVersion: 'western-2026-10-23-v1', checkedAt: '2026-10-23T10:00:00.000Z',
      verifiedAt: '2026-10-23T10:00:00.000Z', status: 'matching' as const, sources: [] }
    store.saveStandardRuleAudit(audit)
    store.close()
    const reopened = new ProjectStore(path)
    expect(reopened.getStandardRuleAudit()).toEqual(audit)
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
  }, 15_000)

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
    const initial: MatchupReport = {
      projectId: project.id, metaId: snapshot.id, opponentId: '284', deckHash: store.getCurrentDeckHash(project.id)!,
      generatedAt: '2026-10-23T00:05:00.000Z', sampleDeckUrl: null,
      sampleDeckCards: ['2 Dragapult ex TWM 130'],
      tournamentEvidence: { schemaVersion: 2, evidenceHash: 'evidence-v2',
        status: 'matched', detail: 'Due eventi', eventId: '582', eventName: 'Nice',
        eventDate: '2026-10-17', eventUrl: 'https://limitlesstcg.com/tournaments/582',
        eventLists: 1, eventParticipants: 429, matchedDeckId: '284', matchedCompleteLists: 1,
        observedCards: [], sampleLists: [], events: [] },
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
    expect(reopened.getMatchupDiscussion(discussion.id)?.turns[0].report?.tournamentEvidence?.evidenceHash)
      .toBe('evidence-v2')
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
    expect(afterRestart.getMatchupDiscussion(discussion.id)?.turns[0].report?.sampleDeckCards)
      .toEqual(['2 Dragapult ex TWM 130'])
    expect(afterRestart.listMatchupDiscussions(other.id, '284')).toEqual([])
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
