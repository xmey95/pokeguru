import {tacticalFrontier,checkTacticalAudit,type GuideTacticalAudit} from './guide-tactical-frontier'
import type {GuideSource} from './matchup-guide'
import {validGuideAnalysisScope} from './guide-analysis-scope'

/** Early access-role check, shared with the complete native scenario gate. */
export function readGuideAccessTurn(id:string,events:any[]|undefined){
  const marked=(events??[]).flatMap((e:any,eventIndex:number)=>e.accessReceipt!=null?[{eventIndex,...e.accessReceipt}]:[])
  if(marked.length!==1||!Array.isArray(marked[0].sourceIds)||!marked[0].sourceIds.length||typeof marked[0].reason!=='string'||!marked[0].reason.trim())throw new Error(`${id}: replica access richiede esattamente una accessReceipt motivata sull'evento di ricerca/recupero/pesca da effetto, non un indice separato. Ricevute non nulle: ${marked.length}; indici a base zero in turns.opponent.events: [${marked.map(p=>p.eventIndex).join(',')}]. Marca solo l'evento reale con accessReceipt={sourceIds:[fonti originali],reason:motivazione}; tutti gli altri eventi devono avere accessReceipt=null. Se separi la risoluzione fra più eventi, non duplicare la ricevuta: il solo evento marcato deve comunque eseguire un accesso aggiuntivo reale.`)
  const proof=marked[0],e=events![proof.eventIndex]
  const gain=(from:string,to:string)=>['deck','discard','lost'].includes(from)&&['hand','attached','active','bench'].includes(to)
  if(!e||e.kind==='turn-draw'||!((e.moves??[]).some((m:any)=>m.side==='opponent'&&gain(m.from,m.to))||(e.energyRoutes??[]).some((r:any)=>r.side==='opponent'&&(r.path??[]).some((to:string,i:number)=>i>0&&gain(r.path[i-1],to)))))throw new Error(`${id}: accessProof.eventIndex non indica un accesso aggiuntivo nel turno della replica; la pescata ordinaria non è sufficiente.`)
  return proof
}

/** A retreat cost belongs to the event's unique outgoing Active. No model-made
 * cross-reference or duplicate printing is repaired or guessed. */
export function prepareNativeDecisions(s:any,accessReceipts=false,setupOnly=false,comparisonScope:'historical'|'declared-lines'='historical'){
  const costs:any[]=[]
  const events=(rows:any[],side:string,path:string)=>{for(const [i,e]of (rows??[]).entries()){
    if(e.kind!=='retreat'){if(e.retreat!=null)throw new Error(`${s.id}: ${path}[${i}] dichiarazione di ritirata su evento non retreat.`);continue}
    const outgoing=(e.moves??[]).filter((m:any)=>m.side===side&&m.from==='active'&&m.to==='bench'&&m.count===1)
    const incoming=(e.moves??[]).filter((m:any)=>m.side===side&&m.from==='bench'&&m.to==='active'&&m.count===1)
    if(outgoing.length!==1||incoming.length!==1||!e.retreat||!Array.isArray(e.retreat.adjustments))throw new Error(`${s.id}: ${path}[${i}] ritirata incompleta: un solo Attivo uscente, un entrante e retreat.adjustments richiesti.`)
    e.retreatCostId='retreat-'+(costs.length+1)
    costs.push({id:e.retreatCostId,context:e.description,side,printId:outgoing[0].printId,adjustments:structuredClone(e.retreat.adjustments)})
  }}
  const next=(n:any,path:string)=>{if(n){events(n.beforeAttack,'ours',path+'.beforeAttack');events(n.attack?[n.attack]:[],'ours',path+'.attack');events(n.afterAttack,'ours',path+'.afterAttack')}}
  if(s.firstOpponentTurn)events(s.firstOpponentTurn.events,'opponent','firstOpponentTurn')
  for(const [i,round]of (s.setupRounds??[]).entries())for(const side of ['ours','opponent'])events(round[side]?.events,side,`setupRounds.${i}.${side}`)
  events(s.turns?.ours?.events,'ours','turns.ours');events(s.turns?.opponent?.events,'opponent','turns.opponent');next(s.turns?.next,'turns.next')
  for(const o of s.replyComparison?.options??[]){events(o.turns?.ours?.events,'ours',o.id+'.ours');events(o.turns?.opponent?.events,'opponent',o.id+'.opponent');next(o.turns?.next,o.id+'.next')}
  if(costs.length>20)throw new Error(`${s.id}: oltre venti costi di ritirata: costruire un caso più breve senza omettere ritirate.`)
  s.retreatCosts=costs
  if(setupOnly)return
  if(comparisonScope==='declared-lines'&&!validGuideAnalysisScope(s.analysisScope))throw new Error(`${s.id}: copertura finita nativa mancante o non valida.`)
  const accessId=comparisonScope==='declared-lines'?s.analysisScope.access.replyId:s.replyComparison?.coverage?.access
  // An explicitly unexamined category makes no access claim. All selected
  // turns, resource movements and retreats above are still validated.
  if(comparisonScope==='declared-lines'&&accessId===null)return
  const access=s.replyComparison?.options?.find((o:any)=>o.id===accessId)
  if(accessReceipts){
    const proof=readGuideAccessTurn(s.id,access?.turns?.opponent?.events)
    access.accessProof=proof
  }
  const proof=access?.accessProof
  if(!access||!proof||!Number.isSafeInteger(proof.eventIndex)||proof.eventIndex<0)throw new Error(`${s.id}: replica access senza indice dell'evento di ricerca/recupero/pesca da effetto.`)
  const e=access.turns?.opponent?.events?.[proof.eventIndex]
  const gain=(from:string,to:string)=>['deck','discard','lost'].includes(from)&&['hand','attached','active','bench'].includes(to)
  if(!e||e.kind==='turn-draw'||!((e.moves??[]).some((m:any)=>m.side==='opponent'&&gain(m.from,m.to))||(e.energyRoutes??[]).some((r:any)=>r.side==='opponent'&&(r.path??[]).some((to:string,i:number)=>i>0&&gain(r.path[i-1],to)))))throw new Error(`${s.id}: accessProof.eventIndex non indica un accesso aggiuntivo nel turno della replica; la pescata ordinaria non è sufficiente.`)
}

