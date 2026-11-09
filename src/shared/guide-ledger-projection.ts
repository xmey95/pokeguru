import {verifyAttackPayment} from './guide-attack-payment'
import {prepareNativeDecisions,deriveNativeAudit} from './guide-native-decisions'
import { prepareResponseConstruction, validateConstructedRetreats, deriveOmissionWitnesses } from './guide-response-construction'
import { readGuideContent,checkGuidePrefix, type GuideContent, type GuideScenario, type GuideStep, type GuidePosition, type GuideList, type GuideSource } from './matchup-guide'
import {compileGuideTactics} from './guide-tactical-checks'
import { guideZones, type GuideSetupLedger } from './guide-setup-ledger'
import { replyCost } from './guide-reply-costs'
import { expandTurnBlocks } from './guide-turn-blocks'
import { physicalResources } from './guide-physical-resources'
import { normalizeCombatEvents } from './guide-combat-normalization'
import { validateTurnLegality } from './guide-turn-legality'
import { deriveCausalDescriptions,guidePositionNotes } from './guide-causal-description'
import { validateDeckObservations } from './guide-deck-observations'
import {createBoardExitTracker} from './guide-board-exits'
import {GUIDE_FINITE_ANALYSIS_CONTRACT} from './guide-analysis-scope'
import type {GuideBasis} from './matchup-guide'
import {tacticalFrontier} from './guide-tactical-frontier'
import {guideAuditAt,guideAuditLocations,type GuideAuditCandidates,type GuideAuditMode} from './guide-audit-candidates'

type Side = 'ours' | 'opponent'
type Move = GuideSetupLedger['events'][number]['moves'][number]
type Event = Omit<GuideSetupLedger['events'][number], 'handAfter'>
type LineEvent = Event & { action: GuideStep['action']; affectedSide: Side }

/** The same movement stream produces every zone, hand count and board transition.
 * Card effects and tactical choices still require the independent source review. */
