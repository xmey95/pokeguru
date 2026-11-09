import {it,expect} from 'vitest'
import {assertGuideDeliveryNative} from '../src/shared/guide-delivery'

it('reports the exact decoded audit path, actual length and unchanged character limit without editing it',()=>{
 const native={id:'unrelated-case',turns:{ours:{tactical:{comparison:'x'.repeat(601)}}}},before=structuredClone(native)
 expect(()=>assertGuideDeliveryNative(native)).toThrow('unrelated-case.turns.ours.tactical.comparison, 601 caratteri; massimo 600')
 expect(native).toEqual(before)
 native.turns.ours.tactical.comparison='x'.repeat(600)
 expect(()=>assertGuideDeliveryNative(native)).not.toThrow()
})
it('locates nested promotion and attack reasons separately from target-count failures',()=>{
 const native:any={id:'other',replyComparison:{options:[{turns:{opponent:{tactical:{promotions:[{reason:'x'.repeat(602)}]},attack:{decisionProof:{reason:'x'.repeat(603)}}}}}]}}
 expect(()=>assertGuideDeliveryNative(native)).toThrow('replyComparison.options[0].turns.opponent.tactical.promotions[0].reason, 602 caratteri; massimo 600')
 native.replyComparison.options[0].turns.opponent.tactical.promotions[0].reason='valid'
 expect(()=>assertGuideDeliveryNative(native)).toThrow('replyComparison.options[0].turns.opponent.attack.decisionProof.reason, 603 caratteri; massimo 600')
 native.replyComparison.options[0].turns.opponent={tactical:{promotions:Array.from({length:18},()=>({reason:'valid'}))}}
 expect(()=>assertGuideDeliveryNative(native)).toThrow('18 target; massimo 17')
 native.replyComparison.options[0].turns.opponent={events:[{decisionProof:{reason:null}}]}
 expect(()=>assertGuideDeliveryNative(native)).toThrow('events[0].decisionProof.reason')
})
