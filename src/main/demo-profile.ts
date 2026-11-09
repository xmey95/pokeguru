import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { DemoProfile } from '../shared/demo-profile'
import type { MetaSnapshot } from '../shared/meta-matchups'

// An explicit launcher flag AND a prepared profile are required. A malformed
// profile aborts startup; it must never silently open the normal user archive.
export function loadDemoProfile(directory: string, enabled: boolean): DemoProfile | null {
  if (!enabled) return null
  const value: DemoProfile = JSON.parse(readFileSync(join(directory, 'demo-profile.json'), 'utf8'))
  if (value.formatVersion !== 1 || !['pilot-readonly', 'validated-readonly'].includes(value.mode) || !Array.isArray(value.guides) ||
    (value.mode === 'pilot-readonly' ? value.guides.length !== 3 : value.guides.length < 1) || value.guides.some((g) => !g ||
      ['projectId', 'opponentId', 'metaId', 'title', 'promptVersion', 'generatedAt']
        .some((key) => typeof g[key as keyof typeof g] !== 'string' || !g[key as keyof typeof g])))
    throw new Error('Profilo dimostrativo non valido. Ricrea la demo con il suo comando di avvio.')
  if (new Set(value.guides.map((g) => g.projectId)).size !== value.guides.length)
    throw new Error('Progetti duplicati nel profilo dimostrativo.')
  return value
}

// Deliberate allowlist: new IPC endpoints are blocked by default in this mode.
const readChannels = new Set([
  'demo:info', 'diagnostics:ui-long-task',
  'projects:list', 'projects:list-archived', 'projects:get', 'projects:get-baseline',
  'deck:list-versions', 'deck:version-page', 'deck:get-version', 'deck:get-reconciliation',
  'constraints:list', 'standard:get-rule-audit',
  'catalog:get', 'catalog:card-preview', 'catalog:card-previews', 'catalog:print',
  'matchups:get-meta', 'matchups:report-summaries', 'matchups:list-reports',
  'matchups:discussion-page', 'matchups:discussion-window', 'matchups:turns-before',
  'matchups:list-discussions', 'matchups:list-historical-opponents',
  'ai:job-status', 'ai:job-activity', 'ai:recent-jobs', 'ai:evidence-page'
])

export function demoAllowsChannel(channel: string): boolean { return readChannels.has(channel) }

export function readDemoMeta(directory: string, profile: DemoProfile, projectId: unknown): MetaSnapshot {
  const guide = profile.guides.find((g) => g.projectId === projectId)
  if (!guide) throw new Error(profile.mode === 'pilot-readonly' ? 'Scegli uno dei tre progetti del pilota.' : 'Scegli uno dei progetti della consultazione verificata.')
  const db = new DatabaseSync(join(directory, 'data', 'pokeguru.sqlite'), { readOnly: true })
  try {
    const row = db.prepare('SELECT payload FROM meta_snapshots WHERE id = ?').get(guide.metaId) as { payload: string } | undefined
    if (!row) throw new Error('Snapshot della guida non disponibile.')
    return { ...JSON.parse(row.payload), cached: true }
  } finally { db.close() }
}