/** Context and turn numbers come from the same executed ledger, while the AI
 * must still acknowledge every attack/card and justify its choices. */
export function deriveNativeAudit(s:any,sources:GuideSource[],promotionReview=false,completeAudit=false,setupOnly=false,prefixTurns?:1|2|3){
  const rows:GuideTacticalAudit[]=[],groups=tacticalFrontier(s,sources),errors:string[]=[]
  const add=(lineId:string,turn:number,side:'ours'|'opponent',body:any)=>{
    if(!body||!Array.isArray(body.attacks)||!Array.isArray(body.cards)||typeof body.comparison!=='string'){
      if(!completeAudit)throw new Error(`${s.id}: audit obbligatorio mancante in ${lineId}|${turn}|${side}.`)
      errors.push(`${s.id}: audit obbligatorio mancante in ${lineId}|${turn}|${side}.`);return
    }
    const row={...structuredClone(body),lineIds:[lineId],turn,side}
    if(promotionReview){
      const key=`${lineId}|${turn}|${side}`,g=groups.find(g=>g.lineId===lineId&&g.turn===turn&&g.side===side)
      const expected=new Set(g?.promotions.flatMap(p=>p.printIds.map(id=>`${p.side}|${id}`))??[]),seen=new Set<string>()
      const reviews=Array.isArray(body.promotions)?body.promotions:[]
      if(!Array.isArray(body.promotions))errors.push(`${s.id}: ${key} promotions obbligatorio, anche [] senza promozioni.`)
      for(const p of reviews){
        const pair=`${p.side}|${p.printId}`
        if(!expected.has(pair)||seen.has(pair)||typeof p.reason!=='string'||!p.reason.trim()||p.reason.length>600)errors.push(`${s.id}: ${key} confronto promozione duplicato, estraneo o senza motivo: ${pair}.`)
        seen.add(pair)
      }
      for(const pair of expected)if(!seen.has(pair))errors.push(`${s.id}: ${key} promozione candidata non valutata: ${pair}. Dichiararla in tactical.promotions con motivo concreto, anche se il lato che promuove non è di turno.`)
      // Only an explicit AI evaluation can supply a promotion candidate to the
      // legacy flat coverage list. No unseen candidate or reason is invented.
      row.cards=[...new Set([...body.cards,...reviews.map((p:any)=>p.printId)])]
    }
    rows.push(row)
  }
  let t=0
  if(s.firstOpponentTurn)add('setup',++t,'opponent',s.firstOpponentTurn.tactical)
  for(const round of s.setupRounds??[])for(const side of ['ours','opponent'] as const)add('setup',++t,side,round[side]?.tactical)
  const first=t+1
  if(!setupOnly){
  for(const [i,phase]of ['ours','opponent','next'].slice(0,prefixTurns??3).entries())add('main',first+i,i===1?'opponent':'ours',s.turns[phase]?.tactical)
  for(const o of s.replyComparison?.options??[]){
    const phases=['ours','opponent','next']
    for(const [i,phase]of phases.entries()){
      const side=i===1?'opponent':'ours',turn=first+i
      if(!groups.some(g=>g.lineId===o.id&&g.turn===turn&&g.side===side))continue // A conditional turn after termination was not executed.
      let body=o.turns?.[phase]?.tactical
      if(i===0&&body==null){
        const prefix=(s.lineEvents??[]).filter((e:any)=>e.turn===first).length
        // forkAtEvent refers to original pre-normalization events: count the native
        // draw and events, not KO/bench atoms added by projection.
        const nativePrefix=1+(s.turns.ours.events?.length??0)
        if(o.turns?.ours?.draw!=null||o.turns?.ours?.events?.length||o.forkAtEvent!==nativePrefix||!prefix)throw new Error(`${s.id}: ${o.id} audit del prefisso riusabile solo se il nostro turno è integralmente identico.`)
        body=s.turns.ours.tactical
      }
      add(o.id,turn,side,body)
    }
  }
  if(rows.length>60)throw new Error(`${s.id}: oltre sessanta audit, caso troppo lungo.`)
  }
  if(completeAudit){
    const coverage=checkTacticalAudit({...s,tacticalAudit:rows},sources)
    errors.push(...coverage)
    if(errors.length)errors.push(`FRONTIERA COMPLETA DAL REGISTRO (dati, non mosse certificate): ${JSON.stringify(groups)}. Correggere ogni tactical del turno/ramo indicato: cards deve dichiarare esplicitamente anche carte in mano appena pescate o poi scartate, Energie e accessi. Non basta modificare il testo comparison. Nessuna carta o valutazione è stata aggiunta automaticamente.`)
  }
  if(errors.length)throw new Error(errors.join('\n'))
  s.tacticalAudit=rows
}
