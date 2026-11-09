import type {AiEvidenceArchive} from './ai-evidence-archive'
import {guideHash,type GuidePacket} from './matchup-guide-packet'
import {appendGuideSegment,forkGuideSegments,verifyGuideSegments,type GuideSegmentJournal,type GuideSegmentScope} from './guide-segments'
import {forkGuideSegmentCheckpoint,guideSegmentForkLine,loadGuideSegmentCheckpoint,saveGuideSegmentCheckpoint,guideSegmentCheckpointFeedback,type GuideSegmentLine} from './guide-segment-checkpoints'
import {readGuideSegmentRepairFeedback} from './guide-segment-repair-feedback'
import {guideReplyPlanRequest,readGuideReplyPlan,guideReplySeeds,guideReplyFork,type GuideReplyPlan,type GuideReplySeed,type GuideReplyPlanRepair} from './guide-reply-plan'
import {guideTurnDeclarationRequest,GuidePremiseSetupRejected,type SavedPremiseReview,type GuideSegmentCaller,type GuideSegmentRequest,type GuideTurnDeclaration} from './guide-segment-generation'
import {readGuidePremiseReview} from './guide-premise-review'
import {guideReplyInitialReview,guideReplyInitialRequest,guideReplyLegacyInitialReview,assertGuideReplyInitialReview,type GuideReplyInitialReview} from './guide-reply-initial'
import {runGuideSegmentPhase,type GuideSegmentUnit} from './guide-segment-scheduler'
import type {GuideBudgetResult} from './guide-request-budget'
import {readGuideAccessTurn} from '../shared/guide-native-decisions'
import {guideSegmentRetry} from './guide-segment-batch'
import {guideOutputCapacity,guideOutputGroupCount} from './guide-output-capacity'
import {guideReplyObjective} from './guide-reply-objective'
import {guideReplyReferenceTurns} from './guide-reply-turn-references'

export interface GuideReplyConstruction {caseId:string;seed:GuideReplySeed;line:GuideSegmentLine;journal:GuideSegmentJournal;terminal:boolean}
export type GuideConstructionRuntime={deliveryLineId?:string;deliveryAuditKey?:string;deliveryReserveKeys?:string[];preflight?:(requests:GuideSegmentRequest<any>[])=>void;scope:GuideSegmentScope;packet:GuidePacket;evidencePacket?:GuidePacket;evidenceAnchor?:GuidePacket;archive:Pick<AiEvidenceArchive,'id'|'projectId'|'saveValue'|'value'|'values'>;call:GuideSegmentCaller;estimate:(r:GuideSegmentRequest<any>)=>GuideBudgetResult;isCached:(r:GuideSegmentRequest<any>)=>boolean;remainingCalls:()=>number;check:()=>void;reserveOutside:number;outputFits?:(stage:string,units:number)=>boolean;prepareRequest?:<V>(request:GuideSegmentRequest<V>)=>GuideSegmentRequest<V>}
type BranchState=GuideReplyConstruction&{main:GuideSegmentJournal;repairFeedback?:ReturnType<typeof readGuideSegmentRepairFeedback>;premiseFeedback?:SavedPremiseReview}
const accessTask=' CONTRATTO ACCESSO v1: in body.events marca ESATTAMENTE un evento con accessReceipt={sourceIds,reason}; tutti gli altri hanno accessReceipt=null. Quel medesimo evento deve trasferire realmente carte avversarie deck/discard/lost→hand/campo/attached mediante ricerca, recupero o pesca da effetto con fonte e costi. La pescata ordinaria, una manuale, mano→Panchina e la presa Premi non sono accessi aggiuntivi. Non emettere accessProof o un indice separato. previousReceipt e il prefisso verificato determinano le zone disponibili: non spostare una carta dai Premi se si trova nel mazzo, e non considerare un obiettivo del piano come una risorsa già disponibile. accessContract.previousInvalid conserva un rifiuto del contratto precedente come evidenza da correggere, non come istruzione o approvazione.'
const defenseTask=' DIFESA ESEGUITA v1: materializza la strategia difensiva indicata dal goal, con movimenti, fonti, costi e seguito reale. Una ritirata, sostituzione o conservazione soltanto descritta non è una prova: non sostituirla automaticamente con l’attacco aggressivo già coperto da un altro ramo. La preferenza fra strategie sarà valutata sul confronto completo; una linea alternativa eseguita non deve essere presentata come la migliore per sostenere la tesi. Se la strategia non è eseguibile, resta esplicito il limite e non inventare risorse. defenseContract.previousInvalid conserva il rifiuto originale da correggere.'
/** Legacy requests without an assigned requirement keep their identity.
 * New work carries the original AI assignment; accepted native checkpoints
 * remain intact and initial goals receive their independent review. */