type LedgerPacket = { ourList: GuideList; opponentLists: GuideList[];basis?:{promptVersion:string;analysisContract?:GuideBasis['analysisContract']};sources?:GuideSource[] }
export function projectGuideLedger(raw:unknown,packet:LedgerPacket,setupOnly=false):GuideContent{
  return projectLedger(raw,packet,setupOnly)
}
function projectLedger(raw: unknown, packet: LedgerPacket,setupOnly=false,prefixTurns?:1|2|3,auditCandidates?:GuideAuditCandidates,positionCandidates?:GuideSetupPosition[],frontierVersion:1|2=1): GuideContent {
  if (!raw || typeof raw !== 'object') throw new Error('Registro della guida mancante.')
  const content = structuredClone(raw) as GuideContent
  if (!Array.isArray(content.scenarios)) throw new Error('Registri degli scenari mancanti.')
  for (const scenario of content.scenarios) {
    const resourceFirst=['matchup-guide-27','matchup-guide-28'].includes(packet.basis?.promptVersion??'')
    const exitTracker=['matchup-guide-26','matchup-guide-27','matchup-guide-28'].includes(packet.basis?.promptVersion??'')?createBoardExitTracker(packet.sources??[]):null
    const observed=['matchup-guide-13','matchup-guide-14','matchup-guide-15','matchup-guide-16','matchup-guide-17','matchup-guide-18','matchup-guide-19','matchup-guide-20','matchup-guide-21','matchup-guide-22','matchup-guide-23','matchup-guide-24','matchup-guide-25','matchup-guide-26','matchup-guide-27','matchup-guide-28'].includes(packet.basis?.promptVersion??'')
    const constructive=['matchup-guide-12','matchup-guide-13','matchup-guide-14','matchup-guide-15','matchup-guide-16','matchup-guide-17','matchup-guide-18','matchup-guide-19','matchup-guide-20','matchup-guide-21','matchup-guide-22','matchup-guide-23','matchup-guide-24','matchup-guide-25','matchup-guide-26','matchup-guide-27','matchup-guide-28'].includes(packet.basis?.promptVersion??'')
    const causal=['matchup-guide-11','matchup-guide-12','matchup-guide-13','matchup-guide-14','matchup-guide-15','matchup-guide-16','matchup-guide-17','matchup-guide-18','matchup-guide-19','matchup-guide-20','matchup-guide-21','matchup-guide-22','matchup-guide-23','matchup-guide-24','matchup-guide-25','matchup-guide-26','matchup-guide-27','matchup-guide-28'].includes(packet.basis?.promptVersion??'')
    const combat=causal||packet.basis?.promptVersion==='matchup-guide-10'
    const blocked=combat||packet.basis?.promptVersion==='matchup-guide-9'
    const budgeted=blocked||packet.basis?.promptVersion==='matchup-guide-8'
    const anchored=budgeted||packet.basis?.promptVersion==='matchup-guide-7'
    const s = scenario as GuideScenario & { positionNotes: string; lineEvents: LineEvent[]; developmentEvents: any[];opening:any;setupEvents:Event[] }
    if(causal)Object.assign(s,{title:(s as any).decision,positionNotes:'',explanation:'',opponentResponse:'',pivot:''})
    if(['matchup-guide-16','matchup-guide-17','matchup-guide-18','matchup-guide-19','matchup-guide-20','matchup-guide-21','matchup-guide-22','matchup-guide-23','matchup-guide-24','matchup-guide-25','matchup-guide-26','matchup-guide-27','matchup-guide-28'].includes(packet.basis?.promptVersion??''))prepareNativeDecisions(s,['matchup-guide-21','matchup-guide-22','matchup-guide-23','matchup-guide-24','matchup-guide-25','matchup-guide-26','matchup-guide-27','matchup-guide-28'].includes(packet.basis?.promptVersion??''),setupOnly||prefixTurns!==undefined,packet.basis?.promptVersion==='matchup-guide-28'&&packet.basis.analysisContract===GUIDE_FINITE_ANALYSIS_CONTRACT?'declared-lines':'historical')
    if(constructive)prepareResponseConstruction(s,packet.sources??[])
    if(blocked)expandTurnBlocks(s,packet.sources??[],combat,causal,observed,setupOnly,prefixTurns,packet.basis?.promptVersion==='matchup-guide-28')
    if(constructive)validateConstructedRetreats(s)
    if(anchored){
      const hands:GuideSetupLedger['openingHands']=[],prizes:GuideSetupLedger['openingPrizes']=[],placements:GuideSetupLedger['events']=[]
      for(const side of ['ours','opponent'] as const){
        const opening=s.opening?.[side]
        if(!opening||!Array.isArray(opening.hand)||opening.hand.length!==6||!Array.isArray(opening.prizes)||opening.prizes.length!==6) throw new Error(`${s.id}: setup incompleto.`)
        const source=packet.sources?.find(c=>c.id===`card:${opening.active}`)
        let card:any;try{card=JSON.parse(source?.content??'null')}catch{/* Gate below */}
        if(card?.category!=='Pokemon'||card?.stage!=='Basic')throw new Error(`${s.id}: Attivo iniziale non Base verificato.`)
        for(const printId of [opening.active,...opening.hand])hands.push({side,printId,count:1})
        for(const printId of opening.prizes)prizes.push({side,printId,count:1})
        placements.push({side,turn:0,kind:'setup',description:`Scelta dell’Attivo iniziale: ${card.name}.`,moves:[{side,printId:opening.active,count:1,from:'hand',to:'active'}],handAfter:{ours:0,opponent:0}})
        if(blocked){
          if(!Array.isArray(opening.bench))throw new Error(`${s.id}: Panchina del setup mancante.`)
          for(const printId of opening.bench){
            let basic:any;try{basic=JSON.parse(packet.sources?.find(c=>c.id===`card:${printId}`)?.content??'null')}catch{/* Gate below. */}
            if(basic?.category!=='Pokemon'||basic?.stage!=='Basic')throw new Error(`${s.id}: Panchina iniziale non Base verificata.`)
            placements.push({side,turn:0,kind:'setup',description:`Panchina iniziale: ${basic.name}.`,moves:[{side,printId,count:1,from:'hand',to:'bench'}],handAfter:{ours:0,opponent:0}})
          }
        }
      }
      if(!Array.isArray(s.setupEvents))throw new Error(`${s.id}: eventi del setup mancanti.`)
      s.setupLedger={openingHands:hands,openingPrizes:prizes,events:[...placements,...s.setupEvents.map(e=>({...e,handAfter:{ours:0,opponent:0}}))]}
      s.development=s.developmentEvents?.map(d=>{
        const e=s.lineEvents?.[d.eventIndex]
        if(!e)throw new Error(`${s.id}: evento di sviluppo assente.`)
        return {resources:d.resources,access:d.access,nextAttack:d.nextAttack,pivot:d.pivot,turn:e.turn,side:e.side,stepIndexes:[d.eventIndex]}
      })
    }else s.development = structuredClone(s.developmentEvents)
    const firstSide=(s as any).firstOpponentTurn===null?'ours':'opponent'
    if(causal)validateTurnLegality(s.setupLedger!.events,packet.sources??[],firstSide)
    const opponent = packet.opponentLists.find(l => l.id === s.opponentListId)
    if (!opponent || !s.setupLedger || (!setupOnly&&!Array.isArray(s.lineEvents)) || typeof s.positionNotes !== 'string') throw new Error('Lista o registro dello scenario non disponibile.')
    const balances = new Map<string, number>()
    const energyIds=new Set<string>()
    if(blocked)for(const source of packet.sources??[]){try{const c=JSON.parse(source.content);if(c.category==='Energy')energyIds.add(c.printId)}catch{/* Missing card text is checked elsewhere. */}}
    let eventLabel='setup iniziale'
    const traced=['matchup-guide-22','matchup-guide-23','matchup-guide-24','matchup-guide-25','matchup-guide-26','matchup-guide-27','matchup-guide-28'].includes(packet.basis?.promptVersion??'')
    let eventBefore:any[]=[],appliedMoves:Move[]=[]
    const beginEvent=(e:Event,context:string)=>{
      eventLabel=`${context}, turno ${e.turn} ${e.side}: ${e.description}`
      if(traced){eventBefore=[...balances].filter(([,count])=>count>0).map(([k,count])=>({side:k.split('|')[0],printId:k.split('|')[1],zone:k.split('|')[2],count}));appliedMoves=[]}
    }
    const key = (side: Side, print: string, zone: string) => `${side}|${print}|${zone}`
    for (const side of ['ours', 'opponent'] as const) for (const card of (side === 'ours' ? packet.ourList : opponent).cards)
      balances.set(key(side, card.printId, 'deck'), card.count)
    const move = (m: Move) => {
      if (!Number.isSafeInteger(m.count) || m.count <= 0 || m.count > 60 || m.from === m.to || !['ours', 'opponent'].includes(m.side) || !guideZones.includes(m.from) || !guideZones.includes(m.to)) throw new Error('Movimento di carte non valido.')
      const from = key(m.side, m.printId, m.from), to = key(m.side, m.printId, m.to)
      if ((balances.get(from) ?? 0) < m.count) {
        const prizeDetail=['matchup-guide-21','matchup-guide-22','matchup-guide-23','matchup-guide-24','matchup-guide-25','matchup-guide-26','matchup-guide-27','matchup-guide-28'].includes(packet.basis?.promptVersion??'')&&m.from==='deck'&&(balances.get(key(m.side,m.printId,'prizes'))??0)>0?` PESCA/RICERCA IMPOSSIBILE: la copia mancante è nei Premi, non nel mazzo. openingAllocation.remainingDeck esclude già mani, Attivi e Premi iniziali. I Premi entrano in mano soltanto tramite prizes→hand giustificato dal KO; non sono pescate. Non spostare la carta dai Premi né cambiare l’allocazione per riparare il saldo: ricostruire una linea con risorse disponibili.`:''
        const available=blocked?` Evento ${eventLabel}. Disponibilità effettiva: ${guideZones.map(z=>`${z}=${balances.get(key(m.side,m.printId,z))??0}`).join(', ')}. Non inventare un accesso: correggere il percorso dichiarato e la sua fonte, oppure cambiare linea.`:''
        const trace=traced?` Stato prima dell'evento e soli movimenti precedenti già verificati (non una correzione applicata): ${JSON.stringify({before:eventBefore,verifiedPrefix:appliedMoves,failedMove:m})}. La descrizione di una pesca/ricerca non sposta carte: dichiarare il trasferimento reale prima dell'uso, con fonte e costi.`:''
        throw new Error(`${s.id}: ${m.printId} ×${m.count} non disponibile in ${m.side}/${m.from}.${prizeDetail}${available}${trace}`)
      }
      balances.set(from, balances.get(from)! - m.count); balances.set(to, (balances.get(to) ?? 0) + m.count)
      if(traced)appliedMoves.push({...m})
    }
    const attacks:{turn:number;side:Side}[]=[]
    const verifyAttack=(e:Event)=>{
      const name=(e as Event&{attackName?:string|null}).attackName
      if(!anchored||name==null)return
      const active=[...balances].filter(([k,n])=>n>0&&k.startsWith(`${e.side}|`)&&k.endsWith('|active'))
      if(active.length!==1||active[0][1]!==1)throw new Error(`${s.id}: attacco senza un Attivo univoco.`)
      const printId=active[0][0].split('|')[1],source=packet.sources?.find(c=>c.id===`card:${printId}`)
      if(combat&&(e as any).attackerPrintId!==printId)throw new Error(`${s.id}: la carta che dichiara l’attacco non è l’Attivo corrente.`)
      let card:any;try{card=JSON.parse(source?.content??'null')}catch{/* Gate below */}
      if(!card?.gameplay?.attacks?.some((a:any)=>a.name===name))throw new Error(`${s.id}: attacco non presente nella scheda dell’Attivo.`)
    }
    const zone = (side: Side, zone: string) => [...balances].filter(([k]) => k.startsWith(`${side}|`) && k.endsWith(`|${zone}`)).reduce((n, [, count]) => n + count, 0)
    const verifyEnergyHosts=(e:Event)=>{
      if(!blocked)return
      for(const route of (e as any).energyRoutes??[])if(route.path.slice(1).includes('attached')){
        if(!route.hostPrintId||!((balances.get(key(route.side,route.hostPrintId,'active'))??0)+(balances.get(key(route.side,route.hostPrintId,'bench'))??0))){
          const board=[...balances].filter(([k,n])=>n>0&&(k.endsWith('|active')||k.endsWith('|bench'))).map(([k,count])=>({side:k.split('|')[0],printId:k.split('|')[1],zone:k.split('|')[2],count}))
          throw new Error(`${s.id}: destinatario dell’Energia non presente in campo. Evento ${eventLabel}. Percorso dichiarato: ${JSON.stringify(route)}. Campo effettivo a questo punto: ${JSON.stringify(board)}. Registrare prima l'ingresso o l'evoluzione reale del destinatario e usare la stampa attualmente in campo; nessun host è stato sostituito automaticamente.`)
        }
      }
    }
    const sourceCards=new Map<string,any>();if(resourceFirst)for(const source of packet.sources??[]){try{const c=JSON.parse(source.content);if(c.printId)sourceCards.set(c.printId,c)}catch{/* Other evidence. */}}
    const priorEvents:Event[]=[]
    const captureAuditQuantities=(e:Event,lineId:string,when:'before'|'after')=>{
      if(!auditCandidates?.quantities)return
      const location=auditCandidates.locations.find(l=>l.lineId===lineId&&l.turn===e.turn&&l.side===e.side)
      const path=(e as any).__guideAuditPath??(e.kind==='turn-draw'&&location?[...location.path,'draw']:undefined)
      // Automatic opening placements and ordinary draws are not native events.
      // Their movements are still in balances before the next native window.
      if(!Array.isArray(path))return
      const id=JSON.stringify([lineId,when,path])
      if(auditCandidates.quantities.windows.some(w=>w.id===id))throw Error('Quantità audit: finestra duplicata.')
      const board=exitTracker!.snapshot()
      auditCandidates.quantities.windows.push({id,path:structuredClone(path),lineId,turn:e.turn,side:e.side,when,...(e as any).prizeResolvedAt!==undefined?{resolvedWithPreviousKo:true}:{},balances:[...balances].filter(([,count])=>count>0).map(([k,count])=>{const [side,printId,zone]=k.split('|');return {side,printId,zone,count}}),hosts:board.groups.map(g=>({side:g.side,printId:g.printId,copy:board.groups.filter(p=>p.side===g.side&&p.printId===g.printId).indexOf(g)+1,zone:g.zone,stack:g.stack,attached:g.attached})),unknownAttachments:board.unknown.filter(u=>u.count>0).map(({side,printId,count})=>({side,printId,count}))})
    }
    const prepareChoice=(e:Event,lineId:string)=>{
      if(!resourceFirst)return
      exitTracker!.resolveOwners(e as any)
      const same=priorEvents.filter(p=>p.turn===e.turn&&p.side===e.side),supporterUsed=same.some(p=>sourceCards.get((p as any).trainer)?.gameplay?.trainerType==='Supporter'),manualUsed=same.some(p=>(p as any).energyRoutes?.some((r:any)=>r.attachment==='manual'))
      const hand=[...balances].filter(([k,n])=>n>0&&k.startsWith(e.side+'|')&&k.endsWith('|hand')).map(([k,count])=>({printId:k.split('|')[1],count})),board=exitTracker!.snapshot().groups
      const candidates=[...new Set([...hand.filter(r=>!supporterUsed||sourceCards.get(r.printId)?.gameplay?.trainerType!=='Supporter').map(r=>r.printId),...board.filter(g=>g.side===e.side).map(g=>g.printId)])]
      const sensitive=(e as any).attack!=null||(e as any).trainer!=null||e.kind==='retreat'||e.moves.some(m=>m.to==='evolution'||(e.turn>0&&m.from==='hand'&&m.to!=='hand'))
      const proof=(e as any).decisionProof
      if(sensitive&&auditCandidates){
        const path=(e as any).__guideAuditPath
        if(!Array.isArray(path))throw new Error('Candidati audit: evento nativo non identificato.')
        auditCandidates.choices.push({path,candidateIds:candidates,lineId,turn:e.turn,side:e.side})
      }
      // Position construction needs the executed movements before the audit
      // constructor can fill these judgments. Public readers pass neither
      // collector and retain the complete pre-action candidate gate.
      if(sensitive&&!auditCandidates&&!positionCandidates&&(!proof||!Array.isArray(proof.cards)||new Set(proof.cards).size!==proof.cards.length||proof.cards.some((id:string)=>!candidates.includes(id))||typeof proof.reason!=='string'||!proof.reason.trim()||candidates.some(id=>!proof.cards.includes(id))))throw new Error(s.id+': alternative PRIMA dell’azione omesse o estranee. '+eventLabel+'. Candidati dalla mano/campo prima del consumo: '+JSON.stringify(candidates)+'. Dichiarare esattamente decisionProof.cards e confrontare l’ordine delle azioni; evolvere/scartare prima non prova che una carta fosse indisponibile.')
      ;(e as any).choiceBefore={lineId,turn:e.turn,side:e.side,hand,board,supporterUsed,manualUsed,candidateIds:candidates,discardPokemon:[...balances].filter(([k,n])=>n>0&&k.startsWith(e.side+'|')&&k.endsWith('|discard')&&sourceCards.get(k.split('|')[1])?.category==='Pokemon').map(([k,count])=>({printId:k.split('|')[1],count}))}
      const present=new Set([...balances].filter(([k,n])=>n>0&&['active','bench','attached','stadium'].includes(k.split('|')[2])).map(([k])=>'card:'+k.split('|')[1]))
      for(const previous of priorEvents)if((previous as any).trainer)present.add('card:'+(previous as any).trainer)
      const payment=verifyAttackPayment(e,exitTracker!.snapshot(),packet.sources??[],present);if(payment)(e as any).attackPaymentResult=payment
      priorEvents.push(e)
    }
    for (const [target, cards, total] of [['hand', s.setupLedger.openingHands, 7], ['prizes', s.setupLedger.openingPrizes, 6]] as const) {
      if (!Array.isArray(cards)) throw new Error('Carte del setup mancanti.')
      for (const side of ['ours', 'opponent'] as const) if (cards.filter(c => c.side === side).reduce((n, c) => n + c.count, 0) !== total) throw new Error(`${s.id}: il setup richiede ${total} carte in ${target} per ${side}.`)
      for (const c of cards) move({ ...c, from: 'deck', to: target })
    }
    s.setupDraws = { ours: 0, opponent: 0 }; s.returnedToDeck = { ours: 0, opponent: 0 }
    for (const [eventIndex,e] of s.setupLedger.events.entries()) {
      if (!Array.isArray(e.moves)) throw new Error('Movimenti del setup mancanti.')
      verifyAttack(e)
      beginEvent(e,`setup[${eventIndex}]`)
      prepareChoice(e,'setup')
      captureAuditQuantities(e,'setup','before')
      exitTracker?.advance(e as any)
      if(resourceFirst)for(const m of e.moves)if(m.to==='attached'&&sourceCards.get(m.printId)?.category==='Energy'&&exitTracker!.snapshot().unknown.some(u=>u.side===m.side&&u.printId===m.printId&&u.count>0&&u.candidates.length))throw new Error(s.id+': assegnazione Energia con copia destinataria ambigua: dichiarare subito attachmentTargets con hostPrintId/copy nell’evento di assegnazione, non dopo.')
      // Non-Energy moves precede the declared Energy paths (e.g. evolve, then attach).
      for (const m of e.moves) { if(blocked&&m.to==='attached'&&energyIds.has(m.printId))verifyEnergyHosts(e);move(m); if (m.to === 'deck') s.returnedToDeck[m.side] += m.count }
      if(observed)validateDeckObservations(s.id,e,packet.sources??[],(side,printId)=>balances.get(`${side}|${printId}|deck`)??0)
      captureAuditQuantities(e,'setup','after')
      if (e.kind === 'turn-draw') s.setupDraws[e.side]++
      e.handAfter = { ours: zone('ours', 'hand'), opponent: zone('opponent', 'hand') }
    }
    if(setupOnly){
      if(!resourceFirst)throw new Error('Setup separato richiesto soltanto nel contratto v27.')
      if(positionCandidates){
        for(const side of ['ours','opponent'] as const)if(zone(side,'active')!==1||zone(side,'prizes')===0||zone(side,'bench')>s.benchLimit[side])throw new Error(s.id+': setup non pronto per una linea: Attivo, Premi o limite Panchina non validi.')
        positionCandidates.push({caseId:s.id,nextTurn:(s.setupLedger!.events.at(-1)?.turn??0)+1,inventory:[...balances].filter(([,n])=>n>0).map(([k,count])=>{const [side,printId,zone]=k.split('|');return {side,printId,zone,count} as GuideScenario['inventory'][number]})})
        continue
      }
      if(packet.basis?.promptVersion==='matchup-guide-28')guidePositionNotes({...s,positionAnnotations:(s as any).positionAnnotations,inventory:[...balances].filter(([,n])=>n>0).map(([k,count])=>{const [side,printId,zone]=k.split('|');return {side,printId,zone,count}})} as any,packet.sources??[],true,(s.setupLedger!.events.at(-1)?.turn??0)+1)
      if(!auditCandidates)deriveNativeAudit(s,packet.sources??[],true,true,true)
      for(const side of ['ours','opponent'] as const)if(zone(side,'active')!==1||zone(side,'prizes')===0||zone(side,'bench')>s.benchLimit[side])throw new Error(s.id+': setup non pronto per una linea: Attivo, Premi o limite Panchina non validi.')
      if(auditCandidates){auditCandidates.groups=tacticalFrontier(s,packet.sources??[],frontierVersion);continue}
      ;(s as any).setupReceipt={scenarioId:s.id,opponentListId:s.opponentListId,nextTurn:(s.setupLedger!.events.at(-1)?.turn??0)+1,inventory:[...balances].filter(([,n])=>n>0).map(([k,count])=>{const [side,printId,zone]=k.split('|');return {side,printId,zone,count}}),board:exitTracker!.snapshot(),events:s.setupLedger!.events,warning:'Stato derivato senza movimenti aggiunti. Non è una certificazione degli effetti: critica completa dopo la linea.'}
      continue
    }
    const initial = new Map(balances),initialBoard=exitTracker?.snapshot(),initialPrior=[...priorEvents]
    s.inventory = [...balances].filter(([, count]) => count > 0).map(([k, count]) => {
      const [side, printId, zone] = k.split('|'); return { side, printId, zone, count } as GuideScenario['inventory'][number]
    })
    const names = new Map([...packet.ourList.cards, ...opponent.cards].map(c => [c.printId, c.name]))
    s.state = `${s.positionNotes}\n\nZone derivate dal registro:\n${s.inventory.filter(r => r.zone !== 'deck').map(r => `${r.side}: ${r.count} ${names.get(r.printId) ?? r.printId} (${r.zone})`).join('\n')}\nCarte nel mazzo: ${zone('ours', 'deck')}/${zone('opponent', 'deck')}.`
    s.setupHistory = s.setupLedger.events.map(e => `Turno ${e.turn}, ${e.side}: ${e.description} Mani dopo: ${e.handAfter.ours}/${e.handAfter.opponent}.`).join('\n')
    const position = (): GuidePosition => ({ ourBench: zone('ours', 'bench'), opponentBench: zone('opponent', 'bench'), ourPrizes: zone('ours', 'prizes'), opponentPrizes: zone('opponent', 'prizes') })
    const ended=()=>zone('ours','prizes')===0||zone('opponent','prizes')===0||zone('ours','active')+zone('ours','bench')===0||zone('opponent','active')+zone('opponent','bench')===0
    const completePromotions=(turn:number)=>{
      if(causal&&ended())return
      if(combat)for(const side of ['ours','opponent'] as const)if(zone(side,'active')===0&&zone(side,'bench')>0){
        const candidates=[...balances].filter(([key,n])=>n>0&&key.startsWith(side+'|')&&key.endsWith('|bench')).map(([key,count])=>({printId:key.split('|')[1],count}))
        const detail=['matchup-guide-19','matchup-guide-20','matchup-guide-21','matchup-guide-22','matchup-guide-23','matchup-guide-24','matchup-guide-25','matchup-guide-26','matchup-guide-27','matchup-guide-28'].includes(packet.basis?.promptVersion??'')?` Turno ${turn}, lato senza Attivo: ${side}; candidati in Panchina: ${JSON.stringify(candidates)}. Scegliere e registrare bench→active nel turno del KO, dopo gli scarti e i Premi. Il giocatore di turno determina la tabella dell'evento, anche quando promuove l'altro lato. Rivalutare TUTTI i candidati in tactical.promotions del turno e di ogni ramo coinvolto.`:''
        throw new Error(`${s.id}: promozione obbligatoria omessa prima della fine del turno.${detail}`)
      }
    }
    const projectLine = (events: LineEvent[],primary=false,execution?:{executed:LineEvent[];unreached:LineEvent[]},lineId='main'): GuideStep[] => {
      balances.clear(); for (const [k, n] of initial) balances.set(k, n)
      if(exitTracker)exitTracker.restore(initialBoard)
      priorEvents.splice(0,priorEvents.length,...initialPrior)
      let turn = s.setupLedger!.events.at(-1)?.turn ?? 0
      const drawn = new Set<string>()
      let stepNumber=0,unreached=false
      const steps=events.flatMap((e,eventIndex) => {
        if(execution&&(unreached||(e.turn!==turn&&ended()&&(e as any).plannedConditional===true))){
          unreached=true;execution.unreached.push(e);return []
        }
        execution?.executed.push(e)
        beginEvent(e,`${lineId}[${eventIndex}]`)
        if(combat&&(e as any).prizeResolvedAt!==undefined){
          captureAuditQuantities(e,lineId,'before')
          captureAuditQuantities(e,lineId,'after')
          Object.assign(e,{handAfter:{ours:zone('ours','hand'),opponent:zone('opponent','hand')}})
          return []
        }
        if(combat&&ended())throw new Error(`${s.id}: azione dopo la fine effettiva della partita.`)
        if(combat&&e.turn!==turn)completePromotions(turn)
        verifyAttack(e)
        if(primary&&(e as any).attackName!=null)attacks.push({turn:e.turn,side:e.side})
        if (e.turn < turn) throw new Error(`${s.id}: ordine dei turni della linea non valido.`)
        if(blocked&&e.turn!==turn&&e.kind!=='turn-draw')throw new Error(`${s.id}: pescata di inizio turno mancante nel ramo.`)
        turn = e.turn
        if (e.kind === 'turn-draw') {
          const drawKey = `${e.side}:${e.turn}`
          if (drawn.has(drawKey)) throw new Error(`${s.id}: pescata di turno della linea non valida. È già stata eseguita per questo lato/turno: draw la materializza automaticamente, non ripeterla in events/beforeAttack. Una pesca aggiuntiva da effetto resta un evento effect con la sua fonte.`)
          if (e.moves.length !== 1 || e.moves[0].side !== e.side || e.moves[0].count !== 1 || e.moves[0].from !== 'deck' || e.moves[0].to !== 'hand') throw new Error(`${s.id}: pescata di turno della linea non valida.`)
          drawn.add(drawKey)
        }
        const before = position()
        prepareChoice(e,lineId)
        captureAuditQuantities(e,lineId,'before')
        const boardExits=exitTracker?.advance(e as any)??[]
        if(resourceFirst)for(const m of e.moves)if(m.to==='attached'&&sourceCards.get(m.printId)?.category==='Energy'&&exitTracker!.snapshot().unknown.some(u=>u.side===m.side&&u.printId===m.printId&&u.count>0&&u.candidates.length))throw new Error(s.id+': assegnazione Energia con copia destinataria ambigua: dichiarare subito attachmentTargets con hostPrintId/copy nell’evento di assegnazione, non dopo.')
        for (const m of e.moves) {if(blocked&&m.to==='attached'&&energyIds.has(m.printId))verifyEnergyHosts(e);move(m)}
        if(observed)validateDeckObservations(s.id,e,packet.sources??[],(side,printId)=>balances.get(`${side}|${printId}|deck`)??0)
        captureAuditQuantities(e,lineId,'after')
        Object.assign(e, { handAfter: { ours: zone('ours', 'hand'), opponent: zone('opponent', 'hand') } })
        const after = position()
        const recipient = e.affectedSide === 'ours' ? 'opponentPrizes' : 'ourPrizes'
        if(combat)Object.assign(e,{projectedStepIndex:stepNumber++})
        return [{ action: boardExits.length?'board-exit' as const:e.action, side: e.affectedSide, description: e.description, before, after,...boardExits.length?{boardExits}:{},
          prizesTaken: ['active-ko', 'bench-ko'].includes(e.action) ? before[recipient] - after[recipient] : 0,
          benchEntries: e.action === 'bench' ? e.moves.filter(m => m.to === 'bench' && m.side === e.affectedSide).flatMap(m => Array.from({ length: m.count }, () => ({ printId: m.printId, description: `Ingresso di ${names.get(m.printId) ?? m.printId}.` }))) : [] }]
      })
      completePromotions(turn)
      return steps
    }
    const rawMain=s.lineEvents
    if(combat)s.lineEvents=normalizeCombatEvents(rawMain)
    s.steps = projectLine(s.lineEvents,true)
    if(causal)validateTurnLegality([...s.setupLedger!.events,...s.lineEvents],packet.sources??[],firstSide)
    if(prefixTurns){
      // Partial construction has no fabricated future turns or reply proofs.
      // Every executed turn still passes the original ledger, legality,
      // promotion, payment, physical-copy and tactical-audit checks.
      const physical=physicalResources(s,packet.ourList,opponent,[s.lineEvents],observed)
      s.resources=physical.resources
      for(const d of s.development??[]){
        d.resources=(physical.primaryByTurn.get(d.turn)??[]).filter(r=>r.side===d.side).map(({printId,count})=>({printId,count}))
        d.stepIndexes=s.lineEvents.flatMap((e,i)=>e.turn===d.turn&&e.side===d.side?(Number.isSafeInteger((e as any).projectedStepIndex)?[(e as any).projectedStepIndex]:[]):[])
      }
      if(auditCandidates){auditCandidates.groups=tacticalFrontier(s,packet.sources??[],frontierVersion);continue}
      deriveNativeAudit(s,packet.sources??[],true,true,false,prefixTurns)
      s.calculations=[]
      const partial=compileGuideTactics({chapters:[],claims:[],scenarios:[s],exercises:[],limitations:[],changeSummary:''})
      const checked=checkGuidePrefix(partial,{...packet,sources:packet.sources??[]})
      if(checked.errors.length)throw new Error(checked.errors.join('\n'))
      const winners=(['ours','opponent'] as const).filter(side=>zone(side,'prizes')===0||zone(side==='ours'?'opponent':'ours','active')+zone(side==='ours'?'opponent':'ours','bench')===0)
      if(winners.length>1)throw new Error(`${s.id}: fine partita simultanea non dimostrata.`)
      const termination=winners.length?{winner:winners[0],reason:zone(winners[0],'prizes')===0?'prizes':'no-pokemon'}:null
      ;(s as any).prefixReceipt={kind:'incomplete-guide-prefix',scenarioId:s.id,opponentListId:s.opponentListId,turns:prefixTurns,lastTurn:s.lineEvents.at(-1)!.turn,inventory:[...balances].filter(([,n])=>n>0).map(([k,count])=>{const [side,printId,zone]=k.split('|');return {side,printId,zone,count}}),board:exitTracker!.snapshot(),events:s.lineEvents,resources:s.resources,tacticalAudit:s.tacticalAudit,terminal:ended(),termination,warning:'Prefisso verificato localmente, non guida valida. Effetti e tattica richiedono critica indipendente; rami e controlli finali restano obbligatori.'}
      continue
    }
    for (const d of s.development ?? []) for (const i of d.stepIndexes) if (!s.lineEvents[i] || s.lineEvents[i].turn !== d.turn || s.lineEvents[i].side !== d.side)
      throw new Error(`${s.id}: sviluppo non collegato al turno del registro.`)
    if(anchored){
      const ours=(s.development??[]).filter(d=>d.side==='ours').map(d=>d.turn),first=Math.min(...ours),last=Math.max(...ours)
      if(new Set(ours).size<2||!s.development?.some(d=>d.side==='opponent'&&d.turn>first&&d.turn<last)||!attacks.some(a=>a.side==='ours'&&a.turn===last))throw new Error(`${s.id}: sviluppo incompleto fino all’attacco successivo alla replica.`)
    }
    const paths:LineEvent[][]=[s.lineEvents]
    for (const o of s.replyComparison?.options ?? []) {
      const branch = o as typeof o & { lineEvents: LineEvent[]; forkAtEvent?: number;expandedLineEvents?:LineEvent[];turns?:any }
      if (!Array.isArray(branch.lineEvents)) throw new Error(`${s.id}: registro della replica mancante.`)
      const fork = branch.forkAtEvent ?? 0
      if (!Number.isSafeInteger(fork) || fork < 0 || fork > s.lineEvents.length) throw new Error(`${s.id}: prefisso della replica non valido.`)
      const rawExpanded=[...(combat?rawMain:s.lineEvents).slice(0,fork),...branch.lineEvents]
      let expanded=combat?normalizeCombatEvents(rawExpanded):rawExpanded
      if(causal&&expanded[0]?.turn!==s.lineEvents[0].turn)throw new Error(`${s.id}: ramo privo del nostro primo turno e della sua pesca.`)
      if(blocked&&expanded.length>40)throw new Error(`${s.id}: ramo oltre quaranta eventi.`)
      const execution={executed:[] as LineEvent[],unreached:[] as LineEvent[]}
      branch.steps = projectLine(expanded,false,causal?execution:undefined,o.id)
      if(causal){
        expanded=execution.executed
        validateTurnLegality([...s.setupLedger!.events,...expanded],packet.sources??[],firstSide)
        const winners=(['ours','opponent'] as const).filter(side=>zone(side,'prizes')===0||zone(side==='ours'?'opponent':'ours','active')+zone(side==='ours'?'opponent':'ours','bench')===0)
        if(winners.length>1)throw new Error(`${s.id}: fine partita simultanea non dimostrata.`)
        Object.assign(branch,{termination:winners.length?{winner:winners[0],reason:zone(winners[0],'prizes')===0?'prizes':'no-pokemon'}:null,unreachedPlan:execution.unreached})
      }
      if(combat){
        branch.expandedLineEvents=expanded
        if(branch.turns?.opponent?.terminal===true&&(!ended()||!Number.isSafeInteger(o.replyTurn)||expanded.some(e=>e.turn>=o.replyTurn!)))throw new Error(`${s.id}: risposta avversaria terminale senza fine partita prima della replica.`)
        if(branch.turns?.next?.terminal===true&&!ended())throw new Error(`${s.id}: ramo terminale dichiarato senza fine partita.`)
        if(!ended()&&!expanded.some(e=>e.turn===o.replyTurn&&e.side==='opponent'))throw new Error(`${s.id}: turno della risposta avversaria omesso.`)
      }
      paths.push(expanded)
      if(blocked){
        const last=s.lineEvents.at(-1)!.turn
        const noAttack=packet.basis?.promptVersion==='matchup-guide-28'&&branch.turns?.next?.attack?.action==='end-turn'
        if(!ended()&&!expanded.some(e=>e.turn===last&&e.side==='ours'&&((e as any).attackName!=null||noAttack)))throw new Error(`${s.id}: ramo ${o.id} incompleto fino all’attacco successivo.`)
      }
      if(budgeted){
        if(!Number.isSafeInteger(o.replyTurn)||!o.replyTurn||o.replyTurn<1)throw new Error(`${s.id}: turno della replica non valido.`)
        Object.assign(o,causal&&!expanded.some(e=>e.turn===o.replyTurn&&e.side==='opponent')&&ended()?{requiredCards:[],attachments:0,retreatEnergy:0}:replyCost(s,expanded,o.replyTurn,packet.sources??[]))
      }
      if (o.intent && !branch.steps.length) throw new Error(`${s.id}: replica senza eventi né prefisso.`)
    }
    if(constructive)deriveOmissionWitnesses(s,['matchup-guide-23','matchup-guide-24','matchup-guide-25','matchup-guide-26','matchup-guide-27','matchup-guide-28'].includes(packet.basis?.promptVersion??''),packet.basis?.promptVersion==='matchup-guide-28'&&packet.basis.analysisContract===GUIDE_FINITE_ANALYSIS_CONTRACT?'declared-lines':'historical')
    if(budgeted&&s.replyComparison){
      const comparison=s.replyComparison,minimum=comparison.options.find(o=>o.id===comparison.minimumReplyId)
      if(blocked&&minimum&&!minimum.requiredCards.length&&comparison.omissionTests.length)throw new Error(`${s.id}: replica a costo zero, nessuna nuova copia da rimuovere; omissionTests deve essere vuoto.`)
      if(new Set(comparison.options.map(o=>o.replyTurn)).size!==1)throw new Error(`${s.id}: repliche riferite a turni diversi.`)
      comparison.omissionMode='consumption-budget'
      if(minimum)for(const test of comparison.omissionTests)test.maximumNewCards=minimum.requiredCards.reduce((n,c)=>n+c.count,0)-1
    }
    if(blocked){
      const physical=physicalResources(s,packet.ourList,opponent,paths,observed)
      s.resources=physical.resources
      for(const d of s.development??[]){
        d.resources=(physical.primaryByTurn.get(d.turn)??[]).filter(r=>r.side===d.side).map(({printId,count})=>({printId,count}))
        d.stepIndexes=s.lineEvents.flatMap((e,i)=>e.turn===d.turn&&e.side===d.side?(combat?Number.isSafeInteger((e as any).projectedStepIndex)?[(e as any).projectedStepIndex]:[]:[i]):[])
      }
    }
    if(['matchup-guide-16','matchup-guide-17','matchup-guide-18','matchup-guide-19','matchup-guide-20','matchup-guide-21','matchup-guide-22','matchup-guide-23','matchup-guide-24','matchup-guide-25','matchup-guide-26','matchup-guide-27','matchup-guide-28'].includes(packet.basis?.promptVersion??''))deriveNativeAudit(s,packet.sources??[],['matchup-guide-19','matchup-guide-20','matchup-guide-21','matchup-guide-22','matchup-guide-23','matchup-guide-24','matchup-guide-25','matchup-guide-26','matchup-guide-27','matchup-guide-28'].includes(packet.basis?.promptVersion??''),['matchup-guide-20','matchup-guide-21','matchup-guide-22','matchup-guide-23','matchup-guide-24','matchup-guide-25','matchup-guide-26','matchup-guide-27','matchup-guide-28'].includes(packet.basis?.promptVersion??''))
    if(causal){
      deriveCausalDescriptions(s,packet.sources??[],['matchup-guide-15','matchup-guide-16','matchup-guide-17','matchup-guide-18','matchup-guide-19','matchup-guide-20','matchup-guide-21','matchup-guide-22','matchup-guide-23','matchup-guide-24','matchup-guide-25','matchup-guide-26','matchup-guide-27','matchup-guide-28'].includes(packet.basis?.promptVersion??''))
      s.state=`${s.positionNotes}\n\nZone derivate dal registro:\n${s.inventory.filter(r=>r.zone!=='deck').map(r=>`${r.side}: ${r.count} ${names.get(r.printId)??r.printId} (${r.zone})`).join('\n')}\nCarte nel mazzo: ${s.inventory.filter(r=>r.side==='ours'&&r.zone==='deck').reduce((n,r)=>n+r.count,0)}/${s.inventory.filter(r=>r.side==='opponent'&&r.zone==='deck').reduce((n,r)=>n+r.count,0)}.`
    }
  }
  return setupOnly||prefixTurns?content:readGuideContent(content,packet.basis?.promptVersion,packet.basis?.analysisContract)
}

