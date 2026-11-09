import type {GuideContent,GuideList,GuideSource} from '../shared/matchup-guide'
import type {GuidePacket} from './matchup-guide-packet'

export interface GuideOpeningAllocation {
  caseId:string;opening:Record<'ours'|'opponent',{active:string;bench:string[];hand:string[];prizes:string[]}>
  remainingDeck:Record<'ours'|'opponent',{printId:string;count:number}[]>
}
const cardMap=(sources:GuideSource[])=>{
  const result=new Map<string,any>()
  for(const s of sources.filter(s=>s.kind==='card'))try{const c=JSON.parse(s.content);if(c&&typeof c.printId==='string')result.set(c.printId,c)}catch{/* Text-only supporting evidence is preserved; existing source gates still apply. */}
  return result
}

/** Count the exact 60-card list before constructing events. No selected card is
 * moved, substituted or silently removed to make an opening fit. */
function checkedOpeningAllocations(raw:unknown,packet:GuidePacket,opponentId:string,caseIds:string[]):GuideOpeningAllocation[]{
  const opponent=packet.opponentLists.find(l=>l.id===opponentId),cards=cardMap(packet.sources)
  if(!opponent||!Array.isArray(raw)||raw.length!==caseIds.length||new Set(raw.map(r=>r?.id)).size!==caseIds.length||raw.some(r=>!caseIds.includes(r?.id)))throw new Error(`Piano: servono allocazioni iniziali distinte ${caseIds.join('/')} per la lista avversaria selezionata.`)
  return raw.map(r=>{
    const remainingDeck={} as GuideOpeningAllocation['remainingDeck']
    for(const side of ['ours','opponent'] as const){
      const o=r.opening?.[side],list=side==='ours'?packet.ourList:opponent
      if(!o||typeof o.active!=='string'||!Array.isArray(o.hand)||o.hand.length!==6||!Array.isArray(o.prizes)||o.prizes.length!==6||!Array.isArray(o.bench)||o.bench.length>5||[...o.hand,...o.prizes,...o.bench].some(id=>typeof id!=='string'))throw new Error(`${r.id}: allocazione ${side} incompleta: un Attivo, sei carte in mano e sei Premi; Panchina tratta dalla mano.`)
      const basic=(id:string)=>cards.get(id)?.category==='Pokemon'&&cards.get(id)?.stage==='Basic'
      if(!basic(o.active)||o.bench.some((id:string)=>!basic(id)))throw new Error(`${r.id}: allocazione ${side}, Attivo/Panchina richiedono Pokémon Base verificati.`)
      const hand=new Map<string,number>();for(const id of o.hand)hand.set(id,(hand.get(id)??0)+1)
      for(const id of o.bench){if(!(hand.get(id)??0))throw new Error(`${r.id}: ${side}, Panchina ${id} non disponibile nella mano iniziale.`);hand.set(id,hand.get(id)!-1)}
      const stock=new Map(list.cards.map(c=>[c.printId,c.count]))
      for(const id of [o.active,...o.hand,...o.prizes]){if(!(stock.get(id)??0))throw new Error(`${r.id}: allocazione ${side}, ${id} eccede la lista: mani e Premi consumano le stesse copie.`);stock.set(id,stock.get(id)!-1)}
      remainingDeck[side]=[...stock].map(([printId,count])=>({printId,count}))
      if([...stock.values()].reduce((a,b)=>a+b,0)!==47)throw new Error(`${r.id}: mazzo residuo iniziale diverso da 47.`)
    }
    return {caseId:r.id,opening:structuredClone(r.opening),remainingDeck}
  })
}
export function readOpeningAllocations(raw:unknown,packet:GuidePacket,opponentId:string):GuideOpeningAllocation[]{return checkedOpeningAllocations(raw,packet,opponentId,['scenario-1','scenario-2'])}
export function readRebuiltOpening(caseId:string,opening:unknown,packet:GuidePacket,opponentId:string):GuideOpeningAllocation{return checkedOpeningAllocations([{id:caseId,opening}],packet,opponentId,[caseId])[0]}