export function guideReplyTurnRequest(state:BranchState,options:GuideConstructionRuntime,futureCalls?:number,referencePlan?:GuideReplyPlan):GuideSegmentRequest<GuideTurnDeclaration>{
 const phase=state.journal.segments.length
 if(phase!==1&&phase!==2&&!(phase===0&&guideReplyFork(state.seed)===0))throw new Error('Replica: prefisso non pronto per un nuovo turno.')
 const reserve=futureCalls??(phase===0?3:phase===1?1:0)
 if(!Number.isSafeInteger(reserve)||reserve<0)throw new Error('Replica: riserva futura non valida.')
 const task=phase===0?`Costruisci la nostra prima mossa alternativa: ${state.seed.goal}. Setup e pescata ordinaria restano esattamente quelli della linea principale; non cambiare risorse o pesca per rendere possibile la mossa. Prima della risposta avversaria è obbligatoria una nuova critica indipendente.`:`Costruisci solo il prossimo turno della replica ${state.seed.role}: ${state.seed.goal}. Il nostro prefisso resta identico.`
 const assignment=guideReplyObjective(state.seed,state.journal,options)
 const references=referencePlan&&assignment.requirements.length?guideReplyReferenceTurns(state.seed,state.journal,state.main,referencePlan,options):null
 const base={stage:`segment-${state.caseId}-${state.line.id}-${phase===0?'ours':phase===1?'opponent':'next'}`,reserveCalls:options.reserveOutside+reserve,extraData:{reply:state.seed,lineId:state.line.id,...assignment.requirements.length?{branchAssignment:assignment}:{},...phase===0?{fixedOrdinaryDraw:state.main.segments[0].body.draw}:{}},feedback:state.premiseFeedback,repairFeedback:state.repairFeedback,task:task+(assignment.requirements.length?' Esegui la parte di branchAssignment.requirements relativa a questo turno, considerando anche la motivazione AI originale della scelta; il goal abbreviato non sostituisce quei requisiti. Non trattare azioni soltanto discusse come eseguite.':''),archive:options.archive,validateBody:(body:Record<string,any>)=>{
  if(phase===1&&state.seed.role==='access')readGuideAccessTurn(state.caseId,body.events)
  if(phase===0){
   const original=state.main.segments[0].body
   if(guideHash(body.draw)!==guideHash(original.draw))throw new Error('Replica iniziale: pescata ordinaria diversa dalla posizione condivisa.')
   if(guideHash(body.events)===guideHash(original.events))throw new Error('Replica iniziale: prima mossa identica alla linea principale; nessuna alternativa materializzata.')
  }
 }}
 if(references){
  Object.assign(base.extraData,{referenceTurns:references})
  base.task+=' RIFERIMENTI DI CONFRONTO: referenceTurns contiene le dichiarazioni AI storiche esatte della stessa fase, dal contesto scelto dal pianificatore. Per riprodurre un ramo citato dal goal, consulta quelle pescate, azioni, costi e Premi e conserva le condizioni richieste. beforeReceipt e receipt appartengono al ramo storico: non sono risorse nuove del ramo corrente. Il prefisso corrente resta vincolante; confronta le differenze senza inventare equivalenze o nuove carte. Questi riferimenti non sono approvazioni; conti, obiettivi e critica indipendente restano obbligatori.'
 }
 const original=guideTurnDeclarationRequest(state.journal,options.scope,options.packet,base)
 if(phase!==1||!['access','defend'].includes(state.seed.role))return original
 const previousInvalid=original.unitKey?guideSegmentRetry(options.archive,original.unitKey):null
 if(state.seed.role==='defend')return guideTurnDeclarationRequest(state.journal,options.scope,options.packet,{...base,task:base.task+defenseTask,extraData:{...base.extraData,defenseContract:{version:1,previousUnitKey:original.unitKey,previousInvalid}}})
 return guideTurnDeclarationRequest(state.journal,options.scope,options.packet,{...base,task:base.task+accessTask,extraData:{...base.extraData,accessContract:{version:1,requiredReceipts:1,previousUnitKey:original.unitKey,previousInvalid}}})
}
/** Future opponent results may terminate a branch, but until that is derived
 * its next turn still needs a slot at the learned native batch capacity. */
