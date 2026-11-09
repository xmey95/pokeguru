import { describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  ProofRegistry as PrototypeRegistry, digest, type Admission, type Certification, type Context, type Decision, type Formula,
  type MechanicalReceipt, type Obligation, type Original, type ReviewReceipt, type Scope, type TrustCatalog,
  type WitnessRef, type Work
} from './registry'

type Registry = Pick<PrototypeRegistry, 'scopeHash' | 'contextHash' | 'append' | 'originalId' | 'obligation' | 'bindingHash' | 'competitionHash' | 'verified' | 'audit' | 'workQueue' | 'progress' | 'shouldStop' | 'serialize'>
interface RegistryConstructor {
  new(scope: Scope, context: Context, trust: any): Registry
  open(raw: string, scope: Scope, context: Context, trust: any): Registry
}
export function registryContract(ProofRegistry: RegistryConstructor, version: string, label: string, allowSeedSupersession = false) {
const scope: Scope = { projectId: 'synthetic-project', jobId: 'synthetic-job', caseId: 'synthetic-case', dependencyHash: 'dependency-original', configHash: 'config-original' }
const initial: Context = { packetHash: 'packet-original', frameHash: 'frame-with-fixed-draw', validatorVersion: 'existing-validator-1', sourceIds: ['rules', 'card'] }

/** Synthetic host adapters. They deliberately do not assert that AI actually
 * produced these reviews, or that dummy journals pass the real TCG validator. */
class Fixture {
  context = structuredClone(initial)
  trust: TrustCatalog = { mechanics: [], reviews: [] }
  r = new ProofRegistry(scope, this.context, this.trust)
  heads = new Map<string, WitnessRef>()
  next = 0
  refresh() { this.r = ProofRegistry.open(this.r.serialize(), scope, this.context, this.trust) }
  original(label: string, origin: Original['origin'] = 'ai', producerRequestId = 'generator-original'): string {
    const o: Original = { origin, rawJson: JSON.stringify({ goal: label, reason: 'Exact original, not normalized by host' }),
      producerRequestId: origin === 'user' || origin === 'product' ? null : producerRequestId, sourceIds: ['rules'] }
    this.r.append({ type: 'original', value: o })
    return this.r.originalId(o)
  }
  obligation(statement = 'Demonstrate the specified response', conditions = 'Same prefix and fixed draw', comparisonGroupId: string | null = null) {
    return this.r.obligation({ statement, conditions, sourceIds: ['rules'], comparisonGroupId })
  }
  witness(id: string, facts = id, producerRequestId = 'constructor-' + id, description = 'Original journal'): WitnessRef {
    const value = { lineId: id, body: JSON.stringify({ id, facts, description }), producerRequestId, turnNumbers: [1, 2] }
    const receipt: MechanicalReceipt = { kind: 'mechanical', scopeHash: this.r.scopeHash, contextHash: this.r.contextHash,
      validatorVersion: this.context.validatorVersion, lineId: id, bodyHash: digest(value.body), producerRequestId, turnNumbers: [1, 2], factsHash: digest(facts) }
    this.trust.mechanics.push(receipt); this.refresh()
    this.r.append({ type: 'witness', value, receiptHash: digest(receipt) })
    const ref = { lineId: id, bodyHash: digest(value.body), turnNumbers: [1, 2] }
    this.heads.set(id, ref)
    return ref
  }
  receipt(kind: ReviewReceipt['kind'], responseJson: string, originalIds: string[], obligationIds: string[], witnessRefs: WitnessRef[] = [],
    overrides: Partial<ReviewReceipt> = {}): string {
    const receipt: ReviewReceipt = { kind, requestId: 'independent-review-' + ++this.next, contractVersion: version as ReviewReceipt['contractVersion'],
      scopeHash: this.r.scopeHash, contextHash: this.r.contextHash, responseHash: digest(responseJson), originalIds, obligationIds,
      witnessRefs, sourceIds: ['rules', 'card'], competitors: {}, bindingHash: null, ...overrides }
    this.trust.reviews.push(receipt); this.refresh()
    return digest(receipt)
  }
  admission(a: Admission, refs: WitnessRef[] = [], overrides: Partial<ReviewReceipt> = {}) {
    const raw = JSON.stringify(a)
    const receiptHash = this.receipt('admission', raw, a.decisions.map(d => d.originalId), [], refs, overrides)
    this.r.append({ type: 'admission', responseJson: raw, receiptHash })
  }
  map(originalId: string, obligations: Obligation[], formula: Formula = { atom: obligations[0].id }, action: Work['action'] = 'construct', witnessIds: string[] = [],
    overrides: Partial<ReviewReceipt> = {}) {
    const work = obligations.map(o => ({ obligationId: o.id, action, witnessIds, reason: 'Independent routing, not a proof' }))
    this.admission({ obligations, decisions: [{ originalId, disposition: 'map', formula, reason: 'Independent mapping of all conditions', sourceIds: ['rules'] }], work },
      witnessIds.filter(id => this.heads.has(id)).map(id => this.heads.get(id)!), overrides)
  }
  certify(o: Obligation, originals: string[], refs: WitnessRef[], changes: Partial<Certification> = {}, overrides: Partial<ReviewReceipt> = {}) {
    const value: Certification = { obligationId: o.id, verdict: 'verified', reason: 'Independent semantic judgment on cited turns', sourceIds: ['rules'], witnesses: refs, next: null, ...changes }
    const raw = JSON.stringify(value)
    const receiptHash = this.receipt('certification', raw, originals, [o.id], refs, { bindingHash: this.r.bindingHash(o.id), ...overrides })
    this.r.append({ type: 'certification', responseJson: raw, receiptHash })
  }
  checkpoint() { this.r.append({ type: 'checkpoint' }) }
}

describe(label, () => {
  it('evaluates an existing proof in a different unit without demanding new construction', () => {
    const f = new Fixture(), original = f.original('Unit A asks for a proof already stored in unit B'), o = f.obligation(), ref = f.witness('unit-B/line')
    expect(f.r.audit().obligationsClosed).toBe(false)
    expect(f.r.workQueue()).toEqual([]) // unadmitted original cannot order construction
    f.map(original, [o], undefined, 'evaluate', [ref.lineId])
    expect(f.r.workQueue().map(w => w.action)).toEqual(['evaluate'])
    expect(f.r.audit().obligationsClosed).toBe(false) // legal journal plus mapping is insufficient
    expect(() => f.certify(o, [original], [])).toThrow('without proof')
    f.certify(o, [original], [ref])
    expect(f.r.audit()).toEqual({ obligationsClosed: true, originals: [{ id: original, status: 'verified' }] })
    expect(f.r.workQueue()).toEqual([])
  })

  it('keeps every conjunct and supports independent witnesses for a composite original', () => {
    const f = new Fixture(), original = f.original('Demonstrate A AND B'), a = f.obligation('A'), b = f.obligation('B')
    f.map(original, [a, b], { all: [{ atom: a.id }, { atom: b.id }] })
    const wa = f.witness('proof-A'), wb = f.witness('proof-B')
    f.certify(a, [original], [wa])
    expect(f.r.audit().obligationsClosed).toBe(false)
    expect(f.r.workQueue().map(w => w.obligationId)).toEqual([b.id])
    expect(() => f.certify(b, [original], [wa], {}, { witnessRefs: [wb] })).toThrow('Unreviewed witness')
    f.certify(b, [original], [wb])
    expect(f.r.audit().obligationsClosed).toBe(true)
  })

  it('does not require a redundant alternative once an independently admitted disjunction is proved', () => {
    const f = new Fixture(), original = f.original('Demonstrate A OR B'), a = f.obligation('A'), b = f.obligation('B')
    f.map(original, [a, b], { any: [{ atom: a.id }, { atom: b.id }] })
    f.certify(a, [original], [f.witness('A')])
    expect(f.r.verified(b.id)).toBe(false)
    expect(f.r.audit().obligationsClosed).toBe(true)
    expect(f.r.workQueue()).toEqual([])
    expect(() => f.r.append({ type: 'assignment', obligationId: b.id, producerRequestId: 'planner-extra', planJson: '{}' })).toThrow('admitted open construction')
  })

  it('does not merge identical wording with different resource or draw conditions', () => {
    const f = new Fixture(), first = f.original('Same text, first condition'), second = f.original('Same text, other condition')
    const a = f.obligation('Survive the reply', 'Energy is in hand'), b = f.obligation('Survive the reply', 'Energy is not in hand')
    expect(a.id).not.toBe(b.id)
    f.map(first, [a]); f.map(second, [b])
    f.certify(a, [first], [f.witness('with-energy')])
    expect(f.r.audit().obligationsClosed).toBe(false)
    expect(() => f.certify(b, [first], [f.heads.get('with-energy')!])).toThrow('omitted original')
  })

  it.each(allowSeedSupersession ? ['user', 'product'] as const : ['user', 'product', 'seed'] as const)('cannot withdraw a %s invariant with an AI superseded decision', origin => {
    const f = new Fixture(), id = f.original('Mandatory original', origin)
    const before = f.r.serialize()
    expect(() => f.admission({ obligations: [], decisions: [{ originalId: id, disposition: 'superseded', formula: null,
      reason: 'Trying to save calls', sourceIds: ['rules'] }], work: [] })).toThrow('Cannot withdraw')
    expect(f.r.serialize()).toBe(before)
    expect(f.r.audit().obligationsClosed).toBe(false)
  })

  it.skipIf(!allowSeedSupersession)('retains an AI seed that an independent critic refutes, without turning it into a permanent product invariant', () => {
    const f = new Fixture(), id = f.original('An AI plan asks for an impossible resource', 'seed')
    const d: Decision = { originalId: id, disposition: 'superseded', formula: null, reason: 'Source and exact frame prove the resource is unavailable; required tactical coverage remains mandatory', sourceIds: ['rules'] }
    expect(() => f.admission({ obligations: [], decisions: [d], work: [] }, [], { requestId: 'generator-original' })).toThrow('not independent')
    expect(() => f.admission({ obligations: [], decisions: [{ ...d, sourceIds: [] }], work: [] })).toThrow()
    expect(f.r.audit().obligationsClosed).toBe(false)
    f.admission({ obligations: [], decisions: [d], work: [] })
    expect(f.r.audit().originals).toEqual([{ id, status: 'superseded' }])
    expect(f.r.serialize()).toContain('An AI plan asks for an impossible resource')
  })

  it('accepts an independently refuted AI need with source evidence, while retaining its exact original', () => {
    const f = new Fixture(), id = f.original('AI incorrectly requires an impossible extra payment')
    const decision: Decision = { originalId: id, disposition: 'superseded', formula: null, reason: 'Rule source explains why the extra payment is not required', sourceIds: ['rules'] }
    expect(() => f.admission({ obligations: [], decisions: [{ ...decision, sourceIds: [] }], work: [] })).toThrow('Invalid string set')
    expect(() => f.admission({ obligations: [], decisions: [decision], work: [] }, [], { requestId: 'generator-original' })).toThrow('not independent')
    f.admission({ obligations: [], decisions: [decision], work: [] })
    expect(f.r.audit()).toEqual({ obligationsClosed: true, originals: [{ id, status: 'superseded' }] })
    expect(f.r.serialize()).toContain('AI incorrectly requires an impossible extra payment')
    const context = { ...f.context, packetHash: 'new-source-packet' }
    f.r.append({ type: 'context', value: context }); f.context = context
    expect(f.r.audit().originals[0].status).toBe('invalidated')
  })

  it('routes missing context to retrieval rather than automatically constructing a new branch', () => {
    const f = new Fixture(), id = f.original('A proof may exist outside this unit'), o = f.obligation()
    expect(() => f.map(id, [o], undefined, 'evaluate', ['directory-only'])).toThrow('complete current witnesses')
    f.map(id, [o], undefined, 'retrieve', ['directory-only'])
    expect(f.r.workQueue()[0].action).toBe('retrieve')
    expect(() => f.certify(o, [id], [{ lineId: 'directory-only', bodyHash: 'claimed-proof', turnNumbers: [1] }])).toThrow('bindings differ')
    expect(f.r.audit().obligationsClosed).toBe(false)
  })

  it('retains an invalid or ambiguous critical response as unresolved, without admitting orphan work', () => {
    const f = new Fixture(), id = f.original('Ambiguous AI request'), o = f.obligation()
    const raw = JSON.stringify({ obligations: [o], decisions: [{ originalId: id, disposition: 'map', formula: { atom: o.id }, reason: 'Mapping', sourceIds: ['rules'] }], work: [] })
    const hash = f.receipt('admission', raw, [id], [])
    const before = f.r.serialize()
    expect(() => f.r.append({ type: 'admission', responseJson: raw, receiptHash: hash })).toThrow('Incomplete work routing')
    expect(f.r.serialize()).toBe(before) // late validation failure must roll back added definitions
    expect(f.r.workQueue()).toEqual([])
    f.admission({ obligations: [], decisions: [{ originalId: id, disposition: 'clarify', formula: null, reason: 'Need the exact conditions', sourceIds: ['rules'] }], work: [] })
    expect(f.r.audit().originals[0].status).toBe('clarify')
    expect(f.r.audit().obligationsClosed).toBe(false)
  })

  it('does not convert an assignment or a valid journal into semantic approval', () => {
    const f = new Fixture(), id = f.original('Need a demonstrated line'), o = f.obligation()
    f.map(id, [o]); f.r.append({ type: 'assignment', obligationId: o.id, producerRequestId: 'planner', planJson: '{"intention":"satisfy goal"}' })
    const ref = f.witness('constructed')
    expect(f.r.workQueue()[0].assigned).toBe(true)
    expect(f.r.audit().obligationsClosed).toBe(false)
    expect(() => f.certify(o, [id], [ref], {}, { requestId: 'planner' })).toThrow('Planner cannot certify')
    expect(() => f.certify(o, [id], [ref], {}, { requestId: 'constructor-constructed' })).toThrow('self-certification')
    f.certify(o, [id], [ref], { verdict: 'still-open', next: { obligationId: o.id, action: 'construct', witnessIds: [], reason: 'A tactical condition remains unproved' } })
    expect(f.r.audit().obligationsClosed).toBe(false)
  })

  it.each(['frameHash', 'packetHash', 'validatorVersion'] as const)('invalidates dependent proof after a change to %s', key => {
    const f = new Fixture(), id = f.original('Exact setup, draw, resources and sources'), o = f.obligation(), ref = f.witness('proof')
    f.map(id, [o]); f.certify(o, [id], [ref])
    const context = { ...f.context, [key]: 'changed-' + key }
    f.r.append({ type: 'context', value: context }); f.context = context
    expect(f.r.audit().obligationsClosed).toBe(false)
    expect(f.r.verified(o.id)).toBe(false)
    expect(() => f.certify(o, [id], [ref])).toThrow()
    expect(() => ProofRegistry.open(f.r.serialize(), scope, initial, f.trust)).toThrow('not host current context')
  })

  it('invalidates a best-response claim when a defensive alternative is added', () => {
    const f = new Fixture(), id = f.original('Compare all current responses'), a = f.witness('attack'), b = f.witness('defensive-retreat')
    f.r.append({ type: 'competition', groupId: 'replies', criterion: 'Best response under fixed conditions', lineIds: [a.lineId, b.lineId] })
    const o = f.obligation('Best response', 'Same damage and resource criteria', 'replies')
    f.map(id, [o]); const oldHash = f.r.competitionHash('replies')!
    expect(() => f.certify(o, [id], [a], {}, { competitors: { replies: oldHash } })).toThrow('all competitors')
    f.certify(o, [id], [a, b], {}, { competitors: { replies: oldHash } })
    expect(f.r.audit().obligationsClosed).toBe(true)
    const c = f.witness('non-KO-exit')
    f.r.append({ type: 'competition', groupId: 'replies', criterion: 'Best response under fixed conditions', lineIds: [a.lineId, b.lineId, c.lineId] })
    expect(f.r.audit().obligationsClosed).toBe(false)
    expect(() => f.certify(o, [id], [a, b, c], {}, { competitors: { replies: oldHash } })).toThrow('bindings differ')
    f.certify(o, [id], [a, b, c], {}, { competitors: { replies: f.r.competitionHash('replies')! } })
    expect(f.r.audit().obligationsClosed).toBe(true)
  })

  it('rejects a stale head or a turn not read by the independent critic', () => {
    const f = new Fixture(), id = f.original('Specific turns only'), o = f.obligation(), old = f.witness('line')
    f.map(id, [o]); f.certify(o, [id], [old])
    const current = f.witness('line', 'changed-resources')
    expect(f.r.audit().obligationsClosed).toBe(false)
    expect(() => f.certify(o, [id], [old])).toThrow('bindings differ')
    expect(() => f.certify(o, [id], [{ ...current, turnNumbers: [3] }])).toThrow('bindings differ')
    expect(() => f.certify(o, [id], [current], {}, { witnessRefs: [{ ...current, turnNumbers: [1] }] })).toThrow('Unreviewed witness')
  })

  it('requires new certification when another original is linked to an existing obligation', () => {
    const f = new Fixture(), first = f.original('First formulation'), o = f.obligation(), ref = f.witness('proof')
    f.map(first, [o]); f.certify(o, [first], [ref])
    const second = f.original('Independently judged equivalent wording')
    f.map(second, [o])
    expect(f.r.audit().obligationsClosed).toBe(false)
    expect(() => f.certify(o, [first], [ref])).toThrow('omitted original')
    f.certify(o, [first, second], [ref])
    expect(f.r.audit().originals).toHaveLength(2)
    expect(f.r.audit().obligationsClosed).toBe(true)
  })

  it('reopens a persisted registry with the same history and refuses another project, missing authority or tampering', () => {
    const f = new Fixture(), id = f.original('Persist the exact original'), o = f.obligation()
    f.map(id, [o]); f.certify(o, [id], [f.witness('proof')]); f.checkpoint()
    const folder = mkdtempSync(join(tmpdir(), 'app230-registry-')), file = join(folder, 'registry.json')
    writeFileSync(file, f.r.serialize())
    const bytes = readFileSync(file, 'utf8'), opened = ProofRegistry.open(bytes, scope, f.context, f.trust)
    expect(opened.serialize()).toBe(bytes)
    expect(opened.audit()).toEqual(f.r.audit())
    expect(() => ProofRegistry.open(bytes, { ...scope, projectId: 'other' }, f.context, f.trust)).toThrow('Foreign')
    expect(() => ProofRegistry.open(bytes, scope, f.context, { mechanics: [], reviews: [] })).toThrow('host review')
    const damaged = JSON.parse(bytes); damaged.events[0].event.value.rawJson = '{"goal":"rewritten"}'
    expect(() => ProofRegistry.open(JSON.stringify(damaged), scope, f.context, f.trust)).toThrow('Broken registry chain')
    const deleted = JSON.parse(bytes); deleted.events.splice(1, 1)
    expect(() => ProofRegistry.open(JSON.stringify(deleted), scope, f.context, f.trust)).toThrow('Broken registry chain')
  })

  it('detects reworded repetitions after independent mapping, without pretending to normalize semantics itself', () => {
    const f = new Fixture(), first = f.original('Need the defensive line'), o = f.obligation()
    f.map(first, [o]); f.checkpoint()
    for (const text of ['Show how to defend here', 'Please demonstrate that defensive response', 'The defense still needs to be shown']) {
      const id = f.original(text); f.map(id, [o]); f.checkpoint()
    }
    expect(f.r.audit().originals).toHaveLength(4)
    expect(f.r.workQueue()).toHaveLength(1)
    expect(f.r.progress().repeatedSignature).toBe(true)
    expect(f.r.shouldStop(3)).toBe(true)
    expect(f.r.audit().obligationsClosed).toBe(false)
    const closed = ProofRegistry.open(f.r.serialize(), scope, f.context, f.trust)
    expect(closed.shouldStop(3)).toBe(true)
    expect(() => closed.shouldStop(0)).toThrow('positive stop')
  })

  it('records newly discovered obligations without counting their creation as improvement', () => {
    const f = new Fixture(), first = f.original('First need'), a = f.obligation('A')
    f.map(first, [a]); f.checkpoint()
    const second = f.original('A new critical problem'), b = f.obligation('B')
    f.map(second, [b])
    expect(f.r.progress().discoveries).toBe(1)
    f.checkpoint()
    expect(f.r.progress().noProgress).toBeGreaterThan(0)
    f.witness('unrelated', 'noise')
    expect(f.r.progress().facts).toEqual([])
    f.certify(b, [second], [f.witness('relevant-proof')])
    f.checkpoint()
    expect(f.r.progress().noProgress).toBe(0)
    expect(f.r.audit().obligationsClosed).toBe(false) // A remains open
  })

  it('does not count editorial changes to a journal as new physical evidence', () => {
    const f = new Fixture(), id = f.original('A particular line'), o = f.obligation(), ref = f.witness('proof', 'fixed-physical-facts')
    f.map(id, [o], undefined, 'evaluate', [ref.lineId]); f.checkpoint()
    f.witness('proof', 'fixed-physical-facts', 'new-constructor', 'Completely different prose')
    f.map(id, [o], undefined, 'evaluate', ['proof'])
    f.checkpoint()
    expect(f.r.progress().repeatedSignature).toBe(true)
    expect(f.r.progress().noProgress).toBeGreaterThan(0)
  })

  it('rejects unknown sources, untrusted authority and rewritten transport bodies', () => {
    const f = new Fixture(), id = f.original('Exact sources'), o = f.obligation()
    const a: Admission = { obligations: [o], decisions: [{ originalId: id, disposition: 'map', formula: { atom: o.id }, reason: 'Source-bound', sourceIds: ['rules'] }],
      work: [{ obligationId: o.id, action: 'construct', witnessIds: [], reason: 'Necessary evidence' }] }
    const raw = JSON.stringify(a), hash = f.receipt('admission', raw, [id], [])
    expect(() => f.r.append({ type: 'admission', responseJson: raw, receiptHash: 'AI-invented-authority' })).toThrow('Missing host')
    expect(() => f.r.append({ type: 'admission', responseJson: raw + ' ', receiptHash: hash })).toThrow('bindings differ')
    expect(() => f.admission(a, [], { sourceIds: ['invented-source'] })).toThrow('Unknown source')
    expect(f.r.workQueue()).toEqual([])
  })

  it('never closes an omitted original, even after every admitted atom is certified', () => {
    const f = new Fixture(), first = f.original('First mandatory original'), second = f.original('An omitted original', 'product'), o = f.obligation()
    f.map(first, [o]); f.certify(o, [first], [f.witness('proof')])
    expect(f.r.verified(o.id)).toBe(true)
    expect(f.r.audit().obligationsClosed).toBe(false)
    expect(f.r.audit().originals.find(x => x.id === second)?.status).toBe('proposed')
  })

  it('does not accept a directory entry or a self-declared valid journal as mechanical evidence', () => {
    const f = new Fixture(), id = f.original('Require actual evidence'), o = f.obligation()
    f.map(id, [o])
    const value = { lineId: 'claimed', body: '{"valid":true}', producerRequestId: 'generator', turnNumbers: [1] }
    expect(() => f.r.append({ type: 'witness', value, receiptHash: 'directory-claim' })).toThrow('Missing host mechanical')
    const ref = f.witness('different-body')
    const receipt = f.trust.mechanics.at(-1)!
    expect(() => f.r.append({ type: 'witness', value, receiptHash: digest(receipt) })).toThrow('bindings differ')
    const paidWitness = { lineId: ref.lineId, body: JSON.stringify({ id: ref.lineId, facts: ref.lineId, description: 'Original journal' }), producerRequestId: 'constructor-' + ref.lineId, turnNumbers: [1, 2] }
    expect(() => f.r.append({ type: 'witness', value: { ...paidWitness, lineId: 'renamed-line' }, receiptHash: digest(receipt) })).toThrow('bindings differ')
    expect(() => f.certify(o, [id], [ref], {}, { scopeHash: digest({ ...scope, jobId: 'other-job' }) })).toThrow('bindings differ')
    expect(f.r.audit().obligationsClosed).toBe(false)
  })

  it('cannot reuse a certificate after all hashes are recomputed around changed AI content', () => {
    const f = new Fixture(), id = f.original('Exact paid AI body'), o = f.obligation()
    f.map(id, [o]); f.certify(o, [id], [f.witness('proof')])
    const changed = JSON.parse(f.r.serialize())
    const certificate = changed.events.find((e: any) => e.event.type === 'certification')
    const response = JSON.parse(certificate.event.responseJson); response.reason = 'Unreviewed replacement'
    certificate.event.responseJson = JSON.stringify(response)
    let previous = digest({ version: 1, scope: changed.scope, context: changed.context })
    for (const e of changed.events) {
      e.previousHash = previous
      const { hash: _hash, ...body } = e
      e.hash = digest(body); previous = e.hash
    }
    expect(() => ProofRegistry.open(JSON.stringify(changed), scope, f.context, f.trust)).toThrow('bindings differ')
  })

  it('requires an actionable same-goal repair when the independent critic leaves the obligation open', () => {
    const f = new Fixture(), id = f.original('Still open'), o = f.obligation(), other = f.obligation('Another goal'), ref = f.witness('proof')
    f.map(id, [o, other], { all: [{ atom: o.id }, { atom: other.id }] })
    expect(() => f.certify(o, [id], [ref], { verdict: 'still-open', next: null })).toThrow('Invalid object')
    expect(() => f.certify(o, [id], [ref], { verdict: 'still-open', next: { obligationId: other.id, action: 'construct', witnessIds: [], reason: 'Wrong goal' } })).toThrow('routed elsewhere')
    expect(f.r.audit().obligationsClosed).toBe(false)
  })

  it('counts observations only when explicitly checkpointed, preserving stop state across repeated reads', () => {
    const f = new Fixture(), id = f.original('Pending'), o = f.obligation()
    f.map(id, [o]); f.checkpoint()
    const before = f.r.serialize(), count = f.r.progress().noProgress
    for (let i = 0; i < 20; i++) {
      expect(f.r.progress().noProgress).toBe(count)
      expect(f.r.shouldStop(1)).toBe(false)
    }
    expect(f.r.serialize()).toBe(before)
    f.checkpoint()
    expect(f.r.shouldStop(1)).toBe(true)
    // An explicit progress stop does not close the goal or remove obligations.
    expect(f.r.audit().obligationsClosed).toBe(false)
    expect(f.r.workQueue()).toHaveLength(1)
  })

  it.each(['projectId', 'jobId', 'caseId', 'dependencyHash', 'configHash'] as const)('refuses cross-scope reuse after a change to %s', key => {
    const f = new Fixture(), id = f.original('Scope-bound original'), o = f.obligation()
    f.map(id, [o]); f.certify(o, [id], [f.witness('proof')])
    expect(() => ProofRegistry.open(f.r.serialize(), { ...scope, [key]: 'different' }, f.context, f.trust)).toThrow('Foreign')
  })
})

}
