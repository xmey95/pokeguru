import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, describe, expect, it } from 'vitest'
import { DailySyncStore } from '../src/main/daily-sync'

const folders: string[] = []
function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'pokeguru-daily-'))
  folders.push(dir)
  return join(dir, 'pokeguru.sqlite')
}
afterEach(() => { for (const dir of folders.splice(0)) rmSync(dir, { recursive: true, force: true }) })

describe('daily background acquisition', () => {
  it('claims each source once and persists its successful day across restarts', () => {
    const path = fixture()
    const first = new DailySyncStore(path)
    const day1 = new Date('2026-10-24T12:00:00Z')
    const day2 = new Date('2026-10-25T12:00:00Z')
    expect(first.claim('catalog', day1)).toBe(true)
    expect(first.claim('catalog', day1)).toBe(false)
    expect(first.claim('play', day1)).toBe(true)
    first.success('catalog', day1)
    first.success('play', day1)
    first.close()

    const reopened = new DailySyncStore(path)
    expect(reopened.due('catalog', new Date('2026-10-24T18:00:00Z'))).toBe(false)
    expect(reopened.due('catalog', new Date('2026-10-25T00:01:00Z'))).toBe(false)
    expect(reopened.due('catalog', new Date('2026-10-25T11:59:59Z'))).toBe(false)
    expect(reopened.due('play', day2)).toBe(true)
    expect(reopened.due('catalog', day2)).toBe(true)
    expect(reopened.claim('catalog', day2)).toBe(true)
    expect(reopened.claim('catalog', day2)).toBe(false)
    expect(reopened.read('catalog')).toMatchObject({ trigger: 'automatic', outcome: 'running',
      lastSuccessAt: day1.toISOString(), lastAttemptAt: day2.toISOString() })
    reopened.close()
  })

  it('holds failed and limited sources through restart without blocking another source', () => {
    const path = fixture()
    const start = new Date('2026-10-24T12:00:00Z')
    const retry = new Date('2026-10-25T04:00:00Z').toISOString()
    const first = new DailySyncStore(path)
    expect(first.claim('catalog', start)).toBe(true)
    first.failed('catalog', 'offline', null, start)
    expect(first.claim('play', start)).toBe(true)
    first.failed('play', '429', retry, start)
    first.close()
    const reopened = new DailySyncStore(path)
    expect(reopened.due('catalog', new Date('2026-10-24T17:59:59Z'))).toBe(false)
    expect(reopened.due('catalog', new Date('2026-10-24T18:00:00Z'))).toBe(true)
    expect(reopened.due('play', new Date('2026-10-25T03:59:59Z'))).toBe(false)
    expect(reopened.due('play', new Date(retry))).toBe(true)
    expect(reopened.due('main', start)).toBe(true)
    reopened.close()
  })

  it('honors a manual pause, then accepts a manual resume and does not race a background claim', () => {
    const store = new DailySyncStore(fixture())
    const now = new Date('2026-10-25T12:00:00Z')
    store.paused('main')
    expect(store.claim('main', now)).toBe(false)
    store.started('main', now)
    expect(store.read('main')).toMatchObject({ trigger: 'manual', outcome: 'running' })
    expect(store.claim('main', now)).toBe(false)
    store.success('main', now)
    expect(store.due('main', new Date('2026-10-25T15:00:00Z'))).toBe(false)
    store.cancelled('catalog')
    expect(store.claim('catalog', new Date('2026-10-27T12:00:00Z'))).toBe(false)
    store.started('catalog', now)
    expect(store.read('catalog').outcome).toBe('running')
    store.close()
  })

  it('recovers a recent legacy Catalog completion and holds an interrupted job', () => {
    const path = fixture()
    const db = new DatabaseSync(path)
    db.exec(`CREATE TABLE catalog_job (id INTEGER PRIMARY KEY, state TEXT NOT NULL,
      updated_at TEXT NOT NULL, retry_at TEXT) STRICT`)
    const now = new Date('2026-10-25T12:00:00Z')
    db.prepare('INSERT INTO catalog_job VALUES (1, ?, ?, NULL)').run('done', now.toISOString())
    db.close()
    const first = new DailySyncStore(path)
    expect(first.read('catalog').lastSuccessAt).toBe(now.toISOString())
    expect(first.due('catalog', new Date(now.getTime() + 3_600_000))).toBe(false)
    first.close()

    const db2 = new DatabaseSync(path)
    db2.prepare('DELETE FROM daily_sync WHERE source=?').run('catalog')
    db2.prepare('UPDATE catalog_job SET state=?, updated_at=? WHERE id=1')
      .run('interrupted', now.toISOString())
    db2.close()
    const second = new DailySyncStore(path)
    expect(second.due('catalog', new Date(now.getTime() + 60_000))).toBe(false)
    expect(second.read('catalog').outcome).toBe('failed')
    second.close()
  })
})
