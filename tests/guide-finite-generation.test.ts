import {it,expect} from 'vitest'
import {mkdtempSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {DatabaseSync} from 'node:sqlite'
import {ProjectStore} from '../src/main/project-store'
import {AiJobStore} from '../src/main/ai-job-store'
import {AiEvidenceArchive} from '../src/main/ai-evidence-archive'
import {syntheticSegmentProtocol} from './fixtures/guide-segment-protocol'
import {guideHash,packetHash} from '../src/main/matchup-guide-packet'
import {constructFiniteGuideContent} from '../src/main/guide-finite-generation'
import {assertFiniteTransportHistory} from '../src/main/guide-finite-runtime'
import type {GuideConstructionRuntime} from '../src/main/guide-reply-phase'
import {checkGuide} from '../src/shared/matchup-guide'
import {GUIDE_FINITE_ANALYSIS_CONTRACT} from '../src/shared/guide-analysis-scope'
import {AiAnalysisWork} from '../src/main/ai-analysis-work'
import {generateDeepGuide,assertGuideIntegrity} from '../src/main/matchup-guide-generation'
import {assertGuideReport} from '../src/shared/matchup-guide'
import {assertGuideSegmentApproval} from '../src/main/guide-segment-approval'
import {unpackGuideData} from '../src/main/guide-request-budget'

function fixture(distinctSides=false){
  const folder=mkdtempSync(join(tmpdir(),'app232-cycle-')),file=join(folder,'data.sqlite'),projects=new ProjectStore(file),jobs=new AiJobStore(file)
  const project=projects.create({name:'Synthetic finite cycle',format:'STANDARD'}),job=jobs.start('matchup-generate',project.id,'finite-synthetic'),archive=new AiEvidenceArchive(file,job),protocol=syntheticSegmentProtocol(project.id,distinctSides)
  const packet=structuredClone(protocol.packet);packet.basis.analysisContract=GUIDE_FINITE_ANALYSIS_CONTRACT;packet.basis.dependencyHash=packetHash(packet)
  const initial=protocol.response('plan',{}, {}) as any,setups=initial.initialOpenings.map((o:any)=>({...((protocol.response('setup-1',{caseId:o.id},{}) as any).caseSetup),opening:o.opening}))
  let calls=0,negative:'none'|'text'|'case'|'forever'='none',interrupted=false,interruptPatch=false,invalidPatch=false,invalidAuditPatch=false,lateAuditText='Restano due copie nel mazzo.',invalidPlan=false,invalidCritic=false,invalidInitialPlans=0
  const stages:string[]=[],schemas:any[]=[]
  const options:GuideConstructionRuntime={scope:{projectId:project.id,jobId:job.id,dependencyHash:packet.basis.dependencyHash,configHash:guideHash({fixture:'finite-cycle'})},packet,evidencePacket:packet,evidenceAnchor:packet,archive,reserveOutside:0,remainingCalls:()=>200-calls,isCached:()=>false,check:()=>{},
    // A deliberately cheap synthetic estimate tests routing/reserves. Real
    // token sizing is a separate required preflight, not claimed by this test.
    estimate:r=>({stage:r.stage,units:r.units??1,encoding:'plain',visibleTokens:100,estimatedInput:1000,reservedOutput:10000,estimatedResponseCharacters:18000,margin:8192,bytes:10000,fits:true,fitsTarget:true,remainingCalls:200-calls,reservedCalls:r.reserveCalls,calibrationFactor:1.12,family:'synthetic',estimateOnly:true}),
    call:async request=>{
      calls++;stages.push(request.stage);schemas.push(request.schema)
      if(interruptPatch&&request.stage==='repair-finite-cases'&&!interrupted){interrupted=true;throw Error('Synthetic stop before the pending patch')}
      const data=request.data as any,schema=request.schema as any
      const resolve=(node:any):any=>node?.$ref?resolve(schema.$defs[node.$ref.slice('#/$defs/'.length)]):node
      const prop=(node:any,key:string)=>resolve(resolve(node).properties[key])
      const choices=resolve(prop(schema,'units').items).anyOf.map(resolve)
      const units=data.units.map((unit:any)=>{
        const responseSchema=prop(choices.find((c:any)=>prop(c,'unitId').const===unit.unitId),'response'),p=responseSchema.properties,d=unit.data
        let response:any
        if(request.stage==='finite-plans'){
          const direct=d.main.id+'-reply-1',defend=d.main.id+'-reply-2'
          response={caseId:p.caseId.const,rootHash:p.rootHash.const,mainHash:p.mainHash.const,packetHash:p.packetHash.const,
            replies:[{id:direct,role:'direct',intent:'attack',goal:'Synthetic immediate pressure',sourceIds:['card:p']},{id:defend,role:'defend',intent:'defend',goal:'Synthetic conservation response',sourceIds:['card:p']}],
            analysisScope:{contract:GUIDE_FINITE_ANALYSIS_CONTRACT,horizon:'ours-opponent-ours',comparedReplyIds:[direct,defend],access:{replyId:null,reason:'Not compared; no assertion of impossibility.',sourceIds:['card:p']},defend:{replyId:defend,reason:'Explicit synthetic second line.',sourceIds:['card:p']},limits:['Synthetic conditional fixture only.']},reason:'Two synthetic selected lines, no quality claim.',sourceIds:['card:p']}
          if(invalidPlan)response.rootHash='invalid-root'
        }else if(request.stage==='finite-plan-reviews')response={caseId:p.caseId.const,planHash:p.planHash.const,verdict:'pass',findings:[],checks:{relevance:true,conditions:true,competence:true,boundedClaims:true},reason:'Synthetic critic protocol only.',sourceIds:['card:p']}
        else if(request.stage==='metadata-finite-cases'){
          const direct=d.plan.replies[0].id
          response={caseId:p.caseId.const,constructionHash:p.constructionHash.const,metadata:{assumptions:[],sourceIds:['card:p','card:e','rules'],calculations:[{label:'Printed synthetic zero damage',terms:[0],multiplier:1,minimum:0,expected:0,purpose:'damage',attack:{printId:'p',attackName:'Synthetic attack'}}],replyComparison:{objective:'Compare two conditional synthetic lines',threshold:120,minimumReplyId:null,preferredReplyId:direct,options:d.branches.map((b:any)=>({id:b.seed.id,intent:b.seed.intent,specificDraws:[],terms:[0],multiplier:1,damage:0,reachesThreshold:false,remainingHp:120,outcome:'Synthetic zero damage.',sourceIds:['card:p'],promotionRationale:'No promotion in the synthetic fixture.'})),omissionTests:[],conclusion:'Conditional comparison only.',attackReview:[{printId:'p',attackName:'Synthetic attack',replyId:direct,reason:'Printed attack actually executed.'}]}},claims:[],limitations:['Synthetic fixture, not competitive evidence.'],changeSummary:'Synthetic native accounting.'}
        }else if(request.stage==='review-finite-cases'||request.stage==='review-finite-guide'){
          const final=request.stage==='review-finite-guide',wantsText=final&&negative==='text',wantsCase=!final&&['case','forever'].includes(negative)
          const findings=wantsText?[{severity:'minor',targetId:'chapter-decisions',message:'Clarify this synthetic recommendation.',correction:'State the conditional scope explicitly.',sourceIds:['card:p'],repair:{kind:'text',targetId:'chapter-decisions'},proposedActions:[],counterlines:[]}]:wantsCase?[{severity:'major',targetId:d.draft.scenarios[0].id,message:'Clarify the synthetic case scope.',correction:'Qualify its explicit scope limitation.',sourceIds:['card:p'],repair:{kind:'case',caseId:d.draft.scenarios[0].id},proposedActions:[],counterlines:[]}]:[]
          if(d.repairTargetContract)for(const f of findings)if(f.repair.kind==='text')(f.repair as any).quote=d.draft.chapters.find((c:any)=>c.id===f.targetId)?.body
          response={contextHash:d.contextHash,verdict:findings.length?'revise':'pass',findings,checks:['Synthetic full-role protocol, not a real AI judgment.'],resolutions:d.previousFindings.map((old:any)=>({findingHash:old.findingHash,disposition:findings.length?'still-open':'resolved',reason:'Synthetic original finding explicitly reassessed.',sourceIds:['card:p'],currentFindingIndex:findings.length?0:null}))}
          if(invalidCritic)response.checks=[]
          if(wantsText)negative='none'
          // Both scenario units may be negative in the same batch. The mode
          // is reset after that batch, not while iterating its children.
        }else if(request.stage==='prose-finite-units'){
          if(p.kind)response={id:p.id.const,kind:p.kind.const,title:'Synthetic '+p.kind.const,body:'A detailed synthetic conditional explanation of this matchup. '+(d.findings?'Corrected conditional advice.':''),sourceIds:['card:p'],dependsOn:[d.facts.scenarios[0].id]}
          else response={id:p.id.const,question:'Which printed cost applies in this synthetic case?',solution:'The printed free cost, under the declared conditions.',sourceIds:['card:p'],scenarioIds:[d.scenarioId]}
        }else if(request.stage==='repair-finite-cases'){
          response={candidateHash:d.candidateHash,cases:d.nativeCases.map((c:any)=>({id:c.id,baseHash:c.baseHash,operations:[{op:'replace',path:invalidAuditPatch?'/turns/ours/tactical/comparison':invalidPatch?'/turns/next/attack/attack/printId':'/analysisScope/limits/0',valueJson:JSON.stringify(invalidAuditPatch?lateAuditText:invalidPatch?'absent':'Corrected conditional scope '+calls)}]})),claims:d.claims,changeSummary:'Repair the explicitly selected synthetic scope.'}
          invalidPatch=false
          invalidAuditPatch=false
        }else return null
        return {unitId:unit.unitId,response}
      })
      if(request.stage==='review-finite-cases'&&negative==='case')negative='none'
      if(request.stage==='finite-plans')invalidPlan=false
      if(request.stage==='review-finite-cases')invalidCritic=false
      if(units.some((u:any)=>u===null))return request.read(protocol.response(request.stage,data,schema))
      return request.read({units})
    }}
  return {options,setups,archive,file,stages,jobs,job,folder,
    async rawResponse(stage:string,data:unknown,schema:object){
      if(!(data as any).units){calls++;stages.push(stage);const response=protocol.response(stage,data,schema);if(stage==='plan'&&invalidInitialPlans>0){invalidInitialPlans--;return {...response as object,thesis:null}}return response}
      return options.call({stage,data,schema,role:'constructor',instructions:'Synthetic external runner',task:'Synthetic raw response only',reserveCalls:0,read:raw=>raw,cacheValidation:{id:'synthetic-raw',validate:()=>{}}})
    },get calls(){return calls},textFailure(){negative='text'},caseFailure(){negative='case'},alwaysFail(){negative='forever'},interruptBeforePatch(){interruptPatch=true},badFirstPatch(){invalidPatch=true},badFirstAuditPatch(text='Restano due copie nel mazzo.'){invalidAuditPatch=true;lateAuditText=text},badFirstPlan(){invalidPlan=true},badFirstCritic(){invalidCritic=true},badInitialPlans(count:number){invalidInitialPlans=count},close(){archive.close();jobs.close();projects.close();rmSync(folder,{recursive:true,force:true})}}
}
it('reauthenticates the current descriptor before persisting an outcome after its provider await',async()=>{
 const f=fixture(),call=f.options.call;let changed=false,tamperedId=''
 f.options.call=async request=>{
  const value=await call(request)
  if(!changed&&request.stage==='finite-plans'){
   changed=true;const id=(request.data as any).units[0].unitId,descriptor=f.archive.value<any>('guide-finite-request-v1',id);tamperedId=id
   // The archive API is immutable. Model an external binding change instead
   // of asking that API to overwrite an original (which it already rejects).
   f.archive.saveValue('synthetic-descriptor-mutation','tamper',{...descriptor,scopeHash:'synthetic-foreign-scope'})
   const writer=new DatabaseSync(f.file)
   try{writer.prepare("UPDATE ai_evidence_values SET object_hash=(SELECT object_hash FROM ai_evidence_values WHERE job_id=? AND role='synthetic-descriptor-mutation' AND key='tamper') WHERE job_id=? AND role='guide-finite-request-v1' AND key=?").run(f.job.id,f.job.id,id)}finally{writer.close()}
  }
  return value
 }
 try{await expect(constructFiniteGuideContent(f.setups,f.options)).rejects.toThrow('descrittore cambiato prima del salvataggio');expect(changed).toBe(true);expect([...f.archive.values<any>('guide-segment-unit-result-v1')].some(r=>r.value.unitId===tamperedId)).toBe(false)}finally{f.close()}
},60000)

it('never approves a late native delta when its independent reviewer tries to pass an explicit count as qualitative',async()=>{const f=fixture();try{f.caseFailure();f.badFirstAuditPatch();await expect(constructFiniteGuideContent(f.setups,f.options)).rejects.toThrow('due risposte non valide');expect(f.stages.filter(s=>s==='repair-finite-cases')).toHaveLength(1);expect([...f.archive.values<any>('guide-segment-unit-result-v1')].some(r=>!r.value.accepted&&r.value.message.includes('numerale esplicito'))).toBe(true);const calls=f.calls;await expect(constructFiniteGuideContent(f.setups,f.options)).rejects.toThrow('due risposte non valide');expect(f.calls).toBe(calls);expect([...f.archive.values('guide-finite-approval-v1')]).toHaveLength(0)}finally{f.close()}},60000)

it('independently reviews a qualitative absence introduced by a late native patch and reopens without buying it again',async()=>{const f=fixture();try{f.caseFailure();f.badFirstAuditPatch('Nessuna promozione serve.');const result=await constructFiniteGuideContent(f.setups,f.options);expect(result.review.verdict).toBe('pass');expect(f.stages.filter(s=>s==='repair-finite-cases')).toHaveLength(1);expect([...f.archive.values<any>('guide-audit-language-pass-v1')].some(r=>r.value.targets.some((t:any)=>t.text==='Nessuna promozione serve.'))).toBe(true);const calls=f.calls;await constructFiniteGuideContent(f.setups,f.options);expect(f.calls).toBe(calls)}finally{f.close()}},60000)

it('executes the whole finite content cycle with two replies per case and resumes without any new model response',async()=>{
  const f=fixture()
  try{
    const result=await constructFiniteGuideContent(f.setups,f.options)
    expect(result.draft.chapters).toHaveLength(8);expect(result.draft.exercises).toHaveLength(2)
    expect(result.draft.scenarios.every(s=>s.replyComparison!.options.length===2&&s.analysisScope!.access.replyId===null)).toBe(true)
    expect(checkGuide(result.draft,f.options.packet).errors).toEqual([])
    expect(result.review.verdict).toBe('pass');expect(result.repairs).toBe(0)
    expect(f.stages.indexOf('review-finite-cases')).toBeLessThan(f.stages.indexOf('prose-finite-units'))
    expect(f.stages.at(-1)).toBe('review-finite-guide')
    const calls=f.calls,reopened=await constructFiniteGuideContent(f.setups,f.options)
    expect(f.calls).toBe(calls);expect(reopened.draft).toEqual(result.draft)
    expect(assertFiniteTransportHistory(f.archive).outcomes).toBeGreaterThan(10)
    expect([...f.archive.values('guide-attempt-start')]).toHaveLength(0) // no real provider calls
  }finally{f.close()}
},60000)

it('repairs only the affected prose unit after a final negative and retains its original review',async()=>{
  const f=fixture()
  try{
    f.textFailure();const result=await constructFiniteGuideContent(f.setups,f.options)
    expect(result.repairs).toBe(1)
    expect(result.draft.chapters.find(c=>c.kind==='decisions')!.body).toContain('Corrected')
    expect(f.stages.filter(s=>s==='prose-finite-units')).toHaveLength(2)
    expect(f.stages.filter(s=>s==='metadata-finite-cases')).toHaveLength(1)
    const negatives=[...f.archive.values<any>('guide-segment-unit-result-v1')].filter(r=>r.value.accepted&&r.value.value?.verdict==='revise')
    expect(negatives).toHaveLength(1)
    expect(result.review.resolutions.every(r=>r.disposition==='resolved')).toBe(true)
  }finally{f.close()}
},60000)

it('resumes the pending case patch after a negative, rejects an illegal delta and preserves every original',async()=>{
  const f=fixture()
  try{
    f.caseFailure();f.interruptBeforePatch();f.badFirstPatch()
    await expect(constructFiniteGuideContent(f.setups,f.options)).rejects.toThrow('Synthetic stop')
    const firstReviews=f.stages.filter(s=>s==='review-finite-cases').length,metadata=f.stages.filter(s=>s==='metadata-finite-cases').length
    const result=await constructFiniteGuideContent(f.setups,f.options)
    expect(result.repairs).toBe(1)
    expect(f.stages.filter(s=>s==='metadata-finite-cases')).toHaveLength(metadata)
    expect(f.stages.filter(s=>s==='review-finite-cases')).toHaveLength(firstReviews+1) // changed candidate only
    expect(result.draft.scenarios.every(s=>s.analysisScope!.limits[0].startsWith('Corrected'))).toBe(true)
    expect([...f.archive.values<any>('guide-segment-unit-result-v1')].some(r=>r.value.stage==='repair-finite-cases'&&r.value.accepted===false)).toBe(true)
    const calls=f.calls;await constructFiniteGuideContent(f.setups,f.options);expect(f.calls).toBe(calls)
  }finally{f.close()}
},60000)

it('blocks deletion of a known negative before any fresh request',async()=>{
  const f=fixture()
  try{
    f.caseFailure();f.interruptBeforePatch()
    await expect(constructFiniteGuideContent(f.setups,f.options)).rejects.toThrow('Synthetic stop')
    const negative=[...f.archive.values<any>('guide-segment-unit-result-v1')].find(r=>r.value.accepted&&r.value.value?.verdict==='revise')!,calls=f.calls
    const db=new DatabaseSync(f.file)
    try{db.prepare('DELETE FROM ai_evidence_values WHERE job_id=? AND role=? AND key=?').run(f.archive.id,'guide-segment-unit-result-v1',negative.key)}finally{db.close()}
    await expect(constructFiniteGuideContent(f.setups,f.options)).rejects.toThrow('risposta conosciuta')
    expect(f.calls).toBe(calls)
  }finally{f.close()}
},60000)

it('runs through the application caller, exact token planner and final approval, then recovers without a provider',async()=>{
  const f=fixture(true),config={provider:'codex' as const,source:'global' as const,model:null,reasoningEffort:null}
  let work=new AiAnalysisWork(join(f.folder,'work'),f.jobs,f.job.id,new AbortController().signal)
  try{
    const packet=f.options.packet,authorization={jobId:f.job.id,projectId:packet.basis.projectId,dependencyHash:packet.basis.dependencyHash,maximum:96,reason:'Isolated synthetic offline finite integration; no real provider authorized.'}
    const runner=async(prompt:string,_config:unknown,schema:object)=>f.rawResponse(/FASE: ([^\n]+)/.exec(prompt)![1],unpackGuideData(JSON.parse(prompt.split('\n\nDATI CONGELATI:\n')[1])),schema)
    const guide=await generateDeepGuide({packet,config,work,request:'Synthetic finite application test.',callBudgetAuthorization:authorization,runner})
    assertGuideReport({...packet.basis,guide});assertGuideIntegrity(guide)
    const readDb=new DatabaseSync(f.file,{readOnly:true})
    const before=readDb.prepare('SELECT COUNT(*) AS n FROM ai_evidence_values WHERE job_id=?').get(f.job.id)
    assertGuideSegmentApproval(guide,work.archive)
    expect(readDb.prepare('SELECT COUNT(*) AS n FROM ai_evidence_values WHERE job_id=?').get(f.job.id)).toEqual(before)
    readDb.close()
    expect(guide.generation.finiteOriginals?.plans).toHaveLength(2)
    expect(guide.generation.finiteOriginals?.evidenceAnchor).toBeDefined()
    for(const kind of ['anchor','scope','missing-anchor'] as const){
      const forged=structuredClone(guide),originals=forged.generation.finiteOriginals!
      if(kind==='anchor')originals.evidenceAnchor!.ourList.cards[0].count--
      if(kind==='scope')originals.sourceScope.dependencyHash='forged'
      if(kind==='missing-anchor')delete originals.evidenceAnchor
      expect(()=>assertGuideIntegrity(forged),kind).toThrow()
    }
    const setupFrames=[...work.archive.values<any>('guide-finite-request-v1')].filter(r=>r.value.request.validationId==='guide-finite-setup-frame-1')
    expect(setupFrames).toHaveLength(2)
    expect(setupFrames.every(r=>r.value.request.data.context.plan.thesis==='Independent synthetic protocol')).toBe(true)
    expect(guide.generation.scenarioOriginals?.cases).toHaveLength(2)
    expect(guide.generation.attempts.length).toBeGreaterThanOrEqual(17)
    expect(guide.generation.attempts.length).toBeLessThanOrEqual(96)
    const calls=f.calls
    work.close();work=new AiAnalysisWork(join(f.folder,'work'),f.jobs,f.job.id,new AbortController().signal)
    const recovered=await generateDeepGuide({packet,config,work,request:'Synthetic finite application test.',runner:async()=>{throw Error('Recovered guide must not invoke AI')}})
    expect(recovered).toEqual(guide);expect(f.calls).toBe(calls)
    const finals=[...work.archive.values<any>('guide-finite-request-v1')].filter(r=>r.value.request.data.reviewScope==='complete-guide')
    expect(finals).toHaveLength(2)
    expect(finals.map(r=>r.value.request.data.proofCaseIds).sort((a,b)=>a[0].localeCompare(b[0]))).toEqual([['scenario-1'],['scenario-2']])
    expect(finals.every(r=>r.value.request.data.draft.chapters.length===8&&r.value.request.data.draft.scenarios.length===2&&r.value.request.data.contexts.length===3)).toBe(true)
    const source=[...work.archive.values<any>('guide-segment-unit-result-v1')].find(r=>r.value.accepted&&r.value.unitId===finals[0].key)!
    const db=new DatabaseSync(f.file)
    try{db.prepare('DELETE FROM ai_evidence_values WHERE job_id=? AND role=? AND key=?').run(f.archive.id,'guide-segment-unit-result-v1',source.key)}finally{db.close()}
    expect(()=>assertGuideSegmentApproval(guide,work.archive)).toThrow()
    expect(f.calls).toBe(calls)
  }finally{work.close();f.close()}
},90000)

it('stops after two content repairs and does not spend again when reopening the same rejected candidate',async()=>{
  const f=fixture()
  try{
    f.alwaysFail()
    await expect(constructFiniteGuideContent(f.setups,f.options)).rejects.toThrow('dopo due riparazioni')
    expect(f.stages.filter(s=>s==='repair-finite-cases')).toHaveLength(2)
    const calls=f.calls
    await expect(constructFiniteGuideContent(f.setups,f.options)).rejects.toThrow('dopo due riparazioni')
    expect(f.calls).toBe(calls)
  }finally{f.close()}
},60000)

it('recovers invalid plan and critic formats with authenticated retry identities, without a content repair',async()=>{
  const f=fixture()
  try{
    f.badFirstPlan();f.badFirstCritic()
    const result=await constructFiniteGuideContent(f.setups,f.options)
    expect(result.repairs).toBe(0)
    const rows=[...f.archive.values<any>('guide-segment-unit-result-v1')]
    expect(rows.some(r=>r.value.stage==='finite-plans'&&r.value.accepted===false)).toBe(true)
    expect(rows.some(r=>r.value.stage==='finite-plans'&&r.value.accepted&&r.value.retryOrdinal===1)).toBe(true)
    expect(rows.some(r=>r.value.stage==='review-finite-cases'&&r.value.accepted===false)).toBe(true)
    expect(rows.some(r=>r.value.stage==='review-finite-cases'&&r.value.accepted&&r.value.retryOrdinal===1)).toBe(true)
    const calls=f.calls;await constructFiniteGuideContent(f.setups,f.options);expect(f.calls).toBe(calls)
  }finally{f.close()}
},60000)

it('rebuilds a requested finite revision without the legacy repair loop and binds the feedback into its final critic',async()=>{
  const f=fixture(true),config={provider:'codex' as const,source:'global' as const,model:null,reasoningEffort:null}
  let work=new AiAnalysisWork(join(f.folder,'work'),f.jobs,f.job.id,new AbortController().signal)
  try{
    const packet=f.options.packet,runner=async(prompt:string,_config:unknown,schema:object)=>f.rawResponse(/FASE: ([^\n]+)/.exec(prompt)![1],unpackGuideData(JSON.parse(prompt.split('\n\nDATI CONGELATI:\n')[1])),schema)
    const authorization=(id:string)=>({jobId:id,projectId:packet.basis.projectId,dependencyHash:packet.basis.dependencyHash,maximum:96,reason:'Offline finite revision test, synthetic responses only.'})
    const previous=await generateDeepGuide({packet,config,work,request:'Synthetic first guide.',callBudgetAuthorization:authorization(f.job.id),runner})
    work.close()
    const job=f.jobs.start('matchup-revise',packet.basis.projectId,'synthetic-revision')
    work=new AiAnalysisWork(join(f.folder,'revision'),f.jobs,job.id,new AbortController().signal)
    const report={...packet.basis,guide:previous} as any,request='Explain the conditional advice more clearly.'
    const guide=await generateDeepGuide({packet,config,work,previous:report,revision:true,request,callBudgetAuthorization:authorization(job.id),runner})
    assertGuideIntegrity(guide);assertGuideSegmentApproval(guide,work.archive)
    expect(guide.generation.parentDependencyHash).toBe(previous.basis.dependencyHash)
    const final=[...work.archive.values<any>('guide-finite-request-v1')].find(r=>r.value.request.data.reviewScope==='complete-guide')!.value.request
    expect(final.data.userContext).toMatchObject({request,revision:true,parentGuideHash:guideHash(previous)})
    expect(final.data.userContext.previous.scenarios).toHaveLength(2)
    expect([...work.archive.values('guide-segment-repair-epoch-v1')]).toHaveLength(0)
    const calls=f.calls
    await expect(generateDeepGuide({packet,config,work,previous:report,revision:true,request:'Different feedback',runner})).rejects.toThrow('un’altra richiesta')
    expect(f.calls).toBe(calls)
  }finally{work.close();f.close()}
},180000)

it('bounds top-level plan format failures to two instead of consuming the remaining exceptional allowance',async()=>{
  const f=fixture(true),config={provider:'codex' as const,source:'global' as const,model:null,reasoningEffort:null},work=new AiAnalysisWork(join(f.folder,'work'),f.jobs,f.job.id,new AbortController().signal)
  try{
    f.badInitialPlans(10)
    const packet=f.options.packet,authorization={jobId:f.job.id,projectId:packet.basis.projectId,dependencyHash:packet.basis.dependencyHash,maximum:96,reason:'Offline retry-bound regression only.'},runner=async(prompt:string,_config:unknown,schema:object)=>f.rawResponse(/FASE: ([^\n]+)/.exec(prompt)![1],unpackGuideData(JSON.parse(prompt.split('\n\nDATI CONGELATI:\n')[1])),schema)
    await expect(generateDeepGuide({packet,config,work,request:'Synthetic invalid initial plan.',callBudgetAuthorization:authorization,runner})).rejects.toThrow()
    expect(f.calls).toBe(2);expect(f.stages).toEqual(['plan','plan'])
    expect([...work.archive.values('guide-invalid-response')]).toHaveLength(2)
    await expect(generateDeepGuide({packet,config,work,request:'Synthetic invalid initial plan.',runner})).rejects.toThrow()
    expect(f.calls).toBe(2)
  }finally{work.close();f.close()}
},60000)

it('authenticates an audit-only correction through the complete application path and reopens the approved synthetic guide without calls',async()=>{
 const f=fixture(true),work=new AiAnalysisWork(join(f.folder,'audit-work'),f.jobs,f.job.id,new AbortController().signal),packet=f.options.packet,config={provider:'codex' as const,source:'global' as const,model:null,reasoningEffort:null};let changed=false
 try{
  const runner=async(prompt:string,_config:unknown,schema:object)=>{const stage=/FASE: ([^\n]+)/.exec(prompt)![1],data=unpackGuideData(JSON.parse(prompt.split('\n\nDATI CONGELATI:\n')[1])),raw=await f.rawResponse(stage,data,schema) as any;if(stage==='segments-finite-audits'&&!changed){raw.units[0].response.tactical.comparison='';changed=true}return raw}
  const request='Synthetic audit-only application-path regression.',guide=await generateDeepGuide({packet,config,work,request,callBudgetAuthorization:{jobId:f.job.id,projectId:packet.basis.projectId,dependencyHash:packet.basis.dependencyHash,maximum:96,reason:'Offline synthetic audit-only regression.'},runner})
  expect(changed).toBe(true);assertGuideIntegrity(guide);assertGuideSegmentApproval(guide,work.archive)
  expect([...work.archive.values<any>('guide-native-audit-repair-v1')].some(r=>r.value.refs.length>0)).toBe(true)
  expect([...work.archive.values<any>('guide-segment-unit-result-v1')].some(r=>r.value.accepted&&r.value.value?.body?.tactical===null)).toBe(true)
  expect(guide.scenarios[0].tacticalAudit?.some(r=>r.cards.includes('our-basic'))).toBe(true)
  const calls=f.calls;expect(await generateDeepGuide({packet,config,work,request,runner:async()=>{throw Error('No fresh call on recovery')}})).toEqual(guide);expect(f.calls).toBe(calls)
 }finally{work.close();f.close()}
},90000)

it('routes a setup-scoped audit finding through correction and independent review without reconstructing a paid physical turn',async()=>{
 const f=fixture(),original=f.options.call;let negative=false,rereview=false
 f.options.call=async request=>original({...request,read:raw=>{
  const value=raw as any,data=request.data as any
  if(request.stage==='review-premise-main'&&!negative){negative=true;const r=value.units[0].response;r.verdict='revise';r.repairScope='setup';r.findings=[{severity:'major',targetId:'scenario-1',message:'Synthetic audit wording needs correction.',correction:'Correct only the audit, with all movements unchanged.',sourceIds:['card:p'],proposedActions:[],counterlines:[]}]}
  else if(request.stage==='review-premise-main'&&data.units.some((u:any)=>u.data.auditRepairContext))rereview=true
  if(request.stage==='review-premise-audit-routing')for(const unit of value.units){const d=data.units.find((u:any)=>u.unitId===unit.unitId).data;unit.response.mode='audit';unit.response.mapping=d.review.findings.map((_:any,i:number)=>({findingIndex:i,targets:[JSON.stringify(['turns','ours','tactical'])]}));unit.response.reason='Synthetic audit-only classification.'}
  return request.read(value)
 }})
 try{const result=await constructFiniteGuideContent(f.setups,f.options);expect(result.review.verdict).toBe('pass');expect(rereview).toBe(true);expect(f.stages).not.toContain('segments-finite-setup-frames');expect([...f.archive.values<any>('guide-finite-request-v1')].filter(r=>r.value.request.validationId==='guide-finite-turn-frame-1'&&r.value.request.data.parentContext.stage==='segment-scenario-1-ours')).toHaveLength(1);const calls=f.calls;await constructFiniteGuideContent(f.setups,f.options);expect(f.calls).toBe(calls)}finally{f.close()}
},90000)

