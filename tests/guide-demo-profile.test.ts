import { describe, it, expect } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { demoAllowsChannel, loadDemoProfile, readDemoMeta } from '../src/main/demo-profile'

describe('isolated offline pilot profile', () => {
  const info = { formatVersion: 1, mode: 'pilot-readonly', guides: [1, 2, 3].map((n) => ({
    projectId: `project-${n}`, opponentId: `opponent-${n}`, metaId: `meta-${n}`,
    title: `Guide ${n}`, promptVersion: 'historical', generatedAt: '2026-11-01T10:00:00Z'
  })) }
  function profile(run: (directory: string) => void) {
    const directory = mkdtempSync(join(tmpdir(), 'pokeguru-demo-test-'))
    try { run(directory) } finally { rmSync(directory, { recursive: true, force: true }) }
  }
  it('normal startup does not read a demo marker', () => {
    expect(loadDemoProfile('directory-does-not-exist', false)).toBeNull()
  })
  it('explicit demo startup fails closed without a valid marker', () => profile((directory) => {
    expect(() => loadDemoProfile(directory, true)).toThrow()
    writeFileSync(join(directory, 'demo-profile.json'), JSON.stringify({ ...info, mode: 'normal' }))
    expect(() => loadDemoProfile(directory, true)).toThrow(/non valido/)
    writeFileSync(join(directory, 'demo-profile.json'), JSON.stringify(info))
    expect(loadDemoProfile(directory, true)).toEqual(info)
  }))
  it('rejects ambiguous project bindings', () => profile((directory) => {
    writeFileSync(join(directory, 'demo-profile.json'), JSON.stringify({ ...info, guides: [info.guides[0], info.guides[0], info.guides[2]] }))
    expect(() => loadDemoProfile(directory, true)).toThrow(/duplicati/)
  }))
  it('accepts a separate validated preview with one guide while retaining the three-guide historical contract', () => profile((directory) => {
    const one = { ...info, mode: 'validated-readonly', guides: [info.guides[0]] }
    writeFileSync(join(directory, 'demo-profile.json'), JSON.stringify(one))
    expect(loadDemoProfile(directory, true)).toEqual(one)
    writeFileSync(join(directory, 'demo-profile.json'), JSON.stringify({ ...one, guides: [] }))
    expect(() => loadDemoProfile(directory, true)).toThrow(/non valido/)
    writeFileSync(join(directory, 'demo-profile.json'), JSON.stringify({ ...one, mode: 'pilot-readonly' }))
    expect(() => loadDemoProfile(directory, true)).toThrow(/non valido/)
  }))
  it('only reads the frozen meta bound to the requested project, never a newest or foreign snapshot', () => profile((directory) => {
    writeFileSync(join(directory, 'demo-profile.json'), JSON.stringify(info))
    const manifest = loadDemoProfile(directory, true)!
    mkdirSync(join(directory, 'data'))
    const db = new DatabaseSync(join(directory, 'data', 'pokeguru.sqlite'))
    db.exec('CREATE TABLE meta_snapshots (id TEXT PRIMARY KEY, payload TEXT)')
    for (const g of manifest.guides) db.prepare('INSERT INTO meta_snapshots VALUES (?,?)').run(g.metaId, JSON.stringify({ id: g.metaId, decks: [{ id: g.opponentId }], cached: false }))
    db.close()
    expect(readDemoMeta(directory, manifest, 'project-1')).toEqual({ id: 'meta-1', decks: [{ id: 'opponent-1' }], cached: true })
    expect(() => readDemoMeta(directory, manifest, 'foreign')).toThrow(/tre progetti/)
    expect(() => readDemoMeta(directory, manifest, undefined)).toThrow(/tre progetti/)
  }))
  it('denies AI, recovery, remote access, writes and unknown future channels before executing them', () => {
    for (const channel of ['ai:get-connection', 'ai:resume-job', 'ai:recover-jobs', 'deck:ask-thread',
      'matchups:generate', 'matchups:revise', 'matchups:retry-turn', 'matchups:continue',
      'projects:create', 'projects:import-deck', 'projects:delete-archived', 'catalog:sync',
      'catalog:advanced-search', 'standard:check-rule-sources', 'matchups:open-source', 'new:future-handler'])
      expect(demoAllowsChannel(channel), channel).toBe(false)
    for (const channel of ['projects:get-baseline', 'matchups:discussion-window', 'matchups:get-meta', 'deck:get-reconciliation'])
      expect(demoAllowsChannel(channel), channel).toBe(true)
  })
})
