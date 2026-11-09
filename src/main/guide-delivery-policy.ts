import type {AiEvidenceArchive} from './ai-evidence-archive'
import {guideHash,type GuidePacket} from './matchup-guide-packet'
import {guideDeliveryBudget,isGuideDelivery} from '../shared/guide-delivery'
import type {AiRunConfig} from '../shared/ai'
import type {GuideAttempt,MatchupGuide} from '../shared/matchup-guide'
import {AiFailure} from './ai-failure'
import type {AiBudgetSnapshot} from '../shared/ai-limits'
import {deliveryAllowanceRole,readDeliveryAllowances,type DeliveryRepairAllowance} from './guide-delivery-allowance'
import {guideUntilValidAuthority,GUIDE_UNLIMITED_CAPACITY} from './guide-run-policy'

const manifestRole='guide-delivery-manifest-v1',registryRole='guide-delivery-unit-v1',dispatchRole='guide-delivery-dispatch-v1'
type Archive=Pick<AiEvidenceArchive,'id'|'projectId'|'value'|'values'|'saveValue'|'saveValues'>
interface Unit {unitId:string;key:string;repair:boolean}
interface Dispatch {version:1|2|3;sequence:number;inputHash:string;manifestHash:string;previousHash:string|null;units:Unit[];repair:boolean;allowanceHash?:string;policyHash?:string}
export function initializeGuideDelivery(packet:GuidePacket,config:AiRunConfig,archive:Archive){
 if(!isGuideDelivery(packet.basis))return undefined
 if(archive.projectId!==packet.basis.projectId)throw Error('Manifest di un altro progetto.')
 const authority=guideUntilValidAuthority(archive)
 if(authority&&(authority.packetHash!==guideHash(packet)||authority.configHash!==guideHash(config)))throw Error('Politica di convergenza di altre fonti o configurazione.')
 const manifest={version:1,jobId:archive.id,projectId:archive.projectId,packetHash:guideHash(packet),configHash:guideHash(config),contract:packet.basis.deliveryContract,...guideDeliveryBudget()}
 const prior=archive.value(manifestRole,'initial');if(prior&&guideHash(prior)!==guideHash(manifest))throw Error('Manifest di consegna diverso dalla richiesta congelata.')
 if(!prior&&[...archive.values('guide-attempt-start')].length)throw Error('Una storia precedente non può acquisire nuovi crediti di consegna.')
 archive.saveValue(manifestRole,'initial',manifest);return manifest
}
/** Explicit stable host locations; byte identities and retry hashes do not
 * renew a location. Unknown request families stop before dispatch. */
