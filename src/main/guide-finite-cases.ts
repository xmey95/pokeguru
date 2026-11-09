import {guideHash} from './matchup-guide-packet'
import {guideSegmentDeclarations,verifyGuideSegments,guideSegmentNativeSchema,createGuideSegments,appendGuideSegment,forkGuideSegments,type GuideSegmentJournal} from './guide-segments'
import {loadGuideSegmentCheckpoint} from './guide-segment-checkpoints'
import {constructGuideSelectedReplyBranches,type GuideReplyConstruction,type GuideConstructionRuntime} from './guide-reply-phase'
import {readGuideFinitePlan,constructGuideFinitePlans,type GuideFinitePlan} from './guide-finite-plan'
import {singleFiniteScenarioSchema} from './matchup-guide-schema'
import {boundGuideSchema} from './guide-bound-schema'
import {assertNativeScenarioSchema} from './guide-scenario-output-schema'
import {withGuideSegmentRetry,type GuideSegmentRequest} from './guide-segment-generation'
import {runGuideSegmentPhase} from './guide-segment-scheduler'
import {guideFiniteInstructions} from './guide-finite-instructions'
import type {ConstructedGuideScenario} from './guide-scenario-metadata'
import {projectGuideLedger,projectGuideSetup} from '../shared/guide-ledger-projection'
import {finiteMetadataFacts,bindFiniteMetadataFacts} from './guide-finite-metadata-facts'
import {guideUntilValidAuthority} from './guide-run-policy'
import {compileGuideTactics} from '../shared/guide-tactical-checks'
import {checkGuide,type GuideContent} from '../shared/matchup-guide'
import {assertConstructedScenarios} from '../shared/guide-scenario-output'
import {isGuideDelivery,assertGuideDeliveryNative} from '../shared/guide-delivery'
import {AiFailure} from './ai-failure'

