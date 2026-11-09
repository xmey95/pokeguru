import {join} from 'node:path'
import {ProjectStore} from '../../src/main/project-store'
import {AiJobStore} from '../../src/main/ai-job-store'
import {AiAnalysisWork} from '../../src/main/ai-analysis-work'
import {AiEvidenceArchive} from '../../src/main/ai-evidence-archive'
import {authorizeGuideUntilValid,guideUntilValidAuthority} from '../../src/main/guide-run-policy'
import {guideHash,type GuidePacket} from '../../src/main/matchup-guide-packet'
import type {AiRunConfig} from '../../src/shared/ai'

export interface UntilValidStartInput{
 database:string;directory:string;campaignId:string;caseId:string;projectId:string
 packet:GuidePacket;config:AiRunConfig;calibration:unknown[];request:string
 authorityReference:string;approvedAt:string;resumeJobId?:string
}
export function untilValidCampaignResource(campaignId:string,caseId:string){
 if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(campaignId)||!caseId.trim())throw Error('Identità della campagna non valida.')
 return 'until-valid:campaign:'+campaignId+':'+guideHash(caseId)
}
/** Identical startup for offline copies and real jobs. Historical resources
 * and their failed content remain intact; no authority is retrofitted. */
export function startUntilValidCampaignCase(input:UntilValidStartInput){
 if(!input.config||input.config.provider!=='codex'||!['global','override'].includes(input.config.source)||[input.config.model,input.config.reasoningEffort].some(v=>v!==null&&(typeof v!=='string'||!v.trim())))throw Error('Configurazione AI congelata assente o non valida.')
 const resourceId=untilValidCampaignResource(input.campaignId,input.caseId),projects=new ProjectStore(input.database)
 let jobs:AiJobStore|undefined,work:AiAnalysisWork|undefined,activeId:string|undefined
 try{
  if(input.packet.basis.projectId!==input.projectId||projects.getCurrentDeckHash(input.projectId)!==input.packet.basis.deckHash)throw Error('La lista corrente non coincide con quella congelata.')
  jobs=new AiJobStore(input.database)
  const existing=jobs.latest(input.projectId,resourceId)
  if(input.resumeJobId){
   if(existing?.id!==input.resumeJobId||existing.status!=='interrupted')throw Error('Ripresa estranea al job interrotto.')
   const original=new AiEvidenceArchive(input.database,{id:existing.id,projectId:input.projectId,resourceId},true)
   try{if(!guideUntilValidAuthority(original))throw Error('Il job non possiede autorità until-valid.');authorizeGuideUntilValid(original,input.packet,input.config,input.authorityReference,input.approvedAt)}finally{original.close()}
   jobs.retryAfterIntervention(existing.id)
  }
  else if(existing)throw Error('Campagna già avviata sulla risorsa: nessun nuovo job implicito.')
  const job=input.resumeJobId?jobs.resume(input.resumeJobId):jobs.start('matchup-generate',input.projectId,resourceId),controller=new AbortController()
  activeId=job.id
  work=new AiAnalysisWork(join(input.directory,job.id),jobs,job.id,controller.signal)
  authorizeGuideUntilValid(work.archive,input.packet,input.config,input.authorityReference,input.approvedAt)
  work.archive.saveValues(input.calibration.map((value,i)=>({role:'guide-token-sample',key:'inherited-calibration-'+i,value})))
  if(input.resumeJobId){const receipt={at:new Date().toISOString(),authorityReference:input.authorityReference,jobId:job.id,reason:'Explicit continuous until-valid intervention; same job, originals and failures retained.'};work.archive.saveValue('guide-operator-intervention-v1',guideHash(receipt),receipt)}
  const boundJobs=jobs,boundWork=work
  return {projects,jobs:boundJobs,work:boundWork,job,controller,resourceId,generation:{packet:input.packet,config:input.config,work:boundWork,request:input.request},close(){boundWork.close();boundJobs.close();projects.close()}}
 }catch(error){if(activeId&&jobs?.get(activeId)?.status==='running')jobs.suspend(activeId,error instanceof Error?error.message:'Startup failed','failure');work?.close();jobs?.close();projects.close();throw error}
}
