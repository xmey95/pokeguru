import type { GuideScenario,GuideSource } from './matchup-guide'

export class GuidePositionAnnotationError extends Error {}

/** Display facts come from the executed trace. Strategic reasons remain AI
 * judgments and must still pass the independent critic. */
export function deriveCausalDescriptions(s:GuideScenario & Record<string,any>,sources:GuideSource[],adjustedHp=false):void{
  const cards=new Map<string,any>()
  for(const source of sources.filter(s=>s.kind==='card')){try{const c=JSON.parse(source.content);cards.set(c.printId,c)}catch{/* Checked where needed. */}}
  s.title=s.decision
  s.positionNotes=guidePositionNotes({...s,positionAnnotations:s.positionAnnotations},sources,adjustedHp,s.lineEvents[0].turn)
  const lines:string[]=[s.decision]
  for(const [i,d] of (s.development??[]).entries()){
    const phase=['ours','opponent','next'][i],reason=s.developmentPlan[phase].reason,events=s.lineEvents.filter((e:any)=>e.turn===d.turn&&e.side===d.side)
    const attacks=events.filter((e:any)=>e.attackName!=null).map((e:any)=>`${cards.get(e.attackerPrintId)?.name??e.attackerPrintId}: ${e.attackName}`)
    const moved=[...new Set<string>(events.flatMap((e:any)=>e.moves.filter((m:any)=>m.side===d.side).map((m:any)=>`${m.printId} ${m.from}→${m.to}`)))]
    d.access=`Movimenti registrati nel turno: ${moved.join('; ')||'nessuno'}. ${reason}`
    d.nextAttack=attacks.length?attacks.join('; '):'Nessun attacco eseguito nel turno registrato.'
    const lastStep=s.steps[d.stepIndexes.at(-1)??0]
    lines.push(`Turno ${d.turn}, ${d.side}: ${d.nextAttack} Premi rimasti ${lastStep.after.ourPrizes}/${lastStep.after.opponentPrizes}. ${reason}`)
  }
  s.explanation=lines.join('\n\n')
  const comparison=s.replyComparison!
  for(const o of comparison.options){
    const events=(o as any).expandedLineEvents??[]
    o.sequence=events.filter((e:any)=>e.turn>=(o.replyTurn??0)&&e.prizeResolvedAt===undefined).map((e:any)=>e.description)
    if(!o.sequence.length)o.sequence=['La partita termina nel prefisso registrato.']
  }
  const preferred=comparison.options.find(o=>o.id===comparison.preferredReplyId)
  s.opponentResponse=preferred?`Risposta ${preferred.id}: ${preferred.outcome}`:'Risposta preferita non identificata.'
  s.pivot=s.developmentPlan.next.pivot
}

/** Same position/HP gate as the complete guide, usable before future turns exist. */
export function guidePositionNotes(s:Pick<GuideScenario,'id'|'inventory'>&{positionAnnotations:any[]},sources:GuideSource[],adjustedHp:boolean,firstTurn:number):string{
  const cards=new Map<string,any>()
  for(const source of sources.filter(s=>s.kind==='card')){try{const c=JSON.parse(source.content);cards.set(c.printId,c)}catch{/* Checked where needed. */}}
  const notes=[`Inizio del nostro turno ${firstTurn}.`]
  const board=s.inventory.filter(r=>r.zone==='active'||r.zone==='bench')
  const invalid=(message:string,annotation?:unknown,details?:unknown)=>new GuidePositionAnnotationError(`${s.id}: ${message} Campo risultante dal registro: ${JSON.stringify(board)}. Annotazione: ${JSON.stringify(annotation??null)}. Dettagli: ${JSON.stringify(details??null)}.`)
  if(!Array.isArray(s.positionAnnotations))throw invalid('annotazioni della posizione mancanti.')
  const seen=new Set<string>()
  for(const r of s.positionAnnotations){
    const count=s.inventory.filter(c=>c.side===r.side&&c.printId===r.printId&&c.zone===r.zone).reduce((n,c)=>n+c.count,0),card=cards.get(r.printId),key=`${r.side}|${r.printId}|${r.zone}|${r.copy}`
    let maximum=card?.gameplay?.hp
    if(adjustedHp){
      const a=r.hpAdjustment
      if(!a||!Number.isSafeInteger(a.amount)||Math.abs(a.amount)>500||!Array.isArray(a.sourceIds)||a.sourceIds.length>6||new Set(a.sourceIds).size!==a.sourceIds.length||(a.amount!==0&&!a.sourceIds.length)||a.sourceIds.some((id:any)=>typeof id!=='string'||!sources.some(s=>s.id===id&&s.kind==='card')||!s.inventory.some(v=>v.printId===id.replace(/^card:/,'')&&['active','bench','attached','stadium'].includes(v.zone))))throw invalid('modificatore PS senza fonte presente sul campo.',r)
      maximum+=a.amount
    }
    if(!['active','bench'].includes(r.zone)||!Number.isSafeInteger(r.copy)||r.copy<1||r.copy>count||seen.has(key)||!Number.isSafeInteger(r.damage)||r.damage<0||!Number.isFinite(maximum)||maximum<=0||r.damage>=maximum)
      throw invalid('danni/posizione non riferiti a un Pokémon vivo e presente.',r,{copiesPresent:count,maximumHp:maximum??null,duplicate:seen.has(key)})
    seen.add(key);notes.push(`${r.side}: ${card.name}, ${r.zone}, copia ${r.copy}: ${maximum-r.damage}/${maximum} PS${r.condition?`; ${r.condition}`:''}.`)
  }
  if(seen.size!==board.reduce((n,r)=>n+r.count,0))throw invalid('danni/condizioni mancanti per uno o più Pokémon in campo.')
  return notes.join('\n')
}
