import type {AiEvidenceArchive} from './ai-evidence-archive'
import {guideHash,type GuidePacket} from './matchup-guide-packet'
import {verifyGuideSegments,type GuideSegmentJournal,type GuideSegmentScope} from './guide-segments'
import {readGuideReview,type GuideFinding} from '../shared/matchup-guide'

export interface GuideSegmentRepairFeedback {epochHash:string;rejected:GuideSegmentJournal;retainTurns:number;reviewHashes:string[];findings:GuideFinding[]}
export function readGuideSegmentRepairFeedback(archive:Pick<AiEvidenceArchive,'id'|'projectId'|'value'>,scope:GuideSegmentScope,packet:GuidePacket,key:string):GuideSegmentRepairFeedback|undefined{
 const value=archive.value<GuideSegmentRepairFeedback>('guide-segment-repair-feedback-v1',key)
 if(!value)return undefined
 if(archive.id!==scope.jobId||archive.projectId!==scope.projectId||guideHash(value)!==key||!value.epochHash||!value.reviewHashes.length||!value.findings.length||!Number.isSafeInteger(value.retainTurns)||value.retainTurns<0||value.retainTurns>=value.rejected.segments.length)throw new Error('Riparazione segmento: feedback mancante o estraneo.')
 verifyGuideSegments(value.rejected,scope,packet)
 readGuideReview({verdict:'revise',findings:value.findings,checks:['Full independent review retained.']})
 const epoch=archive.value<any>('guide-segment-repair-start-v1',value.epochHash)
 if(!epoch||guideHash(epoch)!==value.epochHash||guideHash(epoch.scope)!==guideHash(scope)||epoch.packetHash!==guideHash(packet)||value.reviewHashes.some(h=>!epoch.reviews.some((r:any)=>guideHash(r.review)===h))||value.findings.some(f=>!epoch.reviews.some((r:any)=>r.review.findings.some((saved:any)=>guideHash(saved)===guideHash(f)))))throw new Error('Riparazione segmento: critica originale non verificabile.')
 return structuredClone(value)
}
