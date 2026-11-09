import type { GuideScenario, GuideSource } from './matchup-guide'

function cardsOf(sources:GuideSource[]){
  const cards=new Map<string,any>()
  for(const s of sources.filter(s=>s.kind==='card'))try{const c=JSON.parse(s.content);cards.set(c.printId,c)}catch{/* Missing card data is rejected when required below or by source gates. */}
  return cards
}

/** Construct accounting only from declared sources and complete witness branches.
 * This does not prove card effects, damage, optimality or an excluded alternative. */
export function prepareResponseConstruction(s:any,sources:GuideSource[]){
  const cards=cardsOf(sources)
  for(const r of s.retreatCosts??[]){
    const printed=cards.get(r.printId)?.gameplay?.retreat
    if(!Number.isSafeInteger(printed)||printed<0)throw new Error(`${s.id}: costo stampato non disponibile per ${r.printId}.`)
    r.printedCost=printed
  }
}

export function validateConstructedRetreats(s:any){
  const paths=[s.setupEvents,s.lineEvents,...(s.replyComparison?.options??[]).map((o:any)=>o.lineEvents)]
  for(const events of paths)for(const e of events??[]){
    if(e.kind!=='retreat'){
      if(e.retreatCostId!=null)throw new Error(`${s.id}: riferimento di ritirata fuori da una ritirata.`)
      continue
    }
    const r=s.retreatCosts?.find((r:any)=>r.id===e.retreatCostId)
    if(!r||r.side!==e.side||!e.moves.some((m:any)=>m.side===e.side&&m.printId===r.printId&&m.from==='active'&&m.to==='bench'&&m.count===1)||
      !e.moves.some((m:any)=>m.side===e.side&&m.from==='bench'&&m.to==='active'&&m.count===1))throw new Error(`${s.id}: ritirata senza retreatCostId e scambio Attivo/Panchina coerente col costo.`)
  }
}

export function deriveOmissionWitnesses(s:GuideScenario,complete=false,comparisonScope:'historical'|'declared-lines'='historical'){
  const c=s.replyComparison
  if(!c)return
  if(comparisonScope==='declared-lines'){
    if(c.omissionTests.length)throw new Error(`${s.id}: il confronto finito non ammette prove di rimozione o minime globali.`)
    return
  }
  if(complete){
    const minimum=c.options.find(o=>o.id===c.minimumReplyId)
    const required=minimum?.requiredCards??[],ids=new Set(required.map(r=>r.printId))
    const missing=required.filter(r=>!c.omissionTests.some(t=>t.printId===r.printId))
    const extra=c.omissionTests.filter(t=>!ids.has(t.printId)),duplicates=c.omissionTests.filter((t,i,all)=>all.findIndex(v=>v.printId===t.printId)!==i)
    if(missing.length||extra.length||duplicates.length)throw new Error(`${s.id}: PROVE DI RIMOZIONE INCOMPLETE. Replica minima=${c.minimumReplyId}; nuove copie impiegate=${JSON.stringify(required)}; prove mancanti=${JSON.stringify(missing.map(r=>r.printId))}; prove estranee=${JSON.stringify(extra.map(r=>r.printId))}; duplicate=${JSON.stringify(duplicates.map(r=>r.printId))}. Includere anche le Energie impiegate tramite energyRoutes, non solo manuali o specificDraws. Per ciascuna stampa mancante dichiarare witnessReplyId e reason dopo aver verificato un ramo positivo completo nel budget ridotto, oppure zero realmente dimostrato con null; nessuna prova o esclusione viene inventata dall'app.`)
  }
  for(const t of c.omissionTests){
    const witness=c.options.find(o=>o.id===t.witnessReplyId)
    if(t.witnessReplyId!=null&&!witness)throw new Error(`${s.id}: ramo testimone ${t.witnessReplyId} assente: costruirlo prima della prova di rimozione.`)
    // null is a substantive claim of zero achievable damage, still checked by
    // the independent critic. Never invent a positive witness or waive budgets.
    Object.assign(t,{terms:witness?[...witness.terms]:[0],multiplier:witness?.multiplier??1,remainingDamage:witness?.damage??0})
  }
}

/** All printed attacks on the opponent's board before and during its reply.
 * A candidate is not a legal move: cost, retreat, timing and KO need review. */
export function responseAttackCandidates(s:GuideScenario,sources:GuideSource[]){
  const cards=cardsOf(sources),result=new Map<string,{printId:string;attackName:string}>()
  const paths=[(s as any).lineEvents??[],...(s.replyComparison?.options??[]).map(o=>(o as any).expandedLineEvents??[])]
  for(const events of paths){
    const board=new Map<string,number>()
    const add=(p:string,n:number)=>board.set(p,(board.get(p)??0)+n)
    for(const r of s.inventory)if(r.side==='opponent'&&['active','bench'].includes(r.zone))add(r.printId,r.count)
    const turn=s.replyComparison?.options[0]?.replyTurn
    const remember=()=>{for(const [printId,n]of board)if(n>0)for(const a of cards.get(printId)?.gameplay?.attacks??[])result.set(`${printId}|${a.name}`,{printId,attackName:a.name})}
    let started=false
    for(const e of events){
      if(e.turn>turn!)break
      if(e.turn===turn&&!started){remember();started=true}
      for(const m of e.moves??[])if(m.side==='opponent'){
        if(['active','bench'].includes(m.from))add(m.printId,-m.count)
        if(['active','bench'].includes(m.to))add(m.printId,m.count)
      }
      if(started)remember()
    }
    if(!started)remember()
  }
  return [...result.values()]
}

export function checkResponseAttackReview(s:GuideScenario,sources:GuideSource[]):string[]{
  const rows=(s.replyComparison as any)?.attackReview,errors:string[]=[]
  if(!Array.isArray(rows))return [`${s.id}: confronto degli attacchi disponibili mancante.`]
  const key=(r:any)=>`${r.printId}|${r.attackName}`,candidates=responseAttackCandidates(s,sources)
  if(new Set(rows.map(key)).size!==rows.length)errors.push(`${s.id}: attacchi confrontati duplicati.`)
  for(const c of candidates)if(!rows.some(r=>key(r)===key(c)))errors.push(`${s.id}: attacco da confrontare prima di escludere KO/ritirata: ${c.printId} / ${c.attackName}.`)
  for(const r of rows){
    if(!candidates.some(c=>key(c)===key(r))||typeof r.reason!=='string'||!r.reason.trim())errors.push(`${s.id}: esclusione di attacco senza candidato o motivazione verificabile.`)
    if(r.replyId!=null){
      const option=s.replyComparison?.options.find(o=>o.id===r.replyId)
      if(!option||!(option as any).expandedLineEvents?.some((e:any)=>e.turn===option.replyTurn&&e.side==='opponent'&&e.attackerPrintId===r.printId&&e.attackName===r.attackName))errors.push(`${s.id}: attacco confrontato senza ramo che lo esegua: ${r.printId} / ${r.attackName}.`)
    }
  }
  return errors
}
