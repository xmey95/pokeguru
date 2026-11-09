/** Executable OFFLINE specification, deliberately not wired into the app.
 * It proves scheduling/termination properties, never Pokémon or AI quality.
 * Every 'accepted' below must be supplied by the unchanged production readers
 * in a future integration. A model's verdict alone is NOT that certificate. */
import {createHash} from 'node:crypto'

export const DELIVERY_SPEC = 'bounded-delivery-spec-1'
export const DELIVERY_DIMENSIONS=Object.freeze({cases:2,setupTurns:5,eventsPerTurn:6,movesPerEvent:12,energyRoutesPerEvent:8,auditTargetsPerTurn:17,auditSpansPerTarget:8,auditTextCharacters:600,chapterCharacters:3000,exerciseQuestionCharacters:1200,exerciseSolutionCharacters:2400})
/** Capacity admission ONLY. Passing this function never validates a move,
 * source or claim; the complete existing readers remain mandatory. */
export function deliveryCapacityCheck(value:{events:{moves:unknown[];energyRoutes:unknown[]}[];auditTargets:{text:string;spans:unknown[]}[]}){
 const failures:string[]=[]
 if(value.events.length>DELIVERY_DIMENSIONS.eventsPerTurn)failures.push('events')
 for(const [i,e]of value.events.entries()){if(e.moves.length>DELIVERY_DIMENSIONS.movesPerEvent)failures.push('events/'+i+'/moves');if(e.energyRoutes.length>DELIVERY_DIMENSIONS.energyRoutesPerEvent)failures.push('events/'+i+'/energyRoutes')}
 if(value.auditTargets.length>DELIVERY_DIMENSIONS.auditTargetsPerTurn)failures.push('auditTargets')
 for(const [i,t]of value.auditTargets.entries()){if(t.text.length>DELIVERY_DIMENSIONS.auditTextCharacters)failures.push('auditTargets/'+i+'/text');if(t.spans.length>DELIVERY_DIMENSIONS.auditSpansPerTarget)failures.push('auditTargets/'+i+'/spans')}
 return {admitted:!failures.length,failures}
}
export const hashDelivery = (v:unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex')
export interface DeliveryBinding {
  projectId:string; lineageId:string; ourListHash:string; opponentListHash:string;
  evidenceHash:string; configHash:string
}
export interface DeliveryShape {replies:2|3|4|[2|3|4,2|3|4];setupTurns:number|[number,number];auditGroups:1|2|3|4|[1|2|3|4,1|2|3|4]}
export interface DeliveryUnit {id:string; role:'constructor'|'critic'|'host'; dependencies:string[]}
export interface DeliveryManifest {
  contract:typeof DELIVERY_SPEC; binding:DeliveryBinding; shape:DeliveryShape;
  units:DeliveryUnit[]; repairCredits:number; maximumCalls:number
}
export function deliveryManifest(binding:DeliveryBinding,shape:DeliveryShape):DeliveryManifest {
  if(Object.keys(binding).sort().join()!==['projectId','lineageId','ourListHash','opponentListHash','evidenceHash','configHash'].sort().join()||Object.values(binding).some(v=>typeof v!=='string'||!v.trim()))throw Error('Binding incompleto.')
  const pair=(v:number|number[])=>Array.isArray(v)?v:[v,v],valid=(v:number|number[],read:(n:number)=>boolean)=>pair(v).length===2&&pair(v).every(read)
  if(Object.keys(shape).sort().join()!==['replies','setupTurns','auditGroups'].sort().join()||!valid(shape.replies,n=>[2,3,4].includes(n))||!valid(shape.setupTurns,n=>Number.isInteger(n)&&n>=0&&n<=5)||!valid(shape.auditGroups,n=>[1,2,3,4].includes(n)))throw Error('Forma fuori contratto.')
  const units:DeliveryUnit[]=[],add=(id:string,role:DeliveryUnit['role'],dependencies:string[])=>{units.push({id,role,dependencies});return id}
  const outline=add('outline','constructor',[]),outlineReview=add('outline-review','critic',[outline]),caseReviews:string[]=[]
  for(let c=1;c<=2;c++){
    const replies=pair(shape.replies)[c-1],setupTurns=pair(shape.setupTurns)[c-1],auditGroups=pair(shape.auditGroups)[c-1]
    const prefix='case-'+c,header=add(prefix+'/setup-header','constructor',[outlineReview])
    const turn=(id:string,deps:string[])=>{const native=add(id,'constructor',deps),declaration=add(id+'/audit-declaration','constructor',[native]);return Array.from({length:auditGroups},(_,i)=>add(id+'/audit-'+i,'critic',[declaration]))}
    let ready=[header]
    for(let t=0;t<setupTurns;t++)ready=turn(prefix+'/setup-'+t,ready)
    ready=turn(prefix+'/first',ready)
    const premise=add(prefix+'/premise','critic',ready),plan=add(prefix+'/reply-plan','constructor',[premise]),planReview=add(prefix+'/reply-plan-review','critic',[plan]),tails:string[]=[]
    for(let r=0;r<replies;r++){const reply=turn(prefix+'/reply-'+r,[planReview]),follow=turn(prefix+'/follow-'+r,reply);tails.push(...follow)}
    const metadata=add(prefix+'/metadata','constructor',tails),summary=add(prefix+'/comparison','constructor',[metadata]),review=add(prefix+'/cases-review','critic',[summary]);caseReviews.push(review)
  }
  const prose=Array.from({length:10},(_,i)=>add(i<8?'chapter-'+i:'exercise-'+(i-8),'constructor',caseReviews))
  const finals=Array.from({length:2},(_,i)=>add('final-review-'+(i+1),'critic',prose))
  const validate=add('host/validate','host',finals),save=add('host/save','host',[validate]);add('host/reopen','host',[save])
  const repairCredits=16
  return {contract:DELIVERY_SPEC,binding:structuredClone(binding),shape:{...shape},units,repairCredits,maximumCalls:units.filter(u=>u.role!=='host').length+repairCredits}
}
export type DeliveryOutcome = {kind:'accepted'}|{kind:'invalid-format'}|{kind:'revise';target:string}|{kind:'fatal'|'oversize'|'timeout'|'unsupported'}
type Start={type:'start';unitId:string;inputHash:string}
type End={type:'end';unitId:string;inputHash:string;outcome:DeliveryOutcome}
export interface DeliveryEvent {sequence:number;manifestHash:string;previousHash:string|null;event:Start|End}
export interface DeliveryAnchor {count:number;tailHash:string|null}
export type DeliveryStatus='running'|'complete'|'budget'|'format-limit'|'content-limit'|'fatal'|'oversize'|'timeout'|'unsupported'|'quarantined'

/** A provider dispatch has a durable start BEFORE it can execute. Reopening an
 * unsettled start quarantines it; it is counted and never silently repeated.
 * Repairs invalidate only descendants, and consume the SAME global credits.
 * Changing a request/input hash never replenishes a logical unit's allowances. */
export class DeliveryMachine {
  readonly manifest:DeliveryManifest
  readonly manifestHash:string
  private readonly log:DeliveryEvent[]=[]
  private readonly accepted=new Set<string>()
  private readonly starts=new Map<string,number>()
  private readonly formats=new Map<string,number>()
  private readonly negatives=new Map<string,number>()
  private pending:Start|null=null
  private state:DeliveryStatus='running'
  constructor(manifest:DeliveryManifest,availableCalls:number,history:DeliveryEvent[]=[],anchor:DeliveryAnchor={count:0,tailHash:null}){
    if(!Number.isSafeInteger(availableCalls)||availableCalls<0)throw Error('Budget esterno non valido.')
    if(hashDelivery(manifest)!==hashDelivery(deliveryManifest(manifest.binding,manifest.shape)))throw Error('Manifest modificato.')
    const freeze=(v:any):any=>{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v)}return v}
    this.manifest=freeze(structuredClone(manifest));this.manifestHash=hashDelivery(this.manifest)
    if(anchor.count!==history.length||anchor.tailHash!==(history.length?hashDelivery(history.at(-1)):null))throw Error('Registro incompleto o ancora diversa.')
    if(availableCalls<this.manifest.maximumCalls){if(history.length)throw Error('Budget di ripresa incoerente.');this.state='budget';return}
    for(const row of history){if(row.sequence!==this.log.length+1||row.manifestHash!==this.manifestHash||row.previousHash!==this.anchor.tailHash)throw Error('Registro alterato o estraneo.');this.apply(row.event);this.log.push(structuredClone(row))}
    if(this.pending)this.state='quarantined'
  }
  get status():DeliveryStatus{return this.state}
  get calls(){return this.manifest.units.filter(u=>u.role!=='host').reduce((n,u)=>n+(this.starts.get(u.id)??0),0)}
  get extraCalls(){return this.manifest.units.filter(u=>u.role!=='host').reduce((n,u)=>n+Math.max(0,(this.starts.get(u.id)??0)-1),0)}
  get anchor():DeliveryAnchor{return {count:this.log.length,tailHash:this.log.length?hashDelivery(this.log.at(-1)):null}}
  get history(){return structuredClone(this.log)}
  get acceptedIds(){return [...this.accepted]}
  /** Strict ranking function: every start decreases fuel; all non-provider
   * transitions are at most one settlement per start plus one terminal check. */
  get fuel(){return this.manifest.maximumCalls+3-[...this.starts.values()].reduce((n,v)=>n+v,0)}
  next():DeliveryUnit|null {
    if(this.state!=='running'||this.pending)return null
    const unit=this.manifest.units.find(u=>!this.accepted.has(u.id)&&u.dependencies.every(d=>this.accepted.has(d)))
    if(!unit){if(this.accepted.size===this.manifest.units.length)this.state='complete';else throw Error('Grafo bloccato.');return null}
    const required=this.manifest.units.filter(u=>u.role!=='host'&&!this.accepted.has(u.id)).length
    if(this.calls+required>this.manifest.maximumCalls||unit.role!=='host'&&this.starts.has(unit.id)&&this.extraCalls>=this.manifest.repairCredits){this.state='budget';return null}
    return structuredClone(unit)
  }
  start(unitId:string,inputHash:string):DeliveryEvent {
    const next=this.next();if(!next||next.id!==unitId||typeof inputHash!=='string'||!inputHash.trim())throw Error('Dispatch non ammissibile.')
    return this.record({type:'start',unitId,inputHash})
  }
  settle(unitId:string,inputHash:string,outcome:DeliveryOutcome):DeliveryEvent {
    return this.record({type:'end',unitId,inputHash,outcome})
  }
  private record(event:Start|End){const row:DeliveryEvent={sequence:this.log.length+1,manifestHash:this.manifestHash,previousHash:this.anchor.tailHash,event:structuredClone(event)};this.apply(event);this.log.push(row);return structuredClone(row)}
  private descendants(root:string){const set=new Set([root]);for(const u of this.manifest.units)if(u.dependencies.some(d=>set.has(d)))set.add(u.id);return set}
  private apply(event:Start|End){
    if(this.state!=='running')throw Error('Stato terminale: nessun riavvio.')
    const unit=this.manifest.units.find(u=>u.id===event.unitId);if(!unit)throw Error('Unità estranea.')
    if(event.type==='start'){
      const next=this.next();if(this.pending||next?.id!==unit.id||!event.inputHash)throw Error('Avvio senza dipendenze o budget.')
      this.starts.set(unit.id,(this.starts.get(unit.id)??0)+1);this.pending=structuredClone(event);return
    }
    if(!this.pending||this.pending.unitId!==unit.id||this.pending.inputHash!==event.inputHash)throw Error('Esito senza invocazione corrispondente.')
    const outcome=event.outcome
    if(outcome.kind==='revise'){
      const target=this.manifest.units.find(u=>u.id===outcome.target)
      if(unit.role!=='critic'||!target||target.role!=='constructor'||!this.accepted.has(target.id)||!this.descendants(target.id).has(unit.id))throw Error('Riparazione senza fonte costruttiva antenata.')
    }else if(!['accepted','invalid-format','fatal','oversize','timeout','unsupported'].includes(outcome.kind))throw Error('Esito sconosciuto.')
    this.pending=null
    if(outcome.kind==='accepted'){this.accepted.add(unit.id);return}
    if(outcome.kind==='invalid-format'){const n=(this.formats.get(unit.id)??0)+1;this.formats.set(unit.id,n);if(unit.role==='host')this.state='fatal';else if(n>=2)this.state='format-limit';return}
    if(outcome.kind==='revise'){
      const n=(this.negatives.get(unit.id)??0)+1;this.negatives.set(unit.id,n)
      if(n>=2){this.state='content-limit';return}
      for(const id of this.descendants(outcome.target))this.accepted.delete(id)
      return
    }
    this.state=outcome.kind
  }
}

