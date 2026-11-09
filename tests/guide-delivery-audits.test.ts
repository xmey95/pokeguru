import {it,expect} from 'vitest'
import {planDeliveryAudits,aggregateDeliveryAudits} from '../scripts/guide-delivery-audits'
import type {AuditLanguageTarget} from '../src/main/guide-audit-language-review'
import type {GuideBudgetResult} from '../src/main/guide-request-budget'
const targets:AuditLanguageTarget[]=Array.from({length:10},(_,i)=>({id:'original-'+i,text:'Exact original '+i,parts:[{text:'Exact original '+i,quantity:null,card:null,measureId:null}],maximum:1600,allowedWindows:['window-'+i],anchorHash:'native-'+i}))
const budget=(items:AuditLanguageTarget[]):GuideBudgetResult=>({stage:'review-premise-audit-language',units:items.length,encoding:'plain',visibleTokens:1000,estimatedInput:2000,reservedOutput:10000*items.length,estimatedResponseCharacters:25000*items.length,margin:8192,bytes:10000,fits:items.length<=4,fitsTarget:items.length<=4,remainingCalls:100,reservedCalls:20,calibrationFactor:1.12,family:'premise-review',estimateOnly:true})
it('partitions whole targets and original fields in order with exactly-once aggregate coverage',()=>{
 const plan=planDeliveryAudits(targets,'exact-evidence-scope',budget);expect(plan.status).toBe('ready');if(plan.status!=='ready')throw Error('Plan');expect(plan.groups.map(g=>g.targets.length)).toEqual([4,4,2]);expect(plan.groups.flatMap(g=>g.targets)).toEqual(targets)
 const receipts=plan.groups.map(g=>({contextHash:plan.contextHash,inputHash:g.inputHash,targetIds:g.targetIds,verdict:'pass' as const}));expect(aggregateDeliveryAudits(targets,plan,receipts).verdict).toBe('pass');expect(aggregateDeliveryAudits(targets,plan,receipts.map((r,i)=>({...r,verdict:i===0?'revise':'pass'}))).verdict).toBe('revise')
 expect(()=>aggregateDeliveryAudits(targets,plan,receipts.slice(1))).toThrow('incompleto');expect(()=>aggregateDeliveryAudits(targets,plan,[receipts[0],receipts[0],receipts[2]])).toThrow('incompleto');expect(()=>aggregateDeliveryAudits(targets,plan,receipts.map(r=>({...r,contextHash:'another-project'})))).toThrow('contesto')
 const changed=structuredClone(plan);changed.groups[0].targets[0].text='Truncated';expect(()=>aggregateDeliveryAudits(targets,changed,receipts)).toThrow('alterata');expect(()=>aggregateDeliveryAudits(targets.slice(1),plan,receipts)).toThrow('originale')
})
it('stops before dispatch on an oversized atomic target or too many partitions, without truncating the input',()=>{
 const before=structuredClone(targets),oversize=planDeliveryAudits(targets,'scope',items=>({...budget(items),estimatedInput:128001}));expect(oversize).toMatchObject({status:'unsupported',reason:'atomic-size',targetId:'original-0'});expect(targets).toEqual(before)
 expect(oversize.status==='unsupported'&&oversize.budget?.stage).toBe('review-premise-audit-language');expect(oversize.status==='unsupported'&&oversize.budget?.estimatedInput).toBe(128001)
 expect(planDeliveryAudits(targets,'scope',items=>({...budget(items),fits:items.length===1}))).toMatchObject({status:'unsupported',reason:'group-limit'});expect(()=>planDeliveryAudits([targets[0],targets[0]],'scope',budget)).toThrow('non valida')
})
