import type {AiEvidenceArchive} from './ai-evidence-archive'
import type {GuidePacket} from './matchup-guide-packet'
import {guideHash} from './matchup-guide-packet'
import {appendGuideSegment,createGuideSegments,forkGuideSegments,type GuideSegmentScope} from './guide-segments'
import {guideSegmentCheckpointFeedback,loadGuideSegmentCheckpoint,saveGuideSegmentCheckpoint} from './guide-segment-checkpoints'
import {GuidePremiseSetupRejected,guidePremiseRequest,guideTurnDeclarationRequest,type GuideSegmentCaller,type GuideSegmentRequest,type GuideTurnDeclaration,type SavedPremiseReview} from './guide-segment-generation'
import {readGuidePremiseReview,type GuidePremiseReview} from './guide-premise-review'
import {runGuideSegmentPhase,type GuideSegmentUnit} from './guide-segment-scheduler'
import type {GuideBudgetResult} from './guide-request-budget'
import {readGuideSegmentRepairFeedback,type GuideSegmentRepairFeedback} from './guide-segment-repair-feedback'
import {guidePremiseRepairRouteRequest,guidePremiseTextRepairRequest,type GuidePremiseRepairRoute} from './guide-premise-text-repair'
import {guideOutputCapacity,guideOutputGroupCount} from './guide-output-capacity'
import {GUIDE_FINITE_ANALYSIS_CONTRACT} from '../shared/guide-analysis-scope'
import {readKnownFinitePremiseRoute} from './guide-finite-premise-audit'
import {isGuideDelivery} from '../shared/guide-delivery'

export function guideMainFutureCalls(states:{journal:{segments:unknown[]}}[],phase:number,capacity:number,fragmented=false):number{
 if(fragmented)return (phase<2?states.filter(s=>s.journal.segments.length<2).length*3:0)+(phase<3?states.filter(s=>s.journal.segments.length<3).length*4:0)+(phase===0?states.length:0)
 const opponent=phase<2?guideOutputGroupCount(states.filter(s=>s.journal.segments.length<2).length,capacity):0
 const next=phase<3?guideOutputGroupCount(states.filter(s=>s.journal.segments.length<3).length,capacity):0
 return opponent+next+(phase===0?1:0)
}

/** All cases share phase calls but retain separate validated states. A negative
 * premise rolls back its own case; accepted sibling cases remain untouched. */
