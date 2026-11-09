/** Offline accounting from authenticated originals. Never opens a provider,
 * writes a database, or treats absent usage as zero billed tokens.
 * Compile with the project's NodeNext tooling, then pass database/job/output. */
import {DatabaseSync} from 'node:sqlite'
import {writeFileSync} from 'node:fs'
import {AiEvidenceArchive} from '../src/main/ai-evidence-archive'
import {guideStageFamily} from '../src/main/guide-request-budget'

const [database,jobId,output]=process.argv.slice(2)
if(!database||!jobId||!output)throw Error('Usage: guide-phase-profile database jobId output.json')
const db=new DatabaseSync(database,{readOnly:true})
const job=db.prepare('SELECT project_id,resource_id FROM ai_jobs WHERE id=?').get(jobId) as {project_id:string;resource_id:string}|undefined
db.close()
if(!job)throw Error('Job missing')
const archive=new AiEvidenceArchive(database,{id:jobId,projectId:job.project_id,resourceId:job.resource_id},true)
try{
 const phases=new Map<string,any>(),failures:Record<string,number>={},seen=new Set<string>()
 const starts=[...archive.values<any>('guide-attempt-start')]
 const dispatches=new Map<number,string>()
 for(const role of ['guide-campaign-provider-dispatch-v1','guide-until-valid-campaign-dispatch-v1'])for(const {value} of archive.values<any>(role)){
  const start=starts.find(r=>r.value.sequence===value.sequence)?.value
  if(!start||start.inputHash!==value.inputHash||dispatches.has(value.sequence)&&dispatches.get(value.sequence)!==value.inputHash)throw Error('Conflicting provider dispatch identity')
  dispatches.set(value.sequence,value.inputHash)
 }
 for(const {key,value:start} of starts){
  const end=archive.value<any>('guide-attempt-end',key),raw=archive.value<any>('guide-raw-response',key)
  if(end&&(end.sequence!==start.sequence||end.inputHash!==start.inputHash||end.stage!==start.stage))throw Error('Conflicting attempt identity')
  if(raw&&(raw.inputHash!==start.inputHash||raw.stage!==start.stage))throw Error('Conflicting raw identity')
  const family=guideStageFamily(start.stage),purpose=/repair|revision/.test(start.stage)?'explicit-repair':start.stage.startsWith('review')?'independent-review':'construction'
  const phase=family+':'+purpose,row=phases.get(phase)??{phase,attempts:0,recordedProviderDispatches:0,completeRawResponses:0,failed:0,unfinished:0,knownInvocationMs:0,missingDuration:0,inputTokens:0,outputTokens:0,cachedInputTokens:0,missingUsage:0,repeatedStageAttempts:0,stages:new Set<string>()}
  row.attempts++;row.stages.add(start.stage)
  if(dispatches.has(start.sequence))row.recordedProviderDispatches++
  if(seen.has(start.stage))row.repeatedStageAttempts++;seen.add(start.stage)
  if(raw)row.completeRawResponses++
  if(!end||end.status==='running')row.unfinished++;else if(end.status==='failed')row.failed++
  if(end&&Number.isFinite(end.durationMs)&&end.durationMs>=0)row.knownInvocationMs+=end.durationMs;else row.missingDuration++
  if(end?.usage){if(end.usage.cachedInputTokens>end.usage.inputTokens)throw Error('Cached input exceeds total input');for(const field of ['inputTokens','outputTokens','cachedInputTokens']){const n=end.usage[field];if(!Number.isSafeInteger(n)||n<0)throw Error('Invalid recorded usage');row[field]+=n}}else row.missingUsage++
  const failure=archive.value<any>('guide-attempt-failure',key)
  if(failure)failures[failure.code??'unspecified']=(failures[failure.code??'unspecified']??0)+1
  phases.set(phase,row)
 }
 const rows=[...phases.values()].map(row=>({...row,stages:[...row.stages].sort()})).sort((a,b)=>b.knownInvocationMs-a.knownInvocationMs)
 const totals=Object.fromEntries(['attempts','recordedProviderDispatches','completeRawResponses','failed','unfinished','knownInvocationMs','missingDuration','inputTokens','outputTokens','cachedInputTokens','missingUsage','repeatedStageAttempts'].map(k=>[k,rows.reduce((n,r)=>n+r[k],0)]))
 const report={version:1,jobId,readOnly:true,newProviderCalls:0,context:'archived-job-without-execution-boundaries',totals,failures,phases:rows,
  recoveredRawReceipts:[...archive.values('guide-raw-cache-recovery-v1')].length,
  limits:['Invocation wall time includes local response processing; not pure remote latency.','Token counters are recorded Codex turn usage, not billing. Cached input is a subset of input.','Missing usage/durations remain unknown and are excluded only from known sums.','Cold generation and resumed work cannot be separated retrospectively without execution markers.','Repeated stages include retries and rebuilding; explicit-repair is a lower bound, not all corrective work.','Replay/cache costs must be measured separately; zero new provider calls do not erase historical token counters.']}
 writeFileSync(output,JSON.stringify(report,null,2),{flag:'wx'})
 console.log(JSON.stringify({jobId,...totals,failures}))
}finally{archive.close()}
