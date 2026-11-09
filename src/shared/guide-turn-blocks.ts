import type { GuideSource } from './matchup-guide'
import {assertGuideTurnEnding} from './guide-turn-ending'

/** Expand declared turn blocks and Energy paths only. No invented draw, search,
 * card effect or substitute Energy. The ledger and critic validate every edge. */
export function expandTurnBlocks(s: any, sources: GuideSource[], combat=false,causal=false,observed=false,setupOnly=false,prefixTurns?:1|2|3,allowTerminalReplies=false) {
  const endings=new WeakSet<object>()
  const finalTurn=(next:any,allow=allowTerminalReplies)=>{if(assertGuideTurnEnding(next,allow,s.id))endings.add(next.attack)}
  const sourceIds = new Set(sources.map(c => c.id)), cards = new Map<string, any>()
  for (const source of sources.filter(c => c.kind === 'card')) { try { const c = JSON.parse(source.content); cards.set(c.printId, c) } catch { /* Checked below. */ } }
  const expand = (raw: any, turn: number, side: string, line: boolean) => {
    if (!raw || !Array.isArray(raw.moves) || !Array.isArray(raw.energyRoutes)) throw new Error(`${s.id}: evento o percorsi Energia mancanti.`)
    if(raw.action==='end-turn'&&!endings.has(raw))throw new Error(`${s.id}: fine turno fuori dal seguito finale dichiarato.`)
    if(observed){
      if(!Array.isArray(raw.deckObservations))throw new Error(`${s.id}: deckObservations mancante nell'evento del turno ${turn}.`)
      for(const [i,m]of raw.moves.entries())if(m.from===m.to)throw new Error(`${s.id}: turno ${turn} ${side}, moves[${i}], ${m.printId}: ${m.from}→${m.to} non è un trasferimento. Per una carta rimasta nel mazzo usare deckObservations con la fonte; non cancellare una reale azione o inventare un'altra zona. Evento: ${raw.description}`)
      for(const [i,r]of raw.energyRoutes.entries())if(r.path?.some((z:string,j:number)=>j>0&&z===r.path[j-1]))throw new Error(`${s.id}: turno ${turn}, energyRoutes[${i}] ${r.printId}: due zone consecutive uguali. Osservazioni nel mazzo in deckObservations, vere assegnazioni/rimozioni in percorsi distinti e documentati.`)
    }
    if (raw.moves.some((m: any) => cards.get(m.printId)?.category === 'Energy')) throw new Error(`${s.id}: Energia fuori dai percorsi dichiarati.`)
    const moves = [...raw.moves]
    for (const route of raw.energyRoutes) {
      if (cards.get(route.printId)?.category !== 'Energy' || !Array.isArray(route.path) || route.path.length < 2 || route.path.length > 5 ||
        !Array.isArray(route.sourceIds) || !route.sourceIds.length || route.sourceIds.some((id: string) => !sourceIds.has(id))) throw new Error(`${s.id}: percorso Energia senza carta o fonti verificate.`)
      if (route.path.includes('attached') && !route.hostPrintId) throw new Error(causal
        ? `${s.id}: percorso Energia ${route.printId} (${route.path.join('→')}) senza Pokémon di origine/destinazione: hostPrintId richiesto anche per rimozioni da attached, ritirate e KO.`
        : `${s.id}: Energia assegnata senza destinatario.`)
      if(route.hostPrintId&&cards.get(route.hostPrintId)?.category!=='Pokemon')throw new Error(`${s.id}: destinatario dell’Energia non Pokémon.`)
      for (let i = 1; i < route.path.length; i++) moves.push({ side: route.side, printId: route.printId, count: route.count, from: route.path[i - 1], to: route.path[i] })
    }
    if(moves.length>80)throw new Error(`${s.id}: evento oltre ottanta movimenti.`)
    let attackName=raw.attackName,attackerPrintId:string|null=null
    if(combat){
      const ref=raw.attack
      if(ref!=null&&(!cards.get(ref.printId)?.gameplay?.attacks?.some((a:any)=>a.name===ref.attackName)))throw new Error(`${s.id}: coppia carta/attacco non verificata.`)
      attackName=ref?.attackName??null;attackerPrintId=ref?.printId??null
    }
    return { ...raw, turn, side, moves,...causal?{trainer:raw.trainer??null}:{},...combat?{attackName,attackerPrintId}:{}, ...line ? raw.action==='end-turn'?{action:'other'}:{} : { action: undefined, affectedSide: undefined } }
  }
  let turn = 0
  const setup: any[] = [], audit: any[] = []
  const draw=(printId:string,turn:number,side:string,line:boolean)=>{
    if(!cards.has(printId)||!sourceIds.has('rules'))throw new Error(`${s.id}: pescata di turno senza carta o regole verificate.`)
    const movement={side,printId,count:1,from:'deck',to:'hand'}
    return expand({kind:'turn-draw',description:`Pescata di inizio turno: ${cards.get(printId).name}.`,...observed?{deckObservations:[]}: {},attackName:null,moves:cards.get(printId).category==='Energy'?[]:[movement],
      energyRoutes:cards.get(printId).category==='Energy'?[{side,printId,count:1,path:['deck','hand'],hostPrintId:null,sourceIds:['rules'],...causal?{attachment:null}:{}}]:[],...line?{action:'other',affectedSide:side}:{}},turn,side,line)
  }
  const setupTurn=(group:any,side:string)=>{
    if(!Array.isArray(group?.events)||!group.decision)throw new Error(`${s.id}: turno del setup incompleto.`)
    turn++;setup.push(draw(group.draw,turn,side,false),...group.events.map((e:any)=>expand(e,turn,side,false)))
    audit.push({...group.decision,turn,side})
  }
  if (s.firstOpponentTurn !== null) {
    setupTurn(s.firstOpponentTurn,'opponent')
  }
  if (!Array.isArray(s.setupRounds)) throw new Error(`${s.id}: round del setup mancanti.`)
  for (const round of s.setupRounds) for (const side of ['ours', 'opponent']) {
    setupTurn(round[side],side)
  }
  if(setup.length>148)throw new Error(`${s.id}: setup troppo lungo per il registro.`)
  s.setupEvents = setup;s.turnAudit=audit
  if(setupOnly)return
  const phases = (['ours', 'opponent', 'next'] as const).slice(0,prefixTurns??3)
  if(!s.turns)throw new Error(`${s.id}: turni mancanti.`)
  if(!prefixTurns||prefixTurns===3){if(combat)finalTurn(s.turns.next,allowTerminalReplies&&prefixTurns===3);else if(!s.turns.next?.attack?.attackName)throw new Error(`${s.id}: attacco successivo esplicito mancante.`)}
  const groups=phases.map(phase=>s.turns[phase])
  const events = phases.map(phase=>phase==='next'?[...s.turns.next.beforeAttack,s.turns.next.attack,...s.turns.next.afterAttack]:s.turns[phase]?.events)
  s.lineEvents = events.flatMap((rows: any[], i: number) => {
    if (!Array.isArray(rows)) throw new Error(`${s.id}: turno di sviluppo mancante.`)
    const actor=i===1?'opponent':'ours',t=turn+i+1
    return [draw(groups[i].draw,t,actor,true),...rows.map(e => expand(e,t,actor,true))]
  })
  if (s.lineEvents.length > 40) throw new Error(`${s.id}: linea oltre quaranta eventi.`)
  s.developmentEvents = phases.map((phase, i) => {
    const note = s.developmentPlan?.[phase], eventIndex = s.lineEvents.findIndex((e: any) => e.turn === turn + i + 1)
    if (!note) throw new Error(`${s.id}: motivazione di sviluppo mancante.`)
    return { ...note, resources: [], eventIndex }
  })
  for (const option of s.replyComparison?.options ?? []) {
    option.replyTurn = turn + 2
    if(combat){
      if(causal&&option.continuation!=='if-game-continues')throw new Error(`${s.id}: continuazione condizionale mancante.`)
      const firstCount=s.lineEvents.filter((e:any)=>e.turn===turn+1).length
      if(!Number.isSafeInteger(option.forkAtEvent)||option.forkAtEvent<0||option.forkAtEvent>firstCount)throw new Error(`${s.id}: il prefisso v10 può riusare solo il nostro primo turno.`)
      const own=option.turns?.ours,reply=option.turns?.opponent,next=option.turns?.next
      if(!Array.isArray(own?.events)||!next)throw new Error(`${s.id}: ramo v10 incompleto.`)
      const suffix=[...(own.draw!=null?[draw(own.draw,turn+1,'ours',true)]:[]),...own.events.map((e:any)=>expand(e,turn+1,'ours',true))]
      if(causal&&(reply==null||(!allowTerminalReplies&&next.terminal===true)))throw new Error(`${s.id}: il piano v11 richiede risposta e seguito completi; la terminalità viene calcolata dall’app.`)
      if(reply?.terminal===true&&(!allowTerminalReplies||next.terminal!==true))throw new Error(`${s.id}: una risposta terminale richiede v28 e un seguito terminale.`)
      if(reply!=null&&reply.terminal!==true){
        if(!Array.isArray(reply.events))throw new Error(`${s.id}: risposta avversaria incompleta.`)
        suffix.push(draw(reply.draw,turn+2,'opponent',true),...reply.events.map((e:any)=>expand(e,turn+2,'opponent',true)))
      }
      if(next.terminal!==true){
        if(!Array.isArray(next.beforeAttack)||!Array.isArray(next.afterAttack)||!next.attack?.attack?.attackName&&next.attack?.action!=='end-turn')throw new Error(`${s.id}: attacco successivo del ramo mancante.`)
        finalTurn(next)
        suffix.push(draw(next.draw,turn+3,'ours',true),...[...next.beforeAttack,next.attack,...next.afterAttack].map((e:any)=>expand(e,turn+3,'ours',true)))
      }
      option.lineEvents=causal?suffix.map(e=>e.turn>=turn+2?{...e,plannedConditional:true}:e):suffix
      continue
    }
    option.lineEvents = phases.flatMap((phase, i) => {
      const group=option.turns?.[phase]
      if (!Array.isArray(group?.events)) throw new Error(`${s.id}: blocchi della replica mancanti.`)
      const t=turn+i+1,actor=i===1?'opponent':'ours'
      return [...group.draw!=null?[draw(group.draw,t,actor,true)]:[],...group.events.map((e: any) => expand(e,t,actor,true))]
    })
  }
}
