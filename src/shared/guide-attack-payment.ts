import {basicEnergyType} from './basic-energy-name'
import type {GuideSource} from './matchup-guide'
export const attackEnergyTypes=['Grass','Fire','Water','Lightning','Psychic','Fighting','Darkness','Metal','Fairy','Colorless','Dragon'] as const
type Board={groups:{id:number;side:string;printId:string;zone:string;attached:{printId:string;count:number}[]}[];unknown:{side:string;printId:string;count:number;candidates:number[]}[]}
const type=(v:string)=>attackEnergyTypes.find(t=>t.toLowerCase()===v.toLowerCase())
/** Matching is per Energy unit: a rainbow unit pays one symbol, never several.
 * Conditional grants/reductions retain explicit sources and independent review. */
export function verifyAttackPayment(event:any,board:Board,sources:GuideSource[],present:Set<string>){
 const fail=(m:string):never=>{throw new Error(`Pagamento attacco, turno ${event.turn} ${event.side}: ${m}`)}
 if(!event.attack){if(event.attackPayment!=null)fail('prova su evento senza attacco.');return null}
 const cards=new Map<string,any>();for(const s of sources.filter(s=>s.kind==='card')){try{const c=JSON.parse(s.content);cards.set(c.printId,c)}catch{/* Evidence gates reject missing cards. */}}
 const active=board.groups.filter(g=>g.side===event.side&&g.zone==='active')
 if(active.length!==1||active[0].printId!==event.attack.printId)fail('Attivo e carta dell’attacco non coerenti.')
 const host=active[0],printed=cards.get(host.printId)?.gameplay?.attacks?.find((a:any)=>a.name===event.attack.attackName)
 if(!Array.isArray(printed?.cost))fail('costo stampato non disponibile.')
 const cost:string[]=printed.cost.filter((t:string)=>!['Free','None'].includes(t)).map((t:string)=>type(t)??fail('simbolo stampato non riconosciuto: '+t)),p=event.attackPayment
 if(!p||!Array.isArray(p.energy)||!Array.isArray(p.costAdjustments))fail('attackPayment con energy e costAdjustments obbligatorio, anche vuoti.')
 const hasText=(c:any)=>!!(c?.gameplay?.effect||c?.gameplay?.abilities?.some((a:any)=>a.effect)||c?.gameplay?.attacks?.some((a:any)=>a.effect))
 const proof=(ids:any,reason:any)=>{if(!Array.isArray(ids)||!ids.length||typeof reason!=='string'||!reason.trim())fail('fonte/motivazione mancante.');for(const id of ids){const c=cards.get(String(id).replace(/^card:/,''));if(!c||!hasText(c)||!present.has(id))fail('fonte di effetto non presente o senza ricevuta verificata: '+id)}return ids.map((id:string)=>cards.get(id.replace(/^card:/,'')))}
 for(const a of p.costAdjustments){if(!type(a.type)||!Number.isSafeInteger(a.amount)||Math.abs(a.amount)>10||!a.amount)fail('modificatore di costo non valido.');proof(a.sourceIds,a.reason);for(let i=0;i<Math.abs(a.amount);i++){if(a.amount>0)cost.push(a.type);else{const index=cost.indexOf(a.type);if(index>=0)cost.splice(index,1)}}}
 if(board.unknown.some(u=>u.count>0&&u.candidates.includes(host.id)&&cards.get(u.printId)?.category==='Energy'))fail('proprietario delle Energie ambiguo: dichiarare attachmentTargets prima di pagare.')
 const stock=new Map<string,number>();for(const a of host.attached)if(cards.get(a.printId)?.category==='Energy')stock.set(a.printId,(stock.get(a.printId)??0)+a.count)
 const units:{printId:string;copy:number;types:string[]}[]=[],seen=new Set<string>()
 for(const r of p.energy){const c=cards.get(r.printId),key=r.printId+'|'+r.copy;if(c?.category!=='Energy'||!Number.isSafeInteger(r.copy)||r.copy<1||r.copy>(stock.get(r.printId)??0)||seen.has(key)||!Array.isArray(r.units)||r.units.length>6||!r.units.length||r.units.some((u:any)=>!Array.isArray(u.types)||!u.types.length||u.types.some((v:any)=>!type(v))))fail('contributo non disponibile, duplicato o non valido: '+key);seen.add(key)
  const basic=basicEnergyType(c.name)
  let grants:any[]
  try{grants=proof(r.sourceIds,r.reason)}catch(error){
   if(basic&&error instanceof Error)throw new Error(error.message+' Le Energie Base ordinarie assegnate all’Attivo sono già conteggiate automaticamente: non inserirle in attackPayment.energy. Quel campo serve solo per contributi speciali/modificati; una Base modificata richiede un effetto non Energia applicabile e verificabile, non rules o la sola scheda della Base.')
   throw error
  }
  if(basic&&!grants.some((g:any)=>g.category!=='Energy'))fail('un’Energia Base fornisce un solo simbolo del proprio tipo; un cambiamento richiede un effetto non Energia.')
  if(!basic&&!r.sourceIds.includes('card:'+r.printId))fail('contributo speciale senza la fonte della stessa Energia.')
  for(const u of r.units)units.push({printId:r.printId,copy:r.copy,types:u.types})
 }
 for(const [id,count]of stock){const basic=basicEnergyType(cards.get(id)?.name??'');if(basic)for(let copy=1;copy<=count;copy++)if(!seen.has(id+'|'+copy))units.push({printId:id,copy,types:[type(basic)!]})}
 const required=[...cost].sort((a,b)=>Number(a==='Colorless')-Number(b==='Colorless')),assigned=new Map<number,number>()
 const match=(i:number,seen:Set<number>):boolean=>{for(let n=0;n<units.length;n++)if(!seen.has(n)&&(required[i]==='Colorless'||units[n].types.includes(required[i]))){seen.add(n);const previous=assigned.get(n);if(previous===undefined||match(previous,seen)){assigned.set(n,i);return true}}return false}
 if(!required.every((_,i)=>match(i,new Set())))fail(`costo non pagabile dall’Attivo. Stampato=${JSON.stringify(printed.cost)}; effettivo=${JSON.stringify(cost)}; unità disponibili=${JSON.stringify(units)}. Non cambiare tipi di Energie Base o usare quelle di un altro Pokémon; correggere prima assegnazioni/accessi o scegliere un altro attacco.`)
 return {printedCost:printed.cost,effectiveCost:cost,units,payment:[...assigned.keys()].map(i=>units[i]),conditionalProofs:p,note:'Contributi condizionali e modificatori richiedono critica indipendente delle condizioni, non sono certificati dal matching.'}
}
