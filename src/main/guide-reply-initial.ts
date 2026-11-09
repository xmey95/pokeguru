import {guidePremiseRequest,withGuideSegmentRetry,type GuideSegmentRequest} from './guide-segment-generation'
import {guideSegmentAcceptedUnit} from './guide-segment-batch'
import {guideReplyFork,type GuideReplySeed} from './guide-reply-plan'
import {forkGuideSegments,type GuideSegmentJournal} from './guide-segments'
import type {GuideConstructionRuntime} from './guide-reply-phase'
import {loadGuideSegmentCheckpoint} from './guide-segment-checkpoints'
import {guideHash} from './matchup-guide-packet'
import {assertNativeScenarioSchema} from './guide-scenario-output-schema'
import type {GuidePremiseReview,GuidePremiseGoalEvaluation} from './guide-premise-review'
import {guideReplyObjective} from './guide-reply-objective'

export type GuideReplyInitialReview=GuidePremiseReview&{goalEvaluation:GuidePremiseGoalEvaluation}
/** Historical proof of mechanical premise review, never approval of a goal. */
export function guideReplyLegacyInitialReview(journal:GuideSegmentJournal,options:GuideConstructionRuntime){
 if(!journal.segments.length)return undefined
 return guideSegmentAcceptedUnit(options.archive,guidePremiseRequest(journal,options.scope,options.packet,0,options.archive))
}
/** An executable first turn may still fail its assigned goal. Bind the critic,
 * result and cache to the exact AI objective, without parsing names or prose. */
export function guideReplyInitialRequest(seed:GuideReplySeed,journal:GuideSegmentJournal,options:GuideConstructionRuntime,reserveCalls:number):GuideSegmentRequest<GuideReplyInitialReview>{
 if(guideReplyFork(seed)!==0)throw new Error('Critica obiettivo: richiede una diramazione iniziale esplicita.')
 const {scope,packet,archive}=options,prefix=forkGuideSegments(journal,scope,packet,1),base=guidePremiseRequest(prefix,scope,packet,reserveCalls,archive),main=loadGuideSegmentCheckpoint(archive,scope,packet,journal.setup.id,journal.rootHash)
 if(!main?.segments.length)throw new Error('Critica obiettivo: prima mossa di riferimento mancante.')
 const objective=guideReplyObjective(seed,journal,options),goalHash=guideHash(objective),count=prefix.segments[0].body.events.length,schema=structuredClone(base.schema) as any
 schema.properties.goalEvaluation={type:'object',additionalProperties:false,required:['goalHash','firstTurnSatisfied','eventIndexes','reason'],properties:{goalHash:{type:'string',const:goalHash},firstTurnSatisfied:{type:'boolean'},eventIndexes:{type:'array',maxItems:count,items:{type:'integer',minimum:0,maximum:Math.max(0,count-1)}},reason:{type:'string',minLength:1,maxLength:1600}}};schema.required.push('goalEvaluation')
 const read=(raw:unknown):GuideReplyInitialReview=>{
  assertNativeScenarioSchema(raw,schema);const {goalEvaluation,...review}=raw as GuideReplyInitialReview,checked=base.read(review)
  if(new Set(goalEvaluation.eventIndexes).size!==goalEvaluation.eventIndexes.length||goalEvaluation.eventIndexes.some(i=>i>=count))throw new Error('Critica obiettivo: riferimenti agli eventi duplicati o estranei.')
  if(checked.verdict==='pass'&&!goalEvaluation.firstTurnSatisfied)throw new Error('Critica obiettivo: pass incompatibile con obiettivo iniziale non eseguito.')
  return {...checked,goalEvaluation:structuredClone(goalEvaluation)}
 }
 const {unitKey:unusedKey,retryOrdinal:unusedOrdinal,finalize:unusedFinalize,construct:unusedConstruct,...descriptor}=base,data={...base.data as any};delete data.previousInvalid
 return withGuideSegmentRetry({...descriptor,instructions:base.instructions+' Verifica anche l’adempimento dell’obiettivo del ramo, distinto dalla sola legalità: un turno legale che esegue una mossa diversa da quella richiesta non dimostra l’alternativa.',task:base.task+' Confronta branchObjective.requirements originali, assignments.reason e seed.goal con gli eventi effettivi di questo primo turno e con la mossa di riferimento. I requisiti originali e la motivazione della scelta non possono essere sostituiti da un goal più vago o riferito soltanto a un altro turno. Indica in goalEvaluation se la parte iniziale dell’obiettivo è realmente eseguita, citando gli indici di body.events pertinenti (base zero). Cambiare soltanto l’ordine delle azioni non dimostra un diverso attacco richiesto. Non trattare un attacco soltanto discusso o rinviato come eseguito. Se l’obiettivo iniziale manca, emetti revise e un rilievo first-turn; se impossibile dalla premessa, conserva il limite senza inventare risorse. Gli obiettivi riferiti alla replica e al seguito ancora futuri non vanno certificati ora. Tutti i controlli ordinari della premessa restano obbligatori.',data:{...data,branchObjective:{...objective,goalHash,referenceFirstTurn:main.segments[0].body,fixedOrdinaryDraw:main.segments[0].body.draw}},schema,read,cacheValidation:{id:'guide-reply-initial-goal-1',validate:value=>{read(value)}}},scope,archive)
}
export function guideReplyInitialReview(seed:GuideReplySeed,journal:GuideSegmentJournal,options:GuideConstructionRuntime){
 if(!journal.segments.length)return undefined
 return guideSegmentAcceptedUnit(options.archive,guideReplyInitialRequest(seed,journal,options,0))
}
export function assertGuideReplyInitialReview(seed:GuideReplySeed,journal:GuideSegmentJournal,options:GuideConstructionRuntime,allowLegacyPlanningProof=false){
 if(guideReplyFork(seed)!==0)return
 if(guideReplyInitialReview(seed,journal,options)?.verdict==='pass')return
 // A historical snapshot can inform a repair choice without approving its goal.
 // Construction and metadata always require the new goal-bound pass.
 if(allowLegacyPlanningProof&&guideReplyLegacyInitialReview(journal,options)?.verdict==='pass')return
 throw new Error('Replica iniziale: critica indipendente del primo turno e del suo obiettivo mancante o negativa.')
}
