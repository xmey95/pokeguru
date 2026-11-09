import type { GuideSetupLedger } from './guide-setup-ledger'
import type { GuideSource } from './matchup-guide'

/** An observation describes a card staying in the deck at that event, not a
 * transfer, new card, guaranteed future draw or permanently ordered deck. */
export function validateDeckObservations(id:string,event:Pick<GuideSetupLedger['events'][number],'turn'|'description'|'deckObservations'>,sources:GuideSource[],available:(side:string,printId:string)=>number){
  const seen=new Map<string,number>()
  for(const r of event.deckObservations??[]){
    const key=`${r.side}|${r.printId}`,count=(seen.get(key)??0)+r.count;seen.set(key,count)
    if(!['ours','opponent'].includes(r.side)||!['top','bottom'].includes(r.position)||!Number.isSafeInteger(r.count)||r.count<1||count>available(r.side,r.printId)||
      !sources.some(s=>s.kind==='card'&&s.id===`card:${r.printId}`)||!Array.isArray(r.sourceIds)||!r.sourceIds.length||r.sourceIds.some(s=>!sources.some(source=>source.id===s)))
      throw new Error(`${id}: osservazione ${r.printId} non dimostrata nel mazzo al turno ${event.turn}: ${event.description}`)
  }
}