export function deliveryUnit(request:{stage:string;data:any;cacheValidation:{id:string}},unitId:string):Unit{
 const d=request.data,v=request.cacheValidation.id,caseId=d.caseId??d.prefix?.id??d.main?.id??d.plan?.caseId??d.context?.caseId??d.native?.id
 const line=d.reply?.id??d.deliveryLineId??'main';let key:string,repair=false
 if(/^guide-finite-setup-frame-[12]$/.test(v))key=caseId+'/setup-header'
 else if(/^guide-finite-setup-turn-[123]$/.test(v))key=caseId+'/setup/'+d.slotId
 else if(/^guide-delivery-turn-[12]$/.test(v))key=caseId+'/'+line+'/'+(['ours','opponent','next'][Object.keys(d.prefix.turns??{}).length])
 else if(/^guide-finite-audit-[34]$/.test(v)||v==='guide-finite-audit-part-1')key=caseId+'/audit/'+line+'/'+d.turnKey
 else if(v==='guide-finite-audit-language-4')key=caseId+'/audit-review/'+(d.deliveryAuditKey??guideHash(d.targets.map((t:any)=>t.id)))
 else if(/^guide-premise-review-[1234]$/.test(v))key=caseId+'/premise'
 else if(/^guide-finite-plan-[12]$/.test(v))key=caseId+'/reply-plan'
 else if(/^guide-finite-plan-review-[12]$/.test(v))key=caseId+'/reply-plan-review'
 else if(/^guide-finite-metadata-[12]$/.test(v))key=caseId+'/metadata'
 else if(/^guide-finite-review-[23456]$/.test(v))key='review/'+d.reviewScope+'/'+(d.textPartition?d.textPartition.unitId:[...d.proofCaseIds].sort().join('/'))
 else if(v.startsWith('guide-finite-prose-'))key='text/'+request.stage
 else if(v.startsWith('guide-finite-native-repair')||v.includes('premise')||v.includes('repair')){key='repair/'+(v==='guide-finite-premise-route-2'?'guide-finite-premise-route-1':v)+'/'+(caseId??'cases');repair=true}
 else if(/^guide-delivery-outline-review-[123]$/.test(v))key='outline-review'
 else throw Error('Famiglia di richieste non ammessa dal manifest: '+v)
 if(key.includes('undefined')||key.length>700)throw Error('Posizione di consegna incompleta.')
 return {unitId,key,repair}
}
export function registerDeliveryUnit(archive:Archive,request:Parameters<typeof deliveryUnit>[0],unitId:string){
 const record=deliveryUnit(request,unitId),old=archive.value(registryRole,unitId)
 if(old&&guideHash(old)!==guideHash(record))throw Error('Identità della posizione di consegna alterata.')
 if(!old)archive.saveValue(registryRole,unitId,record)
}
export function readGuideDelivery(archive:Pick<Archive,'id'|'projectId'|'value'|'values'>){
 const manifest=archive.value<any>(manifestRole,'initial');if(!manifest||manifest.jobId!==archive.id||manifest.projectId!==archive.projectId||manifest.maximum!==guideDeliveryBudget().maximum||manifest.base!==guideDeliveryBudget().base||manifest.replies!==2||manifest.contract!=='bounded-delivery-1'||manifest.repairCredits!==16)throw Error('Manifest di consegna mancante o alterato.')
 const authority=guideUntilValidAuthority(archive),policyHash=authority?guideHash(authority):undefined,maximumCalls=authority?GUIDE_UNLIMITED_CAPACITY:manifest.maximum
 if(authority&&(authority.packetHash!==manifest.packetHash||authority.configHash!==manifest.configHash))throw Error('Autorità senza il manifest originale corrispondente.')
 const rows=[...archive.values<Dispatch>(dispatchRole)].sort((a,b)=>a.value.sequence-b.value.sequence),allowances=readDeliveryAllowances(archive,manifest,rows),seen=new Set<string>(),baseSeen=new Set<string>();let previousHash:string|null=null,repairs=0
 for(const [i,row]of rows.entries()){
  const r=row.value,start=archive.value<GuideAttempt>('guide-attempt-start',String(r.sequence).padStart(3,'0'))
  const allowance=allowances.at(r.sequence)
  if(row.key!==String(r.sequence).padStart(3,'0')||r.version!==(authority?3:allowance.allowanceHash?2:1)||r.policyHash!==policyHash||r.allowanceHash!==(allowance.allowanceHash??undefined)||r.sequence!==i+1||r.previousHash!==previousHash||r.manifestHash!==guideHash(manifest)||!start||start.inputHash!==r.inputHash||!r.units.length)throw Error('Registro di consegna alterato o incompleto.')
  for(const u of r.units)if(u.unitId!=='outline'&&guideHash(archive.value(registryRole,u.unitId))!==guideHash(u))throw Error('Unità senza descrittore di consegna.')
  const repair=r.units.some(u=>u.repair||seen.has(u.key));if(r.repair!==repair)throw Error('Riparazione riclassificata come nuovo lavoro.')
  if(repair)repairs++;if(!authority&&repairs>allowance.repairLimit)throw Error('Crediti di consegna superati prima della concessione.')
  for(const u of r.units){seen.add(u.key);if(!u.repair)baseSeen.add(u.key)}previousHash=guideHash(r)
 }
 if(rows.length>maximumCalls||!authority&&repairs>allowances.repairLimit||baseSeen.size>manifest.base)throw Error('Crediti di consegna superati.')
 if([...archive.values('guide-attempt-start')].length!==rows.length)throw Error('Invocazione senza ricevuta di consegna.')
 return {manifest,rows,seen,baseSeen,repairs,previousHash,repairLimit:authority?GUIDE_UNLIMITED_CAPACITY:allowances.repairLimit,allowanceHash:allowances.allowanceHash,policyHash,maximumCalls}
}
/** Trusted explicit user action only; never call this from model output or
 * automatic recovery. This appends authority, not a rewritten manifest. */
