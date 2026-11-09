import {it,expect} from 'vitest'
import {segmentFixture} from './fixtures/guide-segment'
import {appendGuideSegment,createGuideSegments,verifyGuideSegments} from '../src/main/guide-segments'
import {guideTurnDeclarationRequest} from '../src/main/guide-segment-generation'
import {mkdtempSync,mkdirSync} from 'node:fs'
import {join,resolve} from 'node:path'
import {syntheticSegmentProtocol} from './fixtures/guide-segment-protocol'
import {ProjectStore} from '../src/main/project-store'
import {AiJobStore} from '../src/main/ai-job-store'
import {AiAnalysisWork} from '../src/main/ai-analysis-work'
import {generateDeepGuide,deepGuideReport,assertGuideIntegrity} from '../src/main/matchup-guide-generation'
import {packetHash,guideHash} from '../src/main/matchup-guide-packet'
import {unpackGuideData} from '../src/main/guide-request-budget'

const scope={projectId:'project-a',jobId:'job-a',dependencyHash:'dependency-a',configHash:'config-a'}
function fixture(version='matchup-guide-28'){
 const {packet,scenario,opponent}=segmentFixture();packet.basis.promptVersion=version
 const {turns,developmentPlan,...setup}=scenario,note=developmentPlan.ours
 const first=appendGuideSegment(createGuideSegments(setup,scope,packet as any),scope,packet as any,turns.ours,note)
 const prefix=appendGuideSegment(first,scope,packet as any,opponent,note)
 const ending={kind:'effect',description:'End the turn without attacking; preserve the board and compare the available attack before choosing this continuation.',moves:[],energyRoutes:[],attack:null,trainer:null,retreat:null,deckObservations:[],boardExitProofs:[],attachmentTargets:[],attackPayment:null,decisionProof:{cards:['p','e'],reason:'The printed synthetic attack and every available card are considered; this declaration makes no attack or claim of victory.'},action:'end-turn',affectedSide:'ours'}
 const body={draw:'e',beforeAttack:[],attack:ending,afterAttack:[],tactical:turns.ours.tactical}
 return {packet,prefix,note,body}
}
it('represents a complete nonterminal alternative without an invented attack and replays it unchanged',()=>{
 const {packet,prefix,note,body}=fixture(),before=JSON.stringify(prefix)
 const request=guideTurnDeclarationRequest(prefix,scope,packet as any,{reserveCalls:4,extraData:{reply:{id:'synthetic-alternative',role:'other'}}})
 const value=request.read({caseId:prefix.setup.id,parentHash:prefix.segments.at(-1)!.hash,phase:'next',body,development:note})
 const next=appendGuideSegment(prefix,scope,packet as any,value.body,value.development),receipt=next.segments.at(-1)!.receipt
 const hand=(r:any)=>r.inventory.filter((v:any)=>v.side==='ours'&&v.zone==='hand').reduce((n:number,v:any)=>n+v.count,0)
 expect(hand(receipt)).toBe(hand(prefix.segments.at(-1)!.receipt)+1)
 expect(receipt.terminal).toBe(false);expect(receipt.termination).toBeNull()
 expect(receipt.events.filter((e:any)=>e.attackName)).toEqual([])
 expect(next.segments.at(-1)!.body).toEqual(body)
 expect(JSON.stringify(prefix)).toBe(before)
 verifyGuideSegments(JSON.parse(JSON.stringify(next)),scope,packet as any)
 expect(request.task).toContain('end-turn')
})
it('keeps historical final-attack requirements and refuses an unmarked empty final event',()=>{
 const old=fixture('matchup-guide-27')
 expect(()=>appendGuideSegment(old.prefix,scope,old.packet as any,old.body,old.note)).toThrow()
 const {packet,prefix,note,body}=fixture();body.attack.action='other'
 expect(()=>appendGuideSegment(prefix,scope,packet as any,body,note)).toThrow()
 body.attack.action='end-turn'
 const main=guideTurnDeclarationRequest(prefix,scope,packet as any,{reserveCalls:4})
 expect(()=>main.read({caseId:prefix.setup.id,parentHash:prefix.segments.at(-1)!.hash,phase:'next',body,development:note})).toThrow()
})
it('does not let a turn-ending marker hide an attack, payment, movement, missing audit or unfinished development',()=>{
 const {packet,prefix,note,body}=fixture(),before=JSON.stringify(prefix)
 const invalid=[
  {...body,attack:{...body.attack,attack:{printId:'p',attackName:'Synthetic attack'},attackPayment:{energy:[],costAdjustments:[]}}},
  {...body,attack:{...body.attack,moves:[{side:'ours',printId:'p',count:1,from:'active',to:'discard'}]}},
  {...body,attack:{...body.attack,attackPayment:{energy:[],costAdjustments:[]}}},
  {...body,attack:{...body.attack,decisionProof:null}},
  {...body,afterAttack:[{...body.attack,action:'other'}]},
  {...body,tactical:{...body.tactical,cards:[]}},
  {...body,terminal:true},
 ]
 for(const value of invalid)expect(()=>appendGuideSegment(prefix,scope,packet as any,value,note)).toThrow()
 expect(()=>appendGuideSegment(prefix,scope,packet as any,body,{reason:'',pivot:'Incomplete'})).toThrow()
 expect(JSON.stringify(prefix)).toBe(before)
})
it('SYNTHETIC: keeps no-attack endings through complete generation, independent review contracts and report persistence',async()=>{
 const root=resolve('.verify/app225-segments-20261102');mkdirSync(root,{recursive:true})
 const folder=mkdtempSync(join(root,'turn-ending-synthetic-')),path=join(folder,'data.sqlite'),projects=new ProjectStore(path),jobs=new AiJobStore(path)
 const project=projects.create({name:'SYNTHETIC explicit end-turn',format:'STANDARD'})
 projects.importDeck({projectId:project.id,rawText:'4 Synthetic Basic\n56 Basic Grass Energy',source:'paste'})
 const f=syntheticSegmentProtocol(project.id,true),context=projects.getCurrentDeckContext(project.id)!
 f.packet.basis={...f.packet.basis,deckHash:projects.getCurrentDeckHash(project.id)!,deckVersionId:context.versionId,deckResolutionId:context.resolutionId,metaId:'d'.repeat(64)}
 f.packet.basis.dependencyHash=packetHash(f.packet)
 projects.saveMetaSnapshot({id:f.packet.basis.metaId,fetchedAt:'2026-11-04T13:00:00.000Z',sourceUrl:'https://limitlesstcg.com/decks',circuit:'WESTERN',format:'STANDARD',period:'SYNTHETIC format test',decks:[{id:f.packet.basis.opponentId,name:'Synthetic Basic',url:'https://limitlesstcg.com/decks/284',share:1,count:1}]} as never)
 const job=jobs.start('matchup-generate',project.id,'synthetic-turn-ending'),work=new AiAnalysisWork(join(folder,job.id),jobs,job.id,new AbortController().signal)
 const stages:string[]=[],unitStages:string[]=[]
 try{
  const guide=await generateDeepGuide({packet:f.packet,config:{provider:'codex',source:'global',model:'gpt-6.1-sol',reasoningEffort:null},work,request:'SYNTHETIC format/persistence test; no provider.',runner:async(prompt,_config,schema)=>{
   const stage=/FASE: ([^\n]+)/.exec(prompt)![1],data=unpackGuideData(JSON.parse(prompt.split('\n\nDATI CONGELATI:\n')[1])) as any,raw=f.response(stage,data,schema) as any;stages.push(stage);unitStages.push(...(data.units??[]).map((u:any)=>u.stage))
   for(const unit of raw.units??[])if(unit.response?.phase==='next'&&data.units.find((u:any)=>u.unitId===unit.unitId)?.data.reply)Object.assign(unit.response.body.attack,{action:'end-turn',attack:null,attackPayment:null,description:'Explicit synthetic turn ending; no attack, damage, Prize or game termination is claimed.'})
   return raw
  }})
  assertGuideIntegrity(guide)
  expect(unitStages.some(s=>s.startsWith('review-segments-cases-'))).toBe(true);expect(unitStages.some(s=>s.startsWith('review-segments-final-'))).toBe(true)
  const natives=guide.generation.scenarioOriginals!.cases.map(c=>c.native as any)
  expect(natives.every(n=>n.turns.next.attack.attack!==null&&n.turns.next.attack.action!=='end-turn')).toBe(true)
  expect(natives.every(n=>n.replyComparison.options.every((o:any)=>o.turns.next.attack.action==='end-turn'))).toBe(true)
  const report=deepGuideReport({...f.packet.basis,jobId:job.id,generatedAt:'2026-11-04T13:00:00.000Z',sampleDeckUrl:null},guide)
  projects.saveMatchupReport(report)
  const reopened=new ProjectStore(path)
  try{const saved=reopened.listMatchupReports(project.id,f.packet.basis.metaId)[0];expect(guideHash(saved)).toBe(guideHash(report));assertGuideIntegrity(saved.guide!)}finally{reopened.close()}
 }finally{work.close();jobs.close();projects.close()}
},60000)
