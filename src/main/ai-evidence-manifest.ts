import { createHash } from 'node:crypto'
import { AiEvidenceArchive, evidenceHash, type EvidenceAnalysisInput,
  type EvidenceAnalysisInventory } from './ai-evidence-archive'
import { evidenceBatches, type EvidenceRecord } from './ai-evidence-partition'

export interface EvidenceBatchMember {
  input: EvidenceAnalysisInput
  fragment?: { start: number; end: number; total: number }
}
export interface EvidenceBatchManifest {
  id: string
  bytes: number
  members: EvidenceBatchMember[]
}
export interface EvidenceAnalysisManifest {
  schemaVersion: 1
  fingerprint: string
  budget: number
  inputs: EvidenceAnalysisInput[]
  batches: EvidenceBatchManifest[]
}

const contentHash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const sameInput = (left: EvidenceAnalysisInput, right: EvidenceAnalysisInput) =>
  evidenceHash(left) === evidenceHash(right)

/** A stable batch records exact members, including fragment offsets. Payloads remain
 * in the original archive; the manifest never duplicates full card or event data. */
function batchesForInputs(load: (input: EvidenceAnalysisInput) => EvidenceRecord,
  inputs: EvidenceAnalysisInput[], budget: number): EvidenceBatchManifest[] {
  const byKey = new Map(inputs.map((input) => [input.key, input]))
  function* originals() { for (const input of inputs) yield load(input) }
  return [...evidenceBatches(originals(), budget)].map((group) => ({
    id: contentHash(group), bytes: Buffer.byteLength(JSON.stringify(group)),
    members: group.map((part): EvidenceBatchMember => {
      const data = part.data as { kind?: string; encoding?: string; recordKey?: string;
        start?: number; end?: number; total?: number }
      const fragmented = data.kind === 'evidence-fragment' && data.encoding === 'json-string'
      const input = byKey.get(fragmented ? data.recordKey! : part.key!)
      if (!input) throw new Error('Origine del lotto non presente nel manifest.')
      return { input, ...(fragmented ? { fragment: { start: data.start!, end: data.end!, total: data.total! } } : {}) }
    })
  }))
}

/** Check exact coverage using small descriptors only. A record is either present
 * once or reconstructed by a contiguous, non-overlapping set of JSON fragments. */
export function validateEvidenceManifest(manifest: EvidenceAnalysisManifest): void {
  if (manifest.schemaVersion !== 1 || !Number.isSafeInteger(manifest.budget) || manifest.budget < 2400)
    throw new Error('Manifest di analisi non valido.')
  const inputs = new Map(manifest.inputs.map((input) => [input.key, input]))
  if (inputs.size !== manifest.inputs.length) throw new Error('Prove duplicate nel manifest.')
  const members = new Map<string, EvidenceBatchMember[]>()
  for (const batch of manifest.batches) {
    if (!/^[a-f0-9]{64}$/.test(batch.id) || batch.bytes > manifest.budget || batch.bytes < 2 || !batch.members.length)
      throw new Error('Lotto del manifest non valido.')
    for (const member of batch.members) {
      const input = inputs.get(member.input.key)
      if (!input || !sameInput(input, member.input)) throw new Error('Il manifest contiene una prova non corrente.')
      const group = members.get(input.key) ?? []
      group.push(member); members.set(input.key, group)
    }
  }
  for (const input of manifest.inputs) {
    const group = members.get(input.key)
    if (!group?.length) throw new Error('Il manifest non copre tutte le prove.')
    if (group.length === 1 && !group[0].fragment) continue
    if (group.some((member) => !member.fragment)) throw new Error('Il manifest duplica una prova.')
    const fragments = group.map((member) => member.fragment!).sort((a, b) => a.start - b.start)
    let end = 0
    const total = fragments[0].total
    for (const fragment of fragments) {
      if (![fragment.start, fragment.end, fragment.total].every(Number.isSafeInteger) ||
        fragment.start !== end || fragment.end <= fragment.start || fragment.total !== total || fragment.end > total)
        throw new Error('I frammenti del manifest non coprono esattamente la prova.')
      end = fragment.end
    }
    if (end !== total) throw new Error('Frammenti incompleti nel manifest.')
  }
}

/** First preparation preserves the original greedy partition. Later additions get
 * new sealed batches, so an early-sorting key cannot shift the existing boundaries.
 * A changed/removed member invalidates every batch connected through its fragments;
 * all surviving members of those batches are then repartitioned exactly once. */
export function prepareEvidenceManifest(archive: AiEvidenceArchive, budget: number,
  inventory: EvidenceAnalysisInventory = archive.analysisInventory()): EvidenceAnalysisManifest {
  const role = `analysis-manifest:v1:${budget}`
  return prepareManifest(archive, role, budget, inventory, (input) => archive.readAnalysisInput(input))
}

