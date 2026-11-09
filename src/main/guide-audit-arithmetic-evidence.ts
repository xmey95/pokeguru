import {readAuditCalculation} from './guide-audit-calculation'
import type {AuditQuantityContext} from './guide-audit-quantities'
import type {GuidePacket} from './matchup-guide-packet'

const operand=(kind:string,fields:Record<string,unknown>)=>({kind,quantity:null,measureId:null,contextId:null,source:null,resultIndex:null,...fields})
/** Optional arithmetic witnesses, never semantic approvals. Every witness uses
 * the unchanged calculation reader and the target's exact inventory windows. */
export function auditArithmeticEvidence(targets:{key:string;allowedWindows:string[];spans:{value:number|null}[]}[],context:AuditQuantityContext,contextFacts:{id:string;label:string;value:number}[],packet:GuidePacket){
 return targets.map(t=>{
  const wanted=new Set(t.spans.map(s=>s.value)),aggregates:any[]=[],identities:any[]=[]
  for(const w of context.windows.filter(w=>t.allowedWindows.includes(w.id))){
   const groups=new Map<string,typeof w.balances>()
   for(const row of w.balances){const key=JSON.stringify([row.side,row.zone]),group=groups.get(key)??[];group.push(row);groups.set(key,group)}
   for(const rows of groups.values()){
    const nonzero=rows.filter(r=>r.count>0),total=rows.reduce((n,r)=>n+r.count,0)
    // Eight binary steps can sum at most nine original balances. Do not split
    // a total, pool sides/windows, or invent a constant to bypass that limit.
    if(!wanted.has(total)||nonzero.length<2||nonzero.length>9)continue
    const leaf=(r:typeof rows[number])=>operand('inventory',{quantity:{windowId:w.id,side:r.side,printId:r.printId,zone:r.zone,host:null,count:r.count}})
    const steps=[{operation:'add',left:leaf(nonzero[0]),right:leaf(nonzero[1])}]
    for(let i=2;i<nonzero.length;i++)steps.push({operation:'add',left:operand('result',{resultIndex:i-2}),right:leaf(nonzero[i])})
    const calculation={steps},value=readAuditCalculation(calculation,{context,contextFacts,packet},t.allowedWindows)
    aggregates.push({windowId:w.id,side:rows[0].side,zone:rows[0].zone,value,completeZoneTotal:true,calculation})
   }
  }
  if(wanted.has(1))for(const m of context.measures){
   // Only offer a witness involving a positive exact measure also mentioned
   // numerically in this target, not an unrelated one-card inventory balance.
   if(!/^\d+$/.test(m.value)||Number(m.value)<=0||!wanted.has(Number(m.value)))continue
   const leaf=()=>operand('measure',{measureId:m.id}),calculation={steps:[{operation:'divide',left:leaf(),right:leaf()}]}
   identities.push({value:readAuditCalculation(calculation,{context,contextFacts,packet},t.allowedWindows),measureId:m.id,arithmeticOnly:true,calculation})
  }
  return {targetKey:t.key,aggregates,identities}
 })
}
