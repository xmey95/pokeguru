import {readGuideContent,type MatchupGuide} from '../shared/matchup-guide'
import {guideHash,type GuidePacket} from './matchup-guide-packet'
import {assertGuideRuntimeEvidence} from './guide-evidence-extension'
import {assertGuideFinalReviewEvidence,type GuideReviewEvidenceScope} from './guide-segment-review-history'
import type {GuideSegmentReview} from './guide-segment-review'
import {assertFiniteGuideApproval} from './guide-finite-approval'
import {GUIDE_FINITE_ANALYSIS_CONTRACT} from '../shared/guide-analysis-scope'

interface Approval {version:1|2;guideHash:string;scope:GuideReviewEvidenceScope['scope'];nativePacket:GuidePacket;evidenceAnchor:GuidePacket;evidencePacket:GuidePacket;reviewKeys:string[]}
const role='guide-segment-final-approval-v1'
export function assertGuideSegmentApproval(guide:MatchupGuide,archive:GuideReviewEvidenceScope['archive']):void{
 if(guide.basis.analysisContract===GUIDE_FINITE_ANALYSIS_CONTRACT)return assertFiniteGuideApproval(guide,archive)
 const saved=archive.value<Approval>(role,'validated')
 if(!saved||![1,2].includes(saved.version)||saved.guideHash!==guideHash(guide)||saved.scope.jobId!==archive.id||saved.scope.projectId!==archive.projectId||saved.scope.projectId!==guide.basis.projectId||saved.scope.configHash!==guideHash({config:guide.generation.config,protocol:'segments-v28-1'}))throw new Error('Guida v28 senza attestazione verificabile delle fonti del riesame finale; nessuna approvazione storica riutilizzata.')
 for(const key of ['basis','ourList','opponentLists','sources'] as const)if(guideHash(saved.evidencePacket[key])!==guideHash(guide[key]))throw new Error('Riesame finale: evidenze diverse dalla guida salvata.')
 if(saved.evidencePacket.gaps.some(g=>!guide.limitations.includes(g)))throw new Error('Riesame finale: lacune obbligatorie omesse.')
 const options={scope:saved.scope,packet:saved.nativePacket,evidenceAnchor:saved.evidenceAnchor,evidencePacket:saved.evidencePacket,archive}
 assertGuideRuntimeEvidence(options);assertGuideFinalReviewEvidence(saved.reviewKeys,options,saved.version===2?readGuideContent(guide):undefined,saved.version===2)
}
export function saveGuideSegmentApproval(guide:MatchupGuide,reviews:GuideSegmentReview[],options:GuideReviewEvidenceScope):void{
 if(!options.evidenceAnchor)throw new Error('Riesame finale: ancora delle fonti native assente.')
 const rows=[...options.archive.values<{unitId:string;review:GuideSegmentReview}>('guide-segment-review-v1')]
 const reviewKeys=reviews.map(review=>{const row=rows.find(r=>guideHash(r.value.review)===guideHash(review));if(!row)throw new Error('Riesame finale non archiviato.');return row.key})
 const version=reviewKeys.some(key=>options.archive.value('guide-proof-review-run-membership-v1',key))?2:1
 assertGuideFinalReviewEvidence(reviewKeys,options,version===2?readGuideContent(guide):undefined,version===2)
 const saved:Approval={version,guideHash:guideHash(guide),scope:options.scope,nativePacket:options.packet,evidenceAnchor:options.evidenceAnchor,evidencePacket:options.evidencePacket??options.packet,reviewKeys}
 options.archive.saveValue(role,'validated',saved);assertGuideSegmentApproval(guide,options.archive)
}
