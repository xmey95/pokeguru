import {it,expect} from 'vitest'
import {mkdtempSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join,resolve,sep} from 'node:path'
import {DatabaseSync} from 'node:sqlite'
import {ProjectStore} from '../../src/main/project-store'
import {AiJobStore} from '../../src/main/ai-job-store'
import {AiEvidenceArchive} from '../../src/main/ai-evidence-archive'
import {syntheticSegmentProtocol} from './guide-segment-protocol'
import {guideHash,packetHash} from '../../src/main/matchup-guide-packet'
import {constructFiniteGuideContent} from '../../src/main/guide-finite-generation'
import {assertFiniteTransportHistory} from '../../src/main/guide-finite-runtime'
import type {GuideConstructionRuntime} from '../../src/main/guide-reply-phase'
import {checkGuide} from '../../src/shared/matchup-guide'
import {GUIDE_FINITE_ANALYSIS_CONTRACT} from '../../src/shared/guide-analysis-scope'
import {AiAnalysisWork} from '../../src/main/ai-analysis-work'
import {generateDeepGuide,assertGuideIntegrity} from '../../src/main/matchup-guide-generation'
import {assertGuideReport} from '../../src/shared/matchup-guide'
import {assertGuideSegmentApproval} from '../../src/main/guide-segment-approval'
import {unpackGuideData} from '../../src/main/guide-request-budget'

