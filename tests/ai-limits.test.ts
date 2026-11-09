import {expect,it} from 'vitest'
import {mkdtempSync,rmSync} from 'node:fs'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {createElement} from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
import {readAiQuota,readAiBudget} from '../src/shared/ai-limits'
import {readAiDiagnostics} from '../src/shared/ai-diagnostics'
import {AiQuotaView,AiBudgetStatus} from '../src/renderer/src/AiLimits'
import {planGuideRequest,guideBudgetSnapshot,guideBudgetStop,assertGuideRequestFits} from '../src/main/guide-request-budget'
import {readStructuredCodexOutput} from '../src/main/codex-evidence-plan'
import {AiFailure,aiFailureCode} from '../src/main/ai-failure'
import {AiAnalysisWork} from '../src/main/ai-analysis-work'
import {ProjectStore} from '../src/main/project-store'
import {AiJobStore} from '../src/main/ai-job-store'
import {canResumeAiJob,aiJobInterruptionText} from '../src/shared/ai-job-lifecycle'

it('reads live-shaped quota windows, distinguishes missing data from zero usage and ignores unrelated secrets',()=>{
  const quota=readAiQuota({rateLimitsByLimitId:{codex:{limitId:'codex',primary:{usedPercent:88,windowDurationMins:10080,resetsAt:1794048868},secondary:null,token:'SECRET'}},rateLimitResetCredits:{availableCount:2,credits:[{id:'SECRET'}]}})
  expect(quota.status).toBe('available');expect(quota.buckets[0].primary!.usedPercent).toBe(88)
  expect(JSON.stringify(quota)).not.toContain('SECRET')
  const html=renderToStaticMarkup(createElement(AiQuotaView,{quota}))
  expect(html).toContain('12% disponibile');expect(html).toContain('settimanale');expect(html).toContain('Reset previsto')
  expect(readAiQuota({rateLimits:{primary:{usedPercent:0}}}).status).toBe('available')
  expect(readAiQuota({rateLimitsByLimitId:{},rateLimits:{primary:{usedPercent:0}}}).status).toBe('available')
  for(const raw of [null,{}, {rateLimits:{primary:{usedPercent:'0'}}},{rateLimits:{primary:{usedPercent:NaN}}}]){
    const q=readAiQuota(raw);expect(q.status).toBe('unavailable')
    const text=renderToStaticMarkup(createElement(AiQuotaView,{quota:q}));expect(text).toContain('non disponibile');expect(text).not.toContain('% disponibile')
  }
})

it('persists and displays conservative calibration provenance without converting turn usage into context or account tokens',()=>{
  const plan=planGuideRequest('scenarios-2','Full instructions',{}, {},[{family:'scenario',visibleTokens:60000,inputTokens:140000,outputTokens:12000,usageScope:'codex-turn'}],5,3)
  const budget=readAiBudget({...guideBudgetSnapshot(plan.budget),secret:'PRIVATE'})!
  expect(budget.calibration).toMatchObject({samples:1,turnSamples:1,unknownSamples:0,largestInput:140000})
  const html=renderToStaticMarkup(createElement(AiBudgetStatus,{job:{status:'running',progress:{diagnostics:{budget}}} as any}))
  expect(html).toContain('Calibrazione prudenziale');expect(html).toContain('non misura il contesto')
  expect(readAiBudget({...budget,calibration:{...budget.calibration,factor:Infinity}})!.calibration).toBeUndefined()
  const raw:any=readStructuredCodexOutput('{"answer":"ok"}',{inputTokens:140000,outputTokens:12000,cachedInputTokens:0},{scope:'codex-turn',completedTurns:1,completedItems:3,requestInputTokens:null})
  expect(raw.__usage.inputTokens).toBe(140000);expect(raw.__usageEvidence.requestInputTokens).toBeNull()
})
it('preserves the reconciled request-overhead model in diagnostics and explains its additive estimate',()=>{
 const base=guideBudgetSnapshot(planGuideRequest('review','Full facts',{}, {},[],8,2).budget)
 const calibration={factor:1.12,samples:2,turnSamples:2,unknownSamples:0,largestInput:101100,measurement:'request-usage-conservative' as const,requestSamples:2,largestRequestInput:101100,model:'request-overhead-v1' as const,overheadTokens:11100,visibleFactor:1.12,overheadFactor:1.1,legacyRatioFactor:2.31}
 const budget=readAiBudget({...base,calibration})!
 expect(budget.calibration).toEqual(calibration)
 const html=renderToStaticMarkup(createElement(AiBudgetStatus,{job:{status:'running',progress:{diagnostics:{budget}}} as any}))
 expect(html).toContain('costo aggiuntivo massimo misurato');expect(html).toContain('11.100');expect(html).toContain('non la quota residua')
 for(const bad of [{overheadTokens:-1},{visibleFactor:0.8},{requestSamples:1},{unknownSamples:1,turnSamples:1},{model:'unknown'}])expect(readAiBudget({...base,calibration:{...calibration,...bad}})!.calibration).toBeUndefined()
})

