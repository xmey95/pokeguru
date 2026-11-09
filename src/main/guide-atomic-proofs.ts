import {guideHash} from './matchup-guide-packet'
import {isVerifiedGuideWitnessLibrary,type GuideWitnessLibrary,type GuideLibraryWitness} from './guide-witness-library'

export interface GuideProofFrameSelector {firstTurnHash:string|null;drawsHash:string|null}
export type GuideProofFrameMode='same-draws'|'declared-conditional'
export type GuideAtomicPolicy=
 |{kind:'exists-line';frame:GuideProofFrameSelector}
 |{kind:'pair';firstId:string;secondId:string;frameMode:GuideProofFrameMode}
 |{kind:'all-pairs';frame:GuideProofFrameSelector;focusId:string|null;frameMode:GuideProofFrameMode}
 |{kind:'group';memberIds:string[];frameMode:GuideProofFrameMode}
export interface GuideAtomicPredicate {
  version:1;id:string;contextHash:string;statement:string;conditions:string;sourceIds:string[];policy:GuideAtomicPolicy;authorRequestIds:string[]
}
export interface GuideAtomicUnit {id:string;atomId:string;kind:'line'|'pair'|'group';witnesses:{id:string;nativeHash:string}[]}
export interface GuideAtomicFact {
  atomId:string;unitId:string;verdict:'proves'|'does-not-prove'|'incomplete';reason:string;sourceIds:string[];
  witnesses:{id:string;nativeHash:string;turnNumbers:number[]}[];
  needs:'none'|'numeric-evaluation'|'source-evidence'|'clarification'
}
/** This receipt is created by the host from the actual critic request/response,
 * not parsed from model JSON. Full bodies must be present in readWitnesses. */
export interface GuideAtomicFactReceipt {
  protocol:'guide-atomic-proof-1';requestId:string;scopeHash:string;contextHash:string;atomId:string;unitId:string;responseHash:string;
  sourceIds:string[];readWitnesses:{id:string;nativeHash:string;turnNumbers:number[];producerRequestIds:string[]}[]
}
export interface GuideAtomicEnvironment {evidenceHash:string;sourceIds:string[];contractHash:string}
interface FactRecord {atom:GuideAtomicPredicate;unit:GuideAtomicUnit;fact:GuideAtomicFact;receiptHash:string}
export interface GuideAtomicResult {
  atomId:string;domainHash:string;status:'verified'|'needs-evaluation'|'needs-construction'|'open'|'conflicted'|'blocked';
  requiredUnitIds:string[];provenUnitIds:string[];negativeUnitIds:string[];incompleteUnitIds:string[];conflictedUnitIds:string[];
  blockedUnitIds:string[];libraryComplete:boolean;constructionAuthorized:boolean
}
export interface GuideAtomicCoverage {
  version:1;scopeHash:string;contextHash:string;atomId:string;policy:GuideAtomicPolicy;domainHash:string;unitIds:string[];receiptHashes:string[];
  scope:GuideWitnessLibrary['scope']&{caseId:string};rootHash:string;nativePacketHash:string;evidenceHash:string;contractHash:string;sourceIds:string[];
  predicate:GuideAtomicPredicate;reviewerRequestIds:string[]
}
export interface GuideAtomicPendingWork {
  unitId:string
  needs:'critique'|'adjudication'|'reload-receipt'|'numeric-evaluation'|'source-evidence'|'clarification'
}
const coverageChecks=new WeakMap<object,()=>boolean>()
/** Opaque host-derived proof, reconstructed from actual facts after reopen.
 * JSON containing the same fields is not a verified coverage capability. */
export function readVerifiedAtomicCoverage(value:GuideAtomicCoverage):GuideAtomicCoverage{
  let valid=false
  try{valid=coverageChecks.get(value)?.()===true}catch{/* Changed predicates and stale stores invalidate the capability. */}
  if(!valid)fail('copertura non verificata o superata.')
  return clone(value)
}
const clone=<T>(v:T):T=>structuredClone(v)
function freezeJson(value:any):void{if(value&&typeof value==='object'&&!Object.isFrozen(value)){for(const child of Object.values(value))freezeJson(child);Object.freeze(value)}}
function fail(message:string):never{throw new Error('Prove atomiche: '+message)}
function text(v:unknown):v is string{return typeof v==='string'&&!!v.trim()}
function strings(v:unknown,nonempty=false):asserts v is string[]{if(!Array.isArray(v)||nonempty&&!v.length||v.some(x=>!text(x))||new Set(v).size!==v.length)fail('insieme di riferimenti non valido.')}
function exact(v:unknown,keys:string[]):asserts v is Record<string,any>{if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).sort().join('|')!==[...keys].sort().join('|'))fail('campi non validi.')}
const setEqual=(a:string[],b:string[])=>guideHash([...a].sort())===guideHash([...b].sort())
function predicateBody(atom:GuideAtomicPredicate){const{id,authorRequestIds,...body}=atom;return body}

