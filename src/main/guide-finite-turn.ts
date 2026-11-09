import type {GuideConstructionRuntime} from './guide-reply-phase'
import {withGuideSegmentRetry,type GuideSegmentRequest} from './guide-segment-generation'
import {guideHash} from './matchup-guide-packet'
import {guideFiniteInstructions} from './guide-finite-instructions'
import {assertNativeScenarioSchema} from './guide-scenario-output-schema'
import {assertFiniteTransportHistory} from './guide-finite-runtime'
import {runFiniteUnit,type FiniteUnitRef} from './guide-finite-unit'
import {AiFailure} from './ai-failure'
const object=(properties:Record<string,any>)=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false})
const literal=(value:string)=>({type:'string',const:value})
interface Negative {version:1;contextHash:string;ordinal:number;nativeHash:string;message:string;frame:FiniteUnitRef;events:FiniteUnitRef[]}

/** A frame and individual AI-authored events, followed by audit judgments and
 * the original full reader. No partial event list becomes a checkpoint. */
export async function constructFiniteTurn<T>(parent:GuideSegmentRequest<T>,options:GuideConstructionRuntime,reserve:number,check:(value:any)=>void,prepare:(value:any,reserve:number)=>Promise<any>,validate:(value:any)=>T):Promise<T>{
 assertFiniteTransportHistory(options.archive,options.scope)
 const schema=parent.schema as any,p=schema.properties,b=p.body.properties,contextHash=guideHash({scope:options.scope,packetHash:guideHash(options.packet),stage:parent.stage,data:parent.data,schema}),role='guide-finite-turn-negative-v1'
 if(!b||!p.development)throw Error('Turno frammentato: schema completo mancante.')
 const arrays=['events','beforeAttack','afterAttack'].filter(k=>b[k]),attack=!!b.attack
 const planSchema=object(Object.fromEntries([...arrays.map(k=>[k,{type:'array',items:{type:'string',minLength:1,maxLength:160},minItems:b[k].minItems??0,maxItems:b[k].maxItems}]),...attack?[['attack',{type:'string',minLength:1,maxLength:160}]]:[]]))
 const metaSchema=object(Object.fromEntries(Object.entries(b).filter(([k])=>![...arrays,'attack'].includes(k)).map(([k,v])=>[k,k==='tactical'?{type:'null'}:v])))
 const frameUnits=Math.max(1,Math.ceil((8000+arrays.reduce((n,k)=>n+(b[k].maxItems??1)*180,0))/6000))
 const frameSchema=object({caseId:p.caseId,parentHash:p.parentHash,phase:p.phase,contextHash:literal(contextHash),body:metaSchema,development:p.development,eventPlan:planSchema})
 const known=[...options.archive.values<Negative>(role)].filter(r=>r.value.contextHash===contextHash)
 for(const row of known){const n=row.value;if(row.key!==guideHash(n)||n.version!==1||!Number.isSafeInteger(n.ordinal)||n.ordinal<0||!guideSemanticRetryAllowed(options.archive,n.ordinal))throw Error('Turno frammentato: rifiuto alterato.')}
 if(new Set(known.map(r=>r.value.ordinal)).size!==known.length)throw Error('Turno frammentato: rifiuti ambigui.')
 const rejected:Negative[]=[]
 for(let ordinal=0;guideSemanticRetryAllowed(options.archive,ordinal);ordinal++){
  const history=structuredClone(rejected),parentContext={stage:parent.stage,task:parent.task,data:parent.data}
  const frame=await runFiniteUnit('frame','segments-finite-turn-frames',()=>{
   const read=(raw:any)=>{assertNativeScenarioSchema(raw,frameSchema);return structuredClone(raw)}
   return withGuideSegmentRetry({stage:'segment-finite-turn-frame-'+parent.stage,role:'constructor',units:frameUnits,instructions:guideFiniteInstructions('native'),task:'Pianifica soltanto questo turno: pescata, sviluppo e sequenza motivata degli eventi. Ogni voce di eventPlan è una dichiarazione da eseguire, non una mossa già verificata. Non emettere gli eventi. tactical=null rinvia i giudizi a una fase distinta sui candidati del codice. Conserva obiettivo, prefisso e condizioni di parentContext.',data:{packet:options.packet,parentContext,contextHash,ordinal,previousRejections:history},schema:frameSchema,reserveCalls:reserve+2+(attack?1:0),outputCapacity:{scope:options.scope,packetHash:guideHash(options.packet),kind:'guide-finite-turn-frame-1'},read,cacheValidation:{id:'guide-finite-turn-frame-1',validate:v=>{read(v)}}},options.scope,options.archive)
  },options)
  const slots:{key:string;index:number|null;goal:string;schema:any}[]=[]
  for(const key of arrays){for(const [index,goal]of frame.value.eventPlan[key].entries())slots.push({key,index,goal,schema:structuredClone(b[key].items)});if(key==='beforeAttack'&&attack)slots.push({key:'attack',index:null,goal:frame.value.eventPlan.attack,schema:structuredClone(b.attack)})}
  if(attack&&!slots.some(s=>s.key==='attack'))throw Error('Turno frammentato: attacco assegnato mancante.')
  const body:any={...frame.value.body,...Object.fromEntries(arrays.map(k=>[k,[]]))},events:{slot:string;body:any}[]=[],refs:FiniteUnitRef[]=[]
  for(const [i,slot]of slots.entries()){
   // The original event schema remains complete. Audit reasons are explicitly
   // deferred, never filled with a host-authored placeholder explanation.
   if(slot.schema.properties?.decisionProof)slot.schema.properties.decisionProof={type:'null'}
   const slotId=slot.key+(slot.index===null?'':'-'+slot.index),previous=structuredClone(events),frameHash=guideHash(frame.value),previousHash=guideHash(previous)
   const eventSchema=object({contextHash:literal(contextHash),frameHash:literal(frameHash),slotId:literal(slotId),previousHash:literal(previousHash),body:slot.schema})
   const event=await runFiniteUnit(slotId,'segments-finite-turn-events',()=>{
    const read=(raw:any)=>{assertNativeScenarioSchema(raw,eventSchema);return structuredClone(raw)}
    return withGuideSegmentRetry({stage:'segment-finite-turn-event-'+parent.stage+'-'+slotId,role:'constructor',units:2,instructions:guideFiniteInstructions('native'),task:'Esegui soltanto l’evento assegnato da eventPlan, con movimenti, costi, fonti e condizioni completi. Non riscrivere frame o eventi precedenti. Sono dichiarazioni originali, non stati approvati; ricava disponibilità dalla stessa apertura e dal registro. decisionProof=null rinvia il confronto all’audit separato; non inventare risorse per rendere eseguibile il goal.',data:{packet:options.packet,parentContext,contextHash,frame:frame.value,frameHash,slotId,goal:slot.goal,previousEvents:previous,previousHash,ordinal,previousRejections:history},schema:eventSchema,reserveCalls:reserve+slots.length-i+1,outputCapacity:{scope:options.scope,packetHash:guideHash(options.packet),kind:'guide-finite-turn-event-1'},read,cacheValidation:{id:'guide-finite-turn-event-1',validate:v=>{read(v)}}},options.scope,options.archive)
   },options)
   events.push({slot:slotId,body:event.value.body});refs.push(event.ref)
   if(slot.index===null)body[slot.key]=event.value.body;else body[slot.key].push(event.value.body)
  }
  const declaration={caseId:frame.value.caseId,parentHash:frame.value.parentHash,phase:frame.value.phase,body,development:frame.value.development},nativeHash=guideHash(declaration),prior=known.find(r=>r.value.ordinal===ordinal)
  if(prior){if(prior.value.nativeHash!==nativeHash||guideHash(prior.value.frame)!==guideHash(frame.ref)||guideHash(prior.value.events)!==guideHash(refs))throw Error('Turno frammentato: rifiuto non corrisponde agli originali.');rejected.push(prior.value);continue}
  const fail=(error:unknown)=>{const n:Negative={version:1,contextHash,ordinal,nativeHash,message:error instanceof Error?error.message:String(error),frame:frame.ref,events:refs};options.archive.saveValue(role,guideHash(n),n);rejected.push(n);if(!guideSemanticRetryAllowed(options.archive,ordinal+1))throw new AiFailure('draft-limit','Turno ancora non valido dopo due costruzioni frammentate. '+n.message)}
  try{check(declaration)}catch(error){fail(error);continue}
  // Transport/integrity/budget failures here propagate unchanged: they must
  // not silently purchase an unrelated replacement physical turn.
  const audited=await prepare(declaration,reserve)
  let value:T
  try{value=validate(audited)}catch(error){fail(error);continue}
  const record={version:1,contextHash,ordinal,scope:options.scope,packetHash:guideHash(options.packet),frame:frame.ref,events:refs,declarationHash:nativeHash,valueHash:guideHash(value),requiresIndependentReview:true}
  const old=[...options.archive.values<any>('guide-finite-turn-constructed-v1')].filter(r=>r.value.contextHash===contextHash&&r.value.ordinal===ordinal)
  if(old.some(r=>r.key!==guideHash(r.value)||guideHash(r.value)!==guideHash(record)))throw Error('Turno frammentato: risultato autenticato cambiato.')
  options.archive.saveValue('guide-finite-turn-constructed-v1',guideHash(record),record)
  return value
 }
 throw new AiFailure('draft-limit','Turno frammentato: entrambe le proposte restano respinte; nessuna nuova chiamata automatica.')
}
import {guideSemanticRetryAllowed} from './guide-run-policy'
