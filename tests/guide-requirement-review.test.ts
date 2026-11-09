import {it,expect} from 'vitest'
import {guideRequirementAuditSchema,assertGuideRequirementResolutions,type GuideConstructionRequirementContext,type GuideRequirementResolution} from '../src/main/guide-requirement-review'
import {assertNativeScenarioSchema} from '../src/main/guide-scenario-output-schema'

const contexts:GuideConstructionRequirementContext[]=[{ledger:{caseId:'independent-case',requirements:[{id:'original-requirement',goal:'Compare the independent decision.',reason:'The required alternative must remain visible.',sourceIds:['printed-source']}]},assignments:[],unassignedRequirementIds:['original-requirement'],witnesses:[{lineId:'retained-branch',reviewedHash:'current-head',turnNumbers:[1,2,3]}]}]
const audit:GuideRequirementResolution[]=[{caseId:'independent-case',requirementId:'original-requirement',disposition:'resolved',reason:'The independent critic compared the decision and follow-up against the original source.',sourceIds:['printed-source'],witnesses:[{lineId:'retained-branch',reviewedHash:'current-head',turnNumbers:[1,3]}],currentFindingIndex:null}]
function read(value:unknown,findings:any[]=[]){assertNativeScenarioSchema({audit:value},{type:'object',properties:{audit:guideRequirementAuditSchema(contexts,['printed-source'])},required:['audit'],additionalProperties:false});assertGuideRequirementResolutions(value as GuideRequirementResolution[],contexts,findings)}
it('requires every original obligation even without an assigned seed, with exact current proof references',()=>{
 expect(()=>read(audit)).not.toThrow()
 for(const invalid of [undefined,[],[...audit,...audit],[{...audit[0],caseId:'other-case'}],[{...audit[0],requirementId:'unrelated'}],[{...audit[0],sourceIds:['foreign']}],[{...audit[0],witnesses:[]}],[{...audit[0],witnesses:[{...audit[0].witnesses[0],reviewedHash:'old-head'}]}],[{...audit[0],witnesses:[{...audit[0].witnesses[0],turnNumbers:[4]}]}],[{...audit[0],witnesses:[...audit[0].witnesses,...audit[0].witnesses]}]])expect(()=>read(invalid)).toThrow()
})
it('requires an actionable same-case finding for open obligations and explicit evidence for a superseded request',()=>{
 const open=[{...audit[0],disposition:'still-open',witnesses:[],currentFindingIndex:0}],finding={repair:{kind:'reply-plan',caseId:'independent-case',mainHash:'main'}}
 expect(()=>read(open)).toThrow('ancora aperto')
 expect(()=>read(open,[{repair:{kind:'reply-plan',caseId:'other-case'}}])).toThrow('stesso caso')
 expect(()=>read(open,[finding])).not.toThrow()
 expect(()=>read([{...audit[0],disposition:'superseded',witnesses:[]}])).not.toThrow()
 expect(()=>read([{...audit[0],disposition:'superseded',witnesses:[],sourceIds:[]}])).toThrow()
 expect(()=>read([{...audit[0],disposition:'resolved',currentFindingIndex:0}],[finding])).toThrow('ancora aperto')
})
