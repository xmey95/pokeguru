import type {GuideSource,GuideStep} from './matchup-guide'
type Side='ours'|'opponent'
type Destination='hand'|'deck'|'discard'|'lost'
type CardMove={side:Side;printId:string;from:string;to:string;count:number}
type Event={side:Side;turn:number;kind:string;description:string;moves:CardMove[];action?:string;affectedSide?:Side;trainer?:string|null;attack?:{printId:string;attackName:string}|null;energyRoutes?:any[];attachmentTargets?:any[];boardExitProofs?:any[]}
type Group={id:number;side:Side;printId:string;zone:'active'|'bench';stack:{printId:string;count:number}[];attached:{printId:string;count:number}[]}
export interface GuideBoardExit {side:Side;printId:string;from:'active'|'bench';to:Destination;sourceIds:string[];reason:string;stack:{printId:string;count:number;to:Destination}[];attached:{printId:string;count:number;to:Destination}[]}
const offboard=(s:string):s is Destination=>['hand','deck','discard','lost'].includes(s)
const board=(s:string):s is 'active'|'bench'=>s==='active'||s==='bench'
const supportsExit=(text:string,to:string)=>/\b(return|shuffle|put|discard)\b/i.test(text)&&new RegExp(to==='deck'?'\\bdeck\\b':to==='hand'?'\\bhand\\b':to==='lost'?'\\blost zone\\b':'\\bdiscard\\b','i').test(text)

/** Possible stack/attachment allocation, bound to the declared movement stream.
 * Never creates a card movement or certifies the effect's conditions. Ambiguous
 * attachment ownership must be explicitly resolved by the native declaration. */
