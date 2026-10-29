import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { expect, it } from 'vitest'
import { ProjectStore } from '../src/main/project-store'
import { parseDeck } from '../src/shared/deck-import'
import type { MatchupReport } from '../src/shared/meta-matchups'
import { matchupHistoryContext } from '../src/main/codex-matchup'

it('pages versions and mixed candidates, preserves old adoption and reads all unanswered notes', () => {
  const folder = mkdtempSync(join(tmpdir(), 'pokeguru-history-')), path = join(folder, 'test.sqlite')
  const store = new ProjectStore(path), db = new DatabaseSync(path)
  try {
    const project = store.create({ name: 'Long history', format: 'STANDARD' })
    const other = store.create({ name: 'Other', format: 'STANDARD' })
    for (let i = 1; i <= 131; i++) store.importDeck({ projectId: project.id, source: 'paste', rawText: `60 Basic Psychic Energy\n# Version ${i}` })
    const versions = store.listDeckVersions(project.id)
    const pages = [], cursors = []
    for (let before: number | undefined; ;) {
      const page = store.listDeckVersionPage(project.id, before)
      expect(page.length).toBeLessThanOrEqual(50)
      if (!page.length) break
      pages.push(...page); before = page.at(-1)!.sequence; cursors.push(before)
    }
    expect(pages).toEqual(versions)
    expect(cursors).toEqual([82, 32, 1])
    expect(store.getDeckVersion(other.id, versions[130].id)).toBeNull()
    expect(store.annotateDeckVersion({ projectId: project.id, versionId: versions[130].id, label: 'First', note: 'Preserved' }).label).toBe('First')
    const thread = store.createDeckThread({ projectId: project.id, title: 'Long strategy' })
    const parsed = JSON.stringify(parseDeck('60 Basic Psychic Energy'))
    const manual = db.prepare(`INSERT INTO deck_thread_candidates
      (id, thread_id, sequence, raw_text, parsed_json, note, origin, created_at) VALUES (?, ?, ?, ?, ?, '', 'manual', ?)`)
    const ai = db.prepare(`INSERT INTO deck_ai_candidates
      (id, thread_id, sequence, raw_text, parsed_json, note, sources_json, checks_json, ai_config_json, ai_turn_id, created_at)
      VALUES (?, ?, ?, ?, ?, '', '[]', '[]', '{}', ?, ?)`)
    db.exec('BEGIN')
    for (let i = 1; i <= 131; i++) {
      const args = [`candidate-${i}`, thread.id, i, '60 Basic Psychic Energy', parsed]
      if (i % 2) manual.run(...args, '2026-10-29T00:00:00Z')
      else ai.run(...args, `turn-${i}`, '2026-10-29T00:00:00Z')
    }
    db.prepare('INSERT INTO deck_adoptions VALUES (?, ?, ?, ?)').run(versions[100].id, thread.id, 'candidate-1', '2026-10-29')
    const message = db.prepare(`INSERT INTO deck_thread_messages (id, thread_id, author, text, created_at, ai_turn_id)
      VALUES (?, ?, ?, ?, ?, ?)`)
    for (let i = 0; i <= 160; i++) message.run(`message-${i}`, thread.id, i <= 100 ? 'assistant' : 'user',
      `Note ${i}`, '2026-10-29T01:00:00Z', i <= 100 ? `answer-${i}` : null)
    db.exec('COMMIT')
    const window = store.getDeckThreadWindow(project.id, thread.id)!
    expect(window).toMatchObject({ candidateCount: 131, messageCount: 161 })
    expect(window.candidates).toHaveLength(50)
    const candidates = [...window.candidates]
    while (candidates[0].sequence > 1) candidates.unshift(...store.getDeckThreadCandidatesBefore(project.id, thread.id, candidates[0].sequence))
    expect(candidates.map((item) => item.sequence)).toEqual(Array.from({ length: 131 }, (_, i) => i + 1))
    expect(candidates[0].adoptedVersionNumber).toBe(31)
    expect(store.getDeckCandidate(project.id, thread.id, 'candidate-1')).toEqual(candidates[0])
    expect(store.getDeckCandidate(other.id, thread.id, 'candidate-1')).toBeNull()
    expect(() => store.getDeckThreadCandidatesBefore(other.id, thread.id, 50)).toThrow()
    const analysis = store.getDeckThreadForAnalysis(project.id, thread.id)!
    expect(analysis.messages).toHaveLength(12)
    expect(analysis.candidates).toHaveLength(1)
    expect(analysis.pendingNotes).toEqual(Array.from({ length: 60 }, (_, i) => `Note ${i + 101}`))
    expect(store.hasDeckAiTurn(project.id, thread.id, 'answer-0')).toBe(true)
    expect(store.hasDeckAiTurn(other.id, thread.id, 'answer-0')).toBe(false)
    const restored = store.restoreDeckVersion({ projectId: project.id, versionId: versions[130].id, expectedHeadId: versions[0].id })
    expect(restored.rawText).toBe(versions[130].rawText)
    for (const sql of [
      `SELECT id FROM deck_versions WHERE project_id = 'p' AND sequence < 20 ORDER BY sequence DESC LIMIT 50`,
      `SELECT id FROM deck_ai_candidates WHERE thread_id = 't' AND sequence < 20 ORDER BY sequence DESC LIMIT 50`
    ]) expect(JSON.stringify(db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all())).not.toMatch(/SCAN |TEMP B-TREE/)
  } finally { db.close(); store.close(); rmSync(folder, { recursive: true, force: true }) }
})

