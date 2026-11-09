import {readGuideContent,type GuideContent} from '../shared/matchup-guide'
import {guideHash,type GuidePacket} from './matchup-guide-packet'
import type {GuideSegmentConstruction,GuideSegmentReview} from './guide-segment-review'
import type {GuideConstructionRuntime} from './guide-reply-phase'
import {assertGuideRuntimeEvidence} from './guide-evidence-extension'
import {assertGuideFinalReviewEvidence} from './guide-segment-review-history'

interface Checkpoint {version:1;scope:GuideConstructionRuntime['scope'];constructionHash:string;packet:GuidePacket;draft:GuideContent;draftHash:string;reviewKeys:string[]}
const role='guide-segment-prose-v1'
const keyFor=(construction:GuideSegmentConstruction,options:GuideConstructionRuntime)=>guideHash([options.scope,construction])
/** A paid draft is reusable, never an approval. Final critics always run with
 * current evidence. Changed native heads/acceptance epochs select a new key. */
export function saveGuideSegmentProse(draft:GuideContent,construction:GuideSegmentConstruction,reviews:GuideSegmentReview[],options:GuideConstructionRuntime):void{
 const rows=[...options.archive.values<{unitId:string;review:GuideSegmentReview}>('guide-segment-review-v1')]
 const reviewKeys=reviews.map(review=>{const row=rows.find(r=>guideHash(r.value.review)===guideHash(review));if(!row)throw Error('Prosa: critica preventiva non archiviata.');return row.key})
 assertGuideFinalReviewEvidence(reviewKeys,options)
 const value:Checkpoint={version:1,scope:options.scope,constructionHash:guideHash(construction),packet:options.evidencePacket??options.packet,draft,draftHash:guideHash(draft),reviewKeys}
 options.archive.saveValue(role,keyFor(construction,options),value)
}
export function loadGuideSegmentProse(nativeDraft:GuideContent,construction:GuideSegmentConstruction,options:GuideConstructionRuntime):GuideContent|undefined{
 const saved=options.archive.value<Checkpoint>(role,keyFor(construction,options))
 if(!saved)return
 if(saved.version!==1||guideHash(saved.scope)!==guideHash(options.scope)||saved.constructionHash!==guideHash(construction)||saved.draftHash!==guideHash(saved.draft)||guideHash(readGuideContent(saved.draft,options.packet.basis.promptVersion))!==saved.draftHash||guideHash(nativeDraft.scenarios)!==guideHash(saved.draft.scenarios)||nativeDraft.claims.some(c=>!saved.draft.claims.some(s=>s.id===c.id&&guideHash(s)===guideHash(c))))throw Error('Prosa: checkpoint diverso dai registri verificati.')
 assertGuideRuntimeEvidence(options,saved.packet)
 assertGuideFinalReviewEvidence(saved.reviewKeys,{...options,evidencePacket:saved.packet})
 return structuredClone(saved.draft)
}
