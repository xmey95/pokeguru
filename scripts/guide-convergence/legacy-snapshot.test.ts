import { it, expect } from 'vitest'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { ProofRegistry, digest, type Original } from './registry'

const snapshotPath = process.env.POKEGURU_CONVERGENCE_SNAPSHOT
/** An import rehearsal, not a migration or a certification of the real guides.
 * All current original objects are copied verbatim from this supplied snapshot.
 * Historical seed ancestry and product invariants are NOT inferred here. */
it.skipIf(!snapshotPath)('retains every supplied real original without promoting assignments or journals into approvals', () => {
  const input = readFileSync(snapshotPath!, 'utf8'), saved = JSON.parse(input), c = saved.value.context
  const sourceSha = createHash('sha256').update(input).digest('hex')
  const seeds = [c.before.direct, c.before.access, c.before.defend, ...c.before.others]
  const entries: { legacyKey: string; value: Original }[] = [
    ...c.retained.requirements.map((r: any) => ({ legacyKey: 'retained/' + r.id,
      value: { origin: 'ai', rawJson: JSON.stringify(r), producerRequestId: 'legacy-selections/' + digest(r.selectionKeys), sourceIds: [...r.sourceIds] } })),
    ...c.requirements.map((r: any, i: number) => ({ legacyKey: 'pending/' + c.metadataNeedHash + '/' + i,
      value: { origin: 'ai', rawJson: JSON.stringify(r), producerRequestId: 'legacy-need/' + c.metadataNeedHash, sourceIds: [...r.sourceIds] } })),
    ...seeds.map((s: any) => ({ legacyKey: 'adopted-seed/' + s.id,
      value: { origin: 'seed', rawJson: JSON.stringify(s), producerRequestId: 'legacy-plan/' + digest(c.before), sourceIds: [...s.sourceIds] } }))
  ]
  const scope = { projectId: c.scope.projectId, jobId: c.scope.jobId, caseId: c.before.caseId,
    dependencyHash: c.scope.dependencyHash, configHash: c.scope.configHash }
  const context = { packetHash: c.packetHash, frameHash: digest(c.branches[0].main), validatorVersion: 'isolated-import-without-native-certification',
    sourceIds: [...new Set<string>(entries.flatMap(e => e.value.sourceIds))].sort() }
  const registry = new ProofRegistry(scope, context, { mechanics: [], reviews: [] })
  for (const e of entries) registry.append({ type: 'original', value: e.value })
  const serialized = registry.serialize()
  const reopened = ProofRegistry.open(serialized, scope, context, { mechanics: [], reviews: [] })
  expect(reopened.serialize()).toBe(serialized)
  expect(reopened.audit().originals).toHaveLength(entries.length)
  expect(reopened.audit().originals.every(o => o.status === 'proposed')).toBe(true)
  expect(reopened.audit().obligationsClosed).toBe(false)
  expect(reopened.workQueue()).toEqual([])
  const roundTrip = JSON.parse(serialized).events.map((e: any) => e.event.value.rawJson)
  expect(roundTrip).toEqual(entries.map(e => e.value.rawJson))
  expect(createHash('sha256').update(readFileSync(snapshotPath!, 'utf8')).digest('hex')).toBe(sourceSha)
  const out = resolve(dirname(snapshotPath!), 'convergence-prototype-real-originals.json')
  writeFileSync(out, JSON.stringify({ at: new Date().toISOString(), snapshot: resolve(snapshotPath!), sourceSha,
    originalObjectsUnchanged: true, importedOriginals: entries.length, retainedNeeds: c.retained.requirements.length,
    pendingNeeds: c.requirements.length, adoptedSeedIntentions: seeds.length, candidatePlanIntentsImported: false,
    rawObjectHashByLegacyKey: Object.fromEntries(entries.map(e => [e.legacyKey, digest(e.value.rawJson)])),
    registryHash: digest(serialized), registryEvents: JSON.parse(serialized).events.length,
    statuses: reopened.audit(), constructionQueue: reopened.workQueue(), modelCalls: 0,
    approvalsCreated: 0, isCompleteMigration: false,
    excludedScope: ['historical seed ancestry', 'product/user invariants not in snapshot', 'physical witness validation', 'semantic admission', 'all-family integration'],
    note: 'No real guide or original source database was edited. This is an import rehearsal of supplied originals only.' }, null, 2))
})