export function createBoardExitTracker(sources:GuideSource[]){
 const cards=new Map<string,any>();for(const s of sources.filter(s=>s.kind==='card')){try{cards.set(JSON.parse(s.content).printId,{...JSON.parse(s.content),sourceId:s.id})}catch{/* Evidence gates handle missing text. */}}
 let groups:Group[]=[],serial=0,unknown:{side:Side;printId:string;count:number;candidates:number[]}[]=[],pending=new Set<Side>()
 const fail=(s:string):never=>{throw new Error('Uscita senza KO: '+s)}
 const candidates=(side:Side,id:string,zone?:string)=>groups.filter(g=>g.side===side&&g.printId===id&&(!zone||g.zone===zone))
 const choose=(side:Side,id:string,zone?:string,copy?:number|null)=>{
  const list=candidates(side,id,zone);if(!list.length)return fail(`Pokémon ${side}/${id} non in campo.`)
  if(copy!=null){if(!Number.isSafeInteger(copy)||copy<1||copy>list.length)return fail('copia del Pokémon non disponibile.');return list[copy-1]}
  if(list.length!==1)return fail(`copia ambigua di ${side}/${id}; dichiarare copy nell'ordine del registro.`)
  return list[0]
 }
 const bind=(e:Event,side:Side,id:string,hostId?:string|null)=>{
  const declared=(e.attachmentTargets??[]).filter(t=>t.side===side&&t.printId===id)
  if(declared.length>1)return fail('assegnazione ambigua: separare i trasferimenti verso destinatari diversi.')
  if(declared.length){const d=declared[0];if(hostId&&d.hostPrintId!==hostId)return fail('destinatario incompatibile con energyRoutes.');return choose(side,d.hostPrintId,undefined,d.copy)}
  if(hostId){const list=candidates(side,hostId);if(list.length===1)return list[0];return null}
  const named=groups.filter(g=>g.side===side&&e.description.includes(cards.get(g.printId)?.name??'\u0000'))
  if(named.length===1)return named[0]
  const all=groups.filter(g=>g.side===side);return all.length===1?all[0]:null
 }
 const proof=(e:Event,g:Group,to:string)=>{
  const copy=candidates(g.side,g.printId,g.zone).indexOf(g)+1
  const declared=(e.boardExitProofs??[]).filter(p=>p.side===g.side&&p.printId===g.printId&&(p.copy==null||p.copy===copy))
  if(declared.length>1)return fail('prove duplicate per la stessa uscita; separare gli eventi.')
  if(declared.length){const p=declared[0];if(!Array.isArray(p.sourceIds)||!p.sourceIds.length||typeof p.reason!=='string'||!p.reason.trim())return fail('fonte o motivazione assente.');let applicable=false;for(const id of p.sourceIds){const s=sources.find(s=>s.id===id),c=[...cards.values()].find(c=>c.sourceId===id);if(!s||!c)return fail('fonte di effetto non verificata.');applicable ||= [c.gameplay?.effect,...(c.gameplay?.abilities??[]).map((a:any)=>a.effect),...(c.gameplay?.attacks??[]).map((a:any)=>a.effect)].some(t=>typeof t==='string'&&supportsExit(t,to))}if(!applicable)return fail('fonte priva di un effetto di uscita verso la destinazione dichiarata.');return {sourceIds:p.sourceIds,reason:p.reason}}
  const own=cards.get(g.printId),abilities=(own?.gameplay?.abilities??[]).filter((a:any)=>a.name&&e.description.includes(a.name))
  if(abilities.length===1&&supportsExit(abilities[0].effect??'',to))return {sourceIds:[own.sourceId],reason:`Abilità citata nell'evento: ${abilities[0].name}. Applicabilità e destinazioni richiedono la critica indipendente.`}
  const trainer=e.trainer&&cards.get(e.trainer);if(trainer?.gameplay?.effect&&supportsExit(trainer.gameplay.effect,to))return {sourceIds:[trainer.sourceId],reason:'Effetto del Trainer dichiarato nell’evento; condizioni da verificare nella critica.'}
  const attack=e.attack,attacker=attack&&cards.get(attack.printId);if(attacker?.gameplay?.attacks?.some((a:any)=>a.name===attack?.attackName&&a.effect&&supportsExit(a.effect,to)))return {sourceIds:[attacker.sourceId],reason:'Effetto dell’attacco dichiarato; condizioni da verificare nella critica.'}
  return fail('uscita priva di una fonte di effetto esplicita: usare boardExitProofs o citare esattamente l’Abilità.')
 }
 const takeCompanions=(e:Event,g:Group,rows:{printId:string;count:number}[],from:string,used:Map<number,number>,routes:Map<number,any>)=>rows.flatMap(r=>{
  let remaining=r.count;const result:{printId:string;count:number;to:Destination}[]=[]
  for(const [i,m]of e.moves.entries())if(m.side===g.side&&m.printId===r.printId&&m.from===from&&offboard(m.to)){
   const route=routes.get(i),target=(e.attachmentTargets??[]).find(t=>t.side===g.side&&t.printId===r.printId)
   if(from==='attached'&&((route?.hostPrintId&&route.hostPrintId!==g.printId)||(target&&(target.hostPrintId!==g.printId||(target.copy!=null&&candidates(g.side,g.printId).indexOf(g)+1!==target.copy)))))continue
   const count=Math.min(remaining,m.count-(used.get(i)??0));if(count>0){used.set(i,(used.get(i)??0)+count);result.push({printId:r.printId,count,to:m.to});remaining-=count}
  }
  if(remaining)return fail(`${r.printId}: pila evolutiva o assegnate lasciate sul campo.`)
  return result
 })
 const advance=(e:Event):GuideBoardExit[]=>{
  // expandTurnBlocks appends each route edge in declaration order. Match that
  // edge, rather than the first route for a print shared by different hosts.
  const edges=(e.energyRoutes??[]).flatMap(r=>(r.path??[]).slice(1).map((to:string,i:number)=>({route:r,from:r.path[i],to,used:false}))),routes=new Map<number,any>()
  for(const [i,m]of e.moves.entries())if(cards.get(m.printId)?.category==='Energy'){
   const edge=edges.find(v=>!v.used&&v.route.side===m.side&&v.route.printId===m.printId&&v.from===m.from&&v.to===m.to&&(v.route.count==null||v.route.count===m.count));if(edge){edge.used=true;routes.set(i,edge.route)}
  }
  if(pending.size){const m=e.moves[0],promotion=e.action==='promote'&&e.moves.length===1&&pending.has(m.side)&&m.from==='bench'&&m.to==='active'&&m.count===1;if(!promotion)return fail('sostituzione dell’Attivo obbligatoria prima di altre azioni.');pending.delete(m.side)}
  const departures=e.moves.filter(m=>board(m.from)&&offboard(m.to)),nonKO=departures.length>0&&!['active-ko','bench-ko'].includes(e.action??'')&&e.kind!=='knockout'
  if(nonKO){if(e.action!=null&&e.action!=='other')return fail('non mascherare un rientro come ingresso, KO o promozione.');if(e.moves.some(m=>m.from==='prizes'||m.to==='prizes'))return fail('nessun Premio può essere preso o spostato per una uscita senza KO.');if(e.moves.some(m=>board(m.to)))return fail('separare uscita e ingresso/promozione in eventi atomici.')}
  if(nonKO&&e.affectedSide&&departures.every(m=>m.side!==e.affectedSide))return fail('lato coinvolto incompatibile con i Pokémon che escono.')
  const exiting:Group[]=[],exits:GuideBoardExit[]=[],used=new Map<number,number>()
  for(const m of departures)for(let n=0;n<m.count;n++){const list=candidates(m.side,m.printId,m.from),p=(e.boardExitProofs??[]).find(p=>p.side===m.side&&p.printId===m.printId&&(!p.copy||!exiting.includes(list[p.copy-1]))),all=m.count===list.length,g=all?list.find(g=>!exiting.includes(g))!:choose(m.side,m.printId,m.from,p?.copy)
   if(exiting.includes(g))return fail('stessa copia rimossa due volte.');exiting.push(g)
   // Resolve only a declared possible allocation; never assign unknown cards silently.
   for(const u of unknown.filter(u=>u.count>0&&u.candidates.includes(g.id))){const owner=bind(e,u.side,u.printId);if(!owner)return fail('assegnate con proprietario ambiguo: dichiarare attachmentTargets.');if(!u.candidates.includes(owner.id))return fail('proprietario non presente al momento dell’assegnazione.');owner.attached.push({printId:u.printId,count:u.count});u.candidates=[]}
   if(nonKO){const witness=proof(e,g,m.to),stack=takeCompanions(e,g,g.stack,'evolution',used,routes),attached=takeCompanions(e,g,g.attached,'attached',used,routes);exits.push({side:g.side,printId:g.printId,from:g.zone,to:m.to as Destination,...witness,stack,attached})}
  }
  if(nonKO)for(const [i,m]of e.moves.entries())if(['evolution','attached'].includes(m.from)&&(used.get(i)??0)!==m.count)return fail('rimozione di carte sotto/assegnate non appartenenti ai Pokémon dichiarati.')
  const evolving=e.moves.filter(m=>board(m.from)&&m.to==='evolution'),old:Group[]=[]
  for(const m of evolving){if(m.count!==1)return fail('evoluzione non atomica.');const list=candidates(m.side,m.printId,m.from),g=list[0];if(!g)return fail('preevoluzione non disponibile.');old.push({...g,stack:[...g.stack,{printId:g.printId,count:1}]});groups=groups.filter(v=>v!==g)}
  const removedAttachments=exiting.flatMap(g=>g.attached.map(a=>({...a,side:g.side,hostPrintId:g.printId,copy:candidates(g.side,g.printId).indexOf(g)+1})))
  for(const g of exiting)groups=groups.filter(v=>v!==g)
  const relocated=new Set<Group>()
  for(const m of e.moves)if(board(m.from)&&board(m.to)){for(let i=0;i<m.count;i++){const g=candidates(m.side,m.printId,m.from).find(g=>!relocated.has(g));if(!g)return fail('scambio/promozione senza Pokémon disponibile.');relocated.add(g);g.zone=m.to}}
  for(const m of e.moves)if(!board(m.from)&&board(m.to)&&cards.get(m.printId)?.category==='Pokemon')for(let i=0;i<m.count;i++){
   const previous=old.filter(g=>g.side===m.side&&g.zone===m.to);if(previous.length>1)return fail('pila evolutiva ambigua: separare le evoluzioni.');const g=previous[0];if(g)old.splice(old.indexOf(g),1)
   groups.push(g?{...g,printId:m.printId}:{id:serial++,side:m.side,printId:m.printId,zone:m.to,stack:[],attached:[]})
  }
  if(old.length)return fail('pila evolutiva senza nuova cima nello stesso evento.')
  if(!nonKO)for(const [i,m]of e.moves.entries())if(m.from==='attached'){
   let left=m.count;const route=routes.get(i),target=(e.attachmentTargets??[]).find(t=>t.side===m.side&&t.printId===m.printId),matching=groups.filter(g=>g.side===m.side&&(!target||g.printId===target.hostPrintId)&&(!route?.hostPrintId||g.printId===route.hostPrintId))
   if(target&&route?.hostPrintId&&target.hostPrintId!==route.hostPrintId)return fail('destinatario incompatibile con energyRoutes.');
   // Removed Pokémon own these cards; consume them before touching survivors.
   for(const a of removedAttachments.filter(a=>a.side===m.side&&a.printId===m.printId&&(!route?.hostPrintId||a.hostPrintId===route.hostPrintId)&&(!target||(a.hostPrintId===target.hostPrintId&&(target.copy==null||a.copy===target.copy))))){const n=Math.min(left,a.count);a.count-=n;left-=n}
   const pool=!left?[]:target?.copy!=null?[choose(m.side,target.hostPrintId,undefined,target.copy)]:matching.filter(g=>g.attached.some(a=>a.printId===m.printId&&a.count>0))
   if(!departures.length&&pool.length>1)return fail('rimozione di assegnate da copie ambigue: dichiarare attachmentTargets.')
   for(const g of pool)for(const a of g.attached.filter(a=>a.printId===m.printId)){const n=Math.min(left,a.count);a.count-=n;left-=n}
   // KO removals already removed the group; existing ledger controls availability.
   if(left&&!departures.length){const owner=bind(e,m.side,m.printId,route?.hostPrintId),u=owner&&unknown.find(u=>u.side===m.side&&u.printId===m.printId&&u.count>=left&&u.candidates.includes(owner.id));if(u){u.count-=left;left=0}if(left)return fail('rimozione di assegnate da un proprietario non dimostrato.')}
  }
  for(const [i,m]of e.moves.entries())if(m.to==='attached'){
   const c=cards.get(m.printId);if(c?.category!=='Energy'&&c?.gameplay?.trainerType!=='Tool')return fail('carta assegnata non Energia o Strumento verificato.')
   const route=routes.get(i),host=bind(e,m.side,m.printId,route?.hostPrintId)
   if(host)host.attached.push({printId:m.printId,count:m.count});else unknown.push({side:m.side,printId:m.printId,count:m.count,candidates:groups.filter(g=>g.side===m.side&&(!route?.hostPrintId||g.printId===route.hostPrintId)).map(g=>g.id)})
  }
  if(nonKO)for(const side of ['ours','opponent'] as const)if(!groups.some(g=>g.side===side&&g.zone==='active')&&groups.some(g=>g.side===side&&g.zone==='bench'))pending.add(side)
  for(const side of ['ours','opponent'] as const)if(groups.filter(g=>g.side===side&&g.zone==='active').length>1)return fail('più di un Attivo dopo l’evento.')
  return exits
 }
 const resolveOwners=(e:Event)=>{for(const u of unknown.filter(u=>u.count>0&&u.candidates.length&&(e.attachmentTargets??[]).some(t=>t.side===u.side&&t.printId===u.printId))){const owner=bind(e,u.side,u.printId);if(!owner||!u.candidates.includes(owner.id))return fail('proprietario non dimostrato al momento dell’assegnazione.');owner.attached.push({printId:u.printId,count:u.count});u.candidates=[]}}
 return {advance,resolveOwners,snapshot:()=>structuredClone({groups,serial,unknown,pending:[...pending]}),restore:(s:any)=>{groups=structuredClone(s.groups);serial=s.serial;unknown=structuredClone(s.unknown);pending=new Set(s.pending)}}
}

