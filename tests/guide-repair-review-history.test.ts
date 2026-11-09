import {it,expect} from 'vitest'
import {unresolvedScenarioReviews,type ScenarioReviewHistory} from '../src/main/guide-repair-review-history'
import type {GuideContent,GuideReview} from '../src/shared/matchup-guide'
import type {AiRunConfig} from '../src/shared/ai'
const config:AiRunConfig={provider:'codex',source:'global',model:null,reasoningEffort:null}
const draft=(summary='',ids=['foreign-a','foreign-b'])=>({scenarios:ids.map(id=>({id,title:'fixture'})),claims:[],chapters:[],exercises:[],limitations:[],changeSummary:summary}) as unknown as GuideContent
const review=(message:string):GuideReview=>({verdict:'revise',findings:[{severity:'blocking',targetId:'foreign-a',message,correction:'fixture',sourceIds:[]}],checks:[],revalidatedIds:[],textCorrections:[]})
const entry=(stage:string,message:string):ScenarioReviewHistory=>({stage,dependencyHash:'dependency-a',config,draft:draft(),review:review(message)})
it('preserves all later negative findings on unchanged cases, including complete split scopes and changed commentary',()=>{
 const old=entry('review-scenarios-2','earlier'),later=entry('review-scenarios-4','later'),split=entry('review-scenarios-3-part-1','split');split.draft=draft('old',['foreign-a'])
 const bytes=JSON.stringify([old,later,split]),result=unresolvedScenarioReviews(draft('completed commentary'),'dependency-a',config,[old,later,split,later])
 expect(result.map(r=>r.review.findings[0].message)).toEqual(['earlier','later','split']);expect(result.map(r=>r.review)).toEqual([old.review,later.review,split.review]);expect(JSON.stringify([old,later,split])).toBe(bytes)
 result[0].review.findings[0].message='local mutation';expect(old.review.findings[0].message).toBe('earlier')
})
it('excludes different cases, claims, source dependencies, configurations and non-scenario or positive reviews',()=>{
 const wrongCase=entry('review-scenarios-4','changed');wrongCase.draft.scenarios[0].title='different'
 const wrongClaims=entry('review-scenarios-4','claims');wrongClaims.draft.claims=[{id:'foreign-claim'}] as any
 const wrongSource={...entry('review-scenarios-4','sources'),dependencyHash:'dependency-b'},wrongConfig={...entry('review-scenarios-4','config'),config:{...config,model:'different'}}
 const positive=entry('review-scenarios-4','pass');positive.review={...positive.review,verdict:'pass',findings:[]}
 expect(unresolvedScenarioReviews(draft(),'dependency-a',config,[wrongCase,wrongClaims,wrongSource,wrongConfig,positive,entry('review-final-4','final')])).toEqual([])
})
it('retains an incomplete critic with negative findings as evidence without treating it as approval',()=>{
 const item=entry('review-scenarios-5','unresolved');item.review.verdict='incomplete'
 expect(unresolvedScenarioReviews(draft(),'dependency-a',config,[item])[0].review).toEqual(item.review)
})
