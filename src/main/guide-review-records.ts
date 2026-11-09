import {createHash} from 'node:crypto'
import type {GuideReview} from '../shared/matchup-guide'
const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex')
interface ReviewArchive{
 saveValue(role:string,key:string,value:unknown):void
 value<T>(role:string,key:string):T|undefined
 values<T>(role:string):Iterable<{key:string;value:T}>
}
interface ReviewPayload{review:GuideReview;localChecks:unknown;draftHash:string}
export interface GuideReviewRecord extends ReviewPayload{stage:string;inputHash:string|null}

/** A logical round can recur after rejecting an older cached repair. Keep its
 * first legacy record intact and append each actual input as separate evidence. */
export function saveGuideReviewRecord(archive:ReviewArchive,stage:string,inputHash:string,payload:ReviewPayload):void{
 archive.saveValue('guide-review-stage-version',hash([stage,inputHash]),{...payload,stage,inputHash})
 if(!archive.value('guide-review-stage',stage))archive.saveValue('guide-review-stage',stage,payload)
}
export function readGuideReviewRecord(archive:ReviewArchive,stage:string,inputHash:string):GuideReviewRecord|undefined{
 const exact=archive.value<GuideReviewRecord>('guide-review-stage-version',hash([stage,inputHash]));if(exact)return exact
 const legacy=archive.value<ReviewPayload>('guide-review-stage',stage),context=archive.value<any>('guide-call-data',inputHash)?.data
 return legacy&&context?.draft&&hash(context.draft)===legacy.draftHash?{...legacy,stage,inputHash}:undefined
}
export function guideReviewRecords(archive:ReviewArchive):GuideReviewRecord[]{
 const unique=new Map<string,GuideReviewRecord>()
 const records=[...archive.values<ReviewPayload>('guide-review-stage')].map(r=>({...r.value,stage:r.key,inputHash:null} as GuideReviewRecord)).concat([...archive.values<GuideReviewRecord>('guide-review-stage-version')].map(r=>r.value))
 for(const r of records)unique.set(hash([r.stage,r.draftHash,r.review,r.localChecks]),r)
 return [...unique.values()]
}
