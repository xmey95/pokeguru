import type {AiAnalysisWork,AiWorkflowInput} from './ai-analysis-work'
import type {AiJobKind} from '../shared/ai-job'
import type {AiJob} from './ai-job-store'
import type {AiRunConfig} from '../shared/ai'
import type {GuidePacket} from './matchup-guide-packet'
import {authorizeGuideUntilValid,guideUntilValidAuthority} from './guide-run-policy'
import {isGuideDelivery} from '../shared/guide-delivery'
import {pinMinimumGuideTransport} from './guide-transport-selection'

/** Only the host's explicit Matchup action creates this marker. Existing
 * workflows keep their original object when reopened by AiAnalysisWork. */
export function appGuideWorkflowInput(kind:AiJobKind,args:unknown[],networkReady:boolean):AiWorkflowInput{
 return {kind,args,...kind.startsWith('matchup-')?{guideVersion:1 as const,...networkReady?{guideConvergence:'until-valid' as const,guideTransport:'minimum-visible-v1' as const}:{}}:{}}
}

export function authorizeAppGuideWorkflow(work:AiAnalysisWork,job:Pick<AiJob,'id'|'kind'|'projectId'|'createdAt'>,packet:GuidePacket,config:AiRunConfig):void{
 const workflow=work.archive.value<AiWorkflowInput>('workflow','input')
 if(workflow?.guideConvergence!=='until-valid'||!isGuideDelivery(packet.basis))return
 if(workflow.schemaVersion!==2||workflow.guideVersion!==1||workflow.kind!==job.kind||!job.kind.startsWith('matchup-')||job.id!==work.id||job.projectId!==work.archive.projectId||job.projectId!==packet.basis.projectId||workflow.guideTransport!==undefined&&workflow.guideTransport!=='minimum-visible-v1')throw Error('La politica della guida non appartiene alla richiesta utente corrente.')
 authorizeGuideUntilValid(work.archive,packet,config,'user:app-guide:'+job.id,job.createdAt)
 if(workflow.guideTransport==='minimum-visible-v1')pinMinimumGuideTransport(work.archive,packet,config)
}

/** A direct internal call cannot purchase a guide without either explicit
 * host authority or a persisted legacy app request with its bounded policy. */
export function hasAppGuideNetworkAuthority(work:AiAnalysisWork):boolean{
 if(guideUntilValidAuthority(work.archive))return true
 const workflow=work.archive.value<AiWorkflowInput>('workflow','input')
 return workflow?.schemaVersion===2&&workflow.guideVersion===1&&workflow.guideConvergence===undefined&&workflow.kind.startsWith('matchup-')
}
