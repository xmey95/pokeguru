import {assertGuideDeliveryTurn,GUIDE_DELIVERY_DIMENSIONS as D} from '../shared/guide-delivery'
/** Declaration schema only; the original complete reader remains mandatory
 * after the independent audit finalizer, before any checkpoint is accepted. */
export function guideDeliverySchema(original:any,deferAudits=false):any{
 const out=structuredClone(original)
 const visit=(n:any)=>{if(!n||typeof n!=='object')return
  if(n.properties)for(const [key,v]of Object.entries<any>(n.properties)){
   if(deferAudits&&['tactical','decisionProof'].includes(key)){n.properties[key]={type:'null'};continue}
   if(['events','beforeAttack','afterAttack'].includes(key)&&v.type==='array')v.maxItems=Math.min(v.maxItems??D.eventsPerTurn,D.eventsPerTurn)
   if(key==='moves'&&v.type==='array')v.maxItems=Math.min(v.maxItems??D.movesPerEvent,D.movesPerEvent)
   if(key==='energyRoutes'&&v.type==='array')v.maxItems=Math.min(v.maxItems??D.energyRoutesPerEvent,D.energyRoutesPerEvent)
   if(key==='setupRounds'&&v.type==='array')v.maxItems=Math.min(v.maxItems??2,2)
  }
  for(const v of Object.values(n))if(Array.isArray(v))v.forEach(visit);else if(v&&typeof v==='object')visit(v)
 };visit(out);return out
}
export function deliveryDeclarationCapacity(value:any){if(value?.body)assertGuideDeliveryTurn(value.body)}
