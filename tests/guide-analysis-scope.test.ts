import {it,expect} from 'vitest'
import {createElement} from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
import {guideObligationFixture} from './fixtures/guide-obligation'
import {constructGuideScenarioMetadata} from '../src/main/guide-scenario-metadata'
import {GUIDE_FINITE_ANALYSIS_CONTRACT,checkGuideAnalysisScope,validGuideAnalysisScope,type GuideAnalysisScope} from '../src/shared/guide-analysis-scope'
import {projectGuideLedger} from '../src/shared/guide-ledger-projection'
import {compileGuideTactics,checkGuideTactics} from '../src/shared/guide-tactical-checks'
import {checkGuide,readGuideContent,assertGuideReport,guideChapterKinds,type MatchupGuide} from '../src/shared/matchup-guide'
import {deriveOmissionWitnesses} from '../src/shared/guide-response-construction'
import {singleFiniteScenarioSchema,singleScenarioSchemaV28} from '../src/main/matchup-guide-schema'
import {assertNativeScenarioSchema} from '../src/main/guide-scenario-output-schema'
import {DeepMatchupGuide} from '../src/renderer/src/DeepMatchupGuide'
import {guideFiniteInstructions,type GuideFinitePhase} from '../src/main/guide-finite-instructions'
import {packetHash} from '../src/main/matchup-guide-packet'

it('uses distinct finite role instructions while retaining physical checks and avoiding the old expansion mandate',()=>{
  for(const phase of ['plan','native','evaluation','review','prose'] as GuideFinitePhase[]){
    const instructions=guideFiniteInstructions(phase)
    expect(instructions).toContain(GUIDE_FINITE_ANALYSIS_CONTRACT)
    expect(instructions).toContain('hostPrintId')
    expect(instructions).toContain('attackPayment')
    expect(instructions).toContain('boardExitProofs')
    expect(instructions).toContain('Non confrontato non significa impossibile o zero danno')
    expect(instructions).not.toContain('Cerca il massimo danno entro il budget ridotto')
    expect(instructions).not.toContain('Per ogni printId della minima')
    expect(instructions).not.toContain('Controlli del pilota:')
  }
  expect(guideFiniteInstructions('prose')).toContain('almeno due esercizi')
  expect(guideFiniteInstructions('review')).toContain('Nessun pass con rilievi irrisolti')
})

async function fixture(){
  const f=await guideObligationFixture()
  try{
    const built=(await constructGuideScenarioMetadata([f.main],[f.before],f.branches,f.options))[0],raw=structuredClone(built.raw)
    const scope:GuideAnalysisScope={contract:GUIDE_FINITE_ANALYSIS_CONTRACT,horizon:'ours-opponent-ours',comparedReplyIds:raw.scenarios[0].replyComparison!.options.map(o=>o.id),
      access:{replyId:f.before.access.id,reason:'Synthetic additional draw executed in the selected access line.',sourceIds:['card:p']},
      defend:{replyId:f.before.defend.id,reason:'Synthetic defensive line explicitly compared.',sourceIds:['card:p']},limits:['Synthetic selected replies only; no optimality or competitive assessment is demonstrated.']}
    raw.scenarios[0].analysisScope=scope;delete raw.scenarios[0].replyComparison!.coverage
    for(const option of raw.scenarios[0].replyComparison!.options){const journal=f.branches.find(b=>b.seed.id===option.id)!.journal;(option as any).developmentPlan={opponent:journal.segments[1].development,next:journal.segments.length===3?journal.segments[2].development:null}}
    const packet={...f.options.packet,basis:{...f.options.packet.basis,analysisContract:GUIDE_FINITE_ANALYSIS_CONTRACT}}
    packet.basis.dependencyHash=packetHash(packet)
    const project=()=>compileGuideTactics(projectGuideLedger(raw,packet))
    return {...f,raw,scope,packet,project}
  }catch(error){f.close();throw error}
}

