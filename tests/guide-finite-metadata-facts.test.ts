import {it,expect} from 'vitest'
import {finiteMetadataFacts,bindFiniteMetadataFacts} from '../src/main/guide-finite-metadata-facts'
import {assertNativeScenarioSchema} from '../src/main/guide-scenario-output-schema'
import {guideSource} from '../src/main/matchup-guide-packet'
import {assertGuideSchemaBudget} from '../src/main/guide-schema-encoding'

it('separates copied-attack actors, opponent candidates, consumed copies and unused conditional draws',()=>{
 const card=(id:string,category:string,names:string[]=[])=>guideSource('card:'+id,'card',id,null,JSON.stringify({printId:id,category,gameplay:{attacks:names.map(name=>({name}))}}))
 const sources=[card('our','Pokemon',['Own attack']),card('op','Pokemon',['Copy']),card('origin','Pokemon',['Printed strike']),card('energy','Energy'),card('unused','Trainer')]
 const inventory:any=[['ours','our','active'],['opponent','op','active'],['opponent','origin','bench'],['opponent','energy','deck'],['opponent','unused','deck']].map(([side,printId,zone])=>({side,printId,zone,count:1}))
 const events=[{turn:1,side:'ours',kind:'attack',attackerPrintId:'our',attackName:'Own attack',moves:[]},
  {turn:2,side:'opponent',kind:'draw',moves:['energy','unused'].map(printId=>({side:'opponent',printId,from:'deck',to:'hand',count:1}))},
  {turn:2,side:'opponent',kind:'attach',moves:[{side:'opponent',printId:'energy',from:'hand',to:'attached',count:1}]},
  {turn:2,side:'opponent',kind:'attack',attackerPrintId:'op',attackName:'Copy',moves:[]}]
 const input={caseId:'synthetic',inventory,setupEvents:[],mainEvents:events,lines:[{id:'reply',replyTurn:2,events}],sources},before=JSON.stringify(input),facts=finiteMetadataFacts(input)
 expect(facts.attackCandidates).toEqual([{printId:'op',attackName:'Copy'},{printId:'origin',attackName:'Printed strike'}])
 expect(facts.replies[0].executedAttacks).toEqual([{printId:'op',attackName:'Copy'}])
 expect(facts.replies[0].cost.requiredCards.map(c=>c.printId)).toEqual(['energy'])
 expect(facts.replies[0].cost.attachments).toBe(1)
 expect(JSON.stringify(input)).toBe(before)
 const object=(properties:any)=>({type:'object',properties,additionalProperties:false,required:Object.keys(properties)}),str={type:'string'}
 const schema=object({metadata:object({replyComparison:object({attackReview:{type:'array',maxItems:40,items:object({printId:str,attackName:str,replyId:{anyOf:[str,{type:'null'}]},reason:str})},options:{type:'array',items:{anyOf:[object({id:{type:'string',const:'reply'},replyTurn:{type:'integer'},specificDraws:{type:'array',maxItems:30,items:str}})]}}}),calculations:{type:'array',items:object({attack:{anyOf:[object({printId:str,attackName:str}),{type:'null'}]}})}})})
 const original=JSON.stringify(schema),bound=bindFiniteMetadataFacts(schema,facts)
 const value={metadata:{replyComparison:{attackReview:[{printId:'op',attackName:'Copy',replyId:'reply',reason:'Executed by its actual actor.'},{printId:'origin',attackName:'Printed strike',replyId:null,reason:'Copied effect source, no separate executed attacker.'}],options:[{id:'reply',replyTurn:2,specificDraws:['energy']}]},calculations:[{attack:{printId:'op',attackName:'Copy'}}]}}
 expect(()=>assertNativeScenarioSchema(value,bound)).not.toThrow()
 const badDraw=structuredClone(value);badDraw.metadata.replyComparison.options[0].specificDraws.push('unused')
 expect(()=>assertNativeScenarioSchema(badDraw,bound)).toThrow()
 const badActor=structuredClone(value);badActor.metadata.calculations[0].attack={printId:'origin',attackName:'Printed strike'}
 expect(()=>assertNativeScenarioSchema(badActor,bound)).toThrow()
 const badLink=structuredClone(value);badLink.metadata.replyComparison.attackReview[1].replyId='reply'
 expect(()=>assertNativeScenarioSchema(badLink,bound)).toThrow()
 const own=structuredClone(value);own.metadata.replyComparison.attackReview[1]={printId:'our',attackName:'Own attack',replyId:'reply',reason:'Wrong side.'}
 expect(()=>assertNativeScenarioSchema(own,bound)).toThrow()
 expect(JSON.stringify(schema)).toBe(original)
 const derived=structuredClone(schema),option=derived.properties.metadata.properties.replyComparison.properties.options.items.anyOf[0]
 delete (option.properties as any).replyTurn;option.required=option.required.filter((k:string)=>k!=='replyTurn')
 const derivedBound=bindFiniteMetadataFacts(derived,facts)
 expect(derivedBound.properties.metadata.properties.replyComparison.properties.options.items.anyOf[0].properties.replyTurn).toBeUndefined()
 expect(()=>assertGuideSchemaBudget(derivedBound)).not.toThrow()
})