export interface GuideFiniteConstruction {mains:GuideSegmentJournal[];plans:GuideFinitePlan[];branches:GuideReplyConstruction[];built:ConstructedGuideScenario[]}
interface Metadata {caseId:string;constructionHash:string;metadata:Record<string,any>;claims:GuideContent['claims'];limitations:string[];changeSummary:string}
const object=(properties:Record<string,any>)=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false})
const omit=(schema:any,keys:string[])=>{const out=structuredClone(schema);for(const key of keys){delete out.properties[key];out.required=out.required.filter((k:string)=>k!==key)}return out}
export function finiteCaseMetadataRequest(main:GuideSegmentJournal,plan:GuideFinitePlan,branches:GuideReplyConstruction[],options:GuideConstructionRuntime){
  const {scope,packet,archive}=options
  verifyGuideSegments(main,scope,packet);readGuideFinitePlan(plan,main,options)
  const selected=loadGuideSegmentCheckpoint(archive,scope,packet,main.setup.id,main.rootHash)
  if(!selected||guideHash(selected)!==guideHash(main))throw Error('Metadata finiti: main superata.')
  if(branches.length!==plan.replies.length||new Set(branches.map(b=>b.seed.id)).size!==branches.length)throw Error('Metadata finiti: risposte mancanti o duplicate.')
  for(const branch of branches){
    const current=loadGuideSegmentCheckpoint(archive,scope,packet,main.setup.id,main.rootHash,branch.line)
    if(branch.caseId!==main.setup.id||!current||guideHash(current)!==guideHash(branch.journal)||branch.journal.segments[0].hash!==main.segments[0].hash||!plan.replies.some(seed=>guideHash(seed)===guideHash(branch.seed)))throw Error('Metadata finiti: ramo estraneo o nostra prima mossa diversa.')
    verifyGuideSegments(branch.journal,scope,packet)
    const tail=branch.journal.segments.at(-1)!
    if(tail.receipt.terminal!==branch.terminal||!branch.terminal&&branch.journal.segments.length!==3)throw Error('Metadata finiti: seguito incompleto o terminalità non dimostrata.')
  }
  const completed=isGuideDelivery(packet.basis)?branches.find(b=>b.seed.role==='direct'&&b.journal.segments.length===3)?.journal??branches.find(b=>b.journal.segments.length===3)?.journal:main
  if(!completed)throw new AiFailure('draft-limit','Il profilo non può rappresentare un caso con tutte le repliche già terminali: nessun seguito viene inventato.')
  const frozen=guideSegmentDeclarations(completed,scope,packet),fullSchema=boundGuideSchema(singleFiniteScenarioSchema(main.setup.id),packet,main.setup.opponentListId) as any
  const metadataSchema=omit(fullSchema.properties.scenarios.items,[...Object.keys(frozen).filter(k=>!['assumptions','sourceIds'].includes(k)),'analysisScope'])
  const comparison=metadataSchema.properties.replyComparison,option=omit(comparison.properties.options.items,['turns','forkAtEvent','continuation','developmentPlan'])
  comparison.properties.options={type:'array',minItems:plan.replies.length,maxItems:plan.replies.length,items:{anyOf:plan.replies.map(seed=>{const item=structuredClone(option);item.properties.id={type:'string',const:seed.id};item.properties.intent={type:'string',const:seed.intent};return item})}}
  const constructionHash=guideHash({main:completed.segments[2].hash,plan,branches:branches.map(b=>({seed:b.seed,line:b.line,head:b.journal.segments.at(-1)!.hash}))})
  const claims=structuredClone(fullSchema.properties.claims);claims.items.properties.id={type:'string',enum:Array.from({length:24},(_,i)=>`${main.setup.id}-claim-${i+1}`)};claims.maxItems=24
  let schema=object({caseId:{type:'string',const:main.setup.id},constructionHash:{type:'string',const:constructionHash},metadata:metadataSchema,claims,limitations:{type:'array',maxItems:8,items:{type:'string',minLength:1,maxLength:4000}},changeSummary:{type:'string',minLength:1,maxLength:2000}})
  const accepted=new Set([...archive.values<any>('guide-segment-unit-result-v1')].filter(r=>r.value.accepted).map(r=>r.value.unitId))
  const historic=[...archive.values<any>('guide-finite-request-v1')].some(r=>accepted.has(r.value.unitId)&&r.value.scopeHash===guideHash(scope)&&r.value.request.validationId==='guide-finite-metadata-1'&&r.value.request.data.constructionHash===constructionHash&&guideHash(r.value.request.data.packet)===guideHash(packet))
  const modern=!!guideUntilValidAuthority(archive)&&!historic
  const setup=modern?projectGuideSetup({scenarios:[completed.setup]},packet)[0]:undefined
  const ledgerFacts=modern?finiteMetadataFacts({caseId:main.setup.id,inventory:setup.inventory,setupEvents:setup.events,mainEvents:completed.segments.at(-1)!.receipt.events,
    lines:branches.map(b=>({id:b.seed.id,replyTurn:b.journal.segments[0].receipt.lastTurn+1,events:b.journal.segments.at(-1)!.receipt.events})),sources:packet.sources}):undefined
  if(ledgerFacts)schema=bindFiniteMetadataFacts(schema,ledgerFacts) as typeof schema
  const build=(value:Metadata):ConstructedGuideScenario=>{
    assertNativeScenarioSchema(value,schema)
    const metadata=structuredClone(value.metadata),ids=metadata.replyComparison.options.map((o:any)=>o.id)
    if(new Set(ids).size!==plan.replies.length||plan.replies.some(seed=>!ids.includes(seed.id)))throw Error('Metadata finiti: confronto senza tutte le risposte del piano.')
    metadata.replyComparison.options=metadata.replyComparison.options.map((option:any)=>{
      const branch=branches.find(b=>b.seed.id===option.id)!,journal=branch.journal
      return {...option,forkAtEvent:1+main.segments[0].body.events.length,continuation:'if-game-continues',turns:{ours:{draw:null,events:[],tactical:null},opponent:structuredClone(journal.segments[1].body),next:journal.segments.length===3?structuredClone(journal.segments[2].body):{terminal:true}},developmentPlan:{opponent:structuredClone(journal.segments[1].development),next:journal.segments.length===3?structuredClone(journal.segments[2].development):null}}
    })
    // These are the exact AI-authored frozen plan scope and native turns;
    // host assembly supplies no new move, minimum or exclusion claim.
    const native={...structuredClone(frozen),...metadata,analysisScope:structuredClone(plan.analysisScope),assumptions:[...new Set([...frozen.assumptions,...metadata.assumptions])],sourceIds:[...new Set([...frozen.sourceIds,...metadata.sourceIds])]}
    const raw:GuideContent={chapters:[],claims:structuredClone(value.claims),scenarios:[native as any],exercises:[],limitations:[...new Set([...value.limitations,...plan.analysisScope.limits])],changeSummary:value.changeSummary}
    assertNativeScenarioSchema(raw,fullSchema);assertConstructedScenarios(raw,true)
    const content=compileGuideTactics(projectGuideLedger(raw,packet)),checked=checkGuide(content,packet,false)
    if(checked.errors.length)throw Error(checked.errors.join('\n'))
    return {raw,content,native,constructionHash}
  }
  const read=(raw:unknown):Metadata=>{build(raw as Metadata);return structuredClone(raw) as Metadata}
  const task='Completa conti e confronto dei soli rami congelati. Lo scopo originale del piano è assemblato dall’host, non riscriverlo. Non restituire needs-branches né prove di rimozione.'+(modern?' ledgerFacts contiene soltanto contabilità e riferimenti meccanici, non giudizi. attackReview confronta ESCLUSIVAMENTE attackCandidates avversari, una volta ciascuno. replyId indica un ramo che esegue proprio quella coppia attaccante/attacco nel turno avversario; altrimenti è null con motivo e condizioni, senza inventare un’impossibilità. Un attacco copiato mantiene l’attaccante e il nome eseguiti nel registro, non la stampa da cui è copiato. Per i calcoli di danno usa calculationAttacks. Le cost.requiredCards sono ricalcolate dal codice e contano le copie effettivamente impiegate, non tutta la mano pescata: specificDraws indica soltanto le pescate richieste per quelle copie. Le altre pescate restano integralmente nei turni congelati e nelle loro condizioni; non gonfiare i consumi e non cambiare il registro. Ogni motivo tattico resta da valutare e riesaminare.':'')
  const request=withGuideSegmentRetry({stage:'metadata-finite-'+main.setup.id,role:'constructor',instructions:guideFiniteInstructions('evaluation'),task,data:{packet,main:frozen,plan,branches:branches.map(b=>({seed:b.seed,line:b.line,native:guideSegmentDeclarations(b.journal,scope,packet),receipt:b.journal.segments.at(-1)!.receipt})),constructionHash,...ledgerFacts?{ledgerFacts}:{}},schema,reserveCalls:options.reserveOutside,read,cacheValidation:{id:modern?'guide-finite-metadata-2':'guide-finite-metadata-1',validate:value=>{read(value)}}},scope,archive)
  return {request,build}
}
export async function constructGuideFiniteCases(mains:GuideSegmentJournal[],options:GuideConstructionRuntime):Promise<GuideFiniteConstruction>{
  if(mains.length!==2||new Set(mains.map(m=>m.setup.id)).size!==2)throw Error('Costruzione finita: servono due casi distinti.')
  const plans=await constructGuideFinitePlans(mains,{...options,reserveOutside:options.reserveOutside+4})
  const branches=await constructGuideSelectedReplyBranches(mains,plans.map(plan=>({caseId:plan.caseId,seeds:plan.replies})),{...options,reserveOutside:options.reserveOutside+2})
  const built=new Map<string,ConstructedGuideScenario>()
  await runGuideSegmentPhase(mains.map(main=>({id:main.setup.id,request:()=>finiteCaseMetadataRequest(main,plans.find(p=>p.caseId===main.setup.id)!,branches.filter(b=>b.caseId===main.setup.id),options).request,
    accept:(value:Metadata)=>{built.set(main.setup.id,finiteCaseMetadataRequest(main,plans.find(p=>p.caseId===main.setup.id)!,branches.filter(b=>b.caseId===main.setup.id),options).build(value))}})),{...options,stage:'metadata-finite-cases'})
  return {mains,plans,branches,built:mains.map(main=>built.get(main.setup.id)!)}
}