export function authorizeGuideDeliveryRepairs(archive:Archive,grant:DeliveryRepairAllowance){
 const key=guideHash(grant),old=archive.value(deliveryAllowanceRole,key);if(old){readGuideDelivery(archive);return key}
 if(archive.value('guide-delivery-final-v1','validated'))throw Error('Una guida già convalidata non può acquisire nuovi crediti.')
 const state=readGuideDelivery(archive)
 if(grant.afterSequence!==state.rows.length||grant.historyHash!==state.previousHash||grant.previousAllowanceHash!==state.allowanceHash)throw Error('Concessione su una storia superata.')
 const view=new Proxy(archive,{get(target,name){if(name==='values')return function*(role:string){yield* target.values(role);if(role===deliveryAllowanceRole)yield {key,value:grant}};const v=Reflect.get(target,name,target);return typeof v==='function'?v.bind(target):v}})
 readGuideDelivery(view);archive.saveValue(deliveryAllowanceRole,key,grant);return key
}
function dispatchUnits(archive:Pick<Archive,'value'>,stage:string,data:any):Unit[]{
 const units=stage==='plan'?[{unitId:'outline',key:'outline',repair:false}]:(data?.units??[]).map((u:any)=>{const r=archive.value<Unit>(registryRole,u.unitId);if(!r)throw Error('Invio senza posizione autenticata.');return r})
 if(!units.length)throw Error('Invio fuori dal manifest di consegna.');return units
}
/** Minimum cost of all known unpaid groups and compulsory followups. These
 * hypothetical keys reserve capacity only; dispatch still requires originals. */