it('separates token, call and response-size budgets without treating any as account quota',()=>{
  const plan=planGuideRequest('review-1','Review',{facts:'Full facts'}, {},[],3,2)
  const token={...plan.budget,estimatedInput:160000,fits:false}
  const error=guideBudgetStop('review-1',3,3,token)
  expect(error.code).toBe('token-budget');expect(error.budget!.reasons).toContain('input-tokens')
  const html=renderToStaticMarkup(createElement(AiBudgetStatus,{job:{status:'interrupted',progress:{diagnostics:{failureCode:error.code,budget:error.budget,suspensionReason:'failure'}}} as any}))
  expect(html).toContain('budget di token insufficiente');expect(html).toContain('160.000 / 128.000 token')
  const calls=guideBudgetStop('review-1',3,4,token)
  expect(calls.code).toBe('call-budget');expect(calls.budget!.requiredCalls).toBe(4)
  const oversized={...plan,budget:{...plan.budget,bytes:500001,fits:false}}
  expect(()=>assertGuideRequestFits(oversized)).toThrow(AiFailure)
  try{assertGuideRequestFits(oversized)}catch(error){expect(aiFailureCode(error)).toBe('request-limit')}
  const snapshot=readAiBudget({...guideBudgetSnapshot(token),secret:'PRIVATE'})!
  expect(JSON.stringify(snapshot)).not.toContain('PRIVATE')
  expect(readAiBudget({...snapshot,stage:'C:/private/path'})).toBeUndefined()
})

it('persists a stop before any model call and exposes measured remaining calls with partial token usage',()=>{
  const folder=mkdtempSync(join(tmpdir(),'pokeguru-limits-')),file=join(folder,'data.sqlite')
  const projects=new ProjectStore(file),jobs=new AiJobStore(file),project=projects.create({name:'Limits fixture',format:'STANDARD'})
  const job=jobs.start('matchup-generate',project.id,'matchup:'+project.id),work=new AiAnalysisWork(join(folder,'work'),jobs,job.id,new AbortController().signal)
  try{
    const error=guideBudgetStop('review-scenarios-1',3,4)
    work.failure(error);work.guideProgress({formatVersion:1,attempts:5,failedAttempts:2,attemptLimit:8,inputTokens:1000,outputTokens:500,cachedInputTokens:0,durationMs:1,localErrors:0,reviewFindings:0,validated:false,usageIncomplete:true})
    jobs.suspend(job.id,error.message,'failure')
    const reopened=new AiJobStore(file)
    try{
      const stored=reopened.get(job.id)!
      expect(stored.progress!.diagnostics!.failureCode).toBe('call-budget');expect(stored.progress!.diagnostics!.budget!.remainingCalls).toBe(3)
      expect(canResumeAiJob({...stored,progress:{...stored.progress!,diagnostics:{...stored.progress!.diagnostics,resumable:true}}})).toBe(false)
      const html=renderToStaticMarkup(createElement(AiBudgetStatus,{job:stored}))
      expect(html).toContain('chiamate insufficienti');expect(html).toContain('necessarie: 4');expect(html).toContain('residue 3');expect(html).toContain('Consumo parziale')
      expect(html).not.toContain('% disponibile')
      expect([...work.archive.values('guide-attempt-start')]).toHaveLength(0)
    }finally{reopened.close()}
  }finally{work.close();jobs.close();projects.close();rmSync(folder,{recursive:true,force:true})}
})

