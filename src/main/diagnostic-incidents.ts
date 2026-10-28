import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { RuntimeIncident } from './diagnostics'

const reasons = new Set(['crashed', 'killed', 'oom', 'launch-failed', 'integrity-failure', 'other'])

export function readDiagnosticIncidents(path: string): RuntimeIncident[] {
  try {
    const value: unknown = JSON.parse(readFileSync(path, 'utf8'))
    if (!Array.isArray(value)) return []
    return value.filter((entry): entry is RuntimeIncident => {
      if (!entry || typeof entry !== 'object') return false
      const item = entry as Record<string, unknown>
      return typeof item.at === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d/.test(item.at) &&
        (item.kind === 'unresponsive' || (item.kind === 'renderer-gone' &&
          typeof item.reason === 'string' && reasons.has(item.reason)))
    }).slice(-20).map((entry) => ({ at: entry.at, kind: entry.kind,
      ...(entry.kind === 'renderer-gone' ? { reason: entry.reason } : {}) }))
  } catch { return [] }
}

export function writeDiagnosticIncidents(path: string, incidents: RuntimeIncident[]): void {
  const temporary = `${path}.tmp`
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(temporary, JSON.stringify(incidents.slice(-20)), { encoding: 'utf8', mode: 0o600 })
  renameSync(temporary, path)
}