/** Same setup replay and controls as the full guide; no dummy continuation. */
export function projectGuideSetup(raw:unknown,packet:Parameters<typeof projectGuideLedger>[1]):any[]{return projectGuideLedger(raw,packet,true).scenarios.map((s:any)=>s.setupReceipt)}

export interface GuideSetupPosition {caseId:string;nextTurn:number;inventory:GuideScenario['inventory']}
/** Construction facts only: execute the same complete movement stream before
 * requesting damaged/status annotations. Neither position/audit approval nor a
 * setup receipt is produced. Public readers retain EVERY original gate. */
export function collectGuideSetupPosition(native:any,packet:LedgerPacket):GuideSetupPosition{
  if(packet.basis?.promptVersion!=='matchup-guide-28'||packet.basis.analysisContract!==GUIDE_FINITE_ANALYSIS_CONTRACT)throw new Error('Posizione setup: contratto finito v28 richiesto.')
  const positions:GuideSetupPosition[]=[]
  projectLedger({scenarios:[native]},packet,true,undefined,undefined,positions)
  if(positions.length!==1)throw new Error('Posizione setup non univoca.')
  return positions[0]
}

/** Construction-only facts from the SAME movement replay. This returns no
 * receipt, guide, tactical judgment or approval. Audit gates are deferred only
 * here; the unchanged public setup/prefix/final readers must run afterwards. */