it('retains only budget whitelist fields in exported diagnostics and preserves legacy entries',()=>{
  expect(readAiDiagnostics({failureCode:'quota'})).toEqual({failureCode:'quota'})
  const b=guideBudgetStop('prose',1,2).budget!
  const clean=readAiDiagnostics({budget:{...b,rawPrompt:'SECRET'},failureCode:'call-budget'})
  expect(clean.budget!.reasons).toEqual(['calls']);expect(JSON.stringify(clean)).not.toContain('SECRET')
  expect(readAiDiagnostics({budget:{...b,remainingCalls:-1}}).budget).toBeUndefined()
})

it('persists and displays the shared delivery reserve separately from provider quota',()=>{
 const guide={formatVersion:1,attempts:25,failedAttempts:2,attemptLimit:144,inputTokens:1,outputTokens:1,cachedInputTokens:0,durationMs:100,localErrors:0,reviewFindings:0,validated:false,delivery:{contract:'bounded-delivery-1',repairLimit:16,repairsUsed:7,raw:'SECRET'}}
 const clean=readAiDiagnostics({guide});expect(clean.guide?.delivery).toEqual({contract:'bounded-delivery-1',repairLimit:16,repairsUsed:7});expect(JSON.stringify(clean)).not.toContain('SECRET')
 const html=renderToStaticMarkup(createElement(AiBudgetStatus,{job:{progress:{diagnostics:clean}} as any}));expect(html).toContain('Riserva condivisa');expect(html).toContain('residue 9');expect(html).toContain('riapertura conserva')
 expect(readAiDiagnostics({guide:{...guide,delivery:{...guide.delivery,repairsUsed:17}}}).guide?.delivery).toBeUndefined()
})

it('recognizes structured quota identifiers without confusing them with local budget failures',()=>{
  for(const code of ['usage_limit_reached','organization_usage_limit_exceeded','rate_limit_exceeded','credit_balance_exhausted','credits_depleted'])expect(aiFailureCode(new Error(code))).toBe('quota')
  expect(aiFailureCode(guideBudgetStop('plan',0,1))).toBe('call-budget')
})

it('displays an exhausted repair reserve with total calls still available and rejects inconsistent counters',()=>{
 const snapshot={stage:'review-premise-main',checkedAt:'2026-11-07T00:00:00.000Z',outcome:'blocked',estimateOnly:true,reasons:['repair-calls'],remainingCalls:123,requiredCalls:9,repairs:{limit:16,used:16,remaining:0,required:1,secret:'PRIVATE'}}
 const budget=readAiBudget(snapshot)!;expect(budget.repairs).toEqual({limit:16,used:16,remaining:0,required:1});expect(JSON.stringify(budget)).not.toContain('PRIVATE')
 const html=renderToStaticMarkup(createElement(AiBudgetStatus,{job:{status:'interrupted',progress:{diagnostics:{failureCode:'call-budget',suspensionReason:'failure',budget}}} as any}))
 expect(html).toContain('riserva per le correzioni insufficiente');expect(html).toContain('Chiamate disponibili al controllo: 123');expect(html).toContain('Correzioni disponibili al controllo: 0');expect(html).toContain('autorizzazione esplicita');expect(html).not.toContain('quota del servizio Codex raggiunta')
 for(const repairs of [{...budget.repairs!,remaining:1},{...budget.repairs!,used:17},{...budget.repairs!,required:-1}])expect(readAiBudget({...budget,repairs})).toBeUndefined()
 expect(readAiBudget({...budget,outcome:'ready',reasons:[]})).toBeUndefined();expect(readAiBudget({...budget,repairs:undefined})).toBeUndefined()
})