export async function constructGuideMainLines(options:{setups:Record<string,any>[];scope:GuideSegmentScope;packet:GuidePacket;archive:Pick<AiEvidenceArchive,'id'|'projectId'|'value'|'values'|'saveValue'>;call:GuideSegmentCaller;estimate:(r:GuideSegmentRequest<any>)=>GuideBudgetResult;isCached:(r:GuideSegmentRequest<any>)=>boolean;remainingCalls:()=>number;reserveOutside:number;check:()=>void}){
  const {archive,scope,packet}=options
  if(!Number.isSafeInteger(options.reserveOutside)||options.reserveOutside<0)throw new Error('Riserva delle fasi successive non valida.')
  if(!options.setups.length||new Set(options.setups.map(s=>s.id)).size!==options.setups.length)throw new Error('Casi principali mancanti o duplicati.')
  const states=options.setups.map(setup=>{
    const root=createGuideSegments(setup,scope,packet),journal=loadGuideSegmentCheckpoint(archive,scope,packet,setup.id,root.rootHash)??root
    saveGuideSegmentCheckpoint(archive,scope,packet,journal)
    const previous=guideSegmentCheckpointFeedback(archive,scope,packet,setup.id,root.rootHash)
    let feedback:SavedPremiseReview|undefined,repairFeedback:GuideSegmentRepairFeedback|undefined
    if(previous){
      repairFeedback=readGuideSegmentRepairFeedback(archive,scope,packet,previous.reviewHash)
      if(!repairFeedback){
      feedback=archive.value<SavedPremiseReview>('guide-premise-review-v1',previous.reviewHash)
      if(!feedback||guideHash(feedback)!==previous.reviewHash||feedback.prefix.rootHash!==root.rootHash)throw new Error('Feedback della premessa mancante o estraneo.')
      readGuidePremiseReview(feedback.review,feedback.prefix,scope,packet)
      if(feedback.review.repairScope==='setup'||packet.basis.analysisContract===GUIDE_FINITE_ANALYSIS_CONTRACT&&readKnownFinitePremiseRoute(feedback.prefix,feedback.review,options)?.mode!=='original')throw new GuidePremiseSetupRejected(feedback.review,feedback.prefix)
      }
    }
    return {root,journal,feedback,repairFeedback,route:undefined as GuidePremiseRepairRoute|undefined,premise:undefined as GuidePremiseReview|undefined}
  })
  for(;;){
    options.check()
    const rank=(s:typeof states[number])=>!s.journal.segments.length?0:!s.premise?1:isGuideDelivery(packet.basis)?4:s.journal.segments.length<3?s.journal.segments.length+1:4
    const phase=Math.min(...states.map(rank))
    if(phase===4)return states.map(s=>({journal:s.journal,premise:s.premise!}))
    const selected=states.filter(s=>rank(s)===phase)
    const capacity=guideOutputCapacity(guideTurnDeclarationRequest(selected[0].root,scope,packet,{reserveCalls:0}),archive)
    const reserve=options.reserveOutside+(isGuideDelivery(packet.basis)?(phase===0?states.length:0):Math.max(states.some(s=>s.journal.segments.length<3)?3-phase:0,guideMainFutureCalls(states,phase,capacity,packet.basis.analysisContract===GUIDE_FINITE_ANALYSIS_CONTRACT)))
    if(phase===1){
      const units:GuideSegmentUnit<GuidePremiseReview>[]=selected.map(state=>({id:state.root.setup.id,request:()=>guidePremiseRequest(state.journal,scope,packet,reserve,archive),accept:review=>{
        const prefix=forkGuideSegments(state.journal,scope,packet,1),saved:SavedPremiseReview={prefix,review},reviewHash=guideHash(saved)
        archive.saveValue('guide-premise-review-v1',reviewHash,saved)
        if(review.verdict==='pass'){state.premise=review;return}
        state.journal=state.root;state.feedback=saved;state.repairFeedback=undefined
        saveGuideSegmentCheckpoint(archive,scope,packet,state.journal,{reviewHash,reason:review.findings.map(f=>f.message).join('\n')})
        if(review.repairScope==='setup'||packet.basis.analysisContract===GUIDE_FINITE_ANALYSIS_CONTRACT&&readKnownFinitePremiseRoute(prefix,review,options)?.mode!=='original')throw new GuidePremiseSetupRejected(review,prefix)
      }}))
      await runGuideSegmentPhase(units,{...options,stage:'review-premise-main'})
    }else{
      // Preserve all historical construction/review identities. Ambiguous old
      // first-turn findings acquire a separate paid routing decision; they are
      // never inferred to be textual from wording, severity or card names.
      const routing=phase===0&&packet.basis.promptVersion==='matchup-guide-28'&&packet.basis.analysisContract!==GUIDE_FINITE_ANALYSIS_CONTRACT?selected.filter(s=>s.feedback&&!s.route&&!s.feedback.review.findings.some(f=>f.proposedActions.length||f.counterlines.length)):[]
      if(routing.length)await runGuideSegmentPhase<GuidePremiseRepairRoute>(routing.map(state=>({id:state.root.setup.id,request:()=>guidePremiseRepairRouteRequest(state.feedback!,scope,packet,reserve+selected.length,archive),accept:route=>{state.route=route}})),{...options,stage:'review-premise-repair-routing'})
      const units:GuideSegmentUnit<GuideTurnDeclaration>[]=selected.map(state=>({id:state.root.setup.id,request:()=>state.route?.mode==='text'?guidePremiseTextRepairRequest(state.feedback!,state.route,scope,packet,reserve,archive):guideTurnDeclarationRequest(state.journal,scope,packet,{reserveCalls:reserve,feedback:state.feedback,repairFeedback:state.repairFeedback,archive}),accept:value=>{
        state.journal=appendGuideSegment(state.journal,scope,packet,value.body,value.development)
        saveGuideSegmentCheckpoint(archive,scope,packet,state.journal);state.feedback=undefined;state.repairFeedback=undefined;state.route=undefined
      }}))
      await runGuideSegmentPhase(units,{...options,stage:'segments-main-'+(['ours','','opponent','next'][phase])})
    }
  }
}
