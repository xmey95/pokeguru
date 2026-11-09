import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {startGuideCampaignCase,guideCampaignResource} from './lib/guide-campaign-start'
import {readFileSync,writeFileSync,mkdirSync,existsSync,mkdtempSync,openSync,closeSync,unlinkSync,readdirSync,readSync} from 'node:fs'
import {join,resolve,relative} from 'node:path'
import {createHash} from 'node:crypto'
import {DatabaseSync,backup} from 'node:sqlite'
import {execFileSync} from 'node:child_process'
import {AiAnalysisWork} from '../src/main/ai-analysis-work'
import {AiEvidenceArchive} from '../src/main/ai-evidence-archive'
import {ProjectStore} from '../src/main/project-store'
import {createArchivedEvidenceEngine} from '../src/main/ai-evidence-snapshot'
import {generateDeepGuide,assertGuideIntegrity,deepGuideReport} from '../src/main/matchup-guide-generation'
import {assertGuideSegmentApproval} from '../src/main/guide-segment-approval'
import {guideCampaignAllowance,assertGuideCampaignDispatch} from '../src/main/guide-campaign-budget'
import {guideHash,packetHash,extendGuidePacket,addGuideLists,type GuidePacket} from '../src/main/matchup-guide-packet'
import {runStructuredCodex} from '../src/main/codex-evidence-plan'
import {BUNDLED_WESTERN_RULE_PACKAGE} from '../src/shared/western-rule-package'
import {extendGuidePrizeRules} from '../src/main/guide-prize-rule-sources'
import {guideDeliveryBudget} from '../src/shared/guide-delivery'
import {AiFailure,aiFailureCode} from '../src/main/ai-failure'
import type {CatalogView} from '../src/shared/catalog'
import type {GuideAttempt} from '../src/shared/matchup-guide'