it('projects complete native lines under an explicit finite basis and refuses a scenario-only opt-out',async()=>{
  const f=await fixture()
  try{
    const scenario=f.raw.scenarios[0]
    assertNativeScenarioSchema(f.raw,singleFiniteScenarioSchema(scenario.id))
    expect(()=>assertNativeScenarioSchema(f.raw,singleScenarioSchemaV28(scenario.id))).toThrow()
    const content=f.project()
    expect(checkGuide(content,f.packet,false).errors).toEqual([])
    expect(readGuideContent(content,'matchup-guide-28',GUIDE_FINITE_ANALYSIS_CONTRACT)).toEqual(content)
    expect(()=>readGuideContent(content,'matchup-guide-28')).toThrow()
    expect(checkGuide(content,f.options.packet,false).errors.join('\n')).toContain('non autorizzata')
    expect(()=>readGuideContent(content,'matchup-guide-27',GUIDE_FINITE_ANALYSIS_CONTRACT)).toThrow('non supportato')
    expect(content.scenarios[0].replyComparison!.options).toHaveLength(3)
    expect(packetHash(f.packet)).not.toBe(packetHash(f.options.packet))
  }finally{f.close()}
})

it('retains all resource, arithmetic, transition and active-attack gates inside the declared comparison',async()=>{
  const f=await fixture()
  try{
    const good=f.project(),resource=structuredClone(good)
    resource.scenarios[0].replyComparison!.options[0].requiredCards=[{printId:'absent',count:1,access:'Synthetic illegal card'}]
    expect(checkGuide(resource,f.packet,false).errors.join('\n')).toContain('risorsa avversaria non disponibile')
    const arithmetic=structuredClone(good);arithmetic.scenarios[0].replyComparison!.options[0].damage=20
    expect(checkGuide(arithmetic,f.packet,false).errors.join('\n')).toContain('danno della replica non coerente')
    const transition=structuredClone(good);transition.scenarios[0].steps[0].after.ourPrizes=0
    expect(checkGuide(transition,f.packet,false).errors.length).toBeGreaterThan(0)
    const otherFirst=structuredClone(good);(otherFirst.scenarios[0].replyComparison!.options[0] as any).forkAtEvent=0
    expect(checkGuide(otherFirst,f.packet,false).errors.join('\n')).toContain('stessa nostra prima mossa')
    const wrongAttack=structuredClone(f.raw) as any
    wrongAttack.scenarios[0].turns.next.attack.attack.printId='absent'
    expect(()=>projectGuideLedger(wrongAttack,f.packet)).toThrow()
    const unavailable=structuredClone(f.raw) as any
    unavailable.scenarios[0].turns.next.beforeAttack.push({...unavailable.scenarios[0].turns.next.attack,attack:null,attackPayment:null,description:'Synthetic impossible energy transfer',energyRoutes:[{side:'ours',printId:'e',count:61,path:['hand','discard'],hostPrintId:null,sourceIds:['card:e'],attachment:null}]})
    expect(()=>projectGuideLedger(unavailable,f.packet)).toThrow()
  }finally{f.close()}
})

it('allows a local sufficient KO without claiming removal minimality and still rejects a dominated selected minimum',async()=>{
  const f=await fixture()
  try{
    const s=f.project().scenarios[0],c=s.replyComparison!
    c.minimumReplyId=c.options[0].id;c.threshold=90
    for(const [i,o]of c.options.entries())Object.assign(o,{terms:[100],multiplier:1,damage:100,reachesThreshold:true,requiredCards:[{printId:'e',count:i===0?1:2,access:'Synthetic test of the comparison predicate, not a native attack proof.'}],attachments:0,specificDraws:[]})
    const errors=(mode:'historical'|'declared-lines')=>checkGuideTactics(s,f.packet.ourList,f.packet.opponentLists[0],f.packet.sources,true,true,false,mode)
    expect(errors('declared-lines')).toEqual([])
    expect(errors('historical').join('\n')).toContain('manca prova di rimozione')
    c.minimumReplyId=c.options[1].id
    expect(errors('declared-lines').join('\n')).toContain('meno risorse')
    c.minimumReplyId=c.options[0].id
    expect(()=>deriveOmissionWitnesses(s,true,'declared-lines')).not.toThrow()
    expect(()=>deriveOmissionWitnesses(s,true)).toThrow('RIMOZIONE INCOMPLETE')
    c.omissionTests=[{printId:'e',remainingDamage:0,reason:'Unproved synthetic absence'}]
    expect(()=>deriveOmissionWitnesses(s,true,'declared-lines')).toThrow('non ammette')
    expect(checkGuideAnalysisScope(s,f.packet.sources,true).join('\n')).toContain('contratto storico')
  }finally{f.close()}
})