export function collectGuideAuditCandidates(native:any,packet:LedgerPacket,mode:GuideAuditMode,includeQuantities=false,frontierVersion:1|2=1):GuideAuditCandidates{
  if(packet.basis?.promptVersion!=='matchup-guide-28'||packet.basis.analysisContract!==GUIDE_FINITE_ANALYSIS_CONTRACT)throw new Error('Candidati audit: contratto finito v28 richiesto.')
  if(mode.kind==='prefix'&&![1,2,3].includes(mode.turns))throw new Error('Candidati audit: numero di turni non valido.')
  const copy=structuredClone(native),locations=guideAuditLocations(copy,mode)
  for(const location of locations)for(const path of location.events){const event=guideAuditAt(copy,path);if(Object.hasOwn(event,'__guideAuditPath'))throw new Error('Candidati audit: campo host riservato.');event.__guideAuditPath=path}
  const opponent=packet.opponentLists.find(l=>l.id===native.opponentListId)
  if(!opponent)throw Error('Quantità audit: lista avversaria assente.')
  const result:GuideAuditCandidates={version:1,caseId:native.id,locations,choices:[],groups:[],...includeQuantities?{quantities:{cards:([['ours',packet.ourList],['opponent',opponent]] as const).flatMap(([side,list])=>list.cards.map(c=>({side,printId:c.printId,name:c.name,total:c.count}))),windows:[]}}:{}}
  projectLedger({scenarios:[copy]},packet,mode.kind==='setup',mode.kind==='prefix'?mode.turns:undefined,result,undefined,frontierVersion)
  return result
}

/** Construction-only replay. Never usable as the final publication gate. */
export function projectGuidePrefix(raw:unknown,packet:LedgerPacket,turns:1|2|3):any[]{
  if(!['matchup-guide-27','matchup-guide-28'].includes(packet.basis?.promptVersion??'')||![1,2,3].includes(turns))throw new Error('Prefisso richiede contratto v27 e uno, due o tre turni completi.')
  const content=structuredClone(raw) as any
  if(!Array.isArray(content?.scenarios)||!content.scenarios.length)throw new Error('Scenari del prefisso mancanti.')
  for(const s of content.scenarios){
    const phases=['ours','opponent','next'].slice(0,turns)
    if(!s.turns||Object.keys(s.turns).some(k=>!phases.includes(k))||phases.some(k=>!s.turns[k]))throw new Error('Il prefisso deve contenere esattamente i turni dichiarati, senza turni futuri.')
    if(s.replyComparison!=null)throw new Error('Costruire ciascun ramo separatamente: repliche non ammesse nel prefisso.')
  }
  return projectLedger(content,packet,false,turns).scenarios.map((s:any)=>s.prefixReceipt)
}
