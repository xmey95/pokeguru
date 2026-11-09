import type { GuideContent, GuideList, GuideSource } from './matchup-guide'

/** Conservative candidates from actual zones, not an assertion that a play is legal. */
export function guideOpportunities(content: GuideContent, packet: { ourList: GuideList; opponentLists: GuideList[]; sources: GuideSource[];basis?:{promptVersion:string} }) {
  const causal=['matchup-guide-11','matchup-guide-12','matchup-guide-13','matchup-guide-14','matchup-guide-15','matchup-guide-16','matchup-guide-17','matchup-guide-18','matchup-guide-19','matchup-guide-20','matchup-guide-21','matchup-guide-22','matchup-guide-23','matchup-guide-24','matchup-guide-25','matchup-guide-26','matchup-guide-27','matchup-guide-28'].includes(packet.basis?.promptVersion??'')
  const cards = new Map<string, any>()
  for (const source of packet.sources.filter(s => s.kind === 'card')) {
    try { const c = JSON.parse(source.content); cards.set(c.printId, c) } catch { /* Existing evidence gates handle missing card text. */ }
  }
  const result: { scenarioId: string; turn: number; side: string; printId: string; kind: string; sourceId: string; detail: string }[] = []
  for (const s of content.scenarios) {
    const seen = new Set<string>(), zones = new Map<string, number>()
    const remember = (turn: number, side: string, printId: string, kind: string, detail: string) => {
      const id = `${turn}|${side}|${printId}|${kind}`
      if (!seen.has(id)) { seen.add(id); result.push({ scenarioId: s.id, turn, side, printId, kind, sourceId: `card:${printId}`, detail }) }
    }
    const scan = (turn: number, side: string) => {
      const board = [...zones].filter(([k,n]) => n > 0 && k.startsWith(`${side}|`) && /\|(active|bench)$/.test(k))
      const bench = board.filter(([k]) => k.endsWith('|bench')).map(([k]) => k.split('|')[1])
      for (const [k, n] of zones) {
        if (n <= 0 || !k.startsWith(`${side}|`)) continue
        const [, printId, zone] = k.split('|'), card = cards.get(printId), game = card?.gameplay
        if (!game) continue
        if (zone === 'hand' && game.trainerType === 'Supporter') remember(turn, side, printId, 'supporter', 'In mano: confrontare uso, costo, limite del Supporter e sviluppo prima dell’attacco.')
        if(causal&&zone==='hand'&&card.category==='Trainer'&&game.trainerType!=='Supporter')remember(turn,side,printId,`trainer:${game.trainerType??'unknown'}`,'In mano prima dell’azione: verificare accessi e ordine, incluso l’uso prima di evolvere. Controllare Item lock, costi e testo originale.')
        if (zone === 'hand' && game.evolveFrom && board.some(([key]) => cards.get(key.split('|')[1])?.name === game.evolveFrom))
          remember(turn, side, printId, 'evolution', `In mano; preevoluzione in campo. Verificare timing, evoluzione e accessi aggiuntivi prima dell’attacco.`)
        if (zone === 'active' || zone === 'bench') {
          for (const a of game.abilities ?? []) remember(turn, side, printId, `ability:${a.name}`, 'In campo: verificare Abilità già usate, costi, limiti e accessi a ricerca/recupero/pesca.')
          if(['matchup-guide-12','matchup-guide-13','matchup-guide-14','matchup-guide-15','matchup-guide-16','matchup-guide-17','matchup-guide-18','matchup-guide-19','matchup-guide-20','matchup-guide-21','matchup-guide-22','matchup-guide-23','matchup-guide-24','matchup-guide-25','matchup-guide-26','matchup-guide-27','matchup-guide-28'].includes(packet.basis?.promptVersion??''))for(const a of game.attacks??[])remember(turn,side,printId,`attack:${a.name}`,`Attacco già sul campo (${zone}): ${a.name}, costo ${JSON.stringify(a.cost??[])}, danno stampato ${a.damage??'effetto'}. Confrontare Energie disponibili/manuale, PS bersaglio, promozione o ritirata PRIMA di richiedere un'evoluzione; non è una mossa certificata.`)
        }
        if (zone === 'active' && bench.length) remember(turn, side, printId, 'defensive-retreat', `Attivo con Panchina (${bench.join(', ')}), costo stampato ${game.retreat ?? 'non disponibile'}. Verificare Energie sul Pokémon, modificatori, cura e ritirata: meno danno immediato può evitare la sconfitta. Non assumere legalità dalla sola presenza delle carte.`)
      }
    }
    const add = (side: string, print: string, zone: string, delta: number) => { const k = `${side}|${print}|${zone}`; zones.set(k, (zones.get(k) ?? 0) + delta) }
    for (const c of s.setupLedger?.openingHands ?? []) add(c.side,c.printId,'hand',c.count)
    for (const c of s.setupLedger?.openingPrizes ?? []) add(c.side,c.printId,'prizes',c.count)
    const replay = (events: any[]) => { for (const e of events) {
      if (e.turn > 0) scan(e.turn,e.side)
      if(causal&&e.moves?.some((m:any)=>['active','bench'].includes(m.from)&&m.to==='evolution'))for(const [k,n] of zones){
        const [side,printId,zone]=k.split('|')
        if(n>0&&side===e.side&&zone==='hand'&&cards.get(printId)?.category==='Trainer')remember(e.turn,side,printId,'before-evolution-order','Disponibile PRIMA dell’evoluzione registrata: confrontare gli accessi alternativi prima di scegliere l’ordine, senza giustificare una rinuncia con un vincolo creato dall’azione scelta.')
      }
      for(const m of e.moves??[]) if(m.from==='bench'&&m.to==='active'){
        const active=[...zones].filter(([k,n])=>n>0&&k.startsWith(`${m.side}|`)&&k.endsWith('|active')).reduce((n,[,v])=>n+v,0)
        if(!active)for(const [k,n] of zones)if(n>0&&k.startsWith(`${m.side}|`)&&k.endsWith('|bench'))remember(e.turn,m.side,k.split('|')[1],'promotion-choice','Possibile promozione dalla Panchina dopo KO: confrontare la promozione diretta con promuovere un altro Pokémon e pagarne la ritirata. Verificare Energie conservate, Abilità e attaccante del turno successivo; distinguere copie con assegnazioni diverse.')
      }
      for (const m of e.moves ?? []) { add(m.side,m.printId,m.from,-m.count); add(m.side,m.printId,m.to,m.count) }
      if(causal&&e.kind==='retreat'){
        const energy=(e.moves??[]).filter((m:any)=>m.from==='attached'&&m.to==='discard'&&cards.get(m.printId)?.category==='Energy')
        if(energy.length)for(const [k,n] of zones){
          const [side,printId,zone]=k.split('|'),card=cards.get(printId)
          if(n>0&&side===e.side&&((zone==='hand'&&card?.category==='Trainer')||(['active','bench'].includes(zone)&&card?.gameplay?.abilities?.length)))remember(e.turn,side,printId,`after-retreat-access:${energy.map((m:any)=>m.printId).join(',')}`,`Dopo la ritirata sono disponibili negli scarti: ${energy.map((m:any)=>`${m.printId} ×${m.count}`).join(', ')}. Rivalutare recuperi, Abilità, assegnazioni e sviluppo PRIMA dell’attacco.`)
        }
      }
      if (e.turn > 0) scan(e.turn,e.side)
    } }
    replay(s.setupLedger?.events ?? [])
    const initial = new Map(zones), main = (s as any).lineEvents ?? []
    replay(main)
    for (const o of s.replyComparison?.options ?? []) {
      zones.clear(); for (const [k,n] of initial) zones.set(k,n)
      replay((o as any).expandedLineEvents??[...main.slice(0,(o as any).forkAtEvent ?? 0), ...((o as any).lineEvents ?? [])])
    }
  }
  return result
}
