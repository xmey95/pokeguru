import {matchingEvidenceValues} from './ai-evidence-selection'
import {guideHash} from './matchup-guide-packet'
import {guideSegmentDeclarations,verifyGuideSegments,type GuideSegmentJournal} from './guide-segments'
import type {GuideReplySeed} from './guide-reply-plan'
import type {GuideConstructionRuntime} from './guide-reply-phase'
import {withGuideSegmentRetry,type GuideSegmentRequest} from './guide-segment-generation'
import {runGuideSegmentPhase} from './guide-segment-scheduler'
import {guideSegmentUnitIdentity} from './guide-segment-batch'
import {readAcceptedGuideTransport} from './guide-transport-evidence'
import {assertNativeScenarioSchema} from './guide-scenario-output-schema'
import {guideFiniteInstructions} from './guide-finite-instructions'
import {GUIDE_FINITE_ANALYSIS_CONTRACT,validGuideAnalysisScope,type GuideAnalysisScope} from '../shared/guide-analysis-scope'
import {AiFailure} from './ai-failure'
import {isGuideDelivery} from '../shared/guide-delivery'

export interface GuideFinitePlan {caseId:string;rootHash:string;mainHash:string;packetHash:string;replies:GuideReplySeed[];analysisScope:GuideAnalysisScope;reason:string;sourceIds:string[]}
interface PlanReview{caseId:string;planHash:string;verdict:'pass'|'revise'|'incomplete';findings:string[];checks:{relevance:boolean;conditions:boolean;competence:boolean;boundedClaims:boolean};reason:string;sourceIds:string[]}
const object=(properties:Record<string,any>)=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false})
const literal=(value:string)=>({type:'string',const:value}),text={type:'string',minLength:1,maxLength:4000,pattern:'\\S'}
function sourceSchema(options:Pick<GuideConstructionRuntime,'packet'>){return {type:'array',minItems:1,maxItems:30,items:{type:'string',enum:options.packet.sources.map(s=>s.id)}}}
function planSchema(main:GuideSegmentJournal,options:Pick<GuideConstructionRuntime,'packet'>){
  const ids=Array.from({length:4},(_,i)=>`${main.setup.id}-reply-${i+1}`),id={type:'string',enum:ids},sources=sourceSchema(options)
  const category=object({replyId:{anyOf:[id,{type:'null'}]},reason:text,sourceIds:sources})
  return object({caseId:literal(main.setup.id),rootHash:literal(main.rootHash),mainHash:literal(main.segments.at(-1)!.hash),packetHash:literal(guideHash(options.packet)),
    replies:{type:'array',minItems:2,maxItems:isGuideDelivery(options.packet.basis)?2:4,items:object({id,role:{type:'string',enum:['direct','access','defend','other']},intent:{type:'string',enum:['attack','defend']},goal:{...text,maxLength:1600},sourceIds:sources})},
    analysisScope:object({contract:literal(GUIDE_FINITE_ANALYSIS_CONTRACT),horizon:literal('ours-opponent-ours'),comparedReplyIds:{type:'array',minItems:2,maxItems:4,items:id},access:category,defend:category,limits:{type:'array',minItems:1,maxItems:8,items:text}}),reason:text,sourceIds:sources})
}
export function readGuideFinitePlan(raw:unknown,main:GuideSegmentJournal,options:Pick<GuideConstructionRuntime,'packet'|'scope'>):GuideFinitePlan{
  verifyGuideSegments(main,options.scope,options.packet)
  if(main.segments.length!==(isGuideDelivery(options.packet.basis)?1:3)||options.packet.basis.analysisContract!==GUIDE_FINITE_ANALYSIS_CONTRACT)throw Error('Piano finito: main incompleta o contratto estraneo.')
  assertNativeScenarioSchema(raw,planSchema(main,options));const plan=raw as GuideFinitePlan,ids=plan.replies.map(s=>s.id)
  if(!validGuideAnalysisScope(plan.analysisScope)||new Set(ids).size!==ids.length||ids.length!==plan.analysisScope.comparedReplyIds.length||ids.some(id=>!plan.analysisScope.comparedReplyIds.includes(id)))throw Error('Piano finito: copertura duplicata o diversa dalle risposte.')
  if(plan.replies.filter(s=>s.role==='direct').length!==1||!plan.replies.some(s=>s.intent==='attack')||plan.replies.some(s=>s.role==='direct'&&s.intent!=='attack'||s.role==='defend'&&s.intent!=='defend'))throw Error('Piano finito: pressione diretta o intenti incoerenti.')
  for(const kind of ['access','defend'] as const){const seeds=plan.replies.filter(s=>s.role===kind);if(seeds.length>1||plan.analysisScope[kind].replyId!==(seeds[0]?.id??null))throw Error('Piano finito: categoria dichiarata senza il proprio ramo o omissione esplicita.')}
  return structuredClone(plan)
}
function proposalRequest(main:GuideSegmentJournal,options:GuideConstructionRuntime,previous?:{plan:GuideFinitePlan;review:PlanReview}):GuideSegmentRequest<GuideFinitePlan>{
  const schema=planSchema(main,options),read=(raw:unknown)=>readGuideFinitePlan(raw,main,options)
  const legacy=withGuideSegmentRetry({stage:'finite-plan-'+main.setup.id,role:'constructor',instructions:guideFiniteInstructions('plan'),task:'Definisci soltanto il piano finito delle risposte del caso; la pertinenza sarà riesaminata prima dei turni.',
    data:{packet:options.packet,main:guideSegmentDeclarations(main,options.scope,options.packet),mainHash:main.segments.at(-1)!.hash,...previous?{previous}:{}},schema,reserveCalls:options.reserveOutside+1,read,cacheValidation:{id:'guide-finite-plan-1',validate:value=>{read(value)}}},options.scope,options.archive)
  if(!isGuideDelivery(options.packet.basis)||!guideUntilValidAuthority(options.archive))return legacy
  const accepted=new Set([...options.archive.values<any>('guide-segment-unit-result-v1')].filter(r=>r.value.accepted).map(r=>r.value.unitId))
  if([...options.archive.values<any>('guide-finite-request-v1')].some(r=>accepted.has(r.value.unitId)&&r.value.scopeHash===guideHash(options.scope)&&r.value.request.validationId==='guide-finite-plan-1'&&guideHash(r.value.request.data)===guideHash(legacy.data)))return legacy
  const ids=[main.setup.id+'-reply-1',main.setup.id+'-reply-2'],bound=structuredClone(schema)
  bound.properties.replies.items.properties.id={type:'string',enum:ids}
  bound.properties.analysisScope.properties.comparedReplyIds={type:'array',minItems:2,maxItems:2,items:{type:'string',enum:ids},const:ids}
  for(const kind of ['access','defend'] as const)bound.properties.analysisScope.properties[kind].properties.replyId={anyOf:[{type:'string',enum:ids},{type:'null'}]}
  const modern=(raw:unknown)=>{assertNativeScenarioSchema(raw,bound);return read(raw)}
  return withGuideSegmentRetry({...legacy,instructions:guideFiniteInstructions('plan',2),
    task:'Definisci il solo piano di questo caso: esattamente due risposte con gli identificativi forniti. comparedReplyIds deve elencare quelle stesse due risposte. Una è pressione diretta; scegli autonomamente la seconda fra accesso, difesa o altra risposta pertinente. La categoria non scelta ha replyId=null, motivo e fonti; non dichiararla confrontata. Nessun turno futuro da costruire ora. La selezione sarà riesaminata indipendentemente.',
    schema:bound,read:modern,cacheValidation:{id:'guide-finite-plan-2',validate:value=>{modern(value)}}},options.scope,options.archive)
}
function criticRequest(main:GuideSegmentJournal,plan:GuideFinitePlan,producerId:string,options:GuideConstructionRuntime):GuideSegmentRequest<PlanReview>{
  const sources=sourceSchema(options),schema=object({caseId:literal(main.setup.id),planHash:literal(guideHash(plan)),verdict:{type:'string',enum:['pass','revise','incomplete']},findings:{type:'array',maxItems:12,items:text},checks:object(Object.fromEntries(['relevance','conditions','competence','boundedClaims'].map(k=>[k,{type:'boolean'}]))),reason:text,sourceIds:sources})
  const read=(raw:unknown):PlanReview=>{assertNativeScenarioSchema(raw,schema);const value=raw as PlanReview;if(value.verdict==='pass'?(value.findings.length||Object.values(value.checks).some(v=>!v)):!value.findings.length)throw Error('Critica del piano finito: verdetto senza controlli o rilievi coerenti.');return structuredClone(value)}
  const modern=options.archive.value<any>('guide-finite-request-v1',producerId)?.request.validationId==='guide-finite-plan-2'
  return withGuideSegmentRetry({stage:'finite-plan-review-'+main.setup.id,role:'critic',instructions:guideFiniteInstructions('review',modern?2:4)+'\nQuesta è la revisione indipendente del solo PIANO. Le risposte sono intenzioni, non turni già costruiti. Valuta pertinenza, fattibilità dalle fonti, condizioni, categorie non confrontate e limiti; non richiedere i registri futuri o la prosa.',task:modern?'Riesamina il piano di due risposte prima della costruzione. Verifica le categorie esplicitamente non confrontate, senza trasformarle in linee già eseguite.':'Riesamina il piano prima della costruzione, senza aumentarne il massimo di quattro risposte.',data:{packet:options.packet,main:guideSegmentDeclarations(main,options.scope,options.packet),plan,producerId},schema,reserveCalls:options.reserveOutside,read,cacheValidation:{id:modern?'guide-finite-plan-review-2':'guide-finite-plan-review-1',validate:value=>{read(value)}}},options.scope,options.archive)
}
/** Two bounded content rounds, with transport retries separately bounded by
 * the finite runtime. Reopen revalidates paid children rather than calling AI. */