it('covers every declared reply, enforces the finite bound and distinguishes unexamined categories from absence',async()=>{
  const f=await fixture()
  try{
    const s=f.project().scenarios[0],c=s.replyComparison!
    const check=()=>checkGuideAnalysisScope(s,f.packet.sources,true)
    s.analysisScope!.comparedReplyIds.pop();expect(check().join('\n')).toContain('diverse')
    s.analysisScope=structuredClone(f.scope)
    s.analysisScope.comparedReplyIds.push('fourth','fifth');expect(check().join('\n')).toContain('non valida')
    s.analysisScope=structuredClone(f.scope)
    const access=c.options.find(o=>o.id===s.analysisScope!.access.replyId)!;access.accessProof=null
    expect(check().join('\n')).toContain('senza prova e fonte')
    c.options=c.options.filter(o=>o.id!==access.id);s.analysisScope.comparedReplyIds=c.options.map(o=>o.id)
    s.analysisScope.access={replyId:null,reason:'Additional access is not examined; no impossibility is claimed.',sourceIds:['card:p']}
    expect(check()).toEqual([])
    const native=f.raw.scenarios[0]
    native.replyComparison!.options=native.replyComparison!.options.filter(o=>o.id!==access.id)
    native.analysisScope=structuredClone(s.analysisScope)
    expect(checkGuide(f.project(),f.packet,false).errors).toEqual([])
    s.analysisScope.defend.sourceIds=['missing-source'];expect(check().join('\n')).toContain('fonte assente')
    expect(validGuideAnalysisScope({...f.scope,limits:[]})).toBe(false)
    expect(validGuideAnalysisScope({...f.scope,globallyOptimal:true})).toBe(false)
  }finally{f.close()}
})

it('preserves the contract through canonical report recovery and displays the scope beside the example',async()=>{
  const f=await fixture()
  try{
    // Explicit synthetic transport fixture: two independent IDs exercise the
    // persistence reader, not scenario diversity or semantic AI approval.
    const second=structuredClone(f.raw.scenarios[0]);second.id='synthetic-second';(second as any).decision='A second synthetic question'
    f.raw.scenarios.push(second)
    const content=f.project()
    content.chapters=guideChapterKinds.map(kind=>({id:'chapter-'+kind,kind,title:'Synthetic '+kind,body:'Synthetic scope-preservation fixture, not an AI-generated guide.',sourceIds:['card:p'],dependsOn:[content.scenarios[0].id]}))
    content.exercises=[1,2].map(i=>({id:'exercise-'+i,question:'Synthetic question',solution:'Synthetic answer',sourceIds:['card:p'],scenarioIds:[content.scenarios[0].id]}))
    const checked=checkGuide(content,f.packet)
    expect(checked.errors).toEqual([])
    const expanded=structuredClone(content);expanded.scenarios.push({...structuredClone(content.scenarios[0]),id:'unplanned-third'})
    expect(checkGuide(expanded,f.packet).errors.join('\n')).toContain('esattamente due scenari')
    const guide:MatchupGuide={...content,...f.packet,formatVersion:1,review:{verdict:'pass',findings:[],checks:['Synthetic independent-critic transport only; no quality claim.']},localChecks:checked.checks,generation:{config:{provider:'codex',model:null,reasoningEffort:null,source:'global'},attempts:[],parentDependencyHash:null}}
    const report={...guide.basis,guide}
    expect(()=>assertGuideReport(report)).not.toThrow()
    f.archive.saveValue('synthetic-finite-report','guide',guide)
    const reopened=f.archive.value<MatchupGuide>('synthetic-finite-report','guide')!
    expect(reopened.basis.analysisContract).toBe(GUIDE_FINITE_ANALYSIS_CONTRACT)
    expect(()=>assertGuideReport({...report,guide:reopened})).not.toThrow()
    const html=renderToStaticMarkup(createElement(DeepMatchupGuide,{guide:reopened,renderText:text=>text}))
    expect(html).toContain('Ambito del confronto')
    expect(html).toContain('Questo caso confronta 3 risposte')
    expect(html).toContain(f.scope.limits[0])
    expect(html).not.toContain('Impiegando una carta in meno')
    const tampered=structuredClone(reopened);delete tampered.basis.analysisContract
    expect(()=>assertGuideReport({...report,guide:tampered})).toThrow()
    const negative=structuredClone(reopened);negative.review.verdict='revise';negative.review.findings=[{severity:'major',targetId:content.scenarios[0].id,message:'Synthetic unresolved critical issue',correction:'Correct it before publishing.',sourceIds:['card:p']}]
    expect(()=>assertGuideReport({...report,guide:negative})).toThrow('non pubblicabile')
  }finally{f.close()}
})
