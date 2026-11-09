import { it, expect } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'
import { DatabaseSync } from 'node:sqlite'
import { EvidenceJsonCache } from '../src/main/evidence-json-cache'
import { AiEvidenceArchive } from '../src/main/ai-evidence-archive'
import { ProjectStore } from '../src/main/project-store'
import { AiJobStore } from '../src/main/ai-job-store'

function fixture() {
  const folder = mkdtempSync(join(tmpdir(), 'app231-cache-')), file = join(folder, 'data.sqlite')
  const projects = new ProjectStore(file), jobs = new AiJobStore(file)
  const project = projects.create({ name: 'Independent archived bytes test', format: 'STANDARD' })
  const job = jobs.start('matchup-generate', project.id, 'independent-resource'), archive = new AiEvidenceArchive(file, job), db = new DatabaseSync(file)
  return { archive, db, project, projects, jobs, file, objectHash: () => (db.prepare("SELECT object_hash FROM ai_evidence_values WHERE job_id=? AND role='test' AND key='value'").get(job.id) as { object_hash: string }).object_hash,
    close() { db.close(); archive.close(); jobs.close(); projects.close(); rmSync(folder, { recursive: true, force: true }) } }
}

it('isolates parsed callers and respects immutable named values after a warm read', () => {
  const f = fixture()
  try {
    const original = { nested: { text: 'é🦜 exact original' }, numbers: [1, 2, 3] }
    f.archive.saveValue('test', 'value', original)
    const first = f.archive.value<typeof original>('test', 'value')!
    first.nested.text = 'Changed by caller'; first.numbers.push(999)
    expect(f.archive.value('test', 'value')).toEqual(original)
    expect(() => f.archive.saveValue('test', 'value', first)).toThrow('immutabile')
  } finally { f.close() }
})

it('detects changed compressed bytes even after the original has been cached', () => {
  const f = fixture()
  try {
    f.archive.saveValue('test', 'value', { decision: 'original' })
    expect(f.archive.value('test', 'value')).toEqual({ decision: 'original' })
    f.db.prepare('UPDATE ai_evidence_chunks SET body=? WHERE object_hash=? AND ordinal=0').run(gzipSync(JSON.stringify({ decision: 'modified' })), f.objectHash())
    expect(() => f.archive.value('test', 'value')).toThrow('Integrità')
  } finally { f.close() }
})

it.each(['missing-middle', 'missing-last', 'size'] as const)('does not inherit cached integrity after storage corruption: %s', kind => {
  const f = fixture()
  try {
    f.archive.saveValue('test', 'value', { body: 'text '.repeat(65_000) })
    expect(f.archive.value('test', 'value')).toBeDefined()
    const hash = f.objectHash()
    if (kind === 'size') f.db.prepare('UPDATE ai_evidence_objects SET bytes=bytes+1 WHERE hash=?').run(hash)
    else f.db.prepare('DELETE FROM ai_evidence_chunks WHERE object_hash=? AND ordinal=?').run(hash, kind === 'missing-middle' ? 1 : 2)
    expect(() => f.archive.value('test', 'value')).toThrow()
  } finally { f.close() }
})

it('reads the current binding and enforces project membership on cache hits', () => {
  const f = fixture()
  try {
    f.archive.saveValue('test', 'value', { version: 1 }); f.archive.saveValue('test', 'other', { version: 2 })
    expect(f.archive.value('test', 'value')).toEqual({ version: 1 })
    f.db.exec("UPDATE ai_evidence_values SET object_hash=(SELECT object_hash FROM ai_evidence_values WHERE role='test' AND key='other') WHERE role='test' AND key='value'")
    expect(f.archive.value('test', 'value')).toEqual({ version: 2 })
    const project = f.projects.create({ name: 'Other project', format: 'STANDARD' }), job = f.jobs.start('matchup-generate', project.id, 'other-resource'), other = new AiEvidenceArchive(f.file, job)
    try { expect(other.value('test', 'value')).toBeUndefined() } finally { other.close() }
  } finally { f.close() }
})

it('bounds decoded memory and entry count, preserving LRU and bypassing oversized originals', () => {
  const cache = new EvidenceJsonCache(24, 2)
  cache.put('a', '123'); cache.put('b', '456'); expect(cache.get('a')).toBe('123')
  cache.put('c', '789'); expect(cache.get('b')).toBeUndefined(); expect(cache.get('a')).toBe('123')
  cache.put('huge', 'x'.repeat(100)); expect(cache.get('huge')).toBeUndefined(); expect(cache.get('a')).toBe('123')
  cache.clear(); expect(cache.get('a')).toBeUndefined()
  expect(() => new EvidenceJsonCache(-1)).toThrow(); expect(() => new EvidenceJsonCache(10, 0)).toThrow()
})

it('reads related evidence from one SQLite snapshot and detects committed corruption immediately after release', () => {
  const f = fixture()
  try {
    f.db.exec('PRAGMA journal_mode=WAL')
    f.archive.saveValue('test', 'value', { decision: 'original' })
    const stable = f.archive.withReadSnapshot(() => {
      expect(f.archive.value('test', 'value')).toEqual({ decision: 'original' })
      expect(() => f.archive.saveValue('test', 'forbidden', { data: true })).toThrow('lettura coerente')
      f.db.prepare('UPDATE ai_evidence_chunks SET body=? WHERE object_hash=? AND ordinal=0').run(gzipSync(JSON.stringify({ decision: 'modified' })), f.objectHash())
      return f.archive.withReadSnapshot(() => f.archive.value('test', 'value'))
    })
    expect(stable).toEqual({ decision: 'original' })
    expect(() => f.archive.value('test', 'value')).toThrow('Integrità')
    expect(f.archive.value('test', 'forbidden')).toBeUndefined()
  } finally { f.close() }
})

it('releases a failed synchronous reader and refuses promises without keeping a database transaction open', () => {
  const f = fixture()
  try {
    expect(() => f.archive.withReadSnapshot(() => { throw Error('read failed') })).toThrow('read failed')
    expect(() => f.archive.withReadSnapshot(() => Promise.resolve(1))).toThrow('sincrona')
    f.archive.saveValue('test', 'value', { subsequentWrite: 'works' })
    expect(f.archive.value('test', 'value')).toEqual({ subsequentWrite: 'works' })
  } finally { f.close() }
})

it('commits related raw opinions and receipts together, rolling back every binding on conflict',()=>{
  const f=fixture()
  try{
    f.archive.saveValue('receipt','existing',{version:1})
    expect(()=>f.archive.saveValues([{role:'opinion',key:'new',value:{verdict:'does-not-prove'}},{role:'receipt',key:'existing',value:{version:2}}])).toThrow('immutabile')
    expect(f.archive.value('opinion','new')).toBeUndefined()
    expect(f.archive.value('receipt','existing')).toEqual({version:1})
    f.archive.saveValues([{role:'opinion',key:'new',value:{verdict:'does-not-prove'}},{role:'receipt',key:'new',value:{opinionKey:'new'}}])
    expect(f.archive.value('opinion','new')).toEqual({verdict:'does-not-prove'})
    expect(f.archive.value('receipt','new')).toEqual({opinionKey:'new'})
    expect(()=>f.archive.withReadSnapshot(()=>f.archive.saveValues([{role:'forbidden',key:'new',value:1}]))).toThrow('lettura coerente')
  }finally{f.close()}
})