export function guideReplyFutureCalls(states:Pick<GuideReplyConstruction,'journal'|'terminal'>[],phase:number,capacity:number,fragmented=false):number{
 if(phase!==0&&phase!==1)return 0
 const opponent=phase===0?states.filter(s=>!s.terminal&&s.journal.segments.length<2).length:0
 const pending=states.filter(s=>!s.terminal&&s.journal.segments.length<3&&!s.journal.segments.at(-1)?.receipt?.terminal).length
 return fragmented?opponent*3+pending*4:guideOutputGroupCount(opponent,capacity)+guideOutputGroupCount(pending,capacity)
}
export async function constructGuideReplyPlans(mains:GuideSegmentJournal[],options:GuideConstructionRuntime,repairs=new Map<string,GuideReplyPlanRepair>()):Promise<GuideReplyPlan[]>{
  if(!mains.length||!Number.isSafeInteger(options.reserveOutside)||options.reserveOutside<0)throw new Error('Piani repliche: casi o riserva non validi.')
  const plans=new Map<string,GuideReplyPlan>()
  const units:GuideSegmentUnit<GuideReplyPlan>[]=mains.map(main=>({id:main.setup.id,request:()=>guideReplyPlanRequest(main,options.scope,options.packet,options.reserveOutside+2,options.archive,repairs.get(main.setup.id)),accept:plan=>{plans.set(main.setup.id,plan)}}))
  await runGuideSegmentPhase(units,{...options,stage:'branch-plan-cases'})
  return mains.map(main=>plans.get(main.setup.id)!)
}
/** A repair decision needs the exact completed historical branches as evidence.
 * Reading that evidence must neither construct turns nor upgrade critics.
 * Legacy premise proof is allowed here only to inform planning: execution and
 * metadata still require the goal-bound review before any continuation. */
export function readGuideReplyBranchSnapshots(mains:GuideSegmentJournal[],plans:GuideReplyPlan[],options:GuideConstructionRuntime):GuideReplyConstruction[]{
 const {archive,scope,packet}=options
 if(!mains.length||plans.length!==mains.length||new Set(plans.map(p=>p.caseId)).size!==plans.length)throw new Error('Snapshot repliche: casi o piani mancanti o duplicati.')
 return mains.flatMap(main=>{
  verifyGuideSegments(main,scope,packet)
  const selected=loadGuideSegmentCheckpoint(archive,scope,packet,main.setup.id,main.rootHash),plan=plans.find(p=>p.caseId===main.setup.id)
  if(!selected||guideHash(selected)!==guideHash(main)||!plan)throw new Error('Snapshot repliche: linea principale mancante o superata.')
  readGuideReplyPlan(main,scope,packet,plan)
  return guideReplySeeds(plan).map(seed=>{
   const fork=guideReplyFork(seed),line=guideSegmentForkLine(archive,scope,packet,main.setup.id,main.rootHash,'reply-'+guideHash(seed),fork),journal=loadGuideSegmentCheckpoint(archive,scope,packet,main.setup.id,main.rootHash,line)
   if(!journal?.segments.length)throw new Error('Snapshot repliche: ramo storico mancante, nessuna costruzione implicita.')
   verifyGuideSegments(journal,scope,packet)
   const terminal=journal.segments.at(-1)!.receipt.terminal===true
   if(!terminal&&journal.segments.length!==3)throw new Error('Snapshot repliche: ramo storico incompleto, nessuna costruzione implicita.')
   if(fork===1&&journal.segments[0].hash!==main.segments[0].hash||fork===0&&guideHash(journal.segments[0].body.draw)!==guideHash(main.segments[0].body.draw))throw new Error('Snapshot repliche: prima mossa o pescata fuori dal prefisso condiviso.')
   assertGuideReplyInitialReview(seed,journal,options,true)
   return {caseId:main.setup.id,seed,line,journal,terminal,main}
  })
 })
}
/** Response branches share the accepted first turn. Explicit initial forks
 * instead share the setup and draw, then require their own premise critique.
 * Each turn is verified and persisted before its continuation is requested. */