export function guideDeliveryResourceBudget(archive:Pick<Archive,'id'|'projectId'|'value'|'values'>,stage:string,groups:{stage:string;data:unknown;deliveryFollowupKeys?:string[];deliveryRepairReserve?:number}[],base?:AiBudgetSnapshot){
 const state=readGuideDelivery(archive),seen=new Set(state.seen),baseSeen=new Set(state.baseSeen);let required=0
 const planned=groups.map(g=>dispatchUnits(archive,g.stage,g.data)),followups=[...new Set(groups.flatMap(g=>g.deliveryFollowupKeys??[]))]
 for(const key of followups){if(typeof key!=='string'||!key||key.length>700||key.includes('undefined'))throw Error('Riserva di riparazione incompleta.');planned.push([{unitId:'reserved-only',key,repair:false}])}
 for(const units of planned){if(units.some(u=>u.repair||seen.has(u.key)))required++;for(const u of units){seen.add(u.key);if(!u.repair)baseSeen.add(u.key)}}
 const extra=groups.reduce((n,g)=>{const reserve=g.deliveryRepairReserve??0;if(!Number.isSafeInteger(reserve)||reserve<0||reserve>state.manifest.maximum)throw Error('Riserva delle ricertificazioni non valida.');return n+reserve},0)
 required+=extra
 const remainingCalls=Math.min(base?.remainingCalls??state.maximumCalls-state.rows.length,state.maximumCalls-state.rows.length),requiredCalls=Math.max(base?.requiredCalls??0,planned.length+extra),repairs={limit:state.repairLimit,used:state.repairs,remaining:state.repairLimit-state.repairs,required},reasons=[...base?.reasons??[]]
 if(remainingCalls<requiredCalls&&!reasons.includes('calls'))reasons.push('calls')
 if(repairs.remaining<required&&!reasons.includes('repair-calls'))reasons.push('repair-calls')
 if(baseSeen.size>state.manifest.base&&!reasons.includes('base-slots'))reasons.push('base-slots')
 const snapshot:AiBudgetSnapshot={...base,stage,checkedAt:new Date().toISOString(),estimateOnly:true,outcome:reasons.length||base?.outcome==='blocked'?'blocked':'ready',reasons,remainingCalls,requiredCalls,repairs}
 return {snapshot,baseExceeded:baseSeen.size>state.manifest.base}
}
export function preflightGuideDelivery(archive:Pick<Archive,'id'|'projectId'|'value'|'values'>,stage:string,groups:{stage:string;data:unknown;deliveryFollowupKeys?:string[];deliveryRepairReserve?:number}[],base?:AiBudgetSnapshot){
 const {snapshot,baseExceeded}=guideDeliveryResourceBudget(archive,stage,groups,base)
 if(baseExceeded)throw new AiFailure('call-budget','Il lavoro supera gli slot congelati del manifest; nessuna espansione automatica.',undefined,undefined,snapshot)
 if(snapshot.reasons.includes('repair-calls'))throw new AiFailure('call-budget',`Riserva condivisa di consegna esaurita o insufficiente: ${snapshot.repairs!.remaining} correzioni disponibili, almeno ${snapshot.repairs!.required} necessarie con i riesami già noti. Restano ${snapshot.remainingCalls} invocazioni totali. Nessun credito rinnovato automaticamente.`,undefined,undefined,snapshot)
 if(snapshot.reasons.includes('calls'))throw new AiFailure('call-budget','Invocazioni insufficienti per le richieste e le verifiche già note.',undefined,undefined,snapshot)
 return snapshot
}
/** The immutable start and its accounting receipt commit together. */
export function beginGuideDelivery(archive:Archive,attempt:GuideAttempt,data:any){
 const state=readGuideDelivery(archive)
 if(state.rows.some(r=>!archive.value('guide-attempt-end',String(r.value.sequence).padStart(3,'0'))))throw new AiFailure('draft-limit','Invocazione precedente senza esito: ripresa in quarantena, nessun invio automatico.')
 const units=dispatchUnits(archive,attempt.stage,data)
 const outcomes=[...archive.values<any>('guide-segment-unit-result-v1')].map(r=>r.value)
 for(const unit of units){let formats=0,negatives=0
  for(const row of state.rows){if(!row.value.units.some(u=>u.key===unit.key))continue
   const failure=archive.value<any>('guide-attempt-failure',String(row.value.sequence).padStart(3,'0'))
   const batchHash=guideHash(row.value.units.map(u=>u.unitId)),ids=new Set(row.value.units.filter(u=>u.key===unit.key).map(u=>u.unitId))
   const values=outcomes.filter(v=>ids.has(v.unitId)&&v.batchHash===batchHash)
   if(failure?.code==='invalid-response'||values.some(v=>v?.accepted===false))formats++
   if(values.some(v=>v?.accepted===true&&v.value?.verdict&&v.value.verdict!=='pass'))negatives++
  }
  if(!state.policyHash&&formats>=2)throw new AiFailure('invalid-response','Due risposte non valide della stessa posizione logica; nessun reset per nuovi input.')
  if(!state.policyHash&&negatives>=2)throw new AiFailure('draft-limit','Secondo giudizio negativo della stessa posizione logica; nessun riesame automatico aggiuntivo.')
 }
 const repair=units.some(u=>u.repair||state.seen.has(u.key))
 if(new Set([...state.baseSeen,...units.filter(u=>!u.repair).map(u=>u.key)]).size>state.manifest.base)throw new AiFailure('call-budget','Il lavoro supera gli slot congelati del manifest; nessuna espansione automatica.')
 preflightGuideDelivery(archive,attempt.stage,[{stage:attempt.stage,data}])
 if(attempt.sequence!==state.rows.length+1||attempt.sequence>state.maximumCalls)throw new AiFailure('call-budget','Sequenza fuori dal manifest di consegna.')
 const record:Dispatch={version:state.policyHash?3:state.allowanceHash?2:1,...state.policyHash?{policyHash:state.policyHash}:{},...state.allowanceHash?{allowanceHash:state.allowanceHash}:{},sequence:attempt.sequence,inputHash:attempt.inputHash,manifestHash:guideHash(state.manifest),previousHash:state.previousHash,units,repair}
 archive.saveValues([{role:'guide-attempt-start',key:String(attempt.sequence).padStart(3,'0'),value:attempt},{role:dispatchRole,key:String(attempt.sequence).padStart(3,'0'),value:record}])
}
export function guideDeliverySeal(guide:MatchupGuide,archive:Archive){
 const s=readGuideDelivery(archive)
 if(s.rows.some(r=>!archive.value('guide-attempt-end',String(r.value.sequence).padStart(3,'0'))))throw Error('Consegna con invocazione senza esito.')
 const attempts=s.rows.map(r=>archive.value('guide-attempt-end',String(r.value.sequence).padStart(3,'0')))
 if(guideHash(attempts)!==guideHash(guide.generation.attempts))throw Error('Consumo della guida diverso dagli esiti originali delle invocazioni.')
 const seal={version:1,guideHash:guideHash(guide),manifestHash:guideHash(s.manifest),historyHash:guideHash(s.rows),attemptsHash:guideHash(guide.generation.attempts),repairs:s.repairs,...s.allowanceHash?{allowanceHash:s.allowanceHash}:{},...s.policyHash?{policyHash:s.policyHash}:{}}
 return seal
}
export function assertGuideDeliveryApproval(guide:MatchupGuide,archive:Archive){
 if(!isGuideDelivery(guide.basis))return
 const s=readGuideDelivery(archive),seal=archive.value<any>('guide-delivery-final-v1','validated')
 if(!seal||seal.guideHash!==guideHash(guide)||seal.manifestHash!==guideHash(s.manifest)||seal.historyHash!==guideHash(s.rows)||seal.attemptsHash!==guideHash(guide.generation.attempts)||seal.repairs!==s.repairs||guide.generation.attempts.length!==s.rows.length)throw Error('Consegna priva di attestazione finale corrispondente.')
 if(guideHash(guideDeliverySeal(guide,archive))!==guideHash(seal))throw Error('Attestazione diversa dagli esiti originali delle invocazioni.')
}