/** Facts address a local, immutable predicate/body pair. Changing the universe
 * invalidates quantified conclusions, not valid local facts about old members.
 * Original→predicate mappings remain a SEPARATE independent certification. */
export class GuideAtomicProofStore {
  private library:GuideWitnessLibrary
  private readonly environment:GuideAtomicEnvironment
  private readonly receipts=new Map<string,GuideAtomicFactReceipt>()
  private readonly records=new Map<string,FactRecord>()
  readonly scopeHash:string
  readonly contextHash:string
  constructor(library:GuideWitnessLibrary,environment:GuideAtomicEnvironment,receipts:GuideAtomicFactReceipt[]=[]){
    if(!isVerifiedGuideWitnessLibrary(library))fail('biblioteca non verificata dall’host.')
    if(!text(environment.evidenceHash)||!text(environment.contractHash))fail('contesto delle fonti o contratto mancante.')
    strings(environment.sourceIds,true)
    this.library=library;this.environment=clone(environment)
    this.scopeHash=guideHash({...library.scope,caseId:library.caseId})
    this.contextHash=guideHash({scopeHash:this.scopeHash,packetHash:library.packetHash,rootHash:library.rootHash,
      evidenceHash:environment.evidenceHash,contractHash:environment.contractHash})
    this.importHostReceipts(receipts)
  }
  importHostReceipts(values:GuideAtomicFactReceipt[]):void{for(const value of values)this.receipts.set(guideHash(value),clone(value))}
  useLibrary(library:GuideWitnessLibrary):void{
    if(!isVerifiedGuideWitnessLibrary(library)||guideHash({...library.scope,caseId:library.caseId})!==this.scopeHash||library.packetHash!==this.library.packetHash||library.rootHash!==this.library.rootHash)fail('nuova biblioteca di un altro scope o frame.')
    this.library=library
  }
  predicate(statement:string,conditions:string,sourceIds:string[],policy:GuideAtomicPolicy,authorRequestIds:string[]):GuideAtomicPredicate{
    const body={version:1 as const,contextHash:this.contextHash,statement,conditions,sourceIds:[...sourceIds],policy:clone(policy)}
    const atom={...body,id:guideHash({scopeHash:this.scopeHash,body}),authorRequestIds:[...authorRequestIds]}
    this.validatePredicate(atom);return atom
  }
  private validatePredicate(atom:GuideAtomicPredicate,historical=false):void{
    exact(atom,['version','id','contextHash','statement','conditions','sourceIds','policy','authorRequestIds'])
    if(atom.version!==1||!text(atom.statement)||!text(atom.conditions)||!text(atom.contextHash)||!historical&&atom.contextHash!==this.contextHash||atom.id!==guideHash({scopeHash:this.scopeHash,body:predicateBody(atom)}))fail('predicato o contesto alterati.')
    strings(atom.sourceIds,true);strings(atom.authorRequestIds,true)
    if(atom.sourceIds.some(id=>!this.environment.sourceIds.includes(id)))fail('fonte sconosciuta.')
    const p=atom.policy
    if(p?.kind==='exists-line'||p?.kind==='all-pairs'){
      exact(p,p.kind==='exists-line'?['kind','frame']:['kind','frame','focusId','frameMode']);exact(p.frame,['firstTurnHash','drawsHash'])
      if([p.frame.firstTurnHash,p.frame.drawsHash].some(x=>x!==null&&!text(x))||p.kind==='all-pairs'&&p.focusId!==null&&!text(p.focusId))fail('selettore di frame non valido.')
    }else if(p?.kind==='pair'){
      exact(p,['kind','firstId','secondId','frameMode']);if(!text(p.firstId)||!text(p.secondId)||p.firstId===p.secondId)fail('coppia non valida.')
    }else if(p?.kind==='group'){exact(p,['kind','memberIds','frameMode']);strings(p.memberIds,true)}
    else fail('politica di prova sconosciuta.')
    if(p.kind!=='exists-line'&&!['same-draws','declared-conditional'].includes(p.frameMode))fail('confronto senza condizioni di pescata esplicite.')
  }
  private incompatibleFrame(atom:GuideAtomicPredicate,unit:GuideAtomicUnit):boolean{
    if(atom.policy.kind==='exists-line'||atom.policy.frameMode!=='same-draws')return false
    const draws=unit.witnesses.map(w=>this.library.members.find(m=>m.id===w.id)?.frame.drawsHash)
    return draws.some(v=>!v)||new Set(draws).size!==1
  }
  units(atom:GuideAtomicPredicate):GuideAtomicUnit[]{
    this.validatePredicate(atom)
    const all=this.library.members,p=atom.policy,select=(ids:string[])=>ids.map(id=>all.find(m=>m.id===id)).filter((m):m is GuideLibraryWitness=>!!m)
    let groups:GuideLibraryWitness[][]=[],kind:GuideAtomicUnit['kind']='line'
    if(p.kind==='exists-line'||p.kind==='all-pairs'){
      const domain=all.filter(m=>(p.frame.firstTurnHash===null||m.frame.firstTurnHash===p.frame.firstTurnHash)&&(p.frame.drawsHash===null||m.frame.drawsHash===p.frame.drawsHash)).sort((a,b)=>a.id.localeCompare(b.id))
      if(p.kind==='exists-line')groups=domain.map(m=>[m])
      else{
        kind='pair'
        if(p.focusId!==null){const focus=domain.find(m=>m.id===p.focusId);if(focus)groups=domain.filter(m=>m.id!==p.focusId).map(m=>[focus,m])}
        else for(let i=0;i<domain.length;i++)for(let j=i+1;j<domain.length;j++)groups.push([domain[i],domain[j]])
        // Do not certify a nonempty singleton domain vacuously: its complete
        // body still needs a judgment of the predicate and its conditions.
        if(domain.length===1&&(p.focusId===null||p.focusId===domain[0].id)){groups=[[domain[0]]];kind='group'}
      }
    }else if(p.kind==='pair'){const selected=select([p.firstId,p.secondId]);if(selected.length===2)groups=[selected];kind='pair'}
    else{const selected=select(p.memberIds);if(selected.length===p.memberIds.length)groups=[selected];kind='group'}
    return groups.map(group=>{const body={atomId:atom.id,kind,witnesses:group.map(m=>({id:m.id,nativeHash:m.nativeHash}))};return {id:guideHash({scopeHash:this.scopeHash,contextHash:atom.contextHash,...body}),...body}})
  }
  private validateRecord(record:FactRecord,historical=false,provided?:GuideAtomicFactReceipt):void{
    const {atom,unit,fact,receiptHash}=record
    this.validatePredicate(atom,historical)
    exact(unit,['id','atomId','kind','witnesses']);exact(fact,['atomId','unitId','verdict','reason','sourceIds','witnesses','needs'])
    if(!['line','pair','group'].includes(unit.kind)||!Array.isArray(unit.witnesses)||!unit.witnesses.length)fail('unità senza corpi completi.')
    const {id,...unitBody}=unit
    if(unit.atomId!==atom.id||id!==guideHash({scopeHash:this.scopeHash,contextHash:atom.contextHash,...unitBody})||new Set(unit.witnesses.map(w=>w.id)).size!==unit.witnesses.length)fail('identità dell’unità diversa.')
    for(const w of unit.witnesses){exact(w,['id','nativeHash']);if(!text(w.id)||!text(w.nativeHash))fail('corpo mancante.')}
    if(!historical&&!this.units(atom).some(u=>guideHash(u)===guideHash(unit)))fail('unità fuori dal dominio corrente.')
    if(!historical&&this.incompatibleFrame(atom,unit))fail('pescate diverse sotto un contratto che le impone identiche.')
    const r=provided??this.receipts.get(receiptHash)
    if(!r||r.protocol!=='guide-atomic-proof-1'||!text(r.requestId)||r.scopeHash!==this.scopeHash||r.contextHash!==atom.contextHash||r.atomId!==atom.id||r.unitId!==unit.id||r.responseHash!==guideHash(fact)||atom.authorRequestIds.includes(r.requestId))fail('ricevuta mancante, estranea o autocertificata.')
    strings(r.sourceIds,true)
    if(!Array.isArray(r.readWitnesses)||!setEqual(r.readWitnesses.map(w=>w.id),unit.witnesses.map(w=>w.id))||r.readWitnesses.length!==unit.witnesses.length)fail('corpi non letti integralmente.')
    if(!['proves','does-not-prove','incomplete'].includes(fact.verdict)||!text(fact.reason)||fact.atomId!==atom.id||fact.unitId!==unit.id)fail('giudizio non valido.')
    if(fact.verdict==='incomplete'?!['numeric-evaluation','source-evidence','clarification'].includes(fact.needs):fact.needs!=='none')fail('dipendenza mancante senza percorso esplicito.')
    strings(fact.sourceIds,true)
    if(atom.sourceIds.some(id=>!fact.sourceIds.includes(id))||fact.sourceIds.some(id=>!r.sourceIds.includes(id))||r.sourceIds.some(id=>!this.environment.sourceIds.includes(id)))fail('fonti necessarie omesse o estranee.')
    if(!Array.isArray(fact.witnesses)||fact.witnesses.length!==unit.witnesses.length||!setEqual(fact.witnesses.map(w=>w.id),unit.witnesses.map(w=>w.id)))fail('citazioni incomplete.')
    for(const ref of unit.witnesses){
      const read=r.readWitnesses.find(w=>w.id===ref.id)!,citation=fact.witnesses.find(w=>w.id===ref.id)!
      exact(citation,['id','nativeHash','turnNumbers'])
      if(read.nativeHash!==ref.nativeHash||citation.nativeHash!==ref.nativeHash||!Array.isArray(read.turnNumbers)||!read.turnNumbers.length||new Set(read.turnNumbers).size!==read.turnNumbers.length||read.turnNumbers.some(n=>!Number.isSafeInteger(n)||n<1)||!Array.isArray(citation.turnNumbers)||!citation.turnNumbers.length||new Set(citation.turnNumbers).size!==citation.turnNumbers.length||citation.turnNumbers.some(n=>!read.turnNumbers.includes(n)))fail('citazioni o corpi superati.')
      strings(read.producerRequestIds,true)
      if(read.producerRequestIds.includes(r.requestId))fail('il produttore non può certificare il proprio testimone.')
      if(!historical){
        const actual=this.library.members.find(m=>m.id===ref.id)!
        const turns=actual.journal.segments.map((_,i)=>i+1),producers=[...new Set(actual.producers.flatMap(p=>p.references.map(v=>v.unitId)))]
        if(actual.nativeHash!==ref.nativeHash||!setEqual(read.turnNumbers.map(String),turns.map(String))||!setEqual(read.producerRequestIds,producers))fail('ricevuta non corrispondente alla biblioteca verificata.')
      }
    }
  }
  addFact(atom:GuideAtomicPredicate,unit:GuideAtomicUnit,fact:GuideAtomicFact,receipt:string|GuideAtomicFactReceipt):void{
    const receiptHash=typeof receipt==='string'?receipt:guideHash(receipt)
    const record={atom:clone(atom),unit:clone(unit),fact:clone(fact),receiptHash}
    this.validateRecord(record,false,typeof receipt==='string'?undefined:receipt);const key=guideHash(record),prior=[...this.records.values()].find(v=>v.receiptHash===receiptHash)
    if(prior&&guideHash(prior)!==key)fail('una ricevuta è stata riassegnata.')
    if(typeof receipt!=='string')this.receipts.set(receiptHash,clone(receipt))
    this.records.set(key,record)
  }
  derive(atom:GuideAtomicPredicate):GuideAtomicResult{
    const units=this.units(atom),proven:string[]=[],negative:string[]=[],incomplete:string[]=[],conflicted:string[]=[],blocked:string[]=[]
    for(const unit of units){
      if(this.incompatibleFrame(atom,unit)){blocked.push(unit.id);continue}
      const records=[...this.records.values()].filter(r=>r.atom.id===atom.id&&r.unit.id===unit.id)
      const known=[...this.receipts.entries()].filter(([,r])=>r.scopeHash===this.scopeHash&&r.contextHash===atom.contextHash&&r.atomId===atom.id&&r.unitId===unit.id)
      if(known.some(([hash])=>!records.some(r=>r.receiptHash===hash))){incomplete.push(unit.id);continue}
      if(records.some(r=>atom.authorRequestIds.includes(this.receipts.get(r.receiptHash)!.requestId))){incomplete.push(unit.id);continue}
      const producers=new Set(unit.witnesses.flatMap(w=>this.library.members.find(m=>m.id===w.id)!.producers.flatMap(p=>p.references.map(r=>r.unitId))))
      if(records.some(r=>producers.has(this.receipts.get(r.receiptHash)!.requestId))){incomplete.push(unit.id);continue}
      const concrete=new Set(records.filter(r=>r.fact.verdict!=='incomplete').map(r=>r.fact.verdict))
      if(concrete.size>1){conflicted.push(unit.id);continue}
      if(concrete.has('proves'))proven.push(unit.id)
      else if(concrete.has('does-not-prove'))negative.push(unit.id)
      else incomplete.push(unit.id)
    }
    const policy=atom.policy.kind,complete=this.library.complete,verified=policy==='exists-line'?!!proven.length:complete&&!!units.length&&proven.length===units.length
    const construction=policy==='exists-line'&&complete&&!!units.length&&negative.length===units.length
    const status:GuideAtomicResult['status']=!units.length||blocked.length?'blocked':verified?'verified':conflicted.length?'conflicted':construction?'needs-construction':incomplete.length||!complete?'needs-evaluation':'open'
    return {atomId:atom.id,domainHash:guideHash({atomId:atom.id,units:units.map(u=>u.id),libraryComplete:complete}),status,
      requiredUnitIds:units.map(u=>u.id),provenUnitIds:proven,negativeUnitIds:negative,incompleteUnitIds:incomplete,conflictedUnitIds:conflicted,
      blockedUnitIds:blocked,libraryComplete:complete,constructionAuthorized:construction}
  }
  pendingWork(atom:GuideAtomicPredicate):GuideAtomicPendingWork[]{
    const state=this.derive(atom)
    return [...state.incompleteUnitIds,...state.conflictedUnitIds].flatMap<GuideAtomicPendingWork>(unitId=>{
      if(state.conflictedUnitIds.includes(unitId))return [{unitId,needs:'adjudication' as const}]
      const rows=[...this.records.values()].filter(r=>r.atom.id===atom.id&&r.unit.id===unitId)
      const known=[...this.receipts.entries()].filter(([,r])=>r.scopeHash===this.scopeHash&&r.contextHash===atom.contextHash&&r.atomId===atom.id&&r.unitId===unitId)
      if(known.some(([hash])=>!rows.some(r=>r.receiptHash===hash)))return [{unitId,needs:'reload-receipt' as const}]
      const pending=[...new Set(rows.filter(r=>r.fact.verdict==='incomplete').map(r=>r.fact.needs))].filter((n):n is 'numeric-evaluation'|'source-evidence'|'clarification'=>n!=='none')
      return pending.length?pending.map(needs=>({unitId,needs})):[{unitId,needs:'critique' as const}]
    })
  }
  coverage(atom:GuideAtomicPredicate):GuideAtomicCoverage|undefined{
    const result=this.derive(atom)
    if(result.status!=='verified')return undefined
    const units=atom.policy.kind==='exists-line'?[result.provenUnitIds[0]]:result.requiredUnitIds
    const receiptHashes=[...this.records.values()].filter(r=>r.atom.id===atom.id&&units.includes(r.unit.id)&&r.fact.verdict==='proves').map(r=>r.receiptHash).sort()
    const value:GuideAtomicCoverage={version:1,scopeHash:this.scopeHash,contextHash:this.contextHash,atomId:atom.id,
      policy:clone(atom.policy),domainHash:result.domainHash,unitIds:[...units],receiptHashes,
      scope:{...clone(this.library.scope),caseId:this.library.caseId},rootHash:this.library.rootHash,nativePacketHash:this.library.packetHash,
      evidenceHash:this.environment.evidenceHash,contractHash:this.environment.contractHash,sourceIds:[...this.environment.sourceIds],
      predicate:clone(atom),reviewerRequestIds:[...new Set(receiptHashes.map(hash=>this.receipts.get(hash)!.requestId))].sort()}
    freezeJson(value)
    coverageChecks.set(value,()=>{
      const current=this.derive(atom)
      return current.status==='verified'&&units.every(id=>current.provenUnitIds.includes(id))&&(atom.policy.kind==='exists-line'||setEqual(current.requiredUnitIds,units))
    })
    return value
  }
  serialize():string{return JSON.stringify({version:1,scopeHash:this.scopeHash,records:[...this.records.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([,record])=>record)})}
  static open(raw:string,expectedHash:string,library:GuideWitnessLibrary,environment:GuideAtomicEnvironment,receipts:GuideAtomicFactReceipt[]):GuideAtomicProofStore{
    if(guideHash(raw)!==expectedHash)fail('stato diverso dalla radice persistita.')
    const value:unknown=JSON.parse(raw);exact(value,['version','scopeHash','records'])
    const store=new GuideAtomicProofStore(library,environment,receipts)
    if(value.version!==1||value.scopeHash!==store.scopeHash||!Array.isArray(value.records))fail('stato di un altro scope.')
    for(const record of value.records){exact(record,['atom','unit','fact','receiptHash']);store.validateRecord(record as FactRecord,true);const key=guideHash(record);if(store.records.has(key))fail('record duplicato.');store.records.set(key,clone(record as FactRecord))}
    return store
  }
}
