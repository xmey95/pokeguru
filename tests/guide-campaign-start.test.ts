import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { it, expect } from 'vitest'
import { ProjectStore } from '../src/main/project-store'
import { AiJobStore } from '../src/main/ai-job-store'
import { guideCampaignResource, startGuideCampaignCase } from '../scripts/lib/guide-campaign-start'
import type { GuidePacket } from '../src/main/matchup-guide-packet'

const campaignId = '0ae8f4ef-0e0e-4e22-b094-9ad97e608ec1'
function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'pg-campaign-isolation-')), database = join(directory, 'data.sqlite')
  const projects = new ProjectStore(database), project = projects.create({ name: 'Isolation', format: 'STANDARD' })
  const deckHash = projects.getCurrentDeckHash(project.id)
  projects.close()
  const packet = { basis: { projectId: project.id, deckHash, dependencyHash: 'frozen' } } as GuidePacket
  const input = { directory, database, campaignId, caseId: 'a', projectId: project.id, packet,
    counts: [{ id: 'a', calls: 358 }, { id: 'b', calls: 0 }, { id: 'c', calls: 0 }], caps: [522, 500, 500],
    ceilings: { perGuide: 522, pool: 1500, reserveEachLater: 24 }, calibration: [{ visibleTokens: 4, inputTokens: 6 }],
    request: 'Use frozen lists', authorityReference: 'offline' }
  return { input, dispose() { rmSync(directory, { recursive: true, force: true }) } }
}
it('preserves a resumable inherited job and creates a separately owned archive with cumulative budget', () => {
  const f = fixture(), oldJobs = new AiJobStore(f.input.database)
  try {
    const old = oldJobs.start('matchup-generate', f.input.projectId, 'bounded-delivery-1:a')
    oldJobs.suspend(old.id, 'test', 'failure')
    const before = oldJobs.get(old.id)
    expect(before?.progress?.diagnostics?.resumable).toBe(true)
    expect(() => oldJobs.start('matchup-generate', f.input.projectId, old.resourceId)).toThrow('pausa')
    const context = startGuideCampaignCase(f.input)
    try {
      expect(context.job.id).not.toBe(old.id)
      expect(context.resourceId).not.toBe(old.resourceId)
      expect(context.allowance).toMatchObject({ remaining: 164, consumedByGuide: 358, reservedForLater: 48 })
      expect(context.generation.callBudgetAuthorization.maximum).toBe(164)
      expect([...context.work.archive.values('guide-token-sample')].map(r => r.value)).toEqual(f.input.calibration)
      expect([...context.work.archive.values('guide-attempt-start')]).toEqual([])
      expect([...context.work.archive.values('guide-raw-response')]).toEqual([])
      expect(oldJobs.get(old.id)).toEqual(before)
      context.jobs.suspend(context.job.id, 'offline pause', 'failure')
    } finally { context.close() }
    expect(() => startGuideCampaignCase(f.input)).toThrow('già avviata')
    expect(oldJobs.get(old.id)).toEqual(before)
  } finally { oldJobs.close(); f.dispose() }
})
it.each(['running', 'ready', 'applied', 'cancelled', 'failed', 'interrupted'] as const)('does not replace an existing %s job of the same campaign', status => {
  const f = fixture()
  try {
    const context = startGuideCampaignCase(f.input)
    if (status === 'interrupted') context.jobs.suspend(context.job.id, 'paused', 'failure')
    else if (status === 'ready' || status === 'applied') { context.jobs.ready(context.job.id, { offline: true }); if (status === 'applied') context.jobs.transition(context.job.id, 'applied') }
    else if (status !== 'running') context.jobs.transition(context.job.id, status)
    context.close()
    expect(() => startGuideCampaignCase(f.input)).toThrow('già avviata')
    const db = new DatabaseSync(f.input.database, { readOnly: true })
    try { expect(db.prepare('SELECT COUNT(*) n FROM ai_jobs').get()?.n).toBe(1) } finally { db.close() }
  } finally { f.dispose() }
})
it.each([
  (i: ReturnType<typeof fixture>['input']) => { i.counts[0].calls = 359 },
  (i: ReturnType<typeof fixture>['input']) => { i.ceilings.pool = 569 },
  (i: ReturnType<typeof fixture>['input']) => { i.packet.basis.projectId = 'foreign' },
  (i: ReturnType<typeof fixture>['input']) => { i.packet.basis.deckHash = 'changed' },
  (i: ReturnType<typeof fixture>['input']) => { i.caps[1] = 523 },
  (i: ReturnType<typeof fixture>['input']) => { i.counts[1].calls = 501 },
])('rejects insufficient budget, depleted reserves and wrong ownership before any job is created', mutate => {
  const f = fixture()
  try {
    mutate(f.input)
    expect(() => startGuideCampaignCase(f.input)).toThrow()
    const jobs = new AiJobStore(f.input.database)
    try { expect(jobs.recent()).toEqual([]) } finally { jobs.close() }
  } finally { f.dispose() }
})
it('binds stable resources to both the frozen campaign identity and matchup', () => {
  expect(guideCampaignResource(campaignId, 'a')).toBe(guideCampaignResource(campaignId, 'a'))
  expect(guideCampaignResource(campaignId, 'a')).not.toBe(guideCampaignResource(campaignId, 'b'))
  expect(guideCampaignResource(campaignId, 'a')).not.toBe(guideCampaignResource('1ae8f4ef-0e0e-4e22-b094-9ad97e608ec1', 'a'))
  expect(() => guideCampaignResource('', 'a')).toThrow()
  expect(() => guideCampaignResource(campaignId, ' ')).toThrow()
})