export function deliveryApplicationFixture(distinctSides=false,pendingSetupAudits=false){
  const temporaryRoot=resolve(tmpdir()),folder=mkdtempSync(join(temporaryRoot,'app234-cycle-')),file=join(folder,'data.sqlite'),projects=new ProjectStore(file),jobs=new AiJobStore(file)
  const project=projects.create({name:'Synthetic finite cycle',format:'STANDARD'}),job=jobs.start('matchup-generate',project.id,'finite-synthetic'),archive=new AiEvidenceArchive(file,job),protocol=syntheticSegmentProtocol(project.id,distinctSides,pendingSetupAudits)
  const packet=structuredClone(protocol.packet);packet.basis.analysisContract=GUIDE_FINITE_ANALYSIS_CONTRACT;packet.basis.deliveryContract='bounded-delivery-1';
  projects.importDeck({projectId:project.id,rawText:packet.ourList.cards.map(c=>c.count+' '+c.name).join('\n'),source:'paste'})
  const version=projects.getCurrentDeckContext(project.id)!,meta={id:guideHash({fixture:'bounded-synthetic',projectId:project.id}),fetchedAt:'2026-11-06T09:00:00.000Z',sourceUrl:'https://limitlesstcg.com/decks',period:'Synthetic offline fixture',circuit:'WESTERN' as const,format:'STANDARD' as const,cached:true,decks:[{id:'999',name:'Synthetic opponent',points:1,share:0.1,url:'https://limitlesstcg.com/decks/999'}]}
  projects.saveMetaSnapshot(meta);Object.assign(packet.basis,{deckHash:projects.getCurrentDeckHash(project.id)!,deckVersionId:version.versionId,deckResolutionId:version.resolutionId,metaId:meta.id,opponentId:'999'});packet.basis.dependencyHash=packetHash(packet)
  const initial=protocol.response('plan',{}, {}) as any,setups=initial.initialOpenings.map((o:any)=>({...((protocol.response('setup-1',{caseId:o.id},{}) as any).caseSetup),opening:o.opening}))
  let calls=0,negative:'none'|'text'|'case'|'forever'='none',interrupted=false,interruptPatch=false,invalidPatch=false,invalidAuditPatch=false,lateAuditText='Restano due copie nel mazzo.',invalidPlan=false,invalidCritic=false,invalidInitialPlans=0
  let caseFailureRounds=0,outlineFailure=false,replacementLimitations:string[]|undefined,lateNegativeText:string|undefined,invalidAuditReviews=0
  const stages:string[]=[],schemas:any[]=[]
  const options:GuideConstructionRuntime={scope:{projectId:project.id,jobId:job.id,dependencyHash:packet.basis.dependencyHash,configHash:guideHash({fixture:'finite-cycle'})},packet,evidencePacket:packet,evidenceAnchor:packet,archive,reserveOutside:0,remainingCalls:()=>200-calls,isCached:()=>false,check:()=>{},
    // A deliberately cheap synthetic estimate tests routing/reserves. Real
    // token sizing is a separate required preflight, not claimed by this test.
    estimate:r=>({stage:r.stage,units:r.units??1,encoding:'plain',visibleTokens:100,estimatedInput:1000,reservedOutput:10000,estimatedResponseCharacters:18000,margin:8192,bytes:10000,fits:true,fitsTarget:true,remainingCalls:200-calls,reservedCalls:r.reserveCalls,calibrationFactor:1.12,family:'synthetic',estimateOnly:true}),
    call:async request=>{
      calls++;stages.push(request.stage);schemas.push(request.schema)
      if(interruptPatch&&request.stage==='repair-finite-cases'&&!interrupted){interrupted=true;throw Error('Synthetic stop before the pending patch')}
      const data=request.data as any,schema=request.schema as any
      const resolve=(node:any):any=>node?.$ref?resolve(schema.$defs[node.$ref.slice('#/$defs/'.length)]):node
      const prop=(node:any,key:string)=>resolve(resolve(node).properties[key])
      const choices=resolve(prop(schema,'units').items).anyOf.map(resolve)
      const units=data.units.map((unit:any)=>{
        const responseSchema=prop(choices.find((c:any)=>prop(c,'unitId').const===unit.unitId),'response'),p=responseSchema.properties,d=unit.data
        let response:any
        if(request.stage==='review-delivery-outline')response={planHash:prop(responseSchema,'planHash').const,verdict:outlineFailure?'revise':'pass',findings:outlineFailure?['Clarify the synthetic setup hypothesis.']:[]}
        else if(request.stage==='repair-delivery-outline'){const {allocations,...raw}=d.plan;response={...raw,thesis:raw.thesis+' Corrected synthetic hypothesis.'};outlineFailure=false}
        else if(request.stage==='finite-plans'){
          const direct=d.main.id+'-reply-1',defend=d.main.id+'-reply-2'
          response={caseId:p.caseId.const,rootHash:p.rootHash.const,mainHash:p.mainHash.const,packetHash:p.packetHash.const,
            replies:[{id:direct,role:'direct',intent:'attack',goal:'Synthetic immediate pressure',sourceIds:['card:p']},{id:defend,role:'defend',intent:'defend',goal:'Synthetic conservation response',sourceIds:['card:p']}],
            analysisScope:{contract:GUIDE_FINITE_ANALYSIS_CONTRACT,horizon:'ours-opponent-ours',comparedReplyIds:[direct,defend],access:{replyId:null,reason:'Not compared; no assertion of impossibility.',sourceIds:['card:p']},defend:{replyId:defend,reason:'Explicit synthetic second line.',sourceIds:['card:p']},limits:['Synthetic conditional fixture only.']},reason:'Two synthetic selected lines, no quality claim.',sourceIds:['card:p']}
          if(invalidPlan)response.rootHash='invalid-root'
        }else if(request.stage==='finite-plan-reviews')response={caseId:p.caseId.const,planHash:p.planHash.const,verdict:'pass',findings:[],checks:{relevance:true,conditions:true,competence:true,boundedClaims:true},reason:'Synthetic critic protocol only.',sourceIds:['card:p']}
        else if(request.stage==='metadata-finite-cases'){
          const direct=d.plan.replies[0].id
          response={caseId:p.caseId.const,constructionHash:p.constructionHash.const,metadata:{assumptions:[],sourceIds:['card:p','card:e','rules'],calculations:[{label:'Printed synthetic zero damage',terms:[0],multiplier:1,minimum:0,expected:0,purpose:'damage',attack:{printId:'p',attackName:'Synthetic attack'}}],replyComparison:{objective:'Compare two conditional synthetic lines',threshold:120,minimumReplyId:null,preferredReplyId:direct,options:d.branches.map((b:any)=>({id:b.seed.id,intent:b.seed.intent,specificDraws:[],terms:[0],multiplier:1,damage:0,reachesThreshold:false,remainingHp:120,outcome:'Synthetic zero damage.',sourceIds:['card:p'],promotionRationale:'No promotion in the synthetic fixture.'})),omissionTests:[],conclusion:'Conditional comparison only.',attackReview:[{printId:'p',attackName:'Synthetic attack',replyId:direct,reason:'Printed attack actually executed.'}]}},claims:[],limitations:['Synthetic fixture, not competitive evidence.'],changeSummary:'Synthetic native accounting.'}
        }else if(request.stage==='review-finite-cases'||request.stage==='review-finite-guide'){
          const final=request.stage==='review-finite-guide',wantsText=final&&negative==='text',wantsCase=!final&&['case','forever'].includes(negative)
          const findings=wantsText?[{severity:'minor',targetId:'chapter-decisions',message:'Clarify this synthetic recommendation.',correction:'State the conditional scope explicitly.',sourceIds:['card:p'],repair:{kind:'text',targetId:'chapter-decisions'},proposedActions:[],counterlines:[]}]:wantsCase?[{severity:'major',targetId:d.proofCaseIds?.[0]??d.draft.scenarios[0].id,message:'Clarify the synthetic case scope.',correction:'Qualify its explicit scope limitation.',sourceIds:['card:p'],repair:{kind:'case',caseId:d.proofCaseIds?.[0]??d.draft.scenarios[0].id},proposedActions:[],counterlines:[]}]:[]
          if(d.repairTargetContract)for(const f of findings)if(f.repair.kind==='text')(f.repair as any).quote=d.draft.chapters.find((c:any)=>c.id===f.targetId)?.body
          response={contextHash:d.contextHash,verdict:findings.length?'revise':'pass',findings,checks:['Synthetic full-role protocol, not a real AI judgment.'],resolutions:d.previousFindings.map((old:any)=>({findingHash:old.findingHash,disposition:findings.length?'still-open':'resolved',reason:'Synthetic original finding explicitly reassessed.',sourceIds:['card:p'],currentFindingIndex:findings.length?0:null}))}
          if(invalidCritic)response.checks=[]
          if(wantsText)negative='none'
          // Both scenario units may be negative in the same batch. The mode
          // is reset after that batch, not while iterating its children.
        }else if(request.stage==='prose-finite-units'){
          if(p.kind)response={id:p.id.const,kind:p.kind.const,title:'Synthetic '+p.kind.const,body:'A detailed synthetic conditional explanation of this matchup. '+(d.findings?'Corrected conditional advice.':''),sourceIds:['card:p'],dependsOn:[d.facts.scenarios[0].id]}
          else response={id:p.id.const,question:'Which printed cost applies in this synthetic case?',solution:'The printed free cost, under the declared conditions.',sourceIds:['card:p'],scenarioIds:[d.scenarioId]}
        }else if(request.stage==='repair-finite-cases'){
          response={candidateHash:d.candidateHash,...d.limitations?{limitations:replacementLimitations??d.limitations}:{},cases:d.nativeCases.map((c:any)=>({id:c.id,baseHash:c.baseHash,operations:[{op:'replace',path:invalidAuditPatch?'/turns/ours/tactical/comparison':invalidPatch?'/turns/next/attack/attack/printId':'/analysisScope/limits/0',valueJson:JSON.stringify(invalidAuditPatch?lateAuditText:invalidPatch?'absent':'Corrected conditional scope '+calls)}]})),claims:d.claims,changeSummary:'Repair the explicitly selected synthetic scope.'}
          invalidPatch=false
          invalidAuditPatch=false
        }else return null
        return {unitId:unit.unitId,response}
      })
      if(request.stage==='review-finite-cases'&&negative==='case'&&--caseFailureRounds<=0)negative='none'
      if(request.stage==='finite-plans')invalidPlan=false
      if(request.stage==='review-finite-cases')invalidCritic=false
      if(units.some((u:any)=>u===null)){
        const raw:any=protocol.response(request.stage,data,schema)
        if(request.stage==='review-premise-audit-language'&&invalidAuditReviews>0){invalidAuditReviews--;for(const u of raw.units)u.response.reviewedHash='synthetic-invalid-review-context'}
        if(request.stage==='review-premise-audit-language'&&lateNegativeText)for(const u of raw.units){const input=data.units.find((v:any)=>v.unitId===u.unitId)?.data;for(const target of input?.targets??[])if(target.text===lateNegativeText){u.response.verdict='revise';u.response.targets[target.key].findings=[{quote:target.text,reason:'Synthetic unsupported absence; correct the provisional audit and obtain a fresh review.'}]}}
        const mask=(value:any,node:any):any=>{node=resolve(node);const branch=typeof value?.outcome==='string'&&node?.anyOf?.find((v:any)=>resolve(v)?.properties?.outcome?.const===value.outcome);if(branch)node=resolve(branch);else if(node?.anyOf?.some((v:any)=>resolve(v)?.type==='null'))node=resolve(node.anyOf.find((v:any)=>value===null?resolve(v)?.type==='null':resolve(v)?.type!=='null'));if(node?.type==='null')return null;if(Array.isArray(value))return value.map(v=>mask(v,node?.items));if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,mask(v,node?.properties?.[k])]));return value}
        raw.units=raw.units.map((u:any)=>{const selected=choices.find((c:any)=>prop(c,'unitId').const===u.unitId);return {...u,response:mask(u.response,prop(selected,'response'))}})
        return request.read(raw)
      }
      return request.read({units})
    }}
  return {options,setups,archive,file,stages,jobs,job,folder,projects,project,meta,
    badAuditReviews(count:number){invalidAuditReviews=count},
    rejectAuditText(text:string){lateNegativeText=text},
    replaceRepairLimitations(text:string){replacementLimitations=[text]},
    repeatCaseFailures(rounds:number){caseFailureRounds=rounds;negative='case'},
    rejectFirstOutline(){outlineFailure=true},
    async rawResponse(stage:string,data:unknown,schema:object){
      if(!(data as any).units){calls++;stages.push(stage);const response=protocol.response(stage,data,schema);if(stage==='plan'&&invalidInitialPlans>0){invalidInitialPlans--;return {...response as object,thesis:null}}return response}
      return options.call({stage,data,schema,role:'constructor',instructions:'Synthetic external runner',task:'Synthetic raw response only',reserveCalls:0,read:raw=>raw,cacheValidation:{id:'synthetic-raw',validate:()=>{}}})
    },get calls(){return calls},textFailure(){negative='text'},caseFailure(){negative='case'},alwaysFail(){negative='forever'},interruptBeforePatch(){interruptPatch=true},badFirstPatch(){invalidPatch=true},badFirstAuditPatch(text='Restano due copie nel mazzo.'){invalidAuditPatch=true;lateAuditText=text},badFirstPlan(){invalidPlan=true},badFirstCritic(){invalidCritic=true},badInitialPlans(count:number){invalidInitialPlans=count},close(){archive.close();jobs.close();projects.close();if(!resolve(folder).startsWith(temporaryRoot+sep)||!resolve(folder).slice(temporaryRoot.length+1).startsWith('app234-cycle-'))throw Error('Temporary fixture outside the intended root');rmSync(folder,{recursive:true,force:true})}}
}
