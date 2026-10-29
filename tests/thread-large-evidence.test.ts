import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, vi } from 'vitest'
import { ProjectStore } from '../src/main/project-store'
import { CatalogStore } from '../src/main/catalog'
import { AiJobStore } from '../src/main/ai-job-store'
import { recoverThreadJob } from '../src/main/ai-job-recovery'
import { makeAiPromptAudit } from '../src/main/ai-evidence-queries'
import type { ThreadEvidencePacket } from '../src/shared/thread-evidence'
import type { AiRunConfig } from '../src/shared/ai'

const config: AiRunConfig = { provider: 'codex', source: 'global', model: null, reasoningEffort: null }

function largeEvidence(): ThreadEvidencePacket {
  return { schemaVersion: 1, capturedAt: '2026-10-29T12:00:00Z',
    baseVersionId: null, candidateId: null, catalogSyncedAt: null,
    cardCoverage: { selected: 0, withGameplay: 0, omitted: 0 }, cards: [], events: [],
    sources: Array.from({ length: 1200 }, (_, i) => ({ id: `source-${i}`,
      label: `Original source ${i}`, url: `https://example.test/events/${i}`, fingerprint: String(i).padStart(64, '0') })),
    change: { updated: [], added: [], removed: [] },
    promptAudit: makeAiPromptAudit('Evidence supplied to the model. '.repeat(7000)) }
}

it('persists large evidence, citations and a complete candidate without truncation after reopen', () => {
  const folder = mkdtempSync(join(tmpdir(), 'pokeguru-large-evidence-')), file = join(folder, 'data.sqlite')
  let projects = new ProjectStore(file)
  try {
    const project = projects.create({ name: 'Large evidence', format: 'STANDARD' })
    const thread = projects.createDeckThread({ projectId: project.id, title: 'Turn' })
    projects.assignDeckAiSession(project.id, thread.id, 'session')
    const evidence = largeEvidence(), sourceIds = ['source-0', 'source-1199']
    expect(JSON.stringify(evidence).length).toBeGreaterThan(400_000)
    const proposal = { rawText: '60 Basic Grass Energy SVE 1', note: 'Saved candidate', sources: [], checks: [] }
    projects.saveDeckAiExchange(project.id, thread.id, 'session', 'Question', 'Answer', 'turn', config,
      proposal, evidence, sourceIds)
    projects.close(); projects = new ProjectStore(file)
    const saved = projects.getDeckThreadWindow(project.id, thread.id)!
    expect(saved.messages).toHaveLength(2)
    expect(saved.messages[1]).toMatchObject({ text: 'Answer', evidence, citedSourceIds: sourceIds })
    expect(saved.candidates).toHaveLength(1)
    expect(saved.candidates[0].rawText).toBe(proposal.rawText)
  } finally { projects.close(); rmSync(folder, { recursive: true, force: true }) }
})

it('recovers a previously blocked ready result once after restart, preserving its opening and other projects', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'pokeguru-large-recovery-')), file = join(folder, 'data.sqlite')
  let projects = new ProjectStore(file), catalog = new CatalogStore(file), jobs = new AiJobStore(file)
  try {
    const project = projects.create({ name: 'Recovery', format: 'STANDARD' })
    const other = projects.create({ name: 'Other', format: 'STANDARD' })
    const thread = projects.createDeckThread({ projectId: project.id, title: 'Turn', openingNote: 'Question', startWithAi: true })
    const otherThread = projects.createDeckThread({ projectId: other.id, title: 'Untouched', openingNote: 'Keep this note' })
    const originalOther = projects.getDeckThread(other.id, otherThread.id)
    const evidence = largeEvidence()
    const job = jobs.start('thread-ask', project.id, thread.id)
    jobs.prepare(job.id, { schemaVersion: 2, validatedDraft: true, message: 'Question', config,
      evidence, sources: [], existingUserMessageId: thread.openingAiMessageId })
    jobs.ready(job.id, { sessionId: 'session', turnId: 'turn', value: {
      kind: 'thought', reply: 'Answer already generated', rawText: '', sourceIds: ['source-1199'] } })
    jobs.noteError(job.id, 'Evidenze del turno non valide.')
    jobs.close(); catalog.close(); projects.close()
    projects = new ProjectStore(file); catalog = new CatalogStore(file); jobs = new AiJobStore(file)
    const ready = jobs.get(job.id)!
    const codex = { latestTurnId: vi.fn(async () => { throw new Error('No Codex request allowed') }) }
    expect(await recoverThreadJob(ready, jobs, projects, catalog, codex, join(folder, 'no-artifacts'))).toBe('applied')
    // Replaying the original ready snapshot must also be safe if saving succeeded before a crash.
    expect(await recoverThreadJob(ready, jobs, projects, catalog, codex, join(folder, 'no-artifacts'))).toBe('applied')
    const saved = projects.getDeckThread(project.id, thread.id)!
    expect(saved.messages).toHaveLength(2)
    expect(saved.messages[0].id).toBe(thread.openingAiMessageId)
    expect(saved.messages[1]).toMatchObject({ text: 'Answer already generated', evidence, citedSourceIds: ['source-1199'] })
    expect(projects.getDeckThreadWindow(project.id, thread.id)?.openingAiPending).toBe(false)
    expect(jobs.get(job.id)).toMatchObject({ status: 'applied', error: null })
    expect(projects.getDeckThread(other.id, otherThread.id)).toEqual(originalOther)
    expect(projects.getDeckThread(other.id, thread.id)).toBeNull()
    expect(codex.latestTurnId).not.toHaveBeenCalled()
  } finally { jobs.close(); catalog.close(); projects.close(); rmSync(folder, { recursive: true, force: true }) }
})

it.each(['schema', 'citation'] as const)('rejects invalid %s in large evidence before writing any part of the exchange', (invalid) => {
  const folder = mkdtempSync(join(tmpdir(), 'pokeguru-invalid-evidence-')), file = join(folder, 'data.sqlite')
  const projects = new ProjectStore(file)
  try {
    const project = projects.create({ name: 'Validation', format: 'STANDARD' })
    const thread = projects.createDeckThread({ projectId: project.id, title: 'Turn' })
    projects.assignDeckAiSession(project.id, thread.id, 'session')
    const evidence = largeEvidence()
    if (invalid === 'schema') (evidence as { schemaVersion: number }).schemaVersion = 2
    expect(() => projects.saveDeckAiExchange(project.id, thread.id, 'session', 'Question', 'Answer', 'turn', config,
      undefined, evidence, invalid === 'citation' ? ['unknown-source'] : [])).toThrow('Evidenze del turno non valide.')
    expect(projects.getDeckThread(project.id, thread.id)?.messages).toHaveLength(0)
  } finally { projects.close(); rmSync(folder, { recursive: true, force: true }) }
})