it('pages matchup bases and revisions with stable ties, absolute numbers and a bounded AI summary batch', () => {
  const folder = mkdtempSync(join(tmpdir(), 'pokeguru-matchup-history-')), path = join(folder, 'test.sqlite')
  let store = new ProjectStore(path)
  const db = new DatabaseSync(path)
  try {
    const project = store.create({ name: 'Guides', format: 'STANDARD' }), other = store.create({ name: 'Other', format: 'STANDARD' })
    const baseline = store.importDeck({ projectId: project.id, source: 'paste', rawText: '60 Basic Psychic Energy' })
    const metaId = 'a'.repeat(64), date = '2026-10-29T00:00:00Z'
    store.saveMetaSnapshot({ id: metaId, fetchedAt: date, sourceUrl: 'https://limitlesstcg.com/decks', period: 'test',
      circuit: 'WESTERN', format: 'STANDARD', cached: false, decks: [{ id: '1', name: 'Opponent', points: 1, share: 1, url: 'https://limitlesstcg.com/decks/1' }] })
    const report: MatchupReport = { projectId: project.id, metaId, opponentId: '1', deckHash: store.getCurrentDeckHash(project.id)!,
      deckVersionId: baseline.versionId, deckResolutionId: baseline.resolutionId, generatedAt: date,
      sampleDeckUrl: null, strengths: 'Good', weaknesses: 'Risk', ourKeyCards: 'Ours', theirKeyCards: 'Theirs', strategy: 'Plan', limitations: 'Limit' }
    store.saveMatchupReport(report)
    const original = store.listMatchupDiscussionPage(project.id, '1').items[0]
    db.exec('BEGIN')
    const insert = db.prepare(`INSERT INTO matchup_turns (id, discussion_id, turn_no, feedback, created_at, report_payload, change_summary)
      VALUES (?, ?, ?, ?, ?, ?, ?)`)
    for (let i = 1; i < 137; i++) insert.run(`revision-${i}`, original.id, i, `Note ${i}`, date,
      JSON.stringify({ ...report, strategy: `Plan ${i}` }), `Change ${i}`)
    const base = db.prepare(`INSERT INTO matchup_discussions
      (id, project_id, meta_id, opponent_id, deck_hash, content_hash, deck_version_id, deck_resolution_id, created_at)
      VALUES (?, ?, ?, '1', ?, ?, ?, ?, ?)`)
    for (let i = 0; i < 55; i++) base.run(`history-${i}`, project.id, metaId, `history-${i}`, `old-${i}`, baseline.versionId!, baseline.resolutionId!, date)
    db.exec('COMMIT')
    let page = store.listMatchupDiscussionPage(project.id, '1')
    let summaries = page.items
    expect(page.currentId).toBe(original.id)
    expect(summaries).toHaveLength(20)
    expect(summaries.every((item) => item.turns.length === 0)).toBe(true)
    while (page.nextCursor) {
      page = store.listMatchupDiscussionPage(project.id, '1', page.nextCursor)
      summaries = [...summaries, ...page.items]
    }
    expect(new Set(summaries.map((item) => item.id)).size).toBe(56)
    expect(summaries.filter((item) => item.current).map((item) => item.id)).toEqual([original.id])
    expect(store.listMatchupReportSummaries(project.id, metaId)).toEqual([{ opponentId: '1' }])
    const window = store.getMatchupDiscussionWindow(project.id, original.id)!
    expect(window.turnCount).toBe(137)
    expect(window.turns).toHaveLength(20)
    expect(window.turns[0].turnNo).toBe(117)
    const turns = [...window.turns]
    while (turns[0].turnNo! > 0) turns.unshift(...store.getMatchupTurnsBefore(project.id, original.id, turns[0].turnNo!))
    expect(turns.map((turn) => turn.turnNo)).toEqual(Array.from({ length: 137 }, (_, i) => i))
    expect(store.getMatchupDiscussionWindow(other.id, original.id)).toBeNull()
    expect(() => store.getMatchupTurnsBefore(other.id, original.id, 100)).toThrow()
    expect(store.getMatchupSummaryBatch(project.id, original.id, 30, 34).map((turn) => turn.turnNo)).toEqual([30, 31, 32, 33, 34])
    store.saveMatchupContextSummary(original.id, 'Summary', 132)
    const context = matchupHistoryContext({ ...window, contextSummary: 'Summary', summarizedThrough: 132 })
    expect(context).toContain('Note 136'); expect(context).not.toContain('Note 132')
    const pending = store.addMatchupFeedback(original.id, 'New note')
    expect(pending.turnCount).toBe(138); expect(pending.turns.at(-1)?.turnNo).toBe(137)
    store.completeMatchupFeedback(original.id, pending.turns.at(-1)!.id, report, 'Complete')
    store.close(); store = new ProjectStore(path)
    expect(store.getMatchupDiscussionWindow(project.id, original.id)?.turnCount).toBe(138)
    for (const sql of [
      `SELECT id FROM matchup_discussions WHERE project_id = 'p' AND opponent_id = '1' AND meta_id = 'm'
        AND coalesce(content_hash, deck_hash) = 'h' ORDER BY created_at DESC, rowid DESC LIMIT 1`,
      `SELECT opponent_id FROM matchup_report_summaries WHERE project_id = 'p' AND meta_id = 'm' AND deck_hash = 'h'`,
      `SELECT id FROM matchup_discussions WHERE project_id = 'p' AND opponent_id = '1' AND (created_at, rowid) < ('z', 200) ORDER BY created_at DESC, rowid DESC LIMIT 20`,
      `SELECT id FROM matchup_turns WHERE discussion_id = 'd' AND turn_no < 120 ORDER BY turn_no DESC LIMIT 20`
    ]) expect(JSON.stringify(db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all())).not.toMatch(/SCAN |TEMP B-TREE/)
  } finally { db.close(); store.close(); rmSync(folder, { recursive: true, force: true }) }
})
