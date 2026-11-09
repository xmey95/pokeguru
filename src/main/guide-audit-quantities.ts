import {guideZones} from '../shared/guide-setup-ledger'
import {guideAuditAt,type GuideAuditCandidates,type GuideAuditLocation} from '../shared/guide-audit-candidates'
import {guideHash,type GuidePacket} from './matchup-guide-packet'
import {assertNativeScenarioSchema} from './guide-scenario-output-schema'

type Quantities=NonNullable<GuideAuditCandidates['quantities']>
export interface AuditQuantityContext {version:1;caseId:string;opponentListId:string;cards:Quantities['cards'];windows:Quantities['windows'];measures:{id:string;label:string;value:string}[]}
const object=(properties:Record<string,any>)=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false})
const nullable=(schema:any)=>({anyOf:[schema,{type:'null'}]})
const zones:Record<string,string>={deck:'nel mazzo',hand:'in mano',prizes:'nei Premi',active:'in posizione Attiva',bench:'in Panchina',evolution:'nelle pile evolutive',discard:'negli scarti',attached:'assegnate',stadium:'come Stadio',lost:'nell’Area Perduta',list:'nella lista'}
/** Inventory facts belong to a precise native window; not a union of maxima
 * across the turn. No later turn participates in a prior audit context. */
export function auditQuantityContext(native:any,packet:GuidePacket,candidates:GuideAuditCandidates,location:GuideAuditLocation):AuditQuantityContext{
 if(!candidates.quantities)throw Error('Audit quantitativo: proiezione delle quantità mancante.')
 const windows=candidates.quantities.windows.filter(w=>w.lineId===location.lineId&&w.turn===location.turn&&w.side===location.side),measures:AuditQuantityContext['measures']=[]
 for(const source of packet.sources.filter(s=>s.kind==='card')){let c:any;try{c=JSON.parse(source.content)}catch{continue}
  if(!candidates.quantities.cards.some(r=>r.printId===c.printId))continue
  const add=(suffix:string,label:string,value:unknown)=>{if(typeof value==='number'&&Number.isSafeInteger(value)&&value>=0||typeof value==='string'&&/^\d+(?:[+×x])?$/.test(value))measures.push({id:source.id+':'+suffix,label:c.name+' · '+label,value:String(value)})}
  add('hp','PS stampati',c.gameplay?.hp);add('retreat','costo di ritirata stampato',c.gameplay?.retreat)
  for(const [i,a]of (c.gameplay?.attacks??[]).entries()){add('attack-'+i+'-damage',a.name+' · danno stampato',a.damage);if(Array.isArray(a.cost))add('attack-'+i+'-cost',a.name+' · simboli nel costo stampato',a.cost.length)}
 }
 if(!windows.length)throw Error('Audit quantitativo: finestra del turno assente.')
 return {version:1,caseId:native.id,opponentListId:native.opponentListId,cards:structuredClone(candidates.quantities.cards),windows:structuredClone(windows),measures}
}
export function auditNarrativeSchema(context:AuditQuantityContext){
 const prints=[...new Set(context.cards.map(c=>c.printId))],side={type:'string',enum:['ours','opponent']}
 return {type:'array',minItems:1,maxItems:24,items:object({text:nullable({type:'string',minLength:1,maxLength:1600}),quantity:nullable(object({windowId:{type:'string',enum:['list',...context.windows.map(w=>w.id)]},side,printId:{type:'string',enum:prints},zone:{type:'string',enum:['list',...guideZones]},host:nullable(object({printId:{type:'string',enum:prints},copy:{type:'integer',minimum:1,maximum:8}})),count:{type:'integer',minimum:0,maximum:60}})),card:nullable(object({side,printId:{type:'string',enum:prints}})),measureId:nullable({type:'string',enum:context.measures.length?context.measures.map(m=>m.id):['no-numeric-measure-available']})})}
}
// The new transport has qualitative text and explicit quantitative atoms.
// Controlled Italian/English numerals (including articles) cannot be used as
// an alternative channel for a copy count. Names with digits use card atoms.
const numeralWords=new Set(['zero','un','uno','una','unico','unica','unici','uniche','nessun','nessuno','nessuna','entrambi','entrambe','doppio','doppia','both','none','single','sole','double',
 'one','two','three','four','five','six','seven','eight','nine','ten','eleven','twelve','thirteen','fourteen','fifteen','sixteen','seventeen','eighteen','nineteen','twenty','thirty','forty','fifty','sixty'])