const root=resolve(process.argv[2]??'.verify/app238-job-isolation-20261106'),base=resolve('.verify/app225-segments-20261102'),sourceRoot=resolve('.verify/app235-bounded-20261106'),mode=process.argv[3]
const json=(p:string):any=>JSON.parse(readFileSync(p,'utf8').replace(/^\uFEFF/,'')),write=(p:string,v:unknown)=>writeFileSync(p,JSON.stringify(v,null,2))
function digest(p:string){const h=createHash('sha256'),fd=openSync(p,'r'),buffer=Buffer.alloc(65536);try{let n:number;while((n=readSync(fd,buffer,0,buffer.length,null))>0)h.update(buffer.subarray(0,n));return h.digest('hex')}finally{closeSync(fd)}}
const prep=json(join(base,'campaign-v28/preparation.json')),history=json(resolve('.verify/app235-bounded-20261106-archive/manifest.json')),qualification=json(join(root,'qualification.json'))
const caps=[522,500,500],ceilings={perGuide:522,pool:1500,reserveEachLater:24},maximum=guideDeliveryBudget().maximum,binary=resolve('C:/Users/federico.grasso/AppData/Local/Programs/Pokeguru/resources/codex/bin/codex.exe')
const folder=(c:any)=>join(root,c.id),file=(c:any)=>join(folder(c),'data.sqlite')
function starts(path:string){const db=new DatabaseSync(path,{readOnly:true});try{return Number(db.prepare("SELECT COUNT(*) n FROM ai_evidence_values WHERE role='guide-attempt-start'").get()!.n)}finally{db.close()}}
function rows():{id:string;calls:number}[]{return prep.cases.map((c:any,i:number)=>({id:c.id,calls:starts(file(c))+history.rows[i].diagnosticCalls}))}
function bound(counts:ReturnType<typeof rows>){assert.equal(counts.length,3);counts.forEach((c,i)=>{assert.equal(c.id,prep.cases[i].id);assert(Number.isSafeInteger(c.calls)&&c.calls>=0&&c.calls<=caps[i],'Per-guide cumulative ceiling exceeded')});assert(counts.reduce((n,c)=>n+c.calls,0)<=1500,'Pool exceeded');return counts}
function allowance(counts:ReturnType<typeof rows>,id:string){bound(counts);const i=counts.findIndex(c=>c.id===id);assert(i>=0);const a=guideCampaignAllowance(counts,id,ceilings);return {...a,remaining:Math.min(a.remaining,caps[i]-counts[i].calls)}}
function sourceChecks(){assert.equal(history.realCallsV28,358);assert.equal(history.historicalCalls,434);assert(qualification.allOfflineGatesPassed);assert.equal(maximum,164);for(const [p,h]of Object.entries(qualification.sourceHashes))assert.equal(digest(resolve(p)),h,'Qualified source changed: '+p);for(const [p,h]of Object.entries(qualification.artifactHashes))if(p!=='README.md'&&!p.startsWith('docs/'))assert.equal(digest(resolve(p)),h,'Offline gate evidence changed: '+p);for(const c of prep.cases){const old=history.rows.find((r:any)=>r.id===c.id);assert.equal(digest(join(sourceRoot,c.id,'data.sqlite')),qualification.originalSources[c.id])}}
function prepared(){const p=json(join(root,'preparation.json'));assert.equal(p.contract,'bounded-delivery-1');assert.deepEqual(p.caps,caps);assert.equal(p.historyHash,digest(resolve('.verify/app235-bounded-20261106-archive/manifest.json')));for(const c of prep.cases){const r=p.cases.find((r:any)=>r.id===c.id);assert.equal(r.resourceId,guideCampaignResource(p.campaignId,c.id));assert.equal(digest(join(folder(c),'packet.json')),r.packetHash)}return p}
function walk(dir:string):string[]{return readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(join(dir,e.name)):[join(dir,e.name)])}
function sealed(){const s=json(join(root,'seal.json'));assert.equal(s.preparationHash,guideHash(prepared()));for(const [p,h]of Object.entries(s.files))assert.equal(digest(resolve(p)),h,'Frozen input changed: '+p);assert.equal(digest(binary),s.binaryHash);return s}
function authorized(){const s=sealed(),a=json(join(root,'authorization.json'));assert.equal(a.status,'authorized');assert.equal(a.sealHash,guideHash(s));assert.deepEqual(a.caps,caps);assert.equal(a.pool,1500);assert.equal(a.reserveEachLater,24);assert.equal(a.baseline,358);assert.equal(a.stopOnFirstInvalid,true);assert.equal(a.newJobs,true);assert.equal(typeof a.userReply,'string');assert(a.userReply.trim());return a}
async function prepare(){sourceChecks();assert(!existsSync(join(root,'preparation.json')),'Preparation is immutable');const campaignId=randomUUID(),cases=[]
 for(const [i,c]of prep.cases.entries()){mkdirSync(folder(c));const src=join(sourceRoot,c.id,'data.sqlite'),db=new DatabaseSync(src,{readOnly:true});try{await backup(db,file(c))}finally{db.close()};assert.equal(starts(file(c)),history.rows[i].mainCalls)
  const original=json(join(sourceRoot,c.id,'packet.json')) as GuidePacket,packet=extendGuidePrizeRules(original);Object.assign(packet.basis,{deliveryContract:'bounded-delivery-1'});packet.basis.dependencyHash=packetHash(packet)
  assert.deepEqual(packet,original);assert.deepEqual(packet.ourList,original.ourList);assert.deepEqual(packet.opponentLists,original.opponentLists);for(const s of original.sources)assert.deepEqual(packet.sources.find(v=>v.id===s.id),s)
  write(join(folder(c),'packet.json'),packet);cases.push({id:c.id,projectId:c.projectId,resourceId:guideCampaignResource(campaignId,c.id),sourceHash:digest(src),packetHash:digest(join(folder(c),'packet.json')),inheritedMainCalls:history.rows[i].mainCalls,diagnosticCalls:history.rows[i].diagnosticCalls,newJobRequired:true,oldPassesReused:false})
 }
 const first=prep.cases[0],link=json(join(sourceRoot,first.id,'job-link.json')),a=new AiEvidenceArchive(join(sourceRoot,first.id,'data.sqlite'),{id:link.jobId,projectId:first.projectId,resourceId:'bounded-delivery-1:'+first.id},true);try{const samples=[...a.values('guide-token-sample')].map(r=>r.value);assert.equal(samples.length,338);write(join(root,'calibration.json'),samples)}finally{a.close()}
 write(join(root,'preparation.json'),{at:new Date().toISOString(),contract:'bounded-delivery-1',campaignId,caps,pool:1500,reserveEachLater:24,baseline:358,historicalBaseline:434,historyHash:digest(resolve('.verify/app235-bounded-20261106-archive/manifest.json')),cases,profileMaximum:maximum,noManualContent:true,heldOutExcluded:true})
 assert.deepEqual(rows().map(r=>r.calls),[358,0,0]);write(join(root,'budget.json'),{counts:rows(),caps,pool:1500,reserveEachLater:24,maximumPerNewJob:maximum,allowances:prep.cases.map((c:any)=>({id:c.id,...allowance(rows(),c.id)})),maximumNewCallsThisCampaign:3*maximum,maximumV28AtCompletion:358+3*maximum,maximumHistoricalAtCompletion:434+3*maximum,remainingPool:1142,sourceAuthority:null,offlinePreparationOnly:true,networkStarted:false})
}
function guard(){prepared();assert.deepEqual(rows().map(r=>r.calls),[358,0,0]);const make=(n:number[])=>n.map((calls,i)=>({id:prep.cases[i].id,calls}));assert.equal(allowance(make([358,0,0]),prep.cases[0].id).remaining,164);assert.equal(allowance(make([522,0,0]),prep.cases[0].id).remaining,0);assert.equal(allowance(make([522,0,0]),prep.cases[1].id).remaining,500);for(const n of [[523,0,0],[358,501,0],[358,0,501],[522,500,479]])assert.throws(()=>bound(make(n)));assertGuideCampaignDispatch(make([522,0,0]),prep.cases[0].id,ceilings);assert.throws(()=>assertGuideCampaignDispatch(make([0,0,0]),prep.cases[0].id,ceilings));assert.throws(()=>assertGuideCampaignDispatch(make([522,0,0]),prep.cases[0].id,{...ceilings,pool:550}));assert(!existsSync(join(root,'authorization.json')));assert(!existsSync(join(root,'run-started.json')));write(join(root,'guard.json'),{at:new Date().toISOString(),passed:true,providerCalls:0,newJobCreated:false,asymmetricCapsEnforced:true,alreadyCountedBoundary:true,futureReserveEnforced:true,baselinePreserved:true,oldPassesReused:false})}
function countsForCase(c:any,database:string){return rows().map(r=>r.id===c.id?{id:r.id,calls:starts(database)+history.rows.find((v:any)=>v.id===c.id).diagnosticCalls}:r)}
let frozenInputCache:{selection:any;events:any;cat:CatalogView}|undefined
function frozenInputs(){return frozenInputCache??={selection:json('.verify/app221-resources-20261102/selection.json'),events:json('.verify/app221-resources-20261102/events.json'),cat:catalog()}}
function createCase(c:any,database:string,directory:string,reference:string){
 const p=prepared(),packet=json(join(folder(c),'packet.json')) as GuidePacket,definition=frozenInputs().selection.cases.find((d:any)=>d.id===c.id)
 const request=`Crea la guida approfondita per la nostra lista esatta ${definition.ours.name} contro ${definition.opponent.name}, con copertura finita, personalizzazione sul singolo matchup e tutti i controlli.`
 return startGuideCampaignCase({database,directory,campaignId:p.campaignId,caseId:c.id,projectId:c.projectId,packet,counts:countsForCase(c,database),caps,ceilings,calibration:json(join(root,'calibration.json')),request,authorityReference:reference})
}
async function generateCase(c:any,ctx:ReturnType<typeof createCase>,provider:typeof runStructuredCodex,beforeProvider:()=>void,onStage:(s:string)=>void){
 const {work}=ctx,packet=ctx.generation.packet,{selection,events,cat}=frozenInputs(),definition=selection.cases.find((d:any)=>d.id===c.id)
 const matches=(name:string)=>name.toLocaleLowerCase()===definition.opponent.name.toLocaleLowerCase(),{engine,catalog:frozen}=createArchivedEvidenceEngine(work.archive,()=>({catalog:cat,window:selection.window,play:events.play.map((e:any)=>({...e,participations:e.participations.filter((v:any)=>matches(v.deck?.name??''))})).filter((e:any)=>e.participations.length),main:events.main.map((e:any)=>({...e,participants:e.participants.filter((v:any)=>matches(v.deckName??''))})).filter((e:any)=>e.participants.length)}))
 return generateDeepGuide({...ctx.generation,config:prep.config,
  runner:async(...args)=>{beforeProvider();const counts=bound(countsForCase(c,ctx.jobs.filePath)),state=assertGuideCampaignDispatch(counts,c.id,ceilings),latest=[...work.archive.values<GuideAttempt>('guide-attempt-start')].map(r=>r.value).sort((a,b)=>b.sequence-a.sequence)[0];assert.equal(latest.inputHash,guideHash(args[0]));work.archive.saveValue('guide-bounded-campaign-dispatch-v1',String(latest.sequence),{campaignId:prepared().campaignId,counts,state,inputHash:latest.inputHash});return provider(...args)},
  ensureEvidence:(current,text)=>{const targets=engine.cardTargets(text).filter(t=>!current.sources.some(s=>s.kind==='card'&&s.label===t.name)),ids=[...new Set(targets.flatMap(t=>t.printIds))],next=ids.length<=12?extendGuidePacket(current,frozen,ids):current;return {packet:next,missing:targets.filter(t=>!next.sources.some(s=>s.kind==='card'&&s.label===t.name)).map(t=>t.name)}},
  retrieve:(current,ids,queries)=>{let next=extendGuidePacket(current,frozen,ids);for(const q of queries){const result=engine.execute({operation:'events.search',deckName:definition.opponent.name,...q.cardName?{cardName:q.cardName}:{},offset:q.offset,limit:2}),lists=(result.data as any)?.lists??[];if(result.status!=='ok'||!lists.length)next.gaps.push('Nessuna lista aggiuntiva risolta per '+(q.cardName??definition.opponent.name));next=addGuideLists(next,frozen,lists.map((l:any)=>({label:`${l.deck} · ${l.name}`,url:l.listUrl,cards:l.cards})))}return next},onStage})
}
function inheritedRows(database:string){const db=new DatabaseSync(database,{readOnly:true});try{return {jobs:db.prepare('SELECT * FROM ai_jobs ORDER BY id').all(),values:db.prepare('SELECT job_id,role,key,object_hash FROM ai_evidence_values ORDER BY job_id,role,key').all()}}finally{db.close()}}
async function replay(){
 prepared();sourceChecks();assert(!existsSync(join(root,'run-started.json')));assert(!existsSync(join(root,'authorization.json')));const probes=[]
 for(const c of prep.cases){const temp=mkdtempSync(join(root,'replay-')),database=join(temp,'data.sqlite'),sourceHash=digest(file(c)),db=new DatabaseSync(file(c),{readOnly:true});try{await backup(db,database)}finally{db.close()}
  const inherited=inheritedRows(database),begin=performance.now(),ctx=createCase(c,database,temp,'OFFLINE gate only, no provider authority'),probesForCase=[];let legacyProtection=false
  try{
   assert.equal(ctx.resourceId,prepared().cases.find((v:any)=>v.id===c.id).resourceId);assert(!inherited.jobs.some((j:any)=>j.id===ctx.job.id));assert.equal([...ctx.work.archive.values('guide-attempt-start')].length,0);assert.equal([...ctx.work.archive.values('guide-raw-response')].length,0)
   const inheritedPaused=inherited.jobs.filter((j:any)=>j.resource_id==='bounded-delivery-1:'+c.id&&j.status==='interrupted'&&JSON.parse(j.progress_json??'{}').diagnostics?.resumable)
   if(c===prep.cases[0]){assert.equal(inheritedPaused.length,1);assert.throws(()=>ctx.jobs.start('matchup-generate',c.projectId,'bounded-delivery-1:'+c.id),/pausa/);legacyProtection=true}
   for(let i=0;i<2;i++){if(i){ctx.work.close();ctx.controller=new AbortController();ctx.work=new AiAnalysisWork(join(temp,ctx.job.id),ctx.jobs,ctx.job.id,ctx.controller.signal);ctx.generation.work=ctx.work}const started=performance.now();let error:any,n=0;const before=[...ctx.work.archive.values('guide-attempt-start')].length
    try{await generateCase(c,ctx,async()=>{n++;ctx.controller.abort('pause');throw new AiFailure('paused','OFFLINE_BEFORE_PROVIDER')},()=>{},()=>{})}catch(e){error=e}
    assert.equal(n,1,String(error?.stack??error));assert.equal(error?.code,'paused');assert.equal([...ctx.work.archive.values('guide-attempt-start')].length,before+1);assert.equal([...ctx.work.archive.values('guide-raw-response')].length,0)
    probesForCase.push({reopen:i,elapsedMs:performance.now()-started,providerIntercepts:n,realProviderCalls:0,attemptsBefore:before,attemptsAfter:before+1,code:error.code})
   }
   ctx.jobs.suspend(ctx.job.id,'Offline gate completed before provider','failure')
   assert.throws(()=>createCase(c,database,temp,'OFFLINE'),/già avviata|Profilo completo non ammesso/)
   const after=inheritedRows(database);assert.deepEqual(after.jobs.filter((j:any)=>j.id!==ctx.job.id),inherited.jobs);assert.deepEqual(after.values.filter((r:any)=>r.job_id!==ctx.job.id),inherited.values)
   assert.deepEqual([...ctx.work.archive.values('guide-token-sample')].map(r=>guideHash(r.value)).sort(),json(join(root,'calibration.json')).map((v:unknown)=>guideHash(v)).sort())
   assert.equal(digest(file(c)),sourceHash);assert(probesForCase[0].elapsedMs<60000&&probesForCase[1].elapsedMs<10000)
   probes.push({id:c.id,resourceId:ctx.resourceId,jobId:ctx.job.id,copy:temp,elapsedMs:performance.now()-begin,inheritedJobsUnchanged:true,inheritedEvidenceUnchanged:true,oldProtectionPreserved:legacyProtection,sharedStartAndGenerationPath:true,probes:probesForCase})
  }finally{ctx.work.close();ctx.close()}
 }
 const peakRssMiB=process.resourceUsage().maxRSS/1024;assert(peakRssMiB<=768,'Peak RSS '+peakRssMiB+' MiB exceeds 768 MiB');assert.deepEqual(rows().map(r=>r.calls),[358,0,0]);sourceChecks();write(join(root,'replay.json'),{at:new Date().toISOString(),passed:true,realProviderCalls:0,newRealJobs:0,probes,peakRssMiB,oldCampaignNotReopened:true})
}