/** Rebuild receipts from the exact AI native case after a delta. No accepted
 * checkpoint is overwritten and no missing development note is inferred. */
export function finiteNativeWitnesses(native:Record<string,any>,plan:GuideFinitePlan,options:Pick<GuideConstructionRuntime,'packet'|'scope'>){
  if(isGuideDelivery(options.packet.basis))assertGuideDeliveryNative(native)
  const {packet,scope}=options,raw:GuideContent={chapters:[],claims:[],scenarios:[native as any],exercises:[],limitations:[],changeSummary:'Finite native replay.'}
  if(native.id!==plan.caseId||plan.packetHash!==guideHash(packet)||guideHash(native.analysisScope?.comparedReplyIds)!==guideHash(plan.analysisScope.comparedReplyIds)||['access','defend'].some(kind=>native.analysisScope?.[kind]?.replyId!==(plan.analysisScope as any)[kind].replyId))throw Error('Riparazione finita: selezione o contratto cambiati; nessuna espansione implicita.')
  assertNativeScenarioSchema(raw,boundGuideSchema(singleFiniteScenarioSchema(native.id),packet,native.opponentListId));assertConstructedScenarios(raw,true)
  const schema=guideSegmentNativeSchema(native.id,packet,native.opponentListId),setup=Object.fromEntries(Object.keys(schema.properties).filter(k=>!['turns','developmentPlan'].includes(k)).map(k=>[k,native[k]]))
  let main=createGuideSegments(setup,scope,packet)
  for(const phase of ['ours','opponent','next'])main=appendGuideSegment(main,scope,packet,native.turns[phase],native.developmentPlan[phase])
  const lines=[{lineId:'main',journal:main}]
  for(const seed of plan.replies){
    const option=native.replyComparison.options.find((o:any)=>o.id===seed.id)
    if(!option||option.intent!==seed.intent)throw Error('Riparazione finita: ramo originale mancante o intento diverso.')
    let journal=forkGuideSegments(main,scope,packet,1)
    journal=appendGuideSegment(journal,scope,packet,option.turns.opponent,option.developmentPlan.opponent)
    if(option.turns.next.terminal===true){if(!journal.segments.at(-1)!.receipt.terminal||option.developmentPlan.next!==null)throw Error('Riparazione finita: terminalità non dimostrata.')}
    else{if(!option.developmentPlan.next)throw Error('Riparazione finita: sviluppo del seguito assente.');journal=appendGuideSegment(journal,scope,packet,option.turns.next,option.developmentPlan.next)}
    lines.push({lineId:seed.id,journal})
  }
  const content=compileGuideTactics(projectGuideLedger(raw,packet)),checked=checkGuide(content,packet,false)
  if(checked.errors.length)throw Error(checked.errors.join('\n'))
  return {lines,content}
}