const small=['','uno','due','tre','quattro','cinque','sei','sette','otto','nove','dieci','undici','dodici','tredici','quattordici','quindici','sedici','diciassette','diciotto','diciannove']
for(let n=1;n<=60;n++){const ten=['','','venti','trenta','quaranta','cinquanta','sessanta'][Math.floor(n/10)],unit=n%10;numeralWords.add(n<20?small[n]:ten+(unit===1||unit===8?'':'')+small[unit]);if(n>=20&&(unit===1||unit===8))numeralWords.add(ten.slice(0,-1)+small[unit])}
function qualitative(text:string){
 if(/\p{N}/u.test(text)||text.toLocaleLowerCase().match(/\p{L}+/gu)?.some(w=>numeralWords.has(w)))throw Error('Audit quantitativo: quantità libera nella motivazione. Usare quantity per copie/zone e measureId per valori stampati; card per nomi con numeri. Non riscrivere il conteggio in lettere.')
 return text
}
export function renderAuditNarrative(parts:unknown,context:AuditQuantityContext,maxLength:number,allowedWindows=context.windows.map(w=>w.id),protocol:2|3=2):string{
 assertNativeScenarioSchema({parts},object({parts:auditNarrativeSchema(context)}))
 const rendered=(parts as any[]).map(p=>{
  if([p.text,p.quantity,p.card,p.measureId].filter(v=>v!==null).length!==1)throw Error('Audit quantitativo: ogni frammento richiede esattamente un contenuto.')
  if(p.text!==null)return protocol===2?qualitative(p.text):p.text
  if(p.measureId!==null){const m=context.measures.find(m=>m.id===p.measureId);if(!m)throw Error('Audit quantitativo: valore stampato senza fonte.');return `${m.label}: ${m.value}`}
  const ref=p.quantity??p.card,card=context.cards.find(c=>c.side===ref.side&&c.printId===ref.printId)
  if(!card)throw Error('Audit quantitativo: carta estranea alla lista del lato assegnato.')
  if(p.card!==null)return card.name
  const q=p.quantity,window=context.windows.find(w=>w.id===q.windowId)
  if(q.zone==='list'?(q.windowId!=='list'):(!window||!allowedWindows.includes(q.windowId)))throw Error('Audit quantitativo: finestra non pertinente alla decisione.')
  let hostLabel='',count=q.zone==='list'?card.total:window!.balances.find(r=>r.side===q.side&&r.printId===q.printId&&r.zone===q.zone)?.count??0
  if(q.host!==null){
   const host=window?.hosts.find(h=>h.side===q.side&&h.printId===q.host.printId&&h.copy===q.host.copy),name=context.cards.find(c=>c.side===q.side&&c.printId===q.host.printId)?.name
   if(!host||!name||!['attached','evolution'].includes(q.zone)||q.zone==='attached'&&window!.unknownAttachments.some(u=>u.side===q.side&&u.printId===q.printId))throw Error('Audit quantitativo: destinatario assente, ambiguo o zona non compatibile.')
   count=host[q.zone==='attached'?'attached':'stack'].filter(r=>r.printId===q.printId).reduce((n,r)=>n+r.count,0);hostLabel=` presso ${name}, copia ${host.copy}`
  }
  if(count!==q.count)throw Error(`Audit quantitativo: ${q.printId} in ${q.side}/${q.zone} ha ${count} copie nella finestra assegnata, non ${q.count}.`)
  const last=window?.path.at(-1),part=typeof last==='number'?`l’azione ${last+1}${window!.path.includes('afterAttack')?' dopo l’attacco':window!.path.includes('beforeAttack')?' prima dell’attacco':''}`:last==='draw'?'la pescata ordinaria':'l’attacco'
  const timing=q.zone==='list'?'':window!.resolvedWithPreviousKo?` (dopo la risoluzione congiunta del KO e dei Premi, turno ${window!.turn})`:` (${window!.when==='before'?'prima di':'dopo'} ${part}, turno ${window!.turn})`
  return `${card.name} ${zones[q.zone]??q.zone}${hostLabel} ${q.side==='ours'?'del nostro lato':'del lato avversario'}: ${count} ${count===1?'copia':'copie'}${timing}`
 }).join('')
 if(!rendered.trim()||rendered.length>maxLength)throw Error(`Audit quantitativo: motivazione di ${rendered.length} caratteri, limite ${maxLength}.`)
 return rendered
}
export function auditDecisionWindows(context:AuditQuantityContext,path:(string|number)[]){return context.windows.filter(w=>w.when==='before'&&guideHash(w.path)===guideHash(path)).map(w=>w.id)}
export function auditPromotionWindows(context:AuditQuantityContext,native:any,side:string){return context.windows.filter(w=>w.when==='before'&&(guideAuditAt(native,w.path)?.moves??[]).some((m:any)=>m.side===side&&m.from==='bench'&&m.to==='active')).map(w=>w.id)}
/** Later native-case deltas may preserve rendered facts, never introduce a
 * second free-number channel. Semantic correctness remains the critic's job. */
