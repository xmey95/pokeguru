/** APP-230 isolated executable contract. Nothing in src imports this prototype.
 * Receipts are supplied by a HOST-owned repository, never by a model response.
 * This module verifies bindings and transitions, not Pokémon rules or semantics.
 */
import { createHash } from 'node:crypto'
import { assertGuideRequirementResolutions } from '../../src/main/guide-requirement-review'

export function digest(value: unknown): string {
  const canonical = (v: unknown): unknown => {
    if (v === null || typeof v === 'string' || typeof v === 'boolean') return v
    if (typeof v === 'number' && Number.isFinite(v)) return v
    if (Array.isArray(v)) return v.map(canonical)
    if (typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype)
      return Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, x]) => [k, canonical(x)]))
    throw new Error('Non-JSON value')
  }
  return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex')
}
function fail(message: string): never { throw new Error(message) }
const text = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0
function strings(v: unknown, nonempty = false): asserts v is string[] {
  if (!Array.isArray(v) || nonempty && !v.length || v.some(x => !text(x)) || new Set(v).size !== v.length) fail('Invalid string set')
}
function object(v: unknown, keys: string[]): asserts v is Record<string, any> {
  if (!v || typeof v !== 'object' || Array.isArray(v) || Object.keys(v).sort().join('|') !== [...keys].sort().join('|')) fail('Invalid object fields')
}
const sameSet = (a: string[], b: string[]) => digest([...a].sort()) === digest([...b].sort())
const clone = <T>(value: T): T => structuredClone(value)

export interface Scope { projectId: string; jobId: string; caseId: string; dependencyHash: string; configHash: string }
export interface Context { packetHash: string; frameHash: string; validatorVersion: string; sourceIds: string[] }
export interface Original {
  origin: 'user' | 'product' | 'seed' | 'ai'
  rawJson: string
  producerRequestId: string | null
  sourceIds: string[]
}
export interface Obligation {
  id: string
  statement: string
  conditions: string
  contextHash: string
  sourceIds: string[]
  comparisonGroupId: string | null
}
export type Formula = { atom: string } | { all: Formula[] } | { any: Formula[] }
export interface Witness { lineId: string; body: string; producerRequestId: string; turnNumbers: number[] }
export interface WitnessRef { lineId: string; bodyHash: string; turnNumbers: number[] }
export interface MechanicalReceipt {
  kind: 'mechanical'
  scopeHash: string
  contextHash: string
  validatorVersion: string
  lineId: string
  bodyHash: string
  producerRequestId: string
  turnNumbers: number[]
  factsHash: string
}
export interface ReviewReceipt {
  kind: 'admission' | 'certification'
  requestId: string
  contractVersion: 'admission-prototype-1'
  scopeHash: string
  contextHash: string
  responseHash: string
  originalIds: string[]
  obligationIds: string[]
  witnessRefs: WitnessRef[]
  sourceIds: string[]
  competitors: Record<string, string>
  bindingHash: string | null
}
/** This catalog must come from verified host archives. Supplying AI-authored
 * receipts here would destroy the trust boundary; integration B must enforce it. */
export interface TrustCatalog { mechanics: MechanicalReceipt[]; reviews: ReviewReceipt[] }
export interface Decision {
  originalId: string
  disposition: 'map' | 'superseded' | 'clarify'
  formula: Formula | null
  reason: string
  sourceIds: string[]
}
export interface Work {
  obligationId: string
  action: 'construct' | 'evaluate' | 'retrieve' | 'clarify'
  witnessIds: string[]
  reason: string
}
export interface Admission { obligations: Obligation[]; decisions: Decision[]; work: Work[] }
export interface Certification {
  obligationId: string
  verdict: 'verified' | 'still-open'
  reason: string
  sourceIds: string[]
  witnesses: WitnessRef[]
  next: Work | null
}
type Event =
  | { type: 'original'; value: Original }
  | { type: 'context'; value: Context }
  | { type: 'witness'; value: Witness; receiptHash: string }
  | { type: 'competition'; groupId: string; criterion: string; lineIds: string[] }
  | { type: 'admission'; responseJson: string; receiptHash: string }
  | { type: 'certification'; responseJson: string; receiptHash: string }
  | { type: 'assignment'; obligationId: string; producerRequestId: string; planJson: string }
  | { type: 'checkpoint' }