/** Internal synthesis nodes use stable child identities, never a whole-run generation. */
export function prepareSummaryManifest(archive: AiEvidenceArchive, namespace: string,
  records: EvidenceRecord[], budget: number): EvidenceAnalysisManifest {
  const byKey = new Map(records.map((record) => [record.key, record]))
  const inputs: EvidenceAnalysisInput[] = records.map((record) => ({ key: record.key!,
    type: 'summary', fingerprint: contentHash(record) }))
  return prepareManifest(archive, `analysis-summary-manifest:v1:${namespace}:${budget}`, budget,
    { snapshotHash: null, inputs }, (input) => {
      const record = byKey.get(input.key)
      if (!record) throw new Error('Sintesi figlia non disponibile.')
      return record
    }, true)
}

function prepareManifest(archive: AiEvidenceArchive, role: string, budget: number,
  inventory: EvidenceAnalysisInventory, load: (input: EvidenceAnalysisInput) => EvidenceRecord,
  repackTail = false): EvidenceAnalysisManifest {
  const fingerprint = evidenceHash(['analysis-manifest:v1', budget, inventory])
  const saved = archive.value<EvidenceAnalysisManifest>(role, fingerprint)
  if (saved) {
    validateEvidenceManifest(saved)
    if (saved.fingerprint !== fingerprint || saved.budget !== budget) throw new Error('Manifest di un altro input.')
    return saved
  }
  const previous = archive.latestValue<EvidenceAnalysisManifest>(role)
  if (previous) validateEvidenceManifest(previous)
  const current = new Map(inventory.inputs.map((input) => [input.key, input]))
  const affected = new Set<string>()
  // Keep the synthesis tail open, including a sole root. Appends then rebuild
  // that tail and its ancestors instead of indefinitely re-summarizing old roots.
  if (repackTail) for (const member of previous?.batches.at(-1)?.members ?? []) affected.add(member.input.key)
  for (const input of previous?.inputs ?? []) {
    const next = current.get(input.key)
    if (!next || !sameInput(input, next)) affected.add(input.key)
  }
  // Fragmented records can bridge adjacent batches. Expand the affected component
  // before retaining anything, preventing duplicated fragments or missing tails.
  let expanded = true
  while (expanded) {
    expanded = false
    for (const batch of previous?.batches ?? []) if (batch.members.some((member) => affected.has(member.input.key)))
      for (const member of batch.members) if (!affected.has(member.input.key)) {
        affected.add(member.input.key); expanded = true
      }
  }
  const retained = previous?.batches.filter((batch) => !batch.members.some((member) => affected.has(member.input.key))) ?? []
  const covered = new Set(retained.flatMap((batch) => batch.members.map((member) => member.input.key)))
  const pending = inventory.inputs.filter((input) => !covered.has(input.key))
  const manifest: EvidenceAnalysisManifest = { schemaVersion: 1, fingerprint, budget,
    inputs: inventory.inputs, batches: [...retained, ...batchesForInputs(load, pending, budget)] }
  validateEvidenceManifest(manifest)
  archive.saveValue(role, fingerprint, manifest)
  return manifest
}

/** Only called for a cache miss. Check the serialized bytes/hash before using a
 * batch so stale descriptors cannot silently replace a checkpoint's original input. */
export function readEvidenceBatch(archive: AiEvidenceArchive, batch: EvidenceBatchManifest): EvidenceRecord[] {
  return readManifestBatch((input) => archive.readAnalysisInput(input), batch)
}

export function readSummaryBatch(records: EvidenceRecord[], batch: EvidenceBatchManifest): EvidenceRecord[] {
  const byKey = new Map(records.map((record) => [record.key, record]))
  return readManifestBatch((input) => {
    const record = byKey.get(input.key)
    if (!record) throw new Error('Sintesi figlia non disponibile.')
    return record
  }, batch)
}

function readManifestBatch(load: (input: EvidenceAnalysisInput) => EvidenceRecord,
  batch: EvidenceBatchManifest): EvidenceRecord[] {
  const originals = new Map<string, EvidenceRecord>()
  const group = batch.members.map((member): EvidenceRecord => {
    let original = originals.get(member.input.key)
    if (!original) { original = load(member.input); originals.set(member.input.key, original) }
    if (!member.fragment) return original
    const { start, end, total } = member.fragment
    const serialized = JSON.stringify(original.data)
    if (serialized.length !== total) throw new Error('Frammento di una prova modificata.')
    return { key: `${original.key}:fragment:${start}:${end}`, sourceIds: original.sourceIds,
      data: { kind: 'evidence-fragment', recordKey: original.key, encoding: 'json-string',
        start, end, total, text: serialized.slice(start, end) } }
  })
  if (contentHash(group) !== batch.id || Buffer.byteLength(JSON.stringify(group)) !== batch.bytes)
    throw new Error('Il lotto non corrisponde al manifest salvato.')
  return group
}
