import {expect,it} from 'vitest'
import {packGuideDataV3,packGuideDataV4,reorderGuideDataReferences,unpackGuideDataV3} from '../src/main/guide-wire-dense'
import {planGuideRequest,unpackGuideData,GUIDE_BUDGET_POLICY} from '../src/main/guide-request-budget'

it.each([3,4])('permutes v%i dictionary references without changing literals, Unicode, nested JSON or delta bases',version=>{
 const shared={printId:'unrelated-print',count:1,zone:'bench',reason:'Every source condition stays intact.'}
 const data={rare:Array.from({length:80},(_,i)=>({...shared,printId:'unrelated-'+i,count:i%4})),repeated:Array(120).fill(shared),negative:-13,literals:[-1,['=',-3],['^0',0,-4],['!',1],['?',-7],['+',-2],'^18'],source:JSON.stringify({shared,literals:['^0',-1,'+']}),text:'Unicode 🐦 prefix '+JSON.stringify(shared)+' suffix'}
 const original=JSON.stringify(data),encoded=version===3?packGuideDataV3(data):packGuideDataV4(data),before=JSON.stringify(encoded),ordered:any=reorderGuideDataReferences(encoded)
 expect(JSON.stringify(unpackGuideDataV3(ordered))).toBe(original);expect(JSON.stringify(encoded)).toBe(before);expect(JSON.stringify(data)).toBe(original)
 expect(ordered.encoding).toBe((encoded as any).encoding);expect(ordered.expandedHash).toBe((encoded as any).expandedHash)
 expect(reorderGuideDataReferences(ordered)).toEqual(ordered)
 const corrupt=structuredClone(ordered);corrupt.expandedHash='wrong';expect(()=>reorderGuideDataReferences(corrupt)).toThrow('Hash')
 const absent=structuredClone(ordered);absent.root=-999999;expect(()=>reorderGuideDataReferences(absent)).toThrow('assente')
})

it.each([false,true])('admits a size-blocked payload only if measured ordering fits, preserving fitted requests and calibration (shared rare facts: %s)',sharedRare=>{
 const rare=Array.from({length:1200},(_,i)=>({printId:'unrelated-'+i,zone:'deck',copies:i%4,reason:'Complete unique condition '+i}))
 const data={rare:sharedRare?rare.flatMap(r=>[r,r]):rare,repeated:Array.from({length:2400},()=>({printId:'frequent-physical-printing',zone:'hand',copies:1,reason:'One complete repeated source.'}))},before=JSON.stringify(data)
 const plan=(samples:any[],remaining:number)=>planGuideRequest('metadata-independent','All sources, alternatives and controls remain.',data,{},samples,remaining,3,1,true,true,true,true)
 const unfunded=plan([],0),ordinary=plan([],32)
 expect(ordinary.budget.fits).toBe(true);expect(ordinary.data).toEqual(unfunded.data);expect(ordinary.prompt).toBe(unfunded.prompt)
 const sample={family:'metadata',visibleTokens:unfunded.budget.visibleTokens,inputTokens:Math.ceil((GUIDE_BUDGET_POLICY.inputMaximum+500-2048)/1.1),outputTokens:1000},samples=[sample],sampleBefore=JSON.stringify(samples)
 const blocked=plan(samples,0),admitted=plan(samples,32)
 expect(blocked.budget.estimatedInput).toBeGreaterThan(GUIDE_BUDGET_POLICY.inputMaximum);expect(blocked.budget.fits).toBe(false)
 expect(admitted.budget.fits,JSON.stringify({blocked:blocked.budget,admitted:admitted.budget})).toBe(sharedRare)
 if(sharedRare){expect(admitted.budget.estimatedInput).toBeLessThanOrEqual(GUIDE_BUDGET_POLICY.inputMaximum);expect(admitted.budget.visibleTokens).toBeLessThan(blocked.budget.visibleTokens)}else{expect(admitted.budget.estimatedInput).toBeGreaterThan(GUIDE_BUDGET_POLICY.inputMaximum)}
 expect(admitted.budget.calibration).toEqual(blocked.budget.calibration)
 expect(admitted.budget.reservedOutput).toBe(blocked.budget.reservedOutput);expect(admitted.budget.reservedCalls).toBe(3);expect(admitted.budget.margin).toBe(GUIDE_BUDGET_POLICY.margin)
 expect(JSON.stringify(unpackGuideData(admitted.data))).toBe(before);expect(JSON.stringify(data)).toBe(before);expect(JSON.stringify(samples)).toBe(sampleBefore)
 expect(()=>reorderGuideDataReferences({encoding:'plain',data})).toThrow('v3/v4')
})