export async function constructGuideFinitePlans(mains:GuideSegmentJournal[],options:GuideConstructionRuntime):Promise<GuideFinitePlan[]>{
  const result:GuideFinitePlan[]=[]
  for(const [index,main]of mains.entries()){
    // This implementation plans cases sequentially; each remaining case still
    // needs its own proposal and independent critic before native execution.
    const current={...options,reserveOutside:options.reserveOutside+2*(mains.length-index-1)}
    let previous:{plan:GuideFinitePlan;review:PlanReview}|undefined
    for(let round=0;guideSemanticRetryAllowed(options.archive,round);round++){
      const request=options.prepareRequest!(proposalRequest(main,current,previous));let plan:GuideFinitePlan|undefined
      await runGuideSegmentPhase([{id:main.setup.id,request:()=>request,accept:value=>{plan=value}}],{...options,stage:'finite-plans'})
      const acceptedRequest=options.prepareRequest!(proposalRequest(main,current,previous))
      const producerId=guideSegmentUnitIdentity(acceptedRequest).unitId,source=[...matchingEvidenceValues<any>(options.archive,'guide-segment-unit-result-v1','unitId',producerId)].find(r=>r.value.unitId===producerId&&r.value.accepted)
      if(!source||!plan)throw Error('Piano finito: risposta originale accettata mancante.')
      readAcceptedGuideTransport(acceptedRequest,source,options.archive)
      const reviewRequest=options.prepareRequest!(criticRequest(main,plan,producerId,current));let review:PlanReview|undefined
      if(guideSegmentUnitIdentity(reviewRequest).unitId===producerId)throw Error('Piano finito: riesame non indipendente.')
      await runGuideSegmentPhase([{id:main.setup.id,request:()=>reviewRequest,accept:value=>{review=value}}],{...options,stage:'finite-plan-reviews'})
      if(!review)throw Error('Piano finito: riesame mancante.')
      if(review.verdict==='pass'){result.push(plan);break}
      if(review.verdict==='incomplete'&&!guideUntilValidAuthority(options.archive))throw new AiFailure('draft-limit','Piano finito non valutabile dalle fonti disponibili: nessuna replica costruita.')
      previous={plan,review}
      if(!guideSemanticRetryAllowed(options.archive,round+1))throw new AiFailure('draft-limit','Piano finito respinto dopo due riesami: nessuna espansione automatica o replica artificiale.')
    }
  }
  return result
}
import {guideSemanticRetryAllowed,guideUntilValidAuthority} from './guide-run-policy'
