import type { GuideSource } from './matchup-guide'

/** Ordinary turn rules supported by the causal contract. Card effects and
 * exceptional permissions still require independent review, never inference. */
export function validateTurnLegality(events:any[],sources:GuideSource[],firstSide:string):void{
  const cards=new Map<string,any>()
  for(const source of sources.filter(s=>s.kind==='card')){try{const c=JSON.parse(source.content);cards.set(c.printId,c)}catch{/* Evidence gates handle absent text. */}}
  const turns=new Map<number,{supporters:number;manual:number;played:Set<string>}>()
  for(const e of events){
    if(e.turn===0)continue
    const expected=e.turn%2===1?firstSide:firstSide==='ours'?'opponent':'ours'
    const label=`Turno ${e.turn} ${e.side}, ${e.description}`
    if(e.side!==expected)throw new Error(`${label}: attore incoerente con l’ordine dei turni.`)
    const use=turns.get(e.turn)??{supporters:0,manual:0,played:new Set<string>()};turns.set(e.turn,use)
    if(e.turn===1&&e.attackName!=null)throw new Error(`${label}: il primo giocatore non può attaccare nel suo primo turno.`)
    if(e.trainer!=null){
      const card=cards.get(e.trainer)
      if(card?.category!=='Trainer'||!e.moves.some((m:any)=>m.side===e.side&&m.printId===e.trainer&&m.count===1&&m.from==='hand'&&m.to!=='hand'))throw new Error(`${label}: Trainer dichiarato senza giocata tracciata dalla mano.`)
      if(card.gameplay?.trainerType==='Supporter'){
        if(e.turn===1)throw new Error(`${label}: ${card.name} è un Supporter; vietato al primo giocatore nel primo turno.`)
        if(++use.supporters>1)throw new Error(`${label}: più di un Supporter giocato nello stesso turno.`)
      }
      use.played.add(e.trainer)
    }
    for(const route of e.energyRoutes??[]){
      const attached=route.path.slice(1).includes('attached')
      if(attached){
        if(!['manual','effect'].includes(route.attachment))throw new Error(`${label}: assegnazione Energia senza modalità manual/effect.`)
        if(route.attachment==='manual'){
          if(route.side!==e.side||route.path.length!==2||route.path[0]!=='hand'||route.path[1]!=='attached'||(use.manual+=route.count)>1)throw new Error(`${label}: assegnazione manuale non valida o già usata.`)
        }else if(!route.sourceIds.some((id:string)=>{const c=cards.get(id.replace(/^card:/,''));return c&&c.category!=='Energy'}))throw new Error(`${label}: assegnazione da effetto senza carta che la consenta.`)
      }
      for(const id of route.sourceIds){
        const card=cards.get(id.replace(/^card:/,''))
        if(card?.gameplay?.trainerType==='Supporter'&&!use.played.has(card.printId))throw new Error(`${label}: effetto di ${card.name} senza Supporter legalmente giocato in questo turno.`)
      }
    }
    const firstOwn=e.side===firstSide?1:2
    if(e.turn===firstOwn&&e.attackName==null&&e.moves.some((m:any)=>m.side===e.side&&m.from==='hand'&&['active','bench'].includes(m.to)&&cards.get(m.printId)?.stage!=='Basic'&&cards.get(m.printId)?.category==='Pokemon'&&e.moves.some((p:any)=>p.side===e.side&&p.from===m.to&&p.to==='evolution')))
      throw new Error(`${label}: evoluzione ordinaria nel primo turno del giocatore; scegliere un setup legale.`)
  }
}