it('explains legacy repair exhaustion without rewriting the stored ready token snapshot',()=>{
 const budget=guideBudgetSnapshot(planGuideRequest('review-premise-main','All facts',{}, {},[],123,8).budget),guide={formatVersion:1,attempts:41,failedAttempts:1,attemptLimit:164,inputTokens:1,outputTokens:1,cachedInputTokens:0,durationMs:1,localErrors:0,reviewFindings:0,validated:false,delivery:{contract:'bounded-delivery-1',repairLimit:16,repairsUsed:16}},diagnostics={failureCode:'call-budget',suspensionReason:'failure',budget,guide},before=JSON.stringify(diagnostics)
 const html=renderToStaticMarkup(createElement(AiBudgetStatus,{job:{status:'interrupted',progress:{diagnostics}} as any}));expect(html).toContain('riserva per le correzioni insufficiente');expect(html).toContain('123');expect(JSON.stringify(diagnostics)).toBe(before)
 expect(aiJobInterruptionText({status:'interrupted',progress:{diagnostics}} as any)).toContain('riprendere il lavoro salvato');expect(aiJobInterruptionText({status:'interrupted',progress:{diagnostics}} as any)).not.toContain('nuova richiesta')
 const active=renderToStaticMarkup(createElement(AiBudgetStatus,{job:{status:'running',progress:{diagnostics}} as any}));expect(active).not.toContain('Analisi ferma:')
 const updated=readAiDiagnostics({guide:{...guide,delivery:{contract:'bounded-delivery-1',repairLimit:32,repairsUsed:17}}});expect(updated.guide?.delivery).toEqual({contract:'bounded-delivery-1',repairLimit:32,repairsUsed:17})
 expect(readAiDiagnostics({guide:{...guide,delivery:{contract:'bounded-delivery-1',repairLimit:165,repairsUsed:17}}}).guide?.delivery).toBeUndefined()
})

it('does not collapse output-size failures into malformed JSON or provider token limits',()=>{
  expect(()=>readStructuredCodexOutput('x'.repeat(100001))).toThrow('100.000 caratteri')
  try{readStructuredCodexOutput('x'.repeat(100001))}catch(error){expect(aiFailureCode(error)).toBe('request-limit')}
  try{readStructuredCodexOutput('{bad')}catch(error){expect(aiFailureCode(error)).toBe('invalid-response')}
  expect(readStructuredCodexOutput('{"answer":"ok"}')).toMatchObject({answer:'ok',__responseCharacters:15})
})

it('stops an oversized output before tokenizing input and never exposes sentinel zeroes as measured input',()=>{
 const data={original:'complete context '.repeat(50000)},plan=planGuideRequest('review-premise-audit-language','All original facts',data,{},[],164,25,6,false,true,true,true)
 expect(plan.budget.inputUnmeasured).toBe(true);expect(plan.data).toBe(data);expect(plan.prompt).toContain(data.original);expect(plan.budget.fits).toBe(false)
 const snapshot=guideBudgetSnapshot(plan.budget);expect(snapshot.reasons).toEqual(['response-size']);expect(snapshot.estimatedResponseCharacters).toBe(108000);expect(snapshot.estimatedInputTokens).toBeUndefined();expect(snapshot.requestBytes).toBeUndefined()
 const html=renderToStaticMarkup(createElement(AiBudgetStatus,{job:{status:'failed',progress:{diagnostics:{budget:snapshot,failureCode:'request-limit'}}} as any}));expect(html).not.toContain('Input stimato');expect(html).toContain('108.000');expect(readAiDiagnostics({budget:snapshot}).budget).toEqual(snapshot)
})
