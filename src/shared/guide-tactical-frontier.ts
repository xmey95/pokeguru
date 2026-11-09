import type {GuideScenario,GuideSource} from './matchup-guide'

export interface GuideTacticalAudit {
  lineIds:string[]; turn:number; side:'ours'|'opponent'
  attacks:{printId:string;attackName:string}[]; cards:string[]; comparison:string
  promotions?:{side:'ours'|'opponent';printId:string;reason:string}[]
}
export interface GuideTacticalFrontier {
  lineId:string; turn:number; side:'ours'|'opponent'
  attacks:{printId:string;attackName:string}[]
  cards:{printId:string;zones:string[];maximumCopies:number}[]
  promotions:{side:string;printIds:string[]}[]
}

/** Union of candidates BEFORE and AFTER every event, separately for every line.
 * Presence is a reason to compare a choice, never proof that it is legal. */
export function tacticalFrontier(s:GuideScenario,sources:GuideSource[],version:1|2=1):GuideTacticalFrontier[]{
  const cards=new Map<string,any>()
  for(const source of sources.filter(s=>s.kind==='card')){try{const c=JSON.parse(source.content);cards.set(c.printId,c)}catch{/* Other evidence gates report missing text. */}}
  let zones=new Map<string,number>()
  const groups=new Map<string,GuideTacticalFrontier>()
  const add=(side:string,id:string,zone:string,n:number)=>{const k=[side,id,zone].join('|');zones.set(k,(zones.get(k)??0)+n)}
  for(const c of s.setupLedger?.openingHands??[])add(c.side,c.printId,'hand',c.count)
  for(const c of s.setupLedger?.openingPrizes??[])add(c.side,c.printId,'prizes',c.count)
  const scan=(g:GuideTacticalFrontier)=>{
    for(const [k,n]of zones){
      const [side,printId,zone]=k.split('|'),card=cards.get(printId)
      if(n<=0||side!==g.side||!card)continue
      const board=zone==='active'||zone==='bench'
      if(!board&&!(version===2&&zone==='attached')&&zone!=='hand'&&!(zone==='discard'&&['Pokemon','Energy'].includes(card.category)))continue
      let item=g.cards.find(c=>c.printId===printId)
      if(!item){item={printId,zones:[],maximumCopies:n};g.cards.push(item)}
      if(!item.zones.includes(zone))item.zones.push(zone);item.maximumCopies=Math.max(item.maximumCopies,n)
      if(board)for(const a of card.gameplay?.attacks??[])if(!g.attacks.some(v=>v.printId===printId&&v.attackName===a.name))g.attacks.push({printId,attackName:a.name})
    }
  }
  const replay=(lineId:string,events:any[])=>{
    for(const e of events){
      let group:GuideTacticalFrontier|undefined
      if(e.turn>0){
        const key=[lineId,e.turn,e.side].join('|')
        group=groups.get(key)
        if(!group){group={lineId,turn:e.turn,side:e.side,attacks:[],cards:[],promotions:[]};groups.set(key,group)}
        scan(group)
        for(const m of e.moves??[])if(m.from==='bench'&&m.to==='active'&&!(zones.get(`${m.side}|${m.printId}|active`)??0)){
          const active=[...zones].some(([k,n])=>n>0&&k.startsWith(m.side+'|')&&k.endsWith('|active'))
          if(!active){const ids=[...zones].filter(([k,n])=>n>0&&k.startsWith(m.side+'|')&&k.endsWith('|bench')).map(([k])=>k.split('|')[1])
            if(!group.promotions.some(p=>p.side===m.side&&JSON.stringify(p.printIds)===JSON.stringify(ids)))group.promotions.push({side:m.side,printIds:ids})
          }
        }
      }
      for(const m of e.moves??[]){add(m.side,m.printId,m.from,-m.count);add(m.side,m.printId,m.to,m.count)}
      if(group)scan(group)
    }
  }
  replay('setup',s.setupLedger?.events??[])
  const initial=new Map(zones)
  replay('main',(s as any).lineEvents??[])
  for(const option of s.replyComparison?.options??[]){zones=new Map(initial);replay(option.id,(option as any).expandedLineEvents??[])}
  return [...groups.values()]
}

