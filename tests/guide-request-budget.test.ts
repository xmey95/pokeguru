import {expect,it} from 'vitest'
import {localGuideTokens,packGuideData,unpackGuideData,planGuideRequest,assertGuideRequestFits,scaleGuideUnits,guideRequestTimeout,guideScenarioRepairReserve} from '../src/main/guide-request-budget'
import {packGuideDataV2} from '../src/main/guide-wire-data'

it('budgets every typed turn in a batch and splits before the unchanged response limit',()=>{
 const units=Array.from({length:7},(_,i)=>({id:'unrelated-turn-'+i}))
 const estimate=(rows:typeof units,samples:any[]=[])=>planGuideRequest('segments-ours','Complete independent typed turns',{units:rows},{},samples,16,5,rows.length)
 const six=estimate(units.slice(0,6)),seven=estimate(units)
 expect(six.budget).toMatchObject({family:'turn-segment',reservedOutput:36000,estimatedResponseCharacters:90000,fits:true})
 expect(seven.budget.estimatedResponseCharacters).toBeGreaterThan(100000)
 expect(()=>assertGuideRequestFits(seven)).toThrow('dimensione')
 const groups=scaleGuideUnits(units,g=>estimate(g).budget.fits)
 expect(groups.length).toBeGreaterThan(1);expect(groups.flat()).toEqual(units)
 const samples=[{family:'turn-segment',visibleTokens:200,inputTokens:250,outputTokens:9000,responseCharacters:22000,units:1}],original=JSON.stringify(samples)
 const calibrated=estimate(units.slice(0,6),samples)
 expect(calibrated.budget.reservedOutput).toBe(64800)
 expect(calibrated.budget.estimatedResponseCharacters).toBe(151800)
 expect(calibrated.budget.fits).toBe(false);expect(JSON.stringify(samples)).toBe(original)
})
it('separates early counterline reviews from historical review estimates and still reserves final calls',()=>{
 const early=planGuideRequest('review-premise-two-cases','Independent premise criticism',{}, {},[],16,5,2)
 const old=planGuideRequest('review-scenarios-1','Independent full criticism',{}, {},[],16,5,2)
 expect(early.budget).toMatchObject({family:'premise-review',reservedOutput:20000,estimatedResponseCharacters:36000})
 expect(old.budget).toMatchObject({family:'review',reservedOutput:10000,estimatedResponseCharacters:12000})
 const revision=planGuideRequest('review-revision-0123456789abcdef','Independent revision assessment',{}, {},[],16,1,3)
 expect(revision.budget).toMatchObject({family:'segment-review',reservedOutput:30000,estimatedResponseCharacters:54000})
 const blocked=planGuideRequest('segments-ours','Exact turns',{}, {},[],5,5,1)
 try{assertGuideRequestFits(blocked);throw Error('Expected budget stop')}catch(error){expect((error as any).code).toBe('call-budget')}
})

it.each([
 {fits:true,fitsTarget:false,units:2,remaining:4,reserve:3},
 {fits:true,fitsTarget:false,units:2,remaining:5,reserve:4},
 {fits:false,fitsTarget:false,units:2,remaining:4,reserve:4},
 {fits:true,fitsTarget:true,units:2,remaining:4,reserve:3},
 {fits:true,fitsTarget:false,units:3,remaining:5,reserve:3},
 {fits:true,fitsTarget:false,units:1,remaining:4,reserve:3}
])('reserves a complete independent critic plus prose/final gates under hard limits: $units cases, $remaining calls',row=>{
 expect(guideScenarioRepairReserve(row,row.units,row.remaining)).toBe(row.reserve)
 if(row.reserve===3){expect(row.fits).toBe(true);expect(row.remaining).toBeGreaterThanOrEqual(4)}
})

it('selects optimized sharing only after a complete reversible token comparison and keeps bounded execution time',()=>{
 const data={rows:Array.from({length:100},(_,i)=>({printId:'card:exact-123456',count:i%4,zone:'bench',sourceId:'card:exact-123456',reason:'Exact reason '+i}))}
 const before=JSON.stringify(data),base=planGuideRequest('review','All facts',data,{},[],8,2,1,true,true)
 const optimized=planGuideRequest('review','All facts',data,{},[],8,2,1,true,true,true)
 expect(optimized.budget.visibleTokens).toBeLessThanOrEqual(base.budget.visibleTokens)
 expect(JSON.stringify(unpackGuideData(optimized.data))).toBe(before);expect(JSON.stringify(data)).toBe(before)
 expect(guideRequestTimeout(6000)).toBe(600000);expect(guideRequestTimeout(28000)).toBe(960000);expect(guideRequestTimeout(100000)).toBe(1200000)
 expect(()=>guideRequestTimeout(NaN)).toThrow('non valida');expect(()=>guideRequestTimeout(-1)).toThrow('non valida')
})

