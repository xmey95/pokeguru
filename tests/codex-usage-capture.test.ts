import {expect,it} from 'vitest'
import {readCodexUsageBatch,reconcileCodexUsage,startCodexUsageCapture} from '../src/main/codex-usage-capture'
import {planGuideRequest} from '../src/main/guide-request-budget'
const batch={resourceLogs:[{scopeLogs:[{logRecords:[{attributes:[{key:'event.kind',value:{stringValue:'response.completed'}},{key:'input_token_count',value:{intValue:'40000'}},{key:'output_token_count',value:{intValue:'200'}},{key:'user_prompt',value:{stringValue:'DO NOT ARCHIVE THIS TEXT'}}]},{attributes:[{key:'event.kind',value:{stringValue:'response.completed'}},{key:'input_token_count',value:{intValue:'45000'}},{key:'output_token_count',value:{intValue:'300'}}]}]}]}]}
it('uses response maxima only after exact reconciliation and retains turn accounting separately',()=>{
 const parsed=readCodexUsageBatch(batch),usage={inputTokens:85000,outputTokens:500,cachedInputTokens:0},evidence=reconcileCodexUsage(parsed.events,usage)
 expect(evidence.status).toBe('reconciled');expect(evidence.maximumInputTokens).toBe(45000);expect(JSON.stringify(parsed)).not.toContain('DO NOT ARCHIVE')
 expect(reconcileCodexUsage([...parsed.events,...parsed.events],usage).maximumInputTokens).toBeNull()
 const sample={family:'scenario',visibleTokens:40000,inputTokens:85000,outputTokens:500,usageScope:'codex-turn' as const}
 const old=planGuideRequest('review','All facts',{}, {},[sample],8,2)
 const measured=planGuideRequest('review','All facts',{}, {},[{...sample,requestInputTokens:45000,requestReconciled:true}],8,2)
 expect(old.budget.calibrationFactor).toBeCloseTo(85000/40000*1.1)
 expect(measured.budget.calibrationFactor).toBeCloseTo(45000/40000*1.1);expect(measured.budget.calibration).toMatchObject({largestInput:85000,largestRequestInput:45000,requestSamples:1,measurement:'request-usage-conservative'})
})
it('receives only authenticated-path local OTLP JSON and closes without an external destination',async()=>{
 const capture=await startCodexUsageCapture()
 try{
  const endpoint=/endpoint="([^"]+)"/.exec(capture.args.join(' '))![1]
  expect(endpoint).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/[a-f0-9]{48}$/)
  const wrong=await fetch(new URL('/wrong',endpoint),{method:'POST',body:'{}'});expect(wrong.status).toBe(404)
  const response=await fetch(endpoint,{method:'POST',body:JSON.stringify(batch)});expect(response.status).toBe(200)
  expect(capture.snapshot({inputTokens:85000,outputTokens:500,cachedInputTokens:0}).maximumInputTokens).toBe(45000)
 }finally{await capture.close()}
})
it('reconciles only a unique complete turn suffix, retains the prefix and never hides a larger request',()=>{
 const prefix={inputTokens:2,outputTokens:0,cachedInputTokens:0},responses=[{inputTokens:54449,outputTokens:127,cachedInputTokens:0},{inputTokens:54904,outputTokens:5073,cachedInputTokens:54400}],usage={inputTokens:109353,outputTokens:5200,cachedInputTokens:54400}
 const r=reconcileCodexUsage([prefix,...responses],usage)
 expect(r).toMatchObject({status:'reconciled',accountingPrefixEvents:1,maximumInputTokens:54904});expect(r.events).toEqual([prefix,...responses])
 expect(reconcileCodexUsage([...responses,...responses],usage).status).toBe('unreconciled')
 expect(reconcileCodexUsage([{...prefix,outputTokens:1},...responses],usage).status).toBe('unreconciled')
 expect(reconcileCodexUsage([{...prefix,inputTokens:200000},...responses],usage).status).toBe('unreconciled')
 expect(reconcileCodexUsage([prefix,{...prefix,inputTokens:0},...responses],usage).status).toBe('unreconciled')
 expect(reconcileCodexUsage([prefix,responses[1]],usage).status).toBe('unreconciled')
})