export function checkBoardExitStep(step:GuideStep):string[]{
 const exits=step.boardExits;if(!Array.isArray(exits)||!exits.length)return ['uscita senza KO senza prova derivata.']
 const before=step.before,after=step.after,errors:string[]=[]
 for(const side of ['ours','opponent'] as const){const b=side==='ours'?'ourBench':'opponentBench',p=side==='ours'?'ourPrizes':'opponentPrizes';if(after[b]!==before[b]-exits.filter(e=>e.side===side&&e.from==='bench').length)errors.push('Panchina incoerente con le uscite dichiarate.');if(after[p]!==before[p])errors.push('Premi alterati da una uscita senza KO.')}
 if(step.prizesTaken)errors.push('Premi non consentiti per una uscita senza KO.')
 return errors
}
export function validBoardExits(v:unknown):v is GuideBoardExit[]{const id=(s:unknown)=>typeof s==='string'&&/^[a-zA-Z0-9:._-]{1,160}$/.test(s);return Array.isArray(v)&&v.length>0&&v.length<=18&&v.every(e=>e&&['ours','opponent'].includes(e.side)&&id(e.printId)&&board(e.from)&&offboard(e.to)&&Array.isArray(e.sourceIds)&&e.sourceIds.length>0&&e.sourceIds.length<=12&&e.sourceIds.every(id)&&typeof e.reason==='string'&&e.reason.trim()&&e.reason.length<=2000&&[e.stack,e.attached].every(rows=>Array.isArray(rows)&&rows.length<=60&&rows.every((r:any)=>r&&id(r.printId)&&Number.isSafeInteger(r.count)&&r.count>0&&r.count<=60&&offboard(r.to))))}