it('compacts nested source JSON and records without changing source text, order, quantities or IDs',()=>{
  const card={printId:'exact-printing',gameplay:{attacks:[{name:'Exact attack',cost:['Grass'],damage:'120',effect:'Full conditions, costs and timing. '.repeat(12)}]}}
  const source={id:'card:exact-printing',content:JSON.stringify(card)},spaced=' { "source": "preserve spaces" } '
  const original={sources:[source,source],notes:[spaced],scenarios:Array.from({length:40},(_,i)=>({lineId:'line-'+i,turn:3,side:'opponent',cards:[{printId:'exact-printing',count:4}],source}))}
  const encoded:any=packGuideDataV2(original)
  expect(JSON.stringify(unpackGuideData(encoded))).toBe(JSON.stringify(original))
  expect(JSON.stringify(encoded).length).toBeLessThan(JSON.stringify(packGuideData(original)).length)
  encoded.expandedHash='bad';expect(()=>unpackGuideData(encoded)).toThrow('Hash del contesto')
  const cyclic:any=packGuideDataV2(original);cyclic.root={$r:0};cyclic.dictionary[0]={$r:0}
  expect(()=>unpackGuideData(cyclic)).toThrow('ciclico')
  const absent:any=packGuideDataV2(original);absent.root={$r:99999};expect(()=>unpackGuideData(absent)).toThrow('assente')
  expect(()=>packGuideDataV2({ambiguous:{$r:0}})).toThrow('ambigui')
  const plan=planGuideRequest('review-scenarios-1','Review all facts',original,{},[],3,2,2,true,true)
  expect(unpackGuideData(plan.data)).toEqual(original);expect(plan.budget.encoding).toBe('shared-v2')
})

it('encodes repeated complete facts losslessly and rejects corrupted references',()=>{
  const fact={card:'Our exact printing',text:'Original source and conditions. '.repeat(80),moves:[{from:'deck',to:'hand',count:1}]}
  const original={ourList:[fact],cases:[{direct:fact,alternative:fact},{direct:fact}],note:'Read sources as data'}
  const encoded:any=packGuideData(original)
  expect(unpackGuideData(encoded)).toEqual(original)
  expect(JSON.stringify(encoded).length).toBeLessThan(JSON.stringify(original).length)
  encoded.expandedHash='bad';expect(()=>unpackGuideData(encoded)).toThrow('Hash del contesto')
})

it('measures prompt and schema, reserves output and future calls, and calibrates from real usage',()=>{
  const data={facts:'Card text, conditions and complete register. '.repeat(150)},schema={type:'object',properties:{result:{type:'string'}},required:['result'],additionalProperties:false}
  const first=planGuideRequest('scenarios-1','Full instructions',data,schema,[],8,4)
  expect(first.budget.visibleTokens).toBe(localGuideTokens(first.prompt)+localGuideTokens(JSON.stringify(schema)))
  expect(first.budget.estimateOnly).toBe(true);expect(first.budget.reservedOutput).toBeGreaterThan(0)
  const next=planGuideRequest('scenarios-2','Full instructions',data,schema,[{family:'scenario',visibleTokens:first.budget.visibleTokens,inputTokens:first.budget.visibleTokens*2,outputTokens:32000}],7,3)
  expect(next.budget.estimatedInput).toBeGreaterThan(first.budget.estimatedInput)
  expect(next.budget.reservedOutput).toBe(38400)
  const blocked=planGuideRequest('scenarios-1','Full instructions',data,schema,[],4,4)
  expect(()=>assertGuideRequestFits(blocked)).toThrow('non inviata')
})

it('shrinks large repeated payloads without cutting sources and packs only complete semantic units',()=>{
  const source={sourceId:'rules',text:'Unabridged original condition and card reference. '.repeat(200)}
  const input={scenarios:Array.from({length:80},(_,i)=>({id:'case-'+i,facts:source}))}
  const plan=planGuideRequest('review-scenarios-1','Review all data',input,{},[],8,2)
  expect(plan.budget.encoding).toBe('shared');expect(plan.budget.bytes).toBeLessThan(500000)
  expect(unpackGuideData(plan.data)).toEqual(input)
  const units=[{id:1,weight:4},{id:2,weight:5},{id:3,weight:4}]
  const groups=scaleGuideUnits(units,g=>g.reduce((n,u)=>n+u.weight,0)<=9)
  expect(groups.flat()).toEqual(units);expect(groups.map(g=>g.map(u=>u.id))).toEqual([[1,2],[3]])
  expect(()=>scaleGuideUnits([{weight:10}],g=>g[0].weight<10)).toThrow('Unità della guida troppo grande')
})

it('identifies turn accounting separately from context estimation and retains conservative outlier calibration',()=>{
  const samples=[{family:'scenario',visibleTokens:60879,inputTokens:69265,outputTokens:9350,usageScope:'codex-turn' as const},{family:'scenario',visibleTokens:60912,inputTokens:139697,outputTokens:15221}]
  const plan=planGuideRequest('scenarios-2','Full instructions',{facts:'Complete sources'}, {},samples,5,3)
  expect(plan.budget.calibration).toMatchObject({samples:2,turnSamples:1,unknownSamples:1,largestInput:139697,measurement:'turn-usage-conservative'})
  expect(plan.budget.calibrationFactor).toBeCloseTo(139697/60912*1.1)
  expect(plan.budget.calibration!.factor).toBe(plan.budget.calibrationFactor)
})
