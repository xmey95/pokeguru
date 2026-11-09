import type { GuideScenario, GuideSource } from './matchup-guide'
import type { GuideSetupLedger } from './guide-setup-ledger'

type CostEvent = Pick<GuideSetupLedger['events'][number], 'turn' | 'side' | 'kind' | 'moves'>

/** Cost of additional physical copies employed in one declared response turn.
 * Identical recovered copies are reused before consuming another copy. This is
 * a ledger witness; effect legality and tactical optimality still need review. */
export function replyCost(s: GuideScenario, events: CostEvent[], turn: number, sources: GuideSource[]) {
  const zones = new Map<string, string[]>(), prints = new Map<string,string>(), serial = new Map<string,number>()
  const key=(side:string,print:string,zone:string)=>`${side}|${print}|${zone}`
  for(const r of s.inventory) for(let i=0;i<r.count;i++){
    const type=`${r.side}|${r.printId}`,n=serial.get(type)??0,id=`${type}|${n}`;serial.set(type,n+1);prints.set(id,r.printId)
    const k=key(r.side,r.printId,r.zone);zones.set(k,[...zones.get(k)??[],id])
  }
  const energy=new Set<string>()
  for(const source of sources.filter(s=>s.kind==='card')){try{const c=JSON.parse(source.content);if(c.category==='Energy')energy.add(c.printId)}catch{/* Existing gates handle missing text. */}}
  const spent=new Set<string>(),existing=new Set<string>();let started=false,seen=false,attachments=0,retreatEnergy=0
  for(const e of events){
    if(e.turn===turn&&!started){
      started=true
      for(const [k,ids] of zones) if(k.startsWith('opponent|')&&/\|(active|bench|evolution|attached|stadium)$/.test(k)) for(const id of ids)existing.add(id)
    }
    const inTurn=e.turn===turn
    if(inTurn&&e.side!=='opponent')throw new Error(`${s.id}: il turno della replica deve appartenere all’avversario.`)
    if(inTurn&&e.side==='opponent')seen=true
    for(const m of e.moves){
      const from=key(m.side,m.printId,m.from),to=key(m.side,m.printId,m.to),pool=zones.get(from)??[]
      if(pool.length<m.count)throw new Error(`${s.id}: costo della replica non ricostruibile.`)
      pool.sort((a,b)=>Number(spent.has(b)||existing.has(b))-Number(spent.has(a)||existing.has(a)))
      const moved=pool.splice(0,m.count);zones.set(from,pool);zones.set(to,[...zones.get(to)??[],...moved])
      if(inTurn&&m.side==='opponent'){
        if(['active','bench','evolution','attached','stadium','discard','lost'].includes(m.to)) for(const id of moved)if(!existing.has(id))spent.add(id)
        if(m.to==='attached'&&energy.has(m.printId))attachments+=m.count
        if(e.kind==='retreat'&&m.from==='attached'&&m.to==='discard'&&energy.has(m.printId))retreatEnergy+=m.count
      }
    }
  }
  if(!seen)throw new Error(`${s.id}: turno della replica assente dal registro.`)
  const counts=new Map<string,number>();for(const id of spent){const print=prints.get(id)!;counts.set(print,(counts.get(print)??0)+1)}
  return {requiredCards:[...counts].map(([printId,count])=>({printId,count,access:`Copie aggiuntive impiegate nel turno ${turn}; accesso e costi sono nei movimenti del ramo.`})),attachments,retreatEnergy}
}
