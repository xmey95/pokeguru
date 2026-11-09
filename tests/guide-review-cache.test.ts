import {it,expect} from 'vitest'
import {cachedReviewPartition} from '../src/main/guide-review-cache'
const stage='review-scenarios-2'
it('reuses a complete earlier partition with its original negative finding intact',()=>{
 const a={verdict:'revise',findings:['counterexample']},b={verdict:'pass',findings:[]},lookups:string[]=[]
 const result=cachedReviewPartition(['case-a','case-b'],stage,[{stage,groups:[['case-a'],['case-b']]}],(ids,name)=>{lookups.push(name+':'+ids.join());return ids[0]==='case-a'?a:b})!
 expect(lookups).toEqual([stage+'-part-1:case-a',stage+'-part-2:case-b']);expect(result.values).toEqual([a,b]);expect(result.values[0]).toBe(a)
})
it('rejects gaps, overlaps, foreign units, reordering and plans from another stage before looking up a cache',()=>{
 const groups:any[]=[[['a']],[['a'],['a']],[['a'],['foreign']],[['b'],['a']],[[],['a','b']],[['a'],'b'],[['a'],[null]]]
 let calls=0
 expect(cachedReviewPartition(['a','b'],stage,[...groups.map(groups=>({stage,groups})),{stage:'review-final',groups:[['a'],['b']]}],()=>{calls++;return {}})).toBeUndefined()
 expect(calls).toBe(0)
})
it('does not approve a partial cache or a partition whose exact current input no longer matches',()=>{
 const plan={stage,groups:[['a'],['b']]}
 expect(cachedReviewPartition(['a','b'],stage,[plan],ids=>ids[0]==='a'?{verdict:'pass'}:undefined)).toBeUndefined()
 const cache=new Map([[JSON.stringify([stage+'-part-1',['a'],'old-facts']),{verdict:'pass'}],[JSON.stringify([stage+'-part-2',['b'],'old-facts']),{verdict:'pass'}]])
 expect(cachedReviewPartition(['a','b'],stage,[plan],(ids,name)=>cache.get(JSON.stringify([name,ids,'changed-facts'])))).toBeUndefined()
})
it('retains all complete matching partitions and never chooses a pass over a cached counterexample',()=>{
 const plans=[{stage,groups:[['a'],['b','c']]},{stage,groups:[['a','b'],['c']]},{stage,groups:[['a'],['b','c']]}]
 const result=cachedReviewPartition(['a','b','c'],stage,plans,(ids)=>({verdict:ids.join()==='a,b'?'revise':'pass',ids}))!
 expect(result.values).toHaveLength(4);expect(result.values.filter(r=>r.verdict==='revise')).toHaveLength(1);expect(result.groups).toHaveLength(2)
})
it('supports arbitrary chapter partitions without mutating stored plans, scope or reviews',()=>{
 const ids=Object.freeze(['intro','opening','resources','closing']),groups=[Object.freeze(['intro','opening']),Object.freeze(['resources']),Object.freeze(['closing'])],plans=Object.freeze([{stage:'review-final-3',groups:Object.freeze(groups)}]),before=JSON.stringify(plans),review=Object.freeze({verdict:'pass'})
 const result=cachedReviewPartition(ids as unknown as string[],'review-final-3',plans,()=>review)!
 expect(result.values).toHaveLength(3);result.groups[0].push('unrelated');expect(JSON.stringify(plans)).toBe(before);expect(result.values.every(v=>v===review)).toBe(true)
})
