import {expect,it} from 'vitest'
import {createGuideRequestPlanner,planGuideRequest,unpackGuideData,assertGuideRequestFits} from '../src/main/guide-request-budget'

const data=()=>({sources:[{id:'card:independent',content:'Complete physical costs, conditions, timing and effects. '.repeat(30)}],rows:Array.from({length:24},(_,i)=>({id:'line-'+i,side:i%2?'ours':'opponent',count:i%4,sourceId:'card:independent'}))})
const schema=()=>({type:'object',properties:{result:{type:'string',maxLength:600}},required:['result'],additionalProperties:false})
it('recalculates every dynamic budget while reusing exact prompt measurements',()=>{
 const plan=createGuideRequestPlanner(),facts=data(),shape=schema(),before=JSON.stringify(facts)
 const scenarios=[
  {stage:'review',samples:[],remaining:20,reserve:3,units:1},
  {stage:'review',samples:[{family:'review',visibleTokens:10,inputTokens:1000,outputTokens:5}],remaining:20,reserve:3,units:1},
  {stage:'review',samples:[],remaining:3,reserve:3,units:1},
  {stage:'segments-ours',samples:[],remaining:20,reserve:3,units:7},
  {stage:'review',samples:[{family:'review',visibleTokens:10,inputTokens:10,outputTokens:150000}],remaining:20,reserve:3,units:1},
  {stage:'review',samples:[],remaining:20,reserve:3,units:1}
 ]
 for(const s of scenarios){
  const args=[s.stage,'Retain all complete facts',facts,shape,s.samples,s.remaining,s.reserve,s.units,true,true,true,true] as const
  expect(plan(...args)).toEqual(planGuideRequest(...args))
 }
 expect(()=>assertGuideRequestFits(plan('review','Retain all complete facts',facts,shape,[],3,3,1,true,true,true,true))).toThrow('non inviata')
 expect(JSON.stringify(facts)).toBe(before)
})
it('invalidates changed data, schema and instructions and does not retain returned mutable objects',()=>{
 const plan=createGuideRequestPlanner(),facts=data(),shape=schema()
 facts.sources=Array.from({length:24},()=>facts.sources[0])
 const run=()=>plan('review','Complete instructions',facts,shape,[],20,3,1,true,true,true,true)
 const first=run();expect(first.budget.encoding).not.toBe('plain');(first.data as any).expandedHash='modified by caller'
 expect(unpackGuideData(run().data)).toEqual(facts)
 facts.rows[0].count=59;shape.properties.result.maxLength=17
 expect(run()).toEqual(planGuideRequest('review','Complete instructions',facts,shape,[],20,3,1,true,true,true,true))
 expect(plan('review','Changed instructions',facts,shape,[],20,3,1,true,true,true,true)).toEqual(planGuideRequest('review','Changed instructions',facts,shape,[],20,3,1,true,true,true,true))
})
it('separates undefined root data from JSON null and preserves ordinary plain data',()=>{
 const plan=createGuideRequestPlanner()
 for(const value of [undefined,null,'',false,0,undefined,null])expect(plan('plan','Exact data',value,{},[],10,2)).toEqual(planGuideRequest('plan','Exact data',value,{},[],10,2))
})
it('keeps bounded measurement eviction and separate planner instances semantically invisible',()=>{
 const plan=createGuideRequestPlanner(),other=createGuideRequestPlanner()
 for(let i=0;i<70;i++){
  const facts={value:'independent-'+i},expected=planGuideRequest('plan','Exact instructions',facts,{},[],10,2)
  expect(plan('plan','Exact instructions',facts,{},[],10,2)).toEqual(expected)
  if(i%10===0)expect(other('plan','Exact instructions',facts,{},[],10,2)).toEqual(expected)
 }
 expect(plan('plan','Exact instructions',{value:'independent-0'},{},[],10,2)).toEqual(planGuideRequest('plan','Exact instructions',{value:'independent-0'},{},[],10,2))
})
