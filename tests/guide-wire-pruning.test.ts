import {it,expect} from 'vitest'
import {createHash} from 'node:crypto'
import {packGuideDataV3,packGuideDataV4,pruneGuideDataDictionary,reorderGuideDataReferences,unpackGuideDataV3} from '../src/main/guide-wire-dense'
import {planGuideRequest,GUIDE_BUDGET_POLICY,unpackGuideData} from '../src/main/guide-request-budget'

it.each([3,4])('inlines only unshared v%i dictionary entries, retaining delta bases, literals, property order and exact original JSON',version=>{
 const value={rows:Array.from({length:70},(_,i)=>({originalIdentity:'independent-'+i,physicalCount:i%4,originalCondition:'Complete original source condition '+i})),repeated:Array(10).fill({originalIdentity:'same',physicalCount:1,originalCondition:'Keep shared proof intact.'}),literals:[-1,['=',-3],['^0',0,-4],['!',1],['?',-7],['+',-2],'^18'],unicode:'  Pokémon 🐦\n',source:JSON.stringify({negative:-12,fields:['^0',1,'+']})}
 const before=JSON.stringify(value),encoded:any=version===3?packGuideDataV3(value):packGuideDataV4(value),originalEncoding=JSON.stringify(encoded),pruned=pruneGuideDataDictionary(encoded),ordered=reorderGuideDataReferences(pruned)
 expect(pruned.dictionary.length).toBeLessThan(encoded.dictionary.length)
 expect(JSON.stringify(unpackGuideDataV3(pruned))).toBe(before);expect(JSON.stringify(unpackGuideDataV3(ordered))).toBe(before)
 expect(pruned.encoding).toBe(encoded.encoding);expect(pruned.expandedHash).toBe(encoded.expandedHash)
 expect(JSON.stringify(encoded)).toBe(originalEncoding);expect(JSON.stringify(value)).toBe(before)
 expect(pruneGuideDataDictionary(pruned)).toEqual(pruned)
 const corrupt=structuredClone(encoded);corrupt.expandedHash='wrong';expect(()=>pruneGuideDataDictionary(corrupt)).toThrow('Hash')
 expect(()=>pruneGuideDataDictionary({encoding:'plain'})).toThrow('v3/v4')
})
it('keeps an incompressible token stop and insufficient call budget closed without altering calibration or any source',()=>{
 const data={unrelatedFacts:Array.from({length:900},(_,i)=>createHash('sha256').update('independent incompressible fact '+i).digest('hex'))},before=JSON.stringify(data)
 const plan=(samples:any[],left:number)=>planGuideRequest('metadata-independent','Retain every source and every check.',data,{},samples,left,3,1,true,true,true,true),base=plan([],32)
 expect(base.budget.fits).toBe(true)
 const samples=[{family:'metadata',visibleTokens:base.budget.visibleTokens,inputTokens:Math.ceil((GUIDE_BUDGET_POLICY.inputMaximum+500-2048)/1.1),outputTokens:1000}],blocked=plan(samples,32)
 expect(blocked.budget.fits).toBe(false);expect(blocked.budget.estimatedInput).toBeGreaterThan(GUIDE_BUDGET_POLICY.inputMaximum)
 expect(JSON.stringify(unpackGuideData(blocked.data))).toBe(before);expect(JSON.stringify(data)).toBe(before)
 const unfunded=plan(samples,3);expect(unfunded.budget.fits).toBe(false)
 expect(unfunded.budget.calibration).toEqual(blocked.budget.calibration);expect(unfunded.budget.reservedOutput).toBe(blocked.budget.reservedOutput);expect(unfunded.budget.margin).toBe(GUIDE_BUDGET_POLICY.margin)
})
