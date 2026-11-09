import {expect,it} from 'vitest'
import {assertGuideDeliveryNative,assertGuideDeliveryTurn,GUIDE_DELIVERY_DIMENSIONS as d} from '../src/shared/guide-delivery'
import {readGuideAccessTurn} from '../src/shared/guide-native-decisions'
const receipt={sourceIds:['original-source'],reason:'An additional effect draw.'}
const event=(accessReceipt:any=null)=>({kind:'effect',moves:[{side:'opponent',printId:'original-card',count:1,from:'deck',to:'hand'}],accessReceipt})
it('reports both original receipt indices without selecting, moving or deleting a mark',()=>{
 const events=[event(receipt),event(),event(receipt)],before=structuredClone(events)
 expect(()=>readGuideAccessTurn('case',events)).toThrow('Ricevute non nulle: 2; indici a base zero in turns.opponent.events: [0,2]')
 expect(events).toEqual(before)
 events[0].accessReceipt=null;expect(readGuideAccessTurn('case',events).eventIndex).toBe(2)
 events[2].moves[0].from='hand';events[2].moves[0].to='bench'
 expect(()=>readGuideAccessTurn('case',events)).toThrow('non indica un accesso aggiuntivo')
})
it('reports exact unchanged event and per-event resource limits with the original case path',()=>{
 const body={events:Array.from({length:d.eventsPerTurn+1},()=>event())};body.events[3].moves=Array.from({length:d.movesPerEvent+1},()=>event().moves[0])
 const native={id:'other-case',turns:{opponent:body}},before=structuredClone(native)
 expect(()=>assertGuideDeliveryNative(native)).toThrow('other-case.turns.opponent: 7 eventi, massimo 6')
 expect(()=>assertGuideDeliveryNative(native)).toThrow('events[3].moves: 13 movimenti, massimo 12')
 expect(native).toEqual(before)
 expect(()=>assertGuideDeliveryTurn({events:Array.from({length:d.eventsPerTurn},()=>({moves:Array(d.movesPerEvent).fill({}),energyRoutes:Array(d.energyRoutesPerEvent).fill({})}))})).not.toThrow()
 expect(()=>assertGuideDeliveryTurn({events:[{energyRoutes:Array(d.energyRoutesPerEvent+1).fill({})}]})).toThrow('9 percorsi, massimo 8')
})