/** Initial events use the AI's already-validated allocation from the plan.
 * The scenario output must not contain a second, potentially conflicting copy. */
export function withAllocatedOpening(raw:any,allocation:GuideOpeningAllocation):any{
  if(!Array.isArray(raw?.scenarios)||raw.scenarios.length!==1||raw.scenarios[0].id!==allocation.caseId||Object.hasOwn(raw.scenarios[0],'opening'))throw new Error('Scenario iniziale: usare l’allocazione fornita, senza duplicare o cambiare opening nell’output.')
  return {...raw,scenarios:[{...raw.scenarios[0],opening:structuredClone(allocation.opening)}]}
}

/** Complete printed chains from the selected lists. They are candidates to
 * examine against timing/access/costs, never certified available actions. */
export function developmentCandidates(packet:GuidePacket,opponentId?:string){
  const cards=cardMap(packet.sources),lists:GuideList[]=[packet.ourList,...packet.opponentLists.filter(l=>!opponentId||l.id===opponentId)]
  return lists.map(list=>{
    const pokemon=list.cards.filter(c=>cards.get(c.printId)?.category==='Pokemon')
    const routes:any[]=[]
    for(const base of pokemon){
      const visit=(ids:string[])=>{
        if(ids.length>1)routes.push({printIds:ids,sourceIds:ids.map(id=>'card:'+id),stages:ids.map(id=>{const c=cards.get(id);return {printId:id,name:c.name,stage:c.stage,evolveFrom:c.gameplay?.evolveFrom??null,attacks:c.gameplay?.attacks??[],abilities:c.gameplay?.abilities??[]}})})
        if(ids.length>=3)return
        for(const next of pokemon)if(!ids.includes(next.printId)&&cards.get(next.printId)?.gameplay?.evolveFrom===cards.get(ids.at(-1)!)?.name)visit([...ids,next.printId])
      };visit([base.printId])
    }
    return {listId:list.id,side:list.id===packet.ourList.id?'ours':'opponent',routes,accessAndTimingSources:list.cards.filter(c=>cards.get(c.printId)?.category==='Trainer').map(c=>({printId:c.printId,sourceId:'card:'+c.printId,effect:cards.get(c.printId)?.gameplay?.effect??null})),candidateOnly:true}
  })
}

/** Give the critic a short, explicit provenance index before the compact
 * projected draft. Full native data remain in the owning archive/report. */
export function guideReviewFacts(content:GuideContent,sources:GuideSource[]){
  const cards=cardMap(sources),energy=new Set([...cards].filter(([,c])=>c.category==='Energy').map(([id])=>id))
  const countEnergy=(v:any):number=>!v||typeof v!=='object'?0:Array.isArray(v)?v.reduce((n,x)=>n+countEnergy(x),0):Object.entries(v).reduce((n,[key,x])=>n+(key==='moves'&&Array.isArray(x)?x.filter(m=>energy.has(m.printId)).length:countEnergy(x)),0)
  return content.scenarios.map(s=>({scenarioId:s.id,representation:'app-projected-ledger',nativeEnergyMoves:countEnergy({firstOpponentTurn:(s as any).firstOpponentTurn,setupRounds:(s as any).setupRounds,turns:(s as any).turns,branches:s.replyComparison?.options.map(o=>({id:o.id,turns:(o as any).turns}))}),projectedEnergyMoves:countEnergy({setupLedger:s.setupLedger,lineEvents:(s as any).lineEvents,branches:s.replyComparison?.options.map(o=>({id:o.id,expandedLineEvents:(o as any).expandedLineEvents}))}),tacticalIndex:s.tacticalAudit?.map(r=>({lineIds:r.lineIds,turn:r.turn,side:r.side,attacks:r.attacks,cards:r.cards})),note:'Il divieto di Energie in moves riguarda soltanto gli eventi NATIVI. I moves del draft normalizzato includono correttamente gli archi di energyRoutes; non sono seconde copie o nuove dichiarazioni AI. L’indice tattico contiene le righe realmente consegnate: verificarlo prima di dichiarare un attacco omesso. Questi fatti non certificano legalità o qualità delle scelte.'}))
}
