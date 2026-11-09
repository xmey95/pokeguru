import {it,expect} from 'vitest'
import {assertGuideDeliveryTurn,assertGuideDeliveryNative,guideDeliveryBudget,isGuideDelivery} from '../src/shared/guide-delivery'
import {guideDeliverySchema} from '../src/main/guide-delivery-schema'
import {deliveryManifest} from '../scripts/guide-delivery-spec'
const event=()=>({moves:Array.from({length:12},()=>({})),energyRoutes:Array.from({length:8},()=>({}))})
it('checks total events across all attack windows and rejects oversized originals without truncation',()=>{
 const body={beforeAttack:[event(),event(),event()],attack:event(),afterAttack:[event(),event()]},before=structuredClone(body)
 expect(()=>assertGuideDeliveryTurn(body)).not.toThrow();body.afterAttack.push(event());expect(()=>assertGuideDeliveryTurn(body)).toThrow('nessuna azione');expect(body.beforeAttack).toEqual(before.beforeAttack)
 expect(()=>assertGuideDeliveryTurn({events:[{moves:Array(13).fill({})}]})).toThrow();expect(()=>assertGuideDeliveryTurn({events:[{energyRoutes:Array(9).fill({})}]})).toThrow()
})
it('accepts exactly the maximum setup and audit dimensions and rejects larger text and setup histories',()=>{
 const body={events:Array.from({length:6},()=>({...event(),decisionProof:{reason:'x'.repeat(600)}})),tactical:{comparison:'x'.repeat(600),promotions:Array.from({length:10},()=>({reason:'x'.repeat(600)}))}},native={setupRounds:Array.from({length:2},()=>({ours:body,opponent:body})),firstOpponentTurn:body,turns:{ours:body,opponent:body,next:body}}
 expect(()=>assertGuideDeliveryNative(native)).not.toThrow();expect(()=>assertGuideDeliveryNative({...native,setupRounds:[...native.setupRounds,{}]})).toThrow('Preparazione');expect(()=>assertGuideDeliveryNative({...native,turns:{ours:{tactical:{comparison:'x'.repeat(601)}}}})).toThrow('Motivazione')
})
it('narrows only declaration transport schemas, preserving the complete original for final validation',()=>{
 const original={type:'object',properties:{events:{type:'array',maxItems:40,items:{type:'object',properties:{moves:{type:'array',maxItems:30},decisionProof:{type:'object'}}}},tactical:{type:'object'}}},before=structuredClone(original),bounded=guideDeliverySchema(original,true)
 expect(original).toEqual(before);expect(bounded.properties.events.maxItems).toBe(6);expect(bounded.properties.events.items.properties.moves.maxItems).toBe(12);expect(bounded.properties.tactical).toEqual({type:'null'});expect(original.properties.tactical).toEqual({type:'object'})
})
it('counts separate audit declarations in the complete conservative graph and never treats unknown contracts as legacy',()=>{
 const binding={projectId:'other-project',lineageId:'other-lineage',ourListHash:'exact-a',opponentListHash:'exact-b',evidenceHash:'all-originals',configHash:'frozen'}
 for(const replies of [2,3,4] as const){const manifest=deliveryManifest(binding,{replies,setupTurns:5,auditGroups:4});expect(manifest.maximumCalls).toBe(guideDeliveryBudget(replies).maximum)}
 expect(guideDeliveryBudget().maximum).toBe(164);expect(()=>isGuideDelivery({deliveryContract:'unknown'})).toThrow();expect(isGuideDelivery({promptVersion:'matchup-guide-27'})).toBe(false)
})
