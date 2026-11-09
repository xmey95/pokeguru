import {expect,it} from 'vitest'
import {packGuideDataV3,unpackGuideDataV3} from '../src/main/guide-wire-dense'
import {nativeRepairCase,applyNativeRepair,nativeRepairConstraint,nativeRepairSchema,assertRepairCaseProgress} from '../src/main/guide-native-repair'
import {scenarioTurnFacts,checkReviewAlternatives} from '../src/shared/guide-turn-facts'

it('requires operations only for the new corrective schema while preserving the historical schema contract',()=>{
 const cases=[nativeRepairCase({id:'foreign-case',decision:'original'})],old:any=nativeRepairSchema(cases,{}),strict:any=nativeRepairSchema(cases,{},true)
 expect(old.properties.cases.items.anyOf[0].properties.operations).not.toHaveProperty('minItems')
 expect(strict.properties.cases.items.anyOf[0].properties.operations.minItems).toBe(1)
 const relaxed=structuredClone(strict);delete relaxed.properties.cases.items.anyOf[0].properties.operations.minItems;expect(relaxed).toEqual(old)
})
it('rejects empty, identical and cancelling repairs without mutating any native source',()=>{
 const source={id:'foreign-case',decision:'original'},base=nativeRepairCase(source),patch=(operations:any[])=>({cases:[{id:base.id,baseHash:base.baseHash,operations}]})
 for(const operations of [[],[{op:'replace',path:'/decision',valueJson:'"original"'}],[{op:'replace',path:'/decision',valueJson:'"changed"'},{op:'replace',path:'/decision',valueJson:'"original"'}]])expect(()=>applyNativeRepair(patch(operations),[base],true)).toThrow('SENZA MODIFICHE')
 expect(applyNativeRepair(patch([]),[base])).toEqual([source])
 expect(applyNativeRepair(patch([{op:'replace',path:'/decision',valueJson:'"changed"'}]),[base],true)[0].decision).toBe('changed');expect(source.decision).toBe('original')
})
it('revalidates scenario progress in parsed caches independently of summary and object-key order',()=>{
 const before=[{id:'foreign-a',decision:'old'},{id:'foreign-b',decision:'old'}],same=[{decision:'old',id:'foreign-a'},{decision:'old',id:'foreign-b'}]
 expect(()=>assertRepairCaseProgress(before,same,['foreign-a'])).toThrow('SENZA MODIFICHE')
 expect(()=>assertRepairCaseProgress(before,[{id:'foreign-a',decision:'new'}],['foreign-a','foreign-b'])).toThrow('foreign-b')
 expect(()=>assertRepairCaseProgress(before,[{id:'foreign-a',decision:'new'}],['foreign-a'])).not.toThrow()
 expect(before[0].decision).toBe('old')
})
it('roundtrips dense records, canonical sources, negative values and every literal control marker',()=>{
 const value={literal:[[],[0,1],[-1,-30.5],['!',-2],['?',{}],['=',-5],['+',-1],['^0',1],['~0',2,2,'x']],strings:['@1','@@2','~0','-3'],source:JSON.stringify({effect:'Full costs and conditions 🐦 '.repeat(12),negative:-30,arr:[0,1]}),rows:Array.from({length:40},(_,i)=>({printId:'exact-card',count:i%4,side:'ours',description:'Complete text and conditions '+i}))}
 const before=JSON.stringify(value),packed:any=packGuideDataV3(value)
 expect(JSON.stringify(unpackGuideDataV3(packed))).toBe(before);expect(JSON.stringify(value)).toBe(before)
 const corrupt=structuredClone(packed);corrupt.root=-1;corrupt.dictionary[0]=-1;expect(()=>unpackGuideDataV3(corrupt)).toThrow('ciclico')
 const absent=structuredClone(packed);absent.root=-999999;expect(()=>unpackGuideDataV3(absent)).toThrow('assente')
 const bad=structuredClone(packed);bad.expandedHash='bad';expect(()=>unpackGuideDataV3(bad)).toThrow('Hash')
})
it('applies all hash-bound edits atomically while keeping identities, opening and prototype keys immutable',()=>{
 const original={id:'scenario-1',opponentListId:'opp',opening:{ours:{}},turns:{ours:{events:[{description:'Old',moves:[]}]}}},base=nativeRepairCase(original)
 const patch=(operations:any[],baseHash=base.baseHash)=>({cases:[{id:base.id,baseHash,operations}]})
 const op={op:'replace',path:'/turns/ours/events/0/description',valueJson:'"Updated"'}
 expect(applyNativeRepair(patch([op]),[base])[0].turns.ours.events[0].description).toBe('Updated')
 const before=JSON.stringify(base)
 expect(()=>applyNativeRepair(patch([op,{op:'remove',path:'/missing',valueJson:'null'}]),[base])).toThrow('assente')
 for(const path of ['/id','/opening/ours','/__proto__/x'])expect(()=>applyNativeRepair(patch([{...op,path}]),[base])).toThrow('non modificabili')
 expect(()=>applyNativeRepair(patch([op],'stale'),[base])).toThrow('hash');expect(JSON.stringify(base)).toBe(before);expect(original.turns.ours.events[0].description).toBe('Old')
})
it('rejects the real first-turn false alternative without removing or approving any finding',()=>{
 const s:any={id:'scenario-1',setupLedger:{events:[{turn:1,side:'opponent'}]},lineEvents:[{turn:2,side:'ours'},{turn:3,side:'opponent'},{turn:4,side:'ours'}],replyComparison:{options:[]}},draft:any={scenarios:[s]},review:any={findings:[{proposedActions:[{scenarioId:s.id,turn:2,side:'ours',action:'ordinary-evolution',reason:'Already in setup.'}]}]}
 expect(scenarioTurnFacts(s)).toMatchObject({firstPlayer:'opponent',firstTurns:{ours:2,opponent:1}})
 const before=JSON.stringify(review);expect(()=>checkReviewAlternatives(review,draft)).toThrow('PRIMO TURNO');expect(JSON.stringify(review)).toBe(before)
 review.findings[0].proposedActions[0].turn=4;expect(()=>checkReviewAlternatives(review,draft)).not.toThrow()
})
it.each(['ours','opponent'] as const)('checks turn rules for arbitrary scenario names with %s starting',first=>{
 for(const id of ['unrelated-archetype-case','a/b~c','other-project-72']){
  const second=first==='ours'?'opponent':'ours',s:any={id,setupLedger:{events:[{turn:1,side:first}]},lineEvents:[{turn:2,side:second},{turn:3,side:first},{turn:4,side:second}],replyComparison:{options:[]}}
  for(const side of ['ours','opponent'] as const){
   const turn=side===first?1:2,review:any={findings:[{proposedActions:[{scenarioId:id,turn,side,action:'ordinary-evolution',reason:'Ordinary evolution.'}]}]}
   expect(()=>checkReviewAlternatives(review,{scenarios:[s]} as any)).toThrow('PRIMO TURNO')
   review.findings[0].proposedActions[0].turn+=2;expect(()=>checkReviewAlternatives(review,{scenarios:[s]} as any)).not.toThrow()
  }
 }
})
it('binds repairs to the project/list scope and supports escaped pointers without modifying any source',()=>{
 const original={id:'unrelated-case','a/b':{'~x':[1,2,3]}},a=nativeRepairCase(original,'project-a:list-v2'),b=nativeRepairCase(original,'project-b:list-v2')
 const patch={cases:[{id:a.id,baseHash:a.baseHash,operations:[{op:'replace',path:'/a~1b/~0x/1',valueJson:'7'}]}]}
 expect(a.baseHash).not.toBe(b.baseHash);expect(()=>applyNativeRepair(patch,[b])).toThrow('hash')
 expect(applyNativeRepair(patch,[a])[0]['a/b']['~x']).toEqual([1,7,3]);expect(original['a/b']['~x']).toEqual([1,2,3])
})
it('resolves precise constraints for a failed native array field without changing the schema',()=>{
 const schema={type:'object',properties:{scenarios:{type:'array',items:{type:'object',properties:{comparison:{type:'string',minLength:10,maxLength:240}}}}}}
 const before=JSON.stringify(schema)
 expect(nativeRepairConstraint(schema,'output.scenarios[0].comparison')).toEqual([{type:'string',minLength:10,maxLength:240}]);expect(JSON.stringify(schema)).toBe(before)
})
