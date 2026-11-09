import {it,expect} from 'vitest'
import {createHash} from 'node:crypto'
import {saveGuideReviewRecord,readGuideReviewRecord,guideReviewRecords} from '../src/main/guide-review-records'
import type {GuideReview} from '../src/shared/matchup-guide'
const hash=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex')
function archive(){const rows=new Map<string,unknown>();return {
 saveValue(role:string,key:string,value:unknown){const k=role+':'+key;if(rows.has(k)&&JSON.stringify(rows.get(k))!==JSON.stringify(value))throw Error('Immutable');rows.set(k,structuredClone(value))},
 value<T>(role:string,key:string){return rows.get(role+':'+key) as T|undefined},
 *values<T>(role:string){for(const [key,value]of rows)if(key.startsWith(role+':'))yield {key:key.slice(role.length+1),value:value as T}}
}}
const review=(message:string):GuideReview=>({verdict:'revise',findings:[{severity:'blocking',targetId:'foreign-case',message,correction:'Rebuild',sourceIds:[]}],checks:[]})
it('stores two different inputs for the same logical round without replacing the original review',()=>{
 const a=archive(),first={review:review('first'),localChecks:{errors:[]},draftHash:'draft-a'},second={...first,review:review('second'),draftHash:'draft-b'}
 saveGuideReviewRecord(a,'review-scenarios-2','input-a',first);saveGuideReviewRecord(a,'review-scenarios-2','input-b',second)
 expect(a.value('guide-review-stage','review-scenarios-2')).toEqual(first)
 expect(readGuideReviewRecord(a,'review-scenarios-2','input-a')!.review).toEqual(first.review);expect(readGuideReviewRecord(a,'review-scenarios-2','input-b')!.review).toEqual(second.review)
 expect(guideReviewRecords(a).map(r=>r.review)).toEqual([first.review,second.review]);expect([...a.values('guide-review-stage-version')]).toHaveLength(2)
})
it('reads a legacy review only for its matching actual draft and refuses to rewrite an input identity',()=>{
 const a=archive(),draft={scenarios:[{id:'foreign-case'}]},payload={review:review('old'),localChecks:{errors:[]},draftHash:hash(draft)}
 a.saveValue('guide-review-stage','review-scenarios-1',payload);a.saveValue('guide-call-data','old-input',{data:{draft}});a.saveValue('guide-call-data','other-input',{data:{draft:{scenarios:[]}}})
 expect(readGuideReviewRecord(a,'review-scenarios-1','old-input')!.review).toEqual(payload.review);expect(readGuideReviewRecord(a,'review-scenarios-1','other-input')).toBeUndefined()
 saveGuideReviewRecord(a,'review-scenarios-1','old-input',payload);expect(()=>saveGuideReviewRecord(a,'review-scenarios-1','old-input',{...payload,review:review('wrong replacement')})).toThrow('Immutable')
})
