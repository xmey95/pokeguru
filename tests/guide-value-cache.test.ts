import {it,expect,vi} from 'vitest'
import {memoGuideJson} from '../src/main/guide-value-cache'
import {segmentFixture} from './fixtures/guide-segment'
import {guideScenarioSchemaV27} from '../src/main/matchup-guide-schema'
import {boundGuideSchema} from '../src/main/guide-bound-schema'
import {compactGuideSchema,shortGuideSchemaRefs} from '../src/main/guide-schema-encoding'
import {createGuideSegments,appendGuideSegment,guideSegmentDeclarations,verifyGuideSegments} from '../src/main/guide-segments'

it('memoizes only complete pure JSON values and returns isolated results',()=>{
 const compute=vi.fn(()=>({nested:{answer:42}})),first=memoGuideJson('synthetic-memo',{input:1},compute)
 first.nested.answer=99
 expect(memoGuideJson('synthetic-memo',{input:1},compute)).toEqual({nested:{answer:42}});expect(compute).toHaveBeenCalledTimes(1)
 memoGuideJson('synthetic-memo',{input:2},compute);expect(compute).toHaveBeenCalledTimes(2)
 const fail=vi.fn(()=>{throw Error('Synthetic rejected calculation')})
 for(let i=0;i<2;i++)expect(()=>memoGuideJson('synthetic-failed',{input:1},fail)).toThrow('Synthetic rejected calculation')
 expect(fail).toHaveBeenCalledTimes(2)
})
it('never conflates lossy JSON inputs with a previously validated value',()=>{
 const cases:any[]=[{a:undefined},{a:NaN},{a:Infinity},{a:-0},new Array(1),Object.assign([null],{extra:1}),Object.assign(Object.create({inherited:true}),{a:1}),Object.defineProperty({a:1},'hidden',{value:1}),Object.defineProperty({},'getter',{get:()=>1,enumerable:true}),{[Symbol('x')]:1},[undefined]]
 for(const [i,input]of cases.entries()){
  const compute=vi.fn(()=>({answer:i}));memoGuideJson('non-json-'+i,input,compute);memoGuideJson('non-json-'+i,input,compute);expect(compute).toHaveBeenCalledTimes(2)
 }
 const large=vi.fn(()=>({text:'x'.repeat(16*1024*1024)}));memoGuideJson('large',{value:1},large);memoGuideJson('large',{value:1},large);expect(large).toHaveBeenCalledTimes(2)
})
it('isolates cached schema results and binds every source change even with an unchanged claimed dependency hash',()=>{
 const f=segmentFixture(),packet=f.packet as any,schema=guideScenarioSchemaV27
 const bound=boundGuideSchema(schema,packet,'their-list'),expectedBound=JSON.stringify(bound),compact=compactGuideSchema(bound),expectedCompact=JSON.stringify(compact),short=shortGuideSchemaRefs(compact),expectedShort=JSON.stringify(short)
 ;(bound as any).injectedForeignProperty=true;(compact as any).injectedForeignProperty=true;(short as any).injectedForeignProperty=true
 expect(JSON.stringify(boundGuideSchema(schema,packet,'their-list'))).toBe(expectedBound)
 expect(JSON.stringify(compactGuideSchema(JSON.parse(expectedBound)))).toBe(expectedCompact)
 expect(JSON.stringify(shortGuideSchemaRefs(JSON.parse(expectedCompact)))).toBe(expectedShort)
 const changed=structuredClone(packet),card=JSON.parse(changed.sources[0].content);card.gameplay.attacks.push({name:'Synthetic new attack',damage:'0',cost:[]});changed.sources[0].content=JSON.stringify(card)
 const rebound=JSON.stringify(boundGuideSchema(schema,changed,'their-list'))
 expect(rebound).not.toBe(expectedBound);expect(rebound).toContain('Synthetic new attack');expect(JSON.stringify(boundGuideSchema(schema,packet,'their-list'))).toBe(expectedBound)
})
it('reuses only already replayed exact journals, retaining all mutation, receipt, source and scope checks',()=>{
 const f=segmentFixture(),packet=f.packet as any,scope={projectId:'project-a',jobId:'cached-replay',dependencyHash:packet.basis.dependencyHash,configHash:'cached-replay'},{turns,developmentPlan,...setup}=f.scenario
 const root=createGuideSegments(setup,scope,packet),first=appendGuideSegment(root,scope,packet,turns.ours,developmentPlan.ours),expected=guideSegmentDeclarations(first,scope,packet)
 expect(guideSegmentDeclarations(first,scope,packet)).toEqual(expected)
 const read=guideSegmentDeclarations(first,scope,packet);read.turns.ours.events.push({invented:true})
 expect(guideSegmentDeclarations(first,scope,packet)).toEqual(expected)
 const extra=structuredClone(first);extra.segments[0].body.extra=undefined;expect(()=>verifyGuideSegments(extra,scope,packet)).toThrow()
 const invalid=structuredClone(first);invalid.segments[0].receipt.inventory[0].count++;expect(()=>verifyGuideSegments(invalid,scope,packet)).toThrow('alterati')
 expect(()=>verifyGuideSegments(first,{...scope,jobId:'foreign-job'},packet)).toThrow('contesto')
 const changed=structuredClone(packet);changed.sources[0].content+=' ';expect(()=>verifyGuideSegments(first,scope,changed)).toThrow('contesto')
 const missing=structuredClone(first);missing.setup.positionAnnotations[0].damage=NaN;expect(()=>verifyGuideSegments(missing,scope,packet)).toThrow()
 expect(guideSegmentDeclarations(first,scope,packet)).toEqual(expected)
})
