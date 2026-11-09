/** Pure accounting for sequential, isolated verification campaigns. Counts
 * include every linked job and diagnostic; this calculation grants no consent. */
export interface GuideCampaignCounts {id:string;calls:number}
export interface GuideCampaignCeilings {perGuide:number;pool:number;reserveEachLater:number}
function frame(counts:GuideCampaignCounts[],id:string,ceilings:GuideCampaignCeilings){
  const index=counts.findIndex(c=>c.id===id)
  if(!counts.length||new Set(counts.map(c=>c.id)).size!==counts.length||index<0||counts.some(c=>!c.id||!Number.isSafeInteger(c.calls)||c.calls<0)||Object.values(ceilings).some(v=>!Number.isSafeInteger(v)||v<0)||ceilings.perGuide<1||ceilings.pool<1)throw Error('Contabilità campagna: conteggi o limiti non validi.')
  const total=counts.reduce((sum,c)=>sum+c.calls,0)
  if(!Number.isSafeInteger(total)||total>ceilings.pool||counts.some(c=>c.calls>ceilings.perGuide))throw Error('Contabilità campagna: tetto già superato, nessuna ulteriore invocazione.')
  const reserve=counts.slice(index+1).reduce((sum,c)=>sum+Math.max(0,ceilings.reserveEachLater-c.calls),0)
  return {index,total,reserve,own:counts[index].calls}
}
/** Before creating or extending a successor job: residual allowance only,
 * never the cumulative ceiling as a fresh per-job grant. */
export function guideCampaignAllowance(counts:GuideCampaignCounts[],id:string,ceilings:GuideCampaignCeilings){
  const state=frame(counts,id,ceilings)
  return {remaining:Math.max(0,Math.min(ceilings.perGuide-state.own,ceilings.pool-state.total-state.reserve)),total:state.total,consumedByGuide:state.own,reservedForLater:state.reserve}
}
/** At the actual provider boundary the pending invocation has already been
 * durably counted. Do not subtract a second call or forget that pending row. */
export function assertGuideCampaignDispatch(counts:GuideCampaignCounts[],id:string,ceilings:GuideCampaignCeilings){
  const state=frame(counts,id,ceilings)
  if(state.own<1||state.total+state.reserve>ceilings.pool)throw Error('Contabilità campagna: invocazione non registrata o riserva futura consumata.')
  return state
}