export function validTacticalAudit(value:unknown):value is GuideTacticalAudit[]{
  return Array.isArray(value)&&value.length<=60&&value.every(v=>v&&Array.isArray(v.lineIds)&&v.lineIds.length>0&&v.lineIds.length<=10&&new Set(v.lineIds).size===v.lineIds.length&&v.lineIds.every((id:any)=>typeof id==='string'&&id.length>0&&id.length<=160)&&Number.isSafeInteger(v.turn)&&v.turn>0&&['ours','opponent'].includes(v.side)&&Array.isArray(v.attacks)&&v.attacks.length<=60&&v.attacks.every((a:any)=>a&&typeof a.printId==='string'&&typeof a.attackName==='string')&&Array.isArray(v.cards)&&v.cards.length<=60&&v.cards.every((c:any)=>typeof c==='string')&&typeof v.comparison==='string'&&v.comparison.trim().length>0&&v.comparison.length<=1600)
}

export function checkTacticalAudit(s:GuideScenario,sources:GuideSource[],version:1|2=1):string[]{
  const fail=(m:string)=>`${s.id}: ${m}`,audit=s.tacticalAudit
  if(!validTacticalAudit(audit))return [fail('tacticalAudit mancante o non valido: confrontare setup, linea e ogni ramo prima di fissare la tesi.')]
  const expected=tacticalFrontier(s,sources,version),key=(v:{lineId:string;turn:number;side:string})=>[v.lineId,v.turn,v.side].join('|'),errors:string[]=[],seen=new Set<string>()
  if(s.replyComparison?.options.some(o=>['setup','main'].includes(o.id)))errors.push(fail('ID replica riservato: setup/main.'))
  const known=new Map<string,any>();for(const source of sources.filter(s=>s.kind==='card')){try{const c=JSON.parse(source.content);known.set(c.printId,c)}catch{/* Checked separately */}}
  for(const row of audit){for(const lineId of row.lineIds){const id=key({...row,lineId})
    if(seen.has(id)||!expected.some(g=>key(g)===id))errors.push(fail(`audit tattico duplicato o estraneo ${id}.`));seen.add(id)
    if(new Set(row.cards).size!==row.cards.length||row.cards.some(id=>!known.has(id)))errors.push(fail(`carte dell'audit non valide in ${id}.`))
    const attacks=new Set<string>()
    for(const a of row.attacks){const pair=a.printId+'|'+a.attackName
      if(attacks.has(pair)||!known.get(a.printId)?.gameplay?.attacks?.some((v:any)=>v.name===a.attackName))errors.push(fail(`attacco dell'audit non valido ${pair} in ${id}.`));attacks.add(pair)
    }
  }
  }
  for(const g of expected){const row=audit.find(r=>r.turn===g.turn&&r.side===g.side&&r.lineIds.includes(g.lineId));if(!row){errors.push(fail(`audit tattico omesso ${key(g)}.`));continue}
    for(const a of g.attacks)if(!row.attacks.some(v=>v.printId===a.printId&&v.attackName===a.attackName))errors.push(fail(`alternativa omessa in ${key(g)}: ${a.printId} / ${a.attackName}, anche prima di evolvere o dalla Panchina.`))
    for(const c of g.cards)if(!row.cards.includes(c.printId))errors.push(fail(`accesso/sviluppo omesso in ${key(g)}: ${c.printId} (${c.zones.join('/')}).`))
    for(const p of g.promotions)for(const id of p.printIds)if(!row.cards.includes(id))errors.push(fail(`promozione diretta omessa in ${key(g)}: ${p.side} / ${id}.`))
  }
  return errors
}
