import type {GuideContent} from '../shared/matchup-guide'
import type {GuideConstructionRuntime} from './guide-reply-phase'
import {guideHash} from './matchup-guide-packet'
import {guideUntilValidAuthority} from './guide-run-policy'

const role='guide-finite-final-text-partition-v1',characters=6000
type Context=Pick<GuideConstructionRuntime,'scope'|'archive'>
export interface FinalTextPartition {kind:'case-text'|'global-text';textIds:string[];unitId:string;historyScope?:'assigned-text-v2'}
export interface FinalReviewUnit {id:string;proofCaseIds:string[];partition?:FinalTextPartition}
/** Host policy only, never an AI opinion or a transferred approval. */
export function finalTextPartitionVersion(o:Context):1|2|undefined{
 const rows=[...o.archive.values<any>(role)]
 if(!rows.length)return undefined
 const r=rows[0]
 if(rows.length!==1||r.key!=='policy'||![1,2].includes(r.value.version)||r.value.scopeHash!==guideHash(o.scope)||r.value.characters!==characters||!guideUntilValidAuthority(o.archive))throw Error('Partizione finale: politica alterata o estranea.')
 return r.value.version
}
export function hasFinalTextPartitions(o:Context):boolean{return finalTextPartitionVersion(o)!==undefined}
export function enableFinalTextPartitions(o:Context){
 if(!guideUntilValidAuthority(o.archive))throw Error('Partizione finale non autorizzata per il contratto storico.')
 if(!hasFinalTextPartitions(o))o.archive.saveValue(role,'policy',{version:2,scopeHash:guideHash(o.scope),characters})
}
/** Every text is paired with EVERY case's full proof. A separate mandatory
 * unit reads all prose together for cross-chapter/case consistency. */
export function finiteFinalReviewUnits(draft:GuideContent,o:Context):FinalReviewUnit[]{
 if(!hasFinalTextPartitions(o))return draft.scenarios.map(s=>({id:s.id,proofCaseIds:[s.id]}))
 const modern=finalTextPartitionVersion(o)===2,history=modern?{historyScope:'assigned-text-v2' as const}:{},texts=[...draft.chapters,...draft.exercises],ids=texts.map(t=>t.id),caseIds=draft.scenarios.map(s=>s.id)
 if(!texts.length||!caseIds.length||new Set(ids).size!==ids.length||new Set(caseIds).size!==caseIds.length)throw Error('Partizione finale: testi o casi mancanti/duplicati.')
 const groups:string[][]=[];let group:string[]=[],size=0
 for(const text of texts){const bytes=JSON.stringify(text).length;if(group.length&&size+bytes>characters){groups.push(group);group=[];size=0}group.push(text.id);size+=bytes}
 if(group.length)groups.push(group)
 const units:FinalReviewUnit[]=caseIds.flatMap(caseId=>groups.map((textIds,i)=>{const id=caseId+'/text-'+(i+1);return {id,proofCaseIds:[caseId],partition:{kind:'case-text' as const,textIds:[...textIds],unitId:id,...history}}}))
 units.push({id:'global-text',proofCaseIds:[],partition:{kind:'global-text',textIds:ids,unitId:'global-text',...history}})
 return units
}
