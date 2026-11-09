import {createHash} from 'node:crypto'
import {expect,it} from 'vitest'
import {guideRequestOverhead,estimateGuideRequestOverhead} from '../src/main/guide-request-calibration'
import {createGuideRequestPlanner,planGuideRequest,unpackGuideData,GUIDE_BUDGET_POLICY,type GuideBudgetSample} from '../src/main/guide-request-budget'

const sample=(visibleTokens:number,overhead:number):GuideBudgetSample=>({visibleTokens,inputTokens:visibleTokens+overhead,requestInputTokens:visibleTokens+overhead,requestReconciled:true,usageScope:'codex-turn',outputTokens:1000,family:'review'})
const samples=[sample(10000,11000),sample(90000,11100)]
const facts=(n:number)=>({facts:Array.from({length:n},(_,i)=>createHash('sha256').update('Independent exact fact '+i).digest('hex'))})
it('covers every reconciled request with at least 10% plus 2048, preserving all observations and overhead maxima',()=>{
 const before=JSON.stringify(samples),model=guideRequestOverhead(samples)!
 expect(model).toEqual({model:'request-overhead-v1',overheadTokens:11100,visibleFactor:1.12,overheadFactor:1.1})
 for(const s of samples)expect(estimateGuideRequestOverhead(s.visibleTokens,model)).toBeGreaterThanOrEqual(Math.ceil(s.requestInputTokens!*1.1)+2048)
 const higher=guideRequestOverhead([...samples,sample(50000,20000)])!
 expect(higher.overheadTokens).toBe(20000);expect(estimateGuideRequestOverhead(80000,higher)).toBeGreaterThan(estimateGuideRequestOverhead(80000,model))
 expect(JSON.stringify(samples)).toBe(before)
})
it('does not infer request overhead from turn totals, mixed/missing receipts, invalid counters or a single observed size',()=>{
 for(const rows of [[],[samples[0]],[samples[0],samples[0]],samples.map(s=>({...s,requestReconciled:undefined})),[...samples,{...samples[0],usageScope:undefined}],[...samples,{...samples[0],requestInputTokens:samples[0].inputTokens+1}],[...samples,{...samples[0],requestInputTokens:0}]])expect(guideRequestOverhead(rows)).toBeNull()
})
it('retains admitted legacy requests byte-for-byte and requires explicit planner authority for the alternate estimate',()=>{
 const data={original:'All facts and all controls.'},old=planGuideRequest('review-affine','Full instructions',data,{},samples,8,2)
 expect(old.budget.fits).toBe(true);expect(createGuideRequestPlanner(true)('review-affine','Full instructions',data,{},samples,8,2)).toEqual(old)
 expect(createGuideRequestPlanner()('review-affine','Full instructions',data,{},samples,8,2)).toEqual(old)
})
it('rechecks an actual-sized unchanged payload under the overhead envelope while keeping hard limits, output and reserves',()=>{
 const data=facts(1800),before=JSON.stringify(data),args=['review-affine','Retain every exact source.',data,{},samples,8,2,1,true,true,true,true] as const
 const legacy=planGuideRequest(...args),current=createGuideRequestPlanner(true)(...args)
 expect(legacy.budget.fits).toBe(false);expect(current.budget.fits).toBe(true);expect(current.prompt).toBe(legacy.prompt)
 expect(current.budget.calibration).toMatchObject({model:'request-overhead-v1',overheadTokens:11100,legacyRatioFactor:legacy.budget.calibrationFactor})
 expect(current.budget.reservedOutput).toBe(legacy.budget.reservedOutput);expect(current.budget.reservedCalls).toBe(2);expect(current.budget.margin).toBe(GUIDE_BUDGET_POLICY.margin)
 expect(JSON.stringify(unpackGuideData(current.data))).toBe(before);expect(JSON.stringify(data)).toBe(before)
})
it('keeps truly oversized, insufficient-call and unmeasured requests closed',()=>{
 const planner=createGuideRequestPlanner(true),large=planner('review-affine','Every fact remains.',facts(4000),{},samples,8,2,1,true,true,true,true)
 expect(large.budget.fits).toBe(false);expect(large.budget.estimatedInput).toBeGreaterThan(GUIDE_BUDGET_POLICY.inputMaximum)
 const unfunded=planner('review-affine','Every fact remains.',facts(1800),{},samples,2,2,1,true,true,true,true)
 expect(unfunded.budget.fits).toBe(false);expect(unfunded.budget.calibration?.model).toBeUndefined()
 const mixed=[...samples,{...samples[0],requestReconciled:undefined}],unknown=planner('review-affine','Every fact remains.',facts(1800),{},mixed,8,2,1,true,true,true,true)
 expect(unknown.budget.fits).toBe(false);expect(unknown.budget.calibration?.model).toBeUndefined()
})