export async function constructGuideReplyBranches(mains:GuideSegmentJournal[],plans:GuideReplyPlan[],options:GuideConstructionRuntime):Promise<GuideReplyConstruction[]>{
  if(plans.length!==mains.length||new Set(plans.map(p=>p.caseId)).size!==plans.length)throw new Error('Piani delle repliche mancanti o duplicati.')
  for(const main of mains){const plan=plans.find(p=>p.caseId===main.setup.id);if(!plan)throw new Error('Piano del caso mancante.');readGuideReplyPlan(main,options.scope,options.packet,plan)}
  return constructGuideSelectedReplyBranches(mains,plans.map(plan=>({caseId:plan.caseId,seeds:guideReplySeeds(plan)})),options,plans)
}

/** Execute exactly the host-admitted selected seeds. No synthetic access or
 * defense role is introduced when a finite plan did not select that category. */
export async function constructGuideSelectedReplyBranches(mains:GuideSegmentJournal[],plans:{caseId:string;seeds:GuideReplySeed[]}[],options:GuideConstructionRuntime,legacyPlans?:GuideReplyPlan[]):Promise<GuideReplyConstruction[]>{
  const {scope,packet,archive}=options
  if(!mains.length||!Number.isSafeInteger(options.reserveOutside)||options.reserveOutside<0)throw new Error('Repliche: casi o riserva non validi.')
  if(plans.length!==mains.length||new Set(plans.map(p=>p.caseId)).size!==plans.length)throw new Error('Piani delle repliche mancanti o duplicati.')
  const states=mains.flatMap(main=>{
    verifyGuideSegments(main,scope,packet)
    const selected=loadGuideSegmentCheckpoint(archive,scope,packet,main.setup.id,main.rootHash)
    if(!selected||guideHash(selected)!==guideHash(main))throw new Error('Piano repliche riferito a una linea principale superata.')
    const plan=plans.find(p=>p.caseId===main.setup.id)
    if(!plan)throw new Error('Piano del caso mancante.')
    if(!plan.seeds.length||new Set(plan.seeds.map(s=>s.id)).size!==plan.seeds.length)throw new Error('Repliche selezionate mancanti o duplicate.')
    return plan.seeds.map(seed=>{
      const fork=forkGuideSegmentCheckpoint(archive,scope,packet,main.setup.id,main.rootHash,'reply-'+guideHash(seed),guideReplyFork(seed))
      const feedback=guideSegmentCheckpointFeedback(archive,scope,packet,main.setup.id,main.rootHash,fork.line)
      const repairFeedback=feedback?readGuideSegmentRepairFeedback(archive,scope,packet,feedback.reviewHash):undefined
      const premiseFeedback=feedback&&!repairFeedback&&guideReplyFork(seed)===0?archive.value<SavedPremiseReview>('guide-premise-review-v1',feedback.reviewHash):undefined
      if(premiseFeedback){if(guideHash(premiseFeedback)!==feedback!.reviewHash||premiseFeedback.prefix.rootHash!==main.rootHash)throw new Error('Replica iniziale: feedback estraneo.');if(premiseFeedback.goalEvaluation)guideReplyInitialRequest(seed,premiseFeedback.prefix,options,0).read({...premiseFeedback.review,goalEvaluation:premiseFeedback.goalEvaluation});else readGuidePremiseReview(premiseFeedback.review,premiseFeedback.prefix,scope,packet)}
      if(feedback&&!repairFeedback&&!premiseFeedback)throw new Error('Replica: feedback di riparazione non verificabile.')
      return {caseId:main.setup.id,seed,line:fork.line,journal:fork.journal,terminal:fork.journal.segments.at(-1)?.receipt.terminal===true,main,repairFeedback,premiseFeedback}
    })
  })
  for(;;){
    options.check()
    const unreviewed=states.filter(s=>guideReplyFork(s.seed)===0&&s.journal.segments.length&&guideReplyInitialReview(s.seed,s.journal,options)?.verdict!=='pass')
    if(unreviewed.length){
      if(unreviewed.some(s=>s.journal.segments.length!==1&&guideReplyLegacyInitialReview(s.journal,options)?.verdict!=='pass'))throw new Error('Replica iniziale: seguito costruito senza critica indipendente del primo turno.')
      const capacity=guideOutputCapacity(guideTurnDeclarationRequest(forkGuideSegments(unreviewed[0].journal,scope,packet,1),scope,packet,{reserveCalls:0}),archive)
      const future=guideReplyFutureCalls(states,0,capacity,packet.basis.analysisContract==='finite-evidence-1')+guideOutputGroupCount(states.filter(s=>!s.journal.segments.length).length,capacity)
      await runGuideSegmentPhase<GuideReplyInitialReview>(unreviewed.map(state=>({id:state.caseId+':'+state.seed.id,request:()=>guideReplyInitialRequest(state.seed,state.journal,options,options.reserveOutside+future),accept:review=>{
        const prefix=forkGuideSegments(state.journal,scope,packet,1),{goalEvaluation,...premise}=review,saved:SavedPremiseReview={prefix,review:premise,goalEvaluation},reviewHash=guideHash(saved)
        archive.saveValue('guide-premise-review-v1',reviewHash,saved)
        if(review.verdict==='pass')return
        state.journal=forkGuideSegments(state.journal,scope,packet,0);state.terminal=false;state.premiseFeedback=saved;state.repairFeedback=undefined
        saveGuideSegmentCheckpoint(archive,scope,packet,state.journal,{reviewHash,reason:review.findings.map(f=>f.message).join('\n')},state.line)
        if(review.repairScope==='setup')throw new GuidePremiseSetupRejected(premise,prefix)
      }})),{...options,stage:'review-premise-replies'})
      continue
    }
    const pending=states.filter(s=>s.journal.segments.length<3&&!s.terminal)
    if(!pending.length)return states
    const phase=Math.min(...pending.map(s=>s.journal.segments.length)),selected=pending.filter(s=>s.journal.segments.length===phase)
    const capacity=guideOutputCapacity(guideReplyTurnRequest(selected[0],options,undefined,legacyPlans?.find(p=>p.caseId===selected[0].caseId)),archive),futureCalls=guideReplyFutureCalls(states,phase,capacity,packet.basis.analysisContract==='finite-evidence-1')+(phase===0?states.filter(s=>guideReplyFork(s.seed)===0&&guideReplyInitialReview(s.seed,s.journal,options)?.verdict!=='pass').length:0)
    const units:GuideSegmentUnit<GuideTurnDeclaration>[]=selected.map(state=>({id:state.caseId+':'+state.seed.id,request:()=>guideReplyTurnRequest(state,options,futureCalls,legacyPlans?.find(p=>p.caseId===state.caseId)),accept:value=>{
      if(state.premiseFeedback&&guideHash([value.body,value.development])===guideHash([state.premiseFeedback.prefix.segments[0].body,state.premiseFeedback.prefix.segments[0].development]))throw new Error('Replica iniziale: primo turno respinto riproposto identico.')
      state.journal=appendGuideSegment(state.journal,scope,packet,value.body,value.development)
      state.terminal=state.journal.segments.at(-1)!.receipt.terminal===true
      saveGuideSegmentCheckpoint(archive,scope,packet,state.journal,null,state.line)
      state.repairFeedback=undefined
      state.premiseFeedback=undefined
    }}))
    await runGuideSegmentPhase(units,{...options,stage:'segments-reply-'+(phase===0?'ours':phase===1?'opponent':'next')})
  }
}