/** No provider/process adapter: tests supply a synthetic operation. An actual
 * integration MUST kill/confirm the provider child on timeout. An unsettled
 * persisted invocation remains quarantined instead of starting another one. */
export async function driveDelivery(machine:DeliveryMachine,options:{
  persist:(event:DeliveryEvent,anchor:DeliveryAnchor)=>void;
  read:(unit:DeliveryUnit,inputHash:string,signal:AbortSignal)=>Promise<DeliveryOutcome>;
  deadlineMs:number;
}){
  if(!Number.isFinite(options.deadlineMs)||options.deadlineMs<=0)throw Error('Deadline non valida.')
  for(let step=0;step<machine.manifest.maximumCalls+3;step++){
    const unit=machine.next();if(!unit)return machine.status
    const inputHash=hashDelivery({manifest:machine.manifestHash,unit:unit.id,accepted:machine.acceptedIds,priorCalls:machine.calls})
    options.persist(machine.start(unit.id,inputHash),machine.anchor)
    const controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined
    let outcome:DeliveryOutcome
    try{outcome=await Promise.race([Promise.resolve().then(()=>options.read(unit,inputHash,controller.signal)),new Promise<DeliveryOutcome>(resolve=>{timer=setTimeout(()=>{controller.abort();resolve({kind:'timeout'})},options.deadlineMs)})])}catch{outcome={kind:'fatal'}}finally{if(timer)clearTimeout(timer)}
    let settlement:DeliveryEvent
    try{settlement=machine.settle(unit.id,inputHash,outcome)}catch{settlement=machine.settle(unit.id,inputHash,{kind:'invalid-format'})}
    options.persist(settlement,machine.anchor)
  }
  machine.next();return machine.status
}
