import {segmentFixture} from './guide-segment'
import {guideSource,packetHash,type GuidePacket} from '../../src/main/matchup-guide-packet'
import {guideChapterKinds} from '../../src/shared/matchup-guide'
import {auditTextFor,auditLanguagePass} from './guide-audit'

/** Independent synthetic game with zero-damage free attacks. It exercises the
 * complete protocol, not competitive quality or real provider convergence. */
export function syntheticSegmentProtocol(projectId:string,distinctSides=false,pendingSetupAudits=false){
  const {packet:base,scenario,opponent}=segmentFixture(),card=JSON.parse(base.sources[0].content)
  card.gameplay.abilities=[{name:'Synthetic Insight',effect:'Once during your turn, draw one card.'}];card.gameplay.attacks[0].damage='0'
  base.sources[0]=guideSource('card:p','card','Synthetic Basic',null,JSON.stringify(card))
  const oursId=distinctSides?'our-basic':'p'
  if(distinctSides){
    base.opponentLists=structuredClone(base.opponentLists)
    base.ourList.cards[0].printId=oursId
    base.sources.push(guideSource('card:'+oursId,'card','Synthetic own Basic',null,JSON.stringify({...card,printId:oursId})))
    scenario.opening.ours.active=oursId;scenario.positionAnnotations[0].printId=oursId
    scenario.sourceIds.push('card:'+oursId)
    scenario.turns.ours.tactical.attacks[0].printId=oursId
    scenario.turns.ours.tactical.cards[0]=oursId
  }
  const packet:GuidePacket={...base,ourList:{...base.ourList,label:'Synthetic ours',url:null},opponentLists:base.opponentLists.map(l=>({...l,label:'Synthetic opponent',url:null})),basis:{projectId,deckHash:'synthetic-deck',deckVersionId:null,deckResolutionId:null,metaId:'synthetic-meta',opponentId:'synthetic-opponent',asOf:'2026-11-02',ruleVersion:null,promptVersion:'matchup-guide-28',dependencyHash:''},matchup:'Synthetic Basic vs Synthetic Basic',deckContext:'Independent 60-card synthetic lists',gaps:[]}
  packet.basis.dependencyHash=packetHash(packet)
  const {turns,developmentPlan,...setup}=scenario
  if(pendingSetupAudits)(setup as any).firstOpponentTurn={draw:'e',events:[{kind:'effect',description:'Synthetic manual attachment before the audit constructor.',moves:[],energyRoutes:[{side:'opponent',printId:'e',count:1,path:['hand','attached'],hostPrintId:'p',sourceIds:['card:e'],attachment:'manual'}],attack:null,trainer:null,retreat:null,deckObservations:[],boardExitProofs:[],attachmentTargets:[],attackPayment:null,decisionProof:{cards:[],reason:'Pending independent audit construction.'}}],decision:{availableAttack:'Synthetic attack',choice:'Do not attack on the first turn.',reason:'The first player cannot attack on its first turn.'},tactical:null}
  const attack={kind:'effect',description:'Printed synthetic free attack',moves:[],energyRoutes:[],attack:{printId:'p',attackName:'Synthetic attack'},trainer:null,retreat:null,deckObservations:[],boardExitProofs:[],attachmentTargets:[],attackPayment:{energy:[],costAdjustments:[]},decisionProof:{cards:['p','e'],reason:'Compare all synthetic candidates'},action:'other',affectedSide:'ours'}
  const bodies:any={ours:turns.ours,opponent:{...opponent,events:[{...attack,accessReceipt:null}]},next:{draw:'e',beforeAttack:[],attack:{...attack,attack:{...attack.attack,printId:oursId},decisionProof:{...attack.decisionProof,cards:[oursId,'e']}},afterAttack:[],tactical:turns.ours.tactical}}
  const access={kind:'effect',description:'Synthetic Insight additional draw',moves:[],energyRoutes:[{side:'opponent',printId:'e',count:1,path:['deck','hand'],hostPrintId:null,sourceIds:['card:p'],attachment:null}],attack:null,trainer:null,retreat:null,deckObservations:[],boardExitProofs:[],attachmentTargets:[],attackPayment:null,decisionProof:null,action:'other',affectedSide:'opponent',accessReceipt:{sourceIds:['card:p'],reason:'Insight draws in addition to the ordinary draw.'}}
  const pass={verdict:'pass',findings:[],checks:['Synthetic mechanical fixture reviewed separately'],revalidatedIds:[],textCorrections:[]}
  const turnBody=(phase:string,d:any)=>{
    const body=structuredClone(bodies[phase])
    if(phase==='ours'&&d.reply?.forkAtTurn===0){const insight:any=structuredClone(access);delete insight.accessReceipt;insight.affectedSide='ours';insight.energyRoutes[0].side='ours';insight.energyRoutes[0].sourceIds=['card:'+oursId];body.events.push(insight)}
    if(phase==='opponent'&&d.reply?.role==='access')body.events=[access,...body.events]
    if(d.repairFeedback){const extra:any=structuredClone(access);if(phase!=='opponent'){delete extra.accessReceipt;extra.energyRoutes[0].side='ours';extra.affectedSide='ours';if(distinctSides)extra.energyRoutes[0].sourceIds=['card:'+oursId]}if(phase==='next')body.beforeAttack.unshift(extra);else body.events.unshift(extra)}
    return body
  }
  const response=(stage:string,data:any,schema:any):unknown=>{
    const resolve=(node:any):any=>node?.$ref?resolve(schema.$defs[node.$ref.slice('#/$defs/'.length)]):node
    const prop=(node:any,key:string)=>resolve(resolve(node).properties[key])
    if(stage==='plan')return {thesis:'Independent synthetic protocol',sections:guideChapterKinds.map(kind=>({kind,objective:'Synthetic '+kind,sourceIds:['card:p']})),additionalPrintIds:[],additionalLists:[],gaps:[],opponentListId:'their-list',initialOpenings:['scenario-1','scenario-2'].map(id=>({id,opening:setup.opening}))}
    if(stage.startsWith('setup-'))return {caseSetup:Object.fromEntries(Object.entries({...setup,id:data.caseId,decision:'Synthetic decision '+data.caseId}).filter(([k])=>k!=='opening')),changeSummary:'Explicit synthetic setup.'}
    if(data.units){
      const choices=resolve(prop(schema,'units').items).anyOf.map(resolve)
      return {units:data.units.map((u:any)=>{
        const chosen=choices.find((c:any)=>prop(c,'unitId').const===u.unitId),responseSchema=prop(chosen,'response'),s=(stage.startsWith('metadata-')||stage==='segments-finite-setup-turns')&&responseSchema.anyOf?resolve(responseSchema.anyOf[0]):responseSchema
        if(stage==='segments-finite-turn-frames'){
          const phase=prop(s,'phase').const,body=turnBody(phase,u.data.parentContext.data),frame=Object.fromEntries(Object.keys(prop(s,'body').properties).map(k=>[k,k==='tactical'?null:body[k]])),plan=Object.fromEntries(Object.keys(prop(s,'eventPlan').properties).map(k=>[k,k==='attack'?'Execute synthetic attack.':body[k].map((_:any,i:number)=>'Synthetic event '+i)]))
          return {unitId:u.unitId,response:{caseId:prop(s,'caseId').const,parentHash:prop(s,'parentHash').const,phase,contextHash:u.data.contextHash,body:frame,development:developmentPlan.ours,eventPlan:plan}}
        }
        if(stage==='segments-finite-turn-events'){
          const body=turnBody(u.data.frame.phase,u.data.parentContext.data),match=/^(.*)-(\d+)$/.exec(u.data.slotId),event=structuredClone(match?body[match[1]][Number(match[2])]:body[u.data.slotId]);event.decisionProof=null
          return {unitId:u.unitId,response:{contextHash:u.data.contextHash,frameHash:u.data.frameHash,slotId:u.data.slotId,previousHash:u.data.previousHash,body:event}}
        }
        if(stage==='review-premise-audit-language')return {unitId:u.unitId,response:auditLanguagePass(u.data)}
        if(stage==='review-premise-audit-routing')return {unitId:u.unitId,response:{reviewHash:u.data.reviewHash,prefixHash:u.data.prefixHash,mode:'original',mapping:[],reason:'Synthetic original repair classification.'}}
        if(stage==='segments-finite-audits')return {unitId:u.unitId,response:{caseId:u.data.native.id,sourceHash:u.data.sourceHash,candidatesHash:u.data.candidatesHash,turnKey:u.data.turnKey,quantityContextHash:u.data.quantityContextHash,decisions:Object.fromEntries(u.data.decisions.map((d:any)=>[d.key,auditTextFor(u.data,'Synthetic judgment of every supplied pre-action candidate; no real strategic-quality claim.')])),tactical:prop(s,'tactical').type==='null'?null:{comparison:auditTextFor(u.data,u.data.feedback?'Corrected synthetic audit after the independent finding; physical actions are unchanged.':'Synthetic comparison of every supplied card and attack, conditional on the unchanged ledger.'),promotions:Object.fromEntries(u.data.promotions.map((p:any)=>[p.key,auditTextFor(u.data,'Synthetic conditional promotion judgment.')]))}}}
        if(stage==='segments-finite-setup-frames')return {unitId:u.unitId,response:{caseId:u.data.caseId,contextHash:u.data.contextHash,frame:Object.fromEntries(Object.keys(prop(s,'frame').properties).map(key=>[key,key==='id'?u.data.caseId:key==='decision'?'Synthetic decision '+u.data.caseId:(setup as any)[key]])),leadOpponent:setup.firstOpponentTurn!==null,rounds:setup.setupRounds.length,...u.data.turnCapacity?{plannedTurns:[...setup.firstOpponentTurn?[{slotId:'first-opponent',events:(setup as any).firstOpponentTurn.events.map((e:any)=>e.description)}]:[],...setup.setupRounds.flatMap((r:any,i:number)=>['ours','opponent'].map(side=>({slotId:'round-'+(i+1)+'-'+side,events:r[side].events.map((e:any)=>e.description)})))]}:{},changeSummary:'Explicit synthetic setup frame.'}}
        if(stage==='segments-finite-setup-turns'){
          const slot=u.data.slotId,match=/round-(\d+)-(ours|opponent)/.exec(slot)
          const body=slot==='first-opponent'?setup.firstOpponentTurn:(setup.setupRounds[Number(match![1])-1] as any)[match![2]]
          return {unitId:u.unitId,response:{caseId:u.data.caseId,headerHash:u.data.headerHash,slotId:slot,previousHash:u.data.previousHash,body,...s.properties?.outcome?{outcome:'complete',reason:'Synthetic complete historical declaration; full setup and independent review remain mandatory.'}:{}}}
        }
        if(stage.startsWith('review-premise-'))return {unitId:u.unitId,response:{...pass,reviewedHash:u.data.witnessContext.reviewedHash,repairScope:'none',...u.data.branchObjective?{goalEvaluation:{goalHash:u.data.branchObjective.goalHash,firstTurnSatisfied:true,eventIndexes:[],reason:'The synthetic first turn executes the explicit objective; future turns remain unreviewed.'}}:{}}}
        if(stage.startsWith('review'))return {unitId:u.unitId,response:{...pass,draftHash:u.data.draftHash,constructionHash:u.data.constructionHash,reviewContextHash:u.data.reviewContextHash,...s.properties.revisionResponse?{revisionResponse:'The requested synthetic point already follows from the printed sources; no changes are justified.'}:{},...u.data.constructionRequirements?{requirementAudit:u.data.constructionRequirements.flatMap((c:any)=>c.ledger.requirements.map((r:any)=>({caseId:c.ledger.caseId,requirementId:r.id,disposition:'resolved',reason:'The synthetic critic independently compared this original requirement with the current printed fixture and complete witness.',sourceIds:['card:p'],witnesses:[c.witnesses[0]],currentFindingIndex:null})))}:{},resolutionAudit:(u.data.reviewHistory?.findings??[]).map((f:any)=>({findingHash:f.hash,disposition:'resolved',reason:'Rechecked the corrected synthetic facts against the original finding.',sourceIds:['card:p'],currentFindingIndex:null}))}}
        if(stage.startsWith('prose-repair')){
          if(u.data.property==='limitations')return {unitId:u.unitId,response:{targetId:u.data.targetId,draftHash:u.data.draftHash,content:{limitations:u.data.draft.limitations},changeSummary:'Review all declared synthetic limitations against the corrected cases.'}}
          const content=structuredClone(u.data.draft[u.data.property].find((c:any)=>c.id===u.data.targetId))
          const field=u.data.property==='chapters'?'body':u.data.property==='claims'?'text':'solution'
          content[field]+=' Updated synthetic explanation after the independently reviewed construction.'
          return {unitId:u.unitId,response:{targetId:u.data.targetId,draftHash:u.data.draftHash,content,changeSummary:'Update the dependent synthetic text.'}}
        }
        if(stage.startsWith('segment-setup-repair')){
          const native=structuredClone(u.data.rejectedPrefix.setup)
          native.opening.ours.hand[0]=u.data.packet.ourList.cards[0].printId
          native.assumptions.push('A different synthetic seven-card opening is declared explicitly.')
          return {unitId:u.unitId,response:{caseId:native.id,rejectedRootHash:u.data.rejectedPrefix.rootHash,native,changeSummary:'Rebuild the rejected synthetic opening before future turns.'}}
        }
        if(stage.startsWith('branch-plan-choice')){
          const before=[u.data.before.direct,u.data.before.access,u.data.before.defend,...u.data.before.others],proposed=[u.data.proposal.direct,u.data.proposal.access,u.data.proposal.defend,...u.data.proposal.others]
          const ids=[...new Set([...before,...proposed].map((seed:any)=>seed.id))]
          const variants=prop(s,'choices').items.anyOf.map(resolve)
          const selected=ids.map(id=>{const permitted=variants.filter((v:any)=>prop(v,'id').const===id),variant=permitted.find((v:any)=>prop(v,'source').const==='proposal')??permitted.find((v:any)=>prop(v,'source').const==='previous');return {id,source:prop(variant,'source').const,requirementIds:prop(variant,'source').const==='proposal'?[...new Set([...u.data.requirements.map((r:any)=>r.id),...(u.data.retainedRequirements?.requirements??[]).map((r:any)=>r.id)])]:[],reason:'Synthetic explicit selection of the requested comparison witness.'}})
          return {unitId:u.unitId,response:{caseId:prop(s,'caseId').const,contextHash:u.data.contextHash,choices:selected}}
        }
        if(stage.startsWith('branch-plan-')){
          const seed=(role:string)=>({id:prop(prop(s,role),'id').const,role,intent:role==='defend'?'defend':'attack',goal:'Compare synthetic '+role,sourceIds:['card:p']})
          const other=prop(s,'others').items,otherSchema=resolve(other.anyOf?.[0]??other)
          const extra=u.data.repair?.requireChange?[{id:prop(otherSchema,'id').enum[0],role:'other',intent:'attack',goal:'An additional synthetic comparison witness.',sourceIds:['card:p'],...u.data.repair.unadoptedProposal?{forkAtTurn:0}:{}}]:[]
          return {unitId:u.unitId,response:{caseId:prop(s,'caseId').const,mainHash:prop(s,'mainHash').const,direct:seed('direct'),access:seed('access'),defend:seed('defend'),others:extra}}
        }
        if(stage.startsWith('metadata-')){
          const comparison=prop(prop(s,'metadata'),'replyComparison'),coverage=Object.fromEntries(['direct','access','defend'].map(role=>[role,prop(prop(comparison,'coverage'),role).const]))
          return {unitId:u.unitId,response:{caseId:u.data.main.id,constructionHash:u.data.constructionHash,metadata:{assumptions:[],sourceIds:['card:p','card:e','rules'],calculations:[{label:'Printed synthetic zero damage',terms:[0],multiplier:1,minimum:0,expected:0,purpose:'damage',attack:{printId:'p',attackName:'Synthetic attack'}}],replyComparison:{objective:'Compare printed zero-damage synthetic replies',threshold:120,minimumReplyId:null,preferredReplyId:coverage.direct,options:u.data.branches.map((b:any)=>({id:b.seed.id,intent:b.seed.intent,specificDraws:[],terms:[0],multiplier:1,damage:0,reachesThreshold:false,remainingHp:120,outcome:'Synthetic zero damage; no KO.',sourceIds:['card:p'],promotionRationale:'No compulsory promotion in this branch.'})),omissionTests:[],conclusion:u.data.repair?'Direct conserves access resources while keeping the same printed zero-damage attack.':'Direct uses no additional access.',coverage,attackReview:[{printId:'p',attackName:'Synthetic attack',replyId:coverage.direct,reason:'Direct executes the printed attack.'}]}},claims:[],limitations:['Synthetic fixture; no competitive quality claimed.'],changeSummary:'Derive evaluations from frozen turns.'}}
        }
        const phase=prop(s,'phase').const,body=structuredClone(bodies[phase])
        if(phase==='ours'&&u.data.reply?.forkAtTurn===0){const insight:any=structuredClone(access);delete insight.accessReceipt;insight.affectedSide='ours';insight.energyRoutes[0].side='ours';insight.energyRoutes[0].sourceIds=['card:'+oursId];body.events.push(insight)}
        if(phase==='opponent'&&u.data.reply?.role==='access')body.events=[access,...body.events]
        if(u.data.repairFeedback){
          const extra:any=structuredClone(access)
          if(phase!=='opponent'){
            delete extra.accessReceipt;extra.energyRoutes[0].side='ours';extra.affectedSide='ours'
            if(distinctSides)extra.energyRoutes[0].sourceIds=['card:'+oursId]
          }
          if(phase==='next')body.beforeAttack.unshift(extra);else body.events.unshift(extra)
        }
        return {unitId:u.unitId,response:{caseId:u.data.prefix.id,parentHash:prop(s,'parentHash').const,phase,body,development:developmentPlan.ours}}
      })}
    }
    if(stage.startsWith('review'))return pass
    if(stage.startsWith('prose'))return {chapters:data.requestedChapterKinds.map((kind:string)=>({id:'chapter-'+kind,kind,title:'Synthetic '+kind,body:kind+': '+('Independent synthetic protocol fixture; printed attacks, costs and sources are compared. ').repeat(35),sourceIds:['card:p'],dependsOn:['scenario-1']})),claims:[],scenarios:[],exercises:data.includeExercises?[1,2].map(i=>({id:'exercise-'+i,question:'Which printed cost applies?',solution:'The synthetic printed free cost.',sourceIds:['card:p'],scenarioIds:['scenario-1']})):[],limitations:['No competitive quality or provider convergence claimed.'],changeSummary:'Synthetic prose from verified scenarios.'}
    throw new Error('Unexpected synthetic protocol stage '+stage)
  }
  return {packet,response}
}

