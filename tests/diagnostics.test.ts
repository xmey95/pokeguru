import { describe, expect, it } from 'vitest'
import { buildDiagnosticReport, type DiagnosticInput } from '../src/main/diagnostics'
import { readDiagnosticIncidents, writeDiagnosticIncidents } from '../src/main/diagnostic-incidents'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const secret = 'PRIVATE-DECK-CHAT-TOKEN-PATH'

function input(): DiagnosticInput {
  return {
    generatedAt: '2026-10-28T12:00:00.000Z', version: '0.3.2', packaged: true,
    platform: 'win32', architecture: 'x64', electron: '45', chrome: '140', node: '24',
    uptimeSeconds: 123, mainHeapBytes: 12345,
    database: { available: true, issue: null, bytes: 1000, walBytes: 200 },
    projects: { active: 2, archived: 1 },
    catalog: { sets: 17, prints: 3303, groups: 2200, thumbnails: 3290, highImages: 3200,
      missingImages: 13, syncedAt: '2026-10-28T10:00:00.000Z', coverageExpected: 3303,
      coverageAcquired: 3303 },
    events: { play: 100, regional: 10 }, catalogSync: null, playSync: null, mainSync: null,
    daily: { catalog: { lastAttemptAt: null, lastSuccessAt: null, trigger: null, outcome: 'idle',
      nextAttemptAt: null, error: secret }, play: null, main: null },
    jobs: [{ id: secret, projectId: secret, resourceId: secret, kind: 'thread-ask',
      status: 'failed', createdAt: '2026-10-28T10:00:00.000Z', updatedAt: '2026-10-28T10:02:00.000Z',
      error: secret, progress: { phase: 'analysis', detail: secret, summary: secret,
        updatedAt: '2026-10-28T10:01:00.000Z', steps: [{ phase: 'analysis', detail: secret,
          at: '2026-10-28T10:01:00.000Z' }] } }],
    uiLongTasks: [{ at: '2026-10-28T10:00:00.000Z', durationMs: 120.7 }],
    incidents: [{ at: '2026-10-28T10:00:00.000Z', kind: 'renderer-gone', reason: secret }],
    collectionMs: 23.8, unavailableSections: []
  }
}

describe('diagnostic export', () => {
  it('keeps useful status and timing fields while excluding private content and raw errors', () => {
    const report = buildDiagnosticReport(input())
    expect(report.catalog?.prints).toBe(3303)
    expect(report.ai.recentJobs?.[0]).toMatchObject({ kind: 'thread-ask', status: 'failed',
      errorCategory: 'auth' })
    expect(report.performance).toMatchObject({ uiLongTaskCount: 1, uiLongTaskMaxMs: 121,
      collectionMs: 24 })
    expect(JSON.stringify(report)).not.toContain(secret)
  })

  it('remains useful when the archive cannot be opened', () => {
    const value = input()
    value.database = { available: false, issue: 'integrity', bytes: 1000, walBytes: null }
    value.catalog = null
    value.events = null
    value.projects = null
    value.jobs = null
    value.unavailableSections = ['catalog', 'events']
    const report = buildDiagnosticReport(value)
    expect(report.database.issue).toBe('integrity')
    expect(report.catalog).toBeNull()
    expect(report.unavailableSections).toEqual(['catalog', 'events'])
  })

  it('keeps only bounded, safe renderer incidents across restarts', () => {
    const directory = mkdtempSync(join(tmpdir(), 'pokeguru-diag-test-'))
    try {
      const path = join(directory, 'incidents.json')
      writeDiagnosticIncidents(path, Array.from({ length: 25 }, (_, index) => ({
        at: `2026-10-28T12:00:${String(index).padStart(2, '0')}.000Z`,
        kind: 'renderer-gone' as const, reason: 'oom'
      })))
      expect(readDiagnosticIncidents(path)).toHaveLength(20)
      expect(readFileSync(path, 'utf8')).not.toContain(secret)
      writeFileSync(path, JSON.stringify([{ at: '2026-10-28T12:00:00.000Z',
        kind: 'renderer-gone', reason: secret }]))
      expect(readDiagnosticIncidents(path)).toEqual([])
    } finally { rmSync(directory, { recursive: true, force: true }) }
  })
})