interface Envelope { index: number; previousHash: string; event: Event; hash: string }
interface Mapping { decision: Decision; receipt: ReviewReceipt }
interface Certified { value: Certification; receipt: ReviewReceipt }
export interface Progress {
  signature: string
  verified: string[]
  facts: string[]
  open: string[]
  unresolvedOriginals: number
  discoveries: number
  noProgress: number
  repeatedSignature: boolean
}
export type OriginalStatus = 'proposed' | 'clarify' | 'open' | 'verified' | 'superseded' | 'invalidated'

export class ProofRegistry {
  private readonly scope: Scope
  private readonly initialContext: Context
  private context: Context
  private readonly trust: TrustCatalog
  private readonly events: Envelope[] = []
  private readonly originals = new Map<string, Original>()
  private readonly obligations = new Map<string, Obligation>()
  private readonly witnesses = new Map<string, { value: Witness; receipt: MechanicalReceipt }>()
  private readonly competitions = new Map<string, { criterion: string; lineIds: string[] }>()
  private readonly mappings = new Map<string, Mapping>()
  private readonly work = new Map<string, Work>()
  private readonly certificates = new Map<string, Certified>()
  private readonly assignments = new Map<string, string[]>()
  private readonly checkpoints: Progress[] = []

  constructor(scope: Scope, context: Context, trust: TrustCatalog) {
    object(scope, ['projectId', 'jobId', 'caseId', 'dependencyHash', 'configHash'])
    if (Object.values(scope).some(x => !text(x))) fail('Invalid scope')
    this.checkContext(context)
    this.scope = clone(scope); this.initialContext = clone(context); this.context = clone(context); this.trust = clone(trust)
  }
  get scopeHash() { return digest(this.scope) }
  get contextHash() { return digest(this.context) }
  originalId(value: Original) { return digest({ scopeHash: this.scopeHash, value }) }
  obligation(value: Omit<Obligation, 'id' | 'contextHash'>): Obligation {
    const body = { ...clone(value), contextHash: this.contextHash }
    return { id: digest({ scopeHash: this.scopeHash, body }), ...body }
  }
  private checkContext(value: unknown): asserts value is Context {
    object(value, ['packetHash', 'frameHash', 'validatorVersion', 'sourceIds'])
    if (![value.packetHash, value.frameHash, value.validatorVersion].every(text)) fail('Invalid context')
    strings(value.sourceIds, true)
  }
  private sources(value: unknown) {
    strings(value, true)
    if (value.some(id => !this.context.sourceIds.includes(id))) fail('Unknown source')
  }
  private turns(value: unknown): asserts value is number[] {
    if (!Array.isArray(value) || !value.length || new Set(value).size !== value.length || value.some(n => !Number.isInteger(n) || n < 0)) fail('Invalid turns')
  }
  private refs(value: unknown): asserts value is WitnessRef[] {
    if (!Array.isArray(value)) fail('Invalid witness list')
    for (const ref of value) {
      object(ref, ['lineId', 'bodyHash', 'turnNumbers']); this.turns(ref.turnNumbers)
      if (!text(ref.lineId) || !text(ref.bodyHash)) fail('Invalid witness reference')
    }
    if (new Set(value.map(r => r.lineId)).size !== value.length) fail('Duplicate witness')
  }
  private currentWitness(ref: WitnessRef): boolean {
    const w = this.witnesses.get(ref.lineId)
    return !!w && w.receipt.contextHash === this.contextHash && w.receipt.validatorVersion === this.context.validatorVersion &&
      digest(w.value.body) === ref.bodyHash && ref.turnNumbers.every(n => w.value.turnNumbers.includes(n))
  }
  private validReceiptDependencies(r: ReviewReceipt): boolean {
    return r.contextHash === this.contextHash && r.witnessRefs.every(w => this.currentWitness(w)) &&
      Object.entries(r.competitors).every(([id, hash]) => this.competitionHash(id) === hash)
  }
  private review(hash: string, kind: ReviewReceipt['kind'], responseJson: string): ReviewReceipt {
    const matches = this.trust.reviews.filter(r => digest(r) === hash)
    if (matches.length !== 1) fail('Missing host review receipt')
    const r = matches[0]
    if (r.kind !== kind || r.contractVersion !== 'admission-prototype-1' || !text(r.requestId) || r.scopeHash !== this.scopeHash ||
      r.responseHash !== digest(responseJson) || !this.validReceiptDependencies(r)) fail('Review bindings differ')
    strings(r.originalIds); strings(r.obligationIds); this.sources(r.sourceIds); this.refs(r.witnessRefs)
    for (const id of r.originalIds) {
      const original = this.originals.get(id)
      if (!original || original.producerRequestId === r.requestId) fail('Review is foreign or not independent of original')
      if (original.sourceIds.some(s => !r.sourceIds.includes(s))) fail('Review omitted original sources')
    }
    for (const id of r.obligationIds) if (!this.obligations.has(id)) fail('Review of unknown obligation')
    for (const ref of r.witnessRefs) if (this.witnesses.get(ref.lineId)!.value.producerRequestId === r.requestId) fail('Witness self-certification')
    for (const [groupId] of Object.entries(r.competitors)) {
      const group = this.competitions.get(groupId)!
      for (const id of group.lineIds) {
        const ref = r.witnessRefs.find(w => w.lineId === id), actual = this.witnesses.get(id)!
        if (!ref || !sameSet(ref.turnNumbers.map(String), actual.value.turnNumbers.map(String))) fail('Comparison did not read all competitors')
      }
    }
    return clone(r)
  }
  private formula(value: unknown, depth = 0): string[] {
    if (depth > 16) fail('Formula too deep')
    if (!value || typeof value !== 'object') fail('Invalid formula')
    const key = Object.keys(value)[0]
    if (key === 'atom') {
      object(value, ['atom'])
      if (!text(value.atom) || !this.obligations.has(value.atom)) fail('Unknown formula obligation')
      return [value.atom]
    }
    if (key !== 'all' && key !== 'any') fail('Invalid connective')
    object(value, [key])
    const children = value[key]
    if (!Array.isArray(children) || children.length < 2 || children.length > 64 || new Set(children.map(digest)).size !== children.length) fail('Invalid composite formula')
    return children.flatMap(x => this.formula(x, depth + 1))
  }
  private satisfied(value: Formula): boolean {
    if ('atom' in value) return this.verified(value.atom)
    if ('all' in value) return value.all.every(x => this.satisfied(x))
    return value.any.some(x => this.satisfied(x))
  }
  bindingHash(id: string): string {
    return digest([...this.mappings.entries()].filter(([, m]) => m.decision.formula && this.formula(m.decision.formula).includes(id))
      .map(([originalId, m]) => ({ originalId, decision: m.decision, admissionHash: digest(m.receipt) })).sort((a, b) => a.originalId.localeCompare(b.originalId)))
  }
  competitionHash(groupId: string): string | null {
    const group = this.competitions.get(groupId)
    if (!group) return null
    const refs: WitnessRef[] = group.lineIds.map(lineId => {
      const w = this.witnesses.get(lineId)
      return { lineId, bodyHash: w ? digest(w.value.body) : '', turnNumbers: w?.value.turnNumbers ?? [] }
    })
    if (!refs.every(ref => this.currentWitness(ref))) return null
    return digest({ criterion: group.criterion, refs: refs.sort((a, b) => a.lineId.localeCompare(b.lineId)) })
  }
  private mappedIds(): string[] {
    return [...new Set([...this.mappings.values()].filter(m => m.decision.disposition === 'map' && this.validReceiptDependencies(m.receipt))
      .flatMap(m => this.formula(m.decision.formula!)))].sort()
  }
  verified(id: string): boolean {
    const c = this.certificates.get(id), o = this.obligations.get(id)
    if (!c || !o || c.value.verdict !== 'verified' || o.contextHash !== this.contextHash || !this.validReceiptDependencies(c.receipt) ||
      c.receipt.bindingHash !== this.bindingHash(id) || !c.value.witnesses.every(w => this.currentWitness(w))) return false
    return !o.comparisonGroupId || c.receipt.competitors[o.comparisonGroupId] === this.competitionHash(o.comparisonGroupId)
  }
  audit(): { obligationsClosed: boolean; originals: { id: string; status: OriginalStatus }[] } {
    const originals = [...this.originals.keys()].map(id => {
      const m = this.mappings.get(id)
      const status: OriginalStatus = !m ? 'proposed' : !this.validReceiptDependencies(m.receipt) ? 'invalidated' :
        m.decision.disposition === 'superseded' ? 'superseded' : m.decision.disposition === 'clarify' ? 'clarify' :
        this.satisfied(m.decision.formula!) ? 'verified' : 'open'
      return { id, status }
    })
    return { obligationsClosed: !!originals.length && originals.every(r => r.status === 'verified' || r.status === 'superseded'), originals }
  }
  workQueue() {
    const needed = new Set([...this.mappings.values()].filter(m => m.decision.disposition === 'map' && this.validReceiptDependencies(m.receipt) && !this.satisfied(m.decision.formula!))
      .flatMap(m => this.formula(m.decision.formula!)))
    return this.mappedIds().filter(id => needed.has(id) && !this.verified(id)).map(id => {
      const w = this.work.get(id)
      return { obligationId: id, action: w?.action ?? 'clarify', witnessIds: clone(w?.witnessIds ?? []), assigned: this.assignments.has(id) }
    })
  }
  private checkWork(value: unknown): asserts value is Work {
    object(value, ['obligationId', 'action', 'witnessIds', 'reason'])
    if (!this.obligations.has(value.obligationId) || !['construct', 'evaluate', 'retrieve', 'clarify'].includes(value.action) || !text(value.reason)) fail('Invalid work decision')
    strings(value.witnessIds)
    if (value.action === 'evaluate' && (!value.witnessIds.length || value.witnessIds.some((id: string) => {
      const w = this.witnesses.get(id)
      return !w || !this.currentWitness({ lineId: id, bodyHash: digest(w.value.body), turnNumbers: w.value.turnNumbers })
    }))) fail('Evaluation requires complete current witnesses')
  }
  private applyAdmission(responseJson: string, receipt: ReviewReceipt) {
    const a: unknown = JSON.parse(responseJson)
    object(a, ['obligations', 'decisions', 'work'])
    if (![a.obligations, a.decisions, a.work].every(Array.isArray)) fail('Invalid admission arrays')
    if (new Set(a.obligations.map((o: Obligation) => o.id)).size !== a.obligations.length) fail('Duplicate obligation')
    for (const o of a.obligations) {
      object(o, ['id', 'statement', 'conditions', 'contextHash', 'sourceIds', 'comparisonGroupId'])
      this.sources(o.sourceIds)
      if (!text(o.statement) || !text(o.conditions) || o.contextHash !== this.contextHash || o.comparisonGroupId !== null && !text(o.comparisonGroupId)) fail('Invalid obligation')
      const { id, ...body } = o
      if (id !== digest({ scopeHash: this.scopeHash, body })) fail('Obligation identity differs')
      const previous = this.obligations.get(id)
      if (previous && digest(previous) !== digest(o)) fail('Obligation was rewritten')
      this.obligations.set(id, clone(o as Obligation))
    }
    const ids = a.decisions.map((d: Decision) => d.originalId)
    if (!ids.length || new Set(ids).size !== ids.length || !sameSet(ids, receipt.originalIds)) fail('Admission omitted or duplicated originals')
    const leaves = new Set<string>()
    for (const d of a.decisions) {
      object(d, ['originalId', 'disposition', 'formula', 'reason', 'sourceIds']); this.sources(d.sourceIds)
      const original = this.originals.get(d.originalId)
      if (!original || !text(d.reason) || d.sourceIds.some((id: string) => !receipt.sourceIds.includes(id))) fail('Invalid admission rationale')
      if (d.disposition === 'map') {
        for (const id of this.formula(d.formula)) {
          const o = this.obligations.get(id)!
          if (o.contextHash !== this.contextHash || o.sourceIds.some(s => !receipt.sourceIds.includes(s)) ||
            !a.obligations.some((x: Obligation) => x.id === id) && !receipt.obligationIds.includes(id)) fail('Mapping to unread or stale obligation')
          leaves.add(id)
        }
      } else if (d.disposition === 'superseded' || d.disposition === 'clarify') {
        if (d.formula !== null || d.disposition === 'superseded' && original.origin !== 'ai') fail('Cannot withdraw invariant or seed')
      } else fail('Invalid admission disposition')
      this.mappings.set(d.originalId, { decision: clone(d as Decision), receipt })
    }
    if (a.obligations.some((o: Obligation) => !leaves.has(o.id))) fail('Orphan obligation')
    const workIds = a.work.map((w: Work) => w.obligationId)
    if (new Set(workIds).size !== workIds.length || !sameSet([...leaves], workIds)) fail('Incomplete work routing')
    for (const w of a.work) {
      this.checkWork(w)
      if (w.action === 'evaluate' && w.witnessIds.some((id: string) => !receipt.witnessRefs.some(r => r.lineId === id))) fail('Admission did not read proposed witness')
      this.work.set(w.obligationId, clone(w))
    }
  }
  private applyCertification(responseJson: string, receipt: ReviewReceipt) {
    const c: unknown = JSON.parse(responseJson)
    object(c, ['obligationId', 'verdict', 'reason', 'sourceIds', 'witnesses', 'next'])
    const o = this.obligations.get(c.obligationId)
    if (!o || o.contextHash !== this.contextHash || !this.mappedIds().includes(o.id) || !sameSet(receipt.obligationIds, [o.id]) ||
      receipt.bindingHash !== this.bindingHash(o.id)) fail('Certificate is foreign or stale')
    if (this.assignments.get(o.id)?.includes(receipt.requestId)) fail('Planner cannot certify its assignment')
    const origins = [...this.mappings.entries()].filter(([, m]) => m.decision.formula && this.formula(m.decision.formula).includes(o.id)).map(([id]) => id)
    if (!sameSet(origins, receipt.originalIds)) fail('Certificate omitted original goals')
    this.sources(c.sourceIds); this.refs(c.witnesses)
    if (!text(c.reason) || c.sourceIds.some((id: string) => !receipt.sourceIds.includes(id)) || o.sourceIds.some(id => !c.sourceIds.includes(id))) fail('Missing certificate rationale or sources')
    for (const ref of c.witnesses) {
      const read = receipt.witnessRefs.find(w => w.lineId === ref.lineId)
      if (!read || read.bodyHash !== ref.bodyHash || !ref.turnNumbers.every(n => read.turnNumbers.includes(n)) || !this.currentWitness(ref)) fail('Unreviewed witness')
    }
    if (o.comparisonGroupId && (!this.competitionHash(o.comparisonGroupId) || receipt.competitors[o.comparisonGroupId] !== this.competitionHash(o.comparisonGroupId))) fail('Comparison set is missing or stale')
    if (c.verdict === 'verified') {
      if (!c.witnesses.length || c.next !== null) fail('Verified claim without proof or with open work')
      // Reuse the current structural resolution control at the atomic goal
      // level. Mapping this atom to a compound original is a separate review.
      assertGuideRequirementResolutions([{ caseId: this.scope.caseId, requirementId: o.id, disposition: 'resolved', reason: c.reason,
        sourceIds: c.sourceIds, witnesses: c.witnesses.map(w => ({ lineId: w.lineId, reviewedHash: w.bodyHash, turnNumbers: w.turnNumbers })), currentFindingIndex: null }], [{
        ledger: { caseId: this.scope.caseId, requirements: [{ id: o.id, goal: o.statement, reason: o.conditions, sourceIds: o.sourceIds }] },
        assignments: [], unassignedRequirementIds: [o.id], witnesses: c.witnesses.map(w => ({ lineId: w.lineId,
          reviewedHash: digest(this.witnesses.get(w.lineId)!.value.body), turnNumbers: this.witnesses.get(w.lineId)!.value.turnNumbers }))
      }], [])
    } else if (c.verdict === 'still-open') {
      this.checkWork(c.next)
      if (c.next.obligationId !== o.id) fail('Open finding routed elsewhere')
      this.work.set(o.id, clone(c.next))
    } else fail('Invalid certificate verdict')
    this.certificates.set(o.id, { value: clone(c as Certification), receipt })
  }
  private apply(event: Event) {
    switch (event.type) {
      case 'original': {
        object(event, ['type', 'value']); object(event.value, ['origin', 'rawJson', 'producerRequestId', 'sourceIds'])
        const o = event.value
        if (!['user', 'product', 'seed', 'ai'].includes(o.origin) || !text(o.rawJson) || !['user', 'product'].includes(o.origin) && !text(o.producerRequestId) || o.producerRequestId !== null && !text(o.producerRequestId)) fail('Invalid original provenance')
        JSON.parse(o.rawJson); this.sources(o.sourceIds)
        const id = this.originalId(o)
        if (this.originals.has(id)) fail('Duplicate original occurrence')
        this.originals.set(id, clone(o)); break
      }
      case 'context':
        object(event, ['type', 'value']); this.checkContext(event.value); this.context = clone(event.value); break
      case 'witness': {
        object(event, ['type', 'value', 'receiptHash']); object(event.value, ['lineId', 'body', 'producerRequestId', 'turnNumbers'])
        const w = event.value
        if (![w.lineId, w.body, w.producerRequestId].every(text)) fail('Incomplete witness body')
        this.turns(w.turnNumbers)
        const matches = this.trust.mechanics.filter(r => digest(r) === event.receiptHash)
        if (matches.length !== 1) fail('Missing host mechanical receipt')
        const r = matches[0]
        if (r.kind !== 'mechanical' || r.scopeHash !== this.scopeHash || r.contextHash !== this.contextHash || r.validatorVersion !== this.context.validatorVersion ||
          r.lineId !== w.lineId || r.bodyHash !== digest(w.body) || r.producerRequestId !== w.producerRequestId || !text(r.factsHash) || !sameSet(r.turnNumbers.map(String), w.turnNumbers.map(String))) fail('Mechanical receipt bindings differ')
        this.witnesses.set(w.lineId, { value: clone(w), receipt: clone(r) }); break
      }
      case 'competition':
        object(event, ['type', 'groupId', 'criterion', 'lineIds']); strings(event.lineIds, true)
        if (!text(event.groupId) || !text(event.criterion) || event.lineIds.some(id => !this.witnesses.has(id))) fail('Invalid competitor set')
        this.competitions.set(event.groupId, { criterion: event.criterion, lineIds: [...event.lineIds] }); break
      case 'admission':
        object(event, ['type', 'responseJson', 'receiptHash']); this.applyAdmission(event.responseJson, this.review(event.receiptHash, 'admission', event.responseJson)); break
      case 'certification':
        object(event, ['type', 'responseJson', 'receiptHash']); this.applyCertification(event.responseJson, this.review(event.receiptHash, 'certification', event.responseJson)); break
      case 'assignment': {
        object(event, ['type', 'obligationId', 'producerRequestId', 'planJson'])
        if (!text(event.producerRequestId) || !text(event.planJson) || !this.workQueue().some(w => w.obligationId === event.obligationId && w.action === 'construct')) fail('Assignment requires admitted open construction')
        JSON.parse(event.planJson)
        this.assignments.set(event.obligationId, [...this.assignments.get(event.obligationId) ?? [], event.producerRequestId]); break
      }
      case 'checkpoint': object(event, ['type']); this.checkpoints.push(this.measureProgress()); break
      default: fail('Unknown event')
    }
  }
  /** Validate in a shadow projection so an invalid critic cannot partially add
   * obligations, mappings or routing before its final field is rejected. */
  append(event: Event): void {
    const shadow = ProofRegistry.open(this.serialize(), this.scope, this.context, this.trust)
    shadow.apply(clone(event))
    this.apply(clone(event))
    const previousHash = this.events.at(-1)?.hash ?? digest({ version: 1, scope: this.scope, context: this.initialContext })
    const entry = { index: this.events.length, previousHash, event: clone(event) }
    this.events.push({ ...entry, hash: digest(entry) })
  }
  private measureProgress(): Progress {
    const ids = this.mappedIds(), verified = ids.filter(id => this.verified(id)), open = ids.filter(id => !this.verified(id))
    const facts = [...new Set(ids.flatMap(id => {
      const refs = this.certificates.get(id)?.value.witnesses ?? []
      const work = this.work.get(id)
      const witnesses = [...refs, ...(work?.action === 'evaluate' ? work.witnessIds.map(lineId => {
        const w = this.witnesses.get(lineId)
        return { lineId, bodyHash: w ? digest(w.value.body) : '', turnNumbers: w?.value.turnNumbers ?? [] }
      }) : [])]
      return witnesses.filter(w => this.currentWitness(w)).map(w => id + '/' + this.witnesses.get(w.lineId)!.receipt.factsHash)
    }))].sort()
    const signature = digest({ contextHash: this.contextHash, open, verified, facts })
    const previous = this.checkpoints, seenVerified = new Set(previous.flatMap(p => p.verified)), seenFacts = new Set(previous.flatMap(p => p.facts)), seenGoals = new Set(previous.flatMap(p => [...p.open, ...p.verified]))
    const repeatedSignature = previous.some(p => p.signature === signature)
    const improvement = !repeatedSignature && (verified.some(id => !seenVerified.has(id)) || facts.some(f => !seenFacts.has(f)))
    return { signature, verified, facts, open, unresolvedOriginals: this.audit().originals.filter(r => !['verified', 'superseded'].includes(r.status)).length,
      discoveries: ids.filter(id => !seenGoals.has(id)).length, noProgress: improvement ? 0 : (previous.at(-1)?.noProgress ?? -1) + 1, repeatedSignature }
  }
  /** Reading state does not consume another observation or advance stop policy. */
  progress(): Progress {
    return { ...this.measureProgress(), noProgress: this.checkpoints.at(-1)?.noProgress ?? 0 }
  }
  shouldStop(maxNoProgress: number): boolean {
    if (!Number.isInteger(maxNoProgress) || maxNoProgress < 1) fail('Explicit positive stop threshold required')
    return !this.audit().obligationsClosed && (this.checkpoints.at(-1)?.noProgress ?? 0) >= maxNoProgress
  }
  serialize(): string {
    return JSON.stringify({ version: 1, scope: this.scope, context: this.initialContext, events: this.events })
  }
  static open(raw: string, expectedScope: Scope, expectedCurrentContext: Context, trust: TrustCatalog): ProofRegistry {
    const value: unknown = JSON.parse(raw)
    object(value, ['version', 'scope', 'context', 'events'])
    if (value.version !== 1 || digest(value.scope) !== digest(expectedScope) || !Array.isArray(value.events)) fail('Foreign or invalid registry')
    const result = new ProofRegistry(expectedScope, value.context as Context, trust)
    for (const entry of value.events) {
      object(entry, ['index', 'previousHash', 'event', 'hash'])
      const { hash, ...body } = entry
      const previous = result.events.at(-1)?.hash ?? digest({ version: 1, scope: result.scope, context: result.initialContext })
      if (entry.index !== result.events.length || entry.previousHash !== previous || hash !== digest(body)) fail('Broken registry chain')
      result.apply(clone(entry.event as Event)); result.events.push(clone(entry as Envelope))
    }
    if (result.contextHash !== digest(expectedCurrentContext)) fail('Registry context is not host current context')
    return result
  }
}