function seal(){
 sourceChecks();assert(json(join(root,'guard.json')).passed&&json(join(root,'replay.json')).passed)
 const gate=json(join(root,'verification.json'));assert(gate.passed&&gate.offlineStartupGatesPassed&&gate.realProviderCalls===0)
 for(const [p,h]of Object.entries(gate.artifactHashes))assert.equal(digest(p),h,'Qualified offline gate changed: '+p)
 assert(!existsSync(join(root,'seal.json')))
 const paths=[...Object.keys(qualification.sourceHashes),...Object.keys(gate.artifactHashes),...walk(join(root,'compiled')),'scripts/guide-bounded-campaign.ts','scripts/lib/guide-campaign-start.ts',join(root,'verification.json'),join(root,'tsconfig.json'),join(root,'preparation.json'),join(root,'guard.json'),join(root,'replay.json'),join(root,'budget.json'),join(root,'calibration.json'),...prep.cases.map((c:any)=>join(folder(c),'packet.json')),'.verify/app221-resources-20261102/selection.json','.verify/app221-resources-20261102/events.json','.verify/matchup-guide-pilot-20261030/catalog.json','.verify/matchup-guide-pilot-20261030/sets.json',join(root,'qualification.json'),'.verify/app236-outline-protocol/verification.json',join(base,'campaign-v28/preparation.json'),resolve('.verify/app235-bounded-20261106-archive/manifest.json')].map(p=>relative(resolve('.'),resolve(p)).replaceAll('\\','/'))
 write(join(root,'seal.json'),{at:new Date().toISOString(),preparationHash:guideHash(prepared()),binaryHash:digest(binary),contract:'bounded-delivery-1',files:Object.fromEntries([...new Set(paths)].sort().map(p=>[p,digest(resolve(p))]))});sealed()
}
function catalog():CatalogView{const prints=json('.verify/matchup-guide-pilot-20261030/catalog.json'),sets=json('.verify/matchup-guide-pilot-20261030/sets.json');return {circuit:'WESTERN',source:'TCGdex REST v2/en',sourceLanguage:'en',prints,sets,scope:{setIds:sets.map((s:any)=>s.id),names:[...new Set<string>(prints.map((p:any)=>p.name))]},syncedAt:'2026-10-30',rulePackage:BUNDLED_WESTERN_RULE_PACKAGE}}
async function live(){
 const grant=authorized();assert(!existsSync(join(root,'run-started.json')),'No restart of a stopped campaign');assert(!existsSync(join(sourceRoot,'live.lock')));sourceChecks();assert.deepEqual(rows().map(r=>r.calls),[358,0,0]);const started=Date.now(),lock=join(root,'live.lock'),fd=openSync(lock,'wx');writeFileSync(fd,JSON.stringify({pid:process.pid,at:new Date().toISOString()}));closeSync(fd);write(join(root,'run-started.json'),{at:new Date().toISOString(),pid:process.pid,sealHash:grant.sealHash});process.env.POKEGURU_CODEX_BIN=binary
 let activeCase:string|null=null,activeJobId:string|null=null,stage='starting',failure:any,passed=0
 const snapshot=(terminal=false)=>{const counts=bound(rows()),total=counts.reduce((n,c)=>n+c.calls,0);write(join(root,'live-status.json'),{at:new Date().toISOString(),terminal,pid:process.pid,activeCase,activeJobId,stage,passed,counts,newCalls:total-358,realCallsV28:total,historicalCalls:total+76,elapsedMs:Date.now()-started,caps,pool:1500,reserveEachLater:24})}
 const timer=setInterval(()=>{try{snapshot()}catch(e){console.error('Status observation failed:',e)}},10000)
 try{for(const c of prep.cases){activeCase=c.id;activeJobId=null;stage='preparing';authorized();const start=Date.now();let ctx:ReturnType<typeof createCase>|undefined,reopenedWork:AiAnalysisWork|undefined
  try{
   ctx=createCase(c,file(c),folder(c),grant.sealHash);activeJobId=ctx.job.id;const {job,work,jobs,projects,allowance:a}=ctx
   write(join(folder(c),'job-link.json'),{at:new Date().toISOString(),jobId:job.id,resourceId:ctx.resourceId,campaignId:prepared().campaignId,consumedBeforeJob:a.consumedByGuide,priorAttempts:0,allowedNewCalls:ctx.maximum,cumulativeCeiling:caps[prep.cases.indexOf(c)],sealHash:grant.sealHash});snapshot()
   const guide=await generateCase(c,ctx,runStructuredCodex,()=>{authorized();snapshot()},s=>{stage=s;snapshot();console.log(c.id+': '+s)})
   assertGuideIntegrity(guide);assertGuideSegmentApproval(guide,work.archive);const report=deepGuideReport({...guide.basis,jobId:job.id,generatedAt:new Date().toISOString(),sampleDeckUrl:ctx.generation.packet.opponentLists[0].url},guide);projects.saveMatchupReport(report);jobs.ready(job.id,{report});jobs.transition(job.id,'applied');work.close();reopenedWork=new AiAnalysisWork(join(folder(c),job.id),jobs,job.id,new AbortController().signal);const countBefore=rows(),recovered=await generateDeepGuide({packet:ctx.generation.packet,config:prep.config,work:reopenedWork,request:ctx.generation.request,runner:async()=>{throw Error('Completed recovery cannot call a provider')}});assert.deepEqual(recovered,guide);assertGuideSegmentApproval(recovered,reopenedWork.archive);assert.deepEqual(rows(),countBefore)
   const reopened=new ProjectStore(file(c));try{assert.deepEqual(reopened.listMatchupReports(c.projectId,guide.basis.metaId)[0],report);assert.deepEqual(reopened.listMatchupReports('foreign-project',guide.basis.metaId),[])}finally{reopened.close()};write(join(folder(c),'generated.json'),report)
   stage='offline-ui';snapshot();execFileSync(process.execPath,['tests/matchup-guide-ui-live.mjs'],{cwd:resolve('.'),env:{...process.env,POKEGURU_TEST_ELECTRON:resolve('.verify/node_modules/electron/dist/electron.exe'),POKEGURU_GUIDE_DB:file(c),POKEGURU_GUIDE_UI_OUTPUT:join(folder(c),'ui')},windowsHide:true,stdio:'pipe',timeout:60000});assert(json(join(folder(c),'ui/result.json')).passed)
   passed++;write(join(folder(c),'outcome.json'),{at:new Date().toISOString(),passed:true,jobId:job.id,resourceId:ctx.resourceId,reportHash:guideHash(report),elapsedMs:Date.now()-start,newCalls:rows().find(r=>r.id===c.id)!.calls-a.consumedByGuide,counts:rows(),readback:true,cachedReopenWithoutCalls:true,ui:true});console.log(c.id+': VALID')
  }catch(e){if(ctx&&ctx.jobs.get(ctx.job.id)?.status==='running')ctx.jobs.suspend(ctx.job.id,e instanceof Error?e.message:String(e),'failure');ctx?.work.failure(e);write(join(folder(c),'outcome.json'),{at:new Date().toISOString(),passed:false,jobId:activeJobId,error:e instanceof Error?e.message:String(e),code:aiFailureCode(e),elapsedMs:Date.now()-start,counts:rows()});throw e}finally{reopenedWork?.close();ctx?.close()}
 }}catch(e){failure=e;throw e}finally{clearInterval(timer);stage=failure?'stopped-first-invalid':'complete';snapshot(true);write(join(root,'terminal.json'),{at:new Date().toISOString(),terminal:true,passed:passed===3,validGuides:passed,error:failure instanceof Error?failure.message:null,code:failure?aiFailureCode(failure):null,counts:rows(),realCallsV28:rows().reduce((n,c)=>n+c.calls,0),historicalCalls:rows().reduce((n,c)=>n+c.calls,0)+76,elapsedMs:Date.now()-started,noManualContent:true,stopOnFirstInvalidRespected:true});sealed();sourceChecks();unlinkSync(lock)}
}

async function main(){assert(['prepare','guard','replay','seal','live'].includes(mode),'Explicit mode required');if(mode==='prepare')await prepare();else if(mode==='guard')guard();else if(mode==='replay')await replay();else if(mode==='seal')seal();else await live()}
main().catch(e=>{console.error(e);process.exitCode=1})