export function assertRenderedAuditText(text:string,context:AuditQuantityContext,knownAtoms:string[]){
 let rest=text
 const supported=[...knownAtoms,...context.cards.map(c=>c.name),...context.measures.map(m=>`${m.label}: ${m.value}`)].sort((a,b)=>b.length-a.length)
 for(const atom of supported)if(atom)rest=rest.split(atom).join('')
 qualitative(rest)
}
/** Hints requiring semantic coverage, NOT a blacklist in protocol3. The
 * independent reviewer must also inspect claims outside these lexical hints. */
export function auditLanguageSpans(text:string){
 const hints=new Set([...numeralWords,'alcun','alcuno','alcuna','alcuni','alcune','tutti','tutte','tutto','ogni','paio','singolo','singola','univoco','univoci','univoca','all','every','any','neither','once','twice'])
 const numeric=new Map<string,number>(small.map((s,i)=>[s,i]));for(let n=20;n<=60;n++){const ten=['','','venti','trenta','quaranta','cinquanta','sessanta'][Math.floor(n/10)],u=n%10;numeric.set(ten+small[u],n);if(u===1||u===8)numeric.set(ten.slice(0,-1)+small[u],n)}
 for(const [i,w]of ['zero','one','two','three','four','five','six','seven','eight','nine','ten','eleven','twelve','thirteen','fourteen','fifteen','sixteen','seventeen','eighteen','nineteen'].entries())numeric.set(w,i)
 for(const [w,n]of Object.entries({twenty:20,thirty:30,forty:40,fifty:50,sixty:60}))numeric.set(w,n)
 for(const [w,n]of Object.entries({un:1,una:1,unico:1,unica:1,unici:1,uniche:1,single:1,sole:1,nessun:0,nessuno:0,nessuna:0,none:0,entrambi:2,entrambe:2,both:2,doppio:2,doppia:2,double:2}))numeric.set(w,n)
 const ambiguous=new Set(['un','uno','una','sei','one','unico','unica','unici','uniche','nessun','nessuno','nessuna','entrambi','entrambe','both','none','single','sole','double','doppio','doppia'])
 return [...text.matchAll(/\p{N}+(?:[.,]\p{N}+)?|\p{L}+/gu)].flatMap(m=>{const word=m[0].toLowerCase(),digits=/^\d+$/.test(word);if(!digits&&!hints.has(word))return [];return [{id:String(m.index)+':'+(m.index+m[0].length),start:m.index,end:m.index+m[0].length,token:m[0],explicit:digits||numeric.has(word)&&!ambiguous.has(word),value:digits?Number(word):numeric.get(word)??null}]})
}
