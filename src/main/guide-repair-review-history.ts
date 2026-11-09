import {createHash} from 'node:crypto'
import type {GuideContent,GuideReview} from '../shared/matchup-guide'
import type {AiRunConfig} from '../shared/ai'
const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex')
export interface ScenarioReviewHistory {
 stage:string;dependencyHash:string;config:AiRunConfig;draft:GuideContent;review:GuideReview
}
/** Extra negative evidence after rejecting an old cached repair. These records
 * never approve a draft or replace its mandatory independent review. Match the
 * actual reviewed cases and claims; changeSummary is commentary, not a case. */
export function unresolvedScenarioReviews(current:GuideContent,dependencyHash:string,config:AiRunConfig,history:ScenarioReviewHistory[]){
 const scenarios=new Map(current.scenarios.map(s=>[s.id,hash(s)])),claims=hash(current.claims),configuration=hash(config),seen=new Set<string>()
 return history.flatMap(entry=>{
  if(!entry.stage.startsWith('review-scenarios-')||entry.dependencyHash!==dependencyHash||hash(entry.config)!==configuration||!entry.review.findings.length||!entry.draft.scenarios.length||hash(entry.draft.claims)!==claims)return []
  if(entry.draft.scenarios.some(s=>scenarios.get(s.id)!==hash(s)))return []
  const reviewHash=hash(entry.review),key=hash([entry.stage,reviewHash])
  if(seen.has(key))return []
  seen.add(key)
  return [{stage:entry.stage,reviewHash,reviewedScenarioIds:entry.draft.scenarios.map(s=>s.id),review:structuredClone(entry.review)}]
 })
}
