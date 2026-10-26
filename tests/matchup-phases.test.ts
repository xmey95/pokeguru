import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { readMatchupAnalysis } from '../src/main/matchup-analysis'
import { matchupHistoryContext } from '../src/main/codex-matchup'
import { ProjectStore } from '../src/main/project-store'
import { AiJobStore } from '../src/main/ai-job-store'
import { recoverMatchupJob } from '../src/main/ai-job-recovery'

const output = { strengths: 'Due attaccanti', weaknesses: 'Ricerca iniziale', ourKeyCards: 'Carta A',
  theirKeyCards: 'Carta B', limitations: 'Non verificato in partita',
  opening: 'Prepara la panchina.', development: 'Conserva il recupero.', closing: 'Proteggi gli ultimi Premi.' }

it('requires three explicit phases and keeps the complete legacy plan verbatim', () => {
  const legacy = '  Testo storico\nSenza suddivisioni automatiche.\n'
  expect(readMatchupAnalysis({ ...output, strategy: legacy }, 1)).toMatchObject({ strategy: legacy })
  expect(readMatchupAnalysis({ ...output, strategy: legacy }, 1).strategyPhases).toBeUndefined()
  for (const closing of [undefined, null, 3, '', '   ', 'x'.repeat(5001)])
    expect(() => readMatchupAnalysis({ ...output, closing }, 2)).toThrow()
  expect(readMatchupAnalysis(output, 2).strategy).toContain('Chiusura\nProteggi gli ultimi Premi.')
})

it('recovers generation and revision with phases, keeps legacy history and isolates projects after reopening', () => {
  const folder = mkdtempSync(join(tmpdir(), 'pokeguru-phases-'))
  const path = join(folder, 'data.sqlite')
  const projects = new ProjectStore(path)
  const jobs = new AiJobStore(path)
  try {
    const project = projects.create({ name: 'Phases', format: 'STANDARD' })
    const other = projects.create({ name: 'Other', format: 'STANDARD' })
    projects.importDeck({ projectId: project.id, rawText: '2 Carta A MEG 1', source: 'paste' })
    const metaId = 'a'.repeat(64)
    const date = '2026-10-26T12:00:00.000Z'
    projects.saveMetaSnapshot({ id: metaId, fetchedAt: date, sourceUrl: 'https://limitlesstcg.com/decks',
      period: 'Fixture contratto', circuit: 'WESTERN', format: 'STANDARD', cached: false,
      decks: [{ id: '284', name: 'Avversario di prova', share: 0, points: 0, url: 'https://limitlesstcg.com/decks/284' }] })
    const context = projects.getCurrentDeckContext(project.id)!
    const base = { projectId: project.id, metaId, opponentId: '284', generatedAt: date, sampleDeckUrl: null,
      deckHash: projects.getCurrentDeckHash(project.id)!, deckVersionId: context.versionId,
      deckResolutionId: context.resolutionId }
    projects.saveMatchupReport({ ...base, ...readMatchupAnalysis({ ...output, strategy: 'Guida precedente integra.' }, 1) })
    const generated = jobs.start('matchup-generate', project.id, `matchup:${project.id}`)
    jobs.prepare(generated.id, { analysisVersion: 2, base: { ...base, jobId: generated.id } })
    const artifact = join(folder, 'result')
    mkdirSync(artifact)
    writeFileSync(join(artifact, 'result.json'), JSON.stringify({ ...output, closing: '' }))
    expect(() => recoverMatchupJob(jobs.get(generated.id)!, jobs, projects, artifact)).toThrow()
    expect(projects.listMatchupDiscussions(project.id, '284')[0].turns).toHaveLength(1)
    writeFileSync(join(artifact, 'result.json'), JSON.stringify(output))
    expect(recoverMatchupJob(jobs.get(generated.id)!, jobs, projects, artifact)).toBe('applied')
    const discussion = projects.listMatchupDiscussions(project.id, '284')[0]
    expect(discussion.turns[0].report?.strategy).toBe('Guida precedente integra.')
    expect(discussion.turns[1].report?.strategyPhases?.closing).toBe(output.closing)
    const pending = projects.addMatchupFeedback(discussion.id, 'Conserva una risorsa per il finale.')
    const revision = jobs.start('matchup-revise', project.id, `matchup:${project.id}`)
    jobs.prepare(revision.id, { analysisVersion: 2, base: { ...base, jobId: revision.id },
      discussionId: discussion.id, turnId: pending.turns.at(-1)!.id })
    writeFileSync(join(artifact, 'result.json'), JSON.stringify({ ...output,
      closing: 'Riserva una risorsa.', changeSummary: 'Finale rivisto.' }))
    expect(recoverMatchupJob(jobs.get(revision.id)!, jobs, projects, artifact)).toBe('applied')
    const reopened = new ProjectStore(path)
    try {
      const saved = reopened.getMatchupDiscussion(discussion.id)!
      expect(saved.turns).toHaveLength(3)
      expect(saved.turns.at(-1)?.report?.strategyPhases?.closing).toBe('Riserva una risorsa.')
      expect(saved.turns[0].report?.strategyPhases).toBeUndefined()
      expect(reopened.listMatchupDiscussions(other.id, '284')).toEqual([])
      expect(JSON.parse(matchupHistoryContext(saved)).previousGuide.strategy).toEqual({
        opening: output.opening, development: output.development, closing: 'Riserva una risorsa.' })
    } finally { reopened.close() }
  } finally { jobs.close(); projects.close(); rmSync(folder, { recursive: true, force: true }) }
})
