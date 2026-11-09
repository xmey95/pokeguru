export const SCENARIO_OUTPUT_ENCODING='pg-scenario-tables-1'
export const CONTEXT_SCENARIO_OUTPUT_ENCODING='pg-scenario-tables-2'
export const INLINE_SCENARIO_OUTPUT_ENCODING='pg-scenario-tables-3'
export const DIRECT_SCENARIO_OUTPUT_ENCODING='pg-scenario-inline-4'
export const CONTEXT_EVENT_TABLES=['ourSetupEvents','opponentSetupEvents','ourLineEvents','opponentLineEvents','ourFinalAttacks'] as const
export const scenarioEventTable=(side:string,setup=false,final=false)=>setup?(side==='ours'?'ourSetupEvents':'opponentSetupEvents'):final?'ourFinalAttacks':side==='ours'?'ourLineEvents':'opponentLineEvents'
export const SCENARIO_OUTPUT_FIELDS:Record<string,string>={kind:'k',description:'d',moves:'m',energyRoutes:'e',deckObservations:'o',attack:'a',trainer:'t',action:'x',affectedSide:'y',retreat:'r',adjustments:'j',sourceId:'q',amount:'v',reason:'z',side:'s',printId:'p',count:'n',from:'f',to:'g',path:'l',hostPrintId:'h',sourceIds:'i',attachment:'u',attacks:'A',attackName:'w',cards:'c',comparison:'b',position:'P'}
const clone=<T>(v:T):T=>structuredClone(v)
const originalFields=Object.fromEntries(Object.entries(SCENARIO_OUTPUT_FIELDS).map(([k,v])=>[v,k]))
export function scenarioOutputKeys(v:any,decode=false):any{
  if(Array.isArray(v))return v.map(x=>scenarioOutputKeys(x,decode))
  if(!v||typeof v!=='object')return v
  const seen=new Set<string>()
  return Object.fromEntries(Object.entries(v).map(([k,x])=>{
    const key=(decode?originalFields:SCENARIO_OUTPUT_FIELDS)[k]??k
    if(seen.has(key))throw new Error('Output scenari: chiavi codificate ambigue.');seen.add(key)
    return [key,scenarioOutputKeys(x,decode)]
  }))
}

/** Transport only. Every referenced value is cloned at its use site; sharing
 * must never alias mutable retreat IDs, counters or branch state. */
function directScenarioOutput(raw:any,decode:boolean):any{
  const out=clone(raw);delete out.scenarioEncoding
  if(!Array.isArray(out.scenarios))throw new Error('Output scenari: casi mancanti.')
  for(const s of out.scenarios){
    if([...CONTEXT_EVENT_TABLES,'eventTable','moveTable','energyTable','auditTable'].some(k=>Object.hasOwn(s,k)))throw new Error(`${s.id}: il formato inline non ammette pool o dichiarazioni separate.`)
    const declarations=new Set<string>()
    const event=(e:any,context:string)=>{
      if(!e||typeof e!=='object'||Array.isArray(e))throw new Error(`${s.id}: evento inline richiesto in ${context}, non un indice.`)
      const native=decode?scenarioOutputKeys(e,true):e
      declarations.add(context+'|'+JSON.stringify(native))
      return scenarioOutputKeys(e,decode)
    }
    const turn=(t:any,side:string,setup=false)=>{
      if(!t)return
      const context=scenarioEventTable(side,setup)
      for(const field of ['events','beforeAttack','afterAttack'])if(t[field]!==undefined){
        if(!Array.isArray(t[field]))throw new Error(`${s.id}: ${field} inline non valido.`)
        t[field]=t[field].map((e:any)=>event(e,context))
      }
      if(t.attack!=null)t.attack=event(t.attack,'ourFinalAttacks')
      if(t.tactical!=null){if(typeof t.tactical!=='object'||Array.isArray(t.tactical))throw new Error(`${s.id}: tactical inline richiesto, non un indice.`);t.tactical=scenarioOutputKeys(t.tactical,decode)}
    }
    turn(s.firstOpponentTurn,'opponent',true)
    for(const r of s.setupRounds??[]){turn(r.ours,'ours',true);turn(r.opponent,'opponent',true)}
    for(const [phase,t]of Object.entries(s.turns??{}))turn(t,phase==='opponent'?'opponent':'ours')
    const c=s.replyComparison
    if(decode){
      const r=c?.replies
      if(!r?.direct||!r.access||!r.defend||!Array.isArray(r.others)||!Array.isArray(c.optionOrder))throw new Error(`${s.id}: tre ruoli inline completi richiesti.`)
      const options=[r.direct,r.access,r.defend,...r.others],ids=options.map(o=>o.id)
      if(new Set(ids).size!==ids.length||c.optionOrder.length!==ids.length||new Set(c.optionOrder).size!==ids.length||c.optionOrder.some((id:any)=>!ids.includes(id))||['direct','access','defend'].some(role=>r[role].id!==c.coverage?.[role]))throw new Error(`${s.id}: ruoli o ordine delle repliche incoerenti.`)
      s.replyComparison=Object.fromEntries(Object.entries(c).filter(([k])=>k!=='optionOrder').map(([k,v])=>k==='replies'?['options',c.optionOrder.map((id:string)=>options.find(o=>o.id===id))]:[k,v]))
    }
    for(const o of s.replyComparison.options)for(const [phase,t]of Object.entries(o.turns??{}))turn(t,phase==='opponent'?'opponent':'ours')
    if(!decode){
      const get=(id:string)=>{const o=c.options.find((o:any)=>o.id===id);if(!o)throw new Error(`${s.id}: ruolo inline senza ramo.`);return o}
      const replies={direct:get(c.coverage.direct),access:get(c.coverage.access),defend:get(c.coverage.defend),others:c.options.filter((o:any)=>!Object.values(c.coverage).includes(o.id))}
      s.replyComparison={...Object.fromEntries(Object.entries(c).map(([k,v])=>k==='options'?['replies',replies]:[k,v])),optionOrder:c.options.map((o:any)=>o.id)}
    }
    if(declarations.size>512||JSON.stringify(s).length>2_000_000)throw new Error(`${s.id}: espansione scenario oltre il limite verificabile.`)
  }
  if(!decode)out.scenarioEncoding=DIRECT_SCENARIO_OUTPUT_ENCODING
  return out
}

export function packScenarioOutput(raw:any,contextual=false,inline=false,direct=false):any{
  if(direct){const out=directScenarioOutput(raw,false);if(JSON.stringify(directScenarioOutput(out,true))!==JSON.stringify(raw))throw new Error('Output scenario inline non reversibile.');return out}
  if(inline)contextual=true
  const out=clone(raw)
  for(const s of out.scenarios??[]){
    const tables:Record<string,any[]>={...Object.fromEntries((contextual?CONTEXT_EVENT_TABLES:['eventTable']).map(k=>[k,[]])),moveTable:[],energyTable:[],auditTable:[]}
    const indexes=new Map<string,Map<string,number>>()
    const intern=(name:string,value:any)=>{
      let index=indexes.get(name);if(!index){index=new Map();indexes.set(name,index)}
      const key=JSON.stringify(value);let n=index.get(key)
      if(n===undefined){n=tables[name].length;index.set(key,n);tables[name].push(clone(value))}return n
    }
    const event=(e:any,table:string)=>intern(table,inline?e:{...e,moves:e.moves.map((m:any)=>intern('moveTable',m)),energyRoutes:e.energyRoutes.map((r:any)=>intern('energyTable',r))})
    const turn=(t:any,side:string,setup=false)=>{
      if(!t)return
      const table=contextual?scenarioEventTable(side,setup):'eventTable'
      if(t.events)t.events=t.events.map((e:any)=>event(e,table))
      if(t.beforeAttack)t.beforeAttack=t.beforeAttack.map((e:any)=>event(e,table))
      if(t.attack)t.attack=event(t.attack,contextual?'ourFinalAttacks':'eventTable')
      if(t.afterAttack)t.afterAttack=t.afterAttack.map((e:any)=>event(e,table))
      if(t.tactical!=null)t.tactical=intern('auditTable',t.tactical)
    }
    turn(s.firstOpponentTurn,'opponent',true)
    for(const r of s.setupRounds??[]){turn(r.ours,'ours',true);turn(r.opponent,'opponent',true)}
    for(const [phase,t]of Object.entries(s.turns??{}))turn(t,phase==='opponent'?'opponent':'ours')
    const c=s.replyComparison
    for(const o of c.options)for(const [phase,t]of Object.entries(o.turns))turn(t,phase==='opponent'?'opponent':'ours')
    const get=(id:string)=>{const o=c.options.find((o:any)=>o.id===id);if(!o)throw new Error('Ruolo di replica senza ramo.');return o}
    const replies={direct:get(c.coverage.direct),access:get(c.coverage.access),defend:get(c.coverage.defend),others:c.options.filter((o:any)=>!Object.values(c.coverage).includes(o.id))}
    s.replyComparison={...Object.fromEntries(Object.entries(c).map(([k,v])=>k==='options'?['replies',replies]:[k,v])),optionOrder:c.options.map((o:any)=>o.id)}
    Object.assign(s,Object.fromEntries(Object.entries(tables).filter(([name])=>!inline||!['moveTable','energyTable'].includes(name)).map(([name,rows])=>[name,rows.map(r=>scenarioOutputKeys(r))])))
  }
  out.scenarioEncoding=inline?INLINE_SCENARIO_OUTPUT_ENCODING:contextual?CONTEXT_SCENARIO_OUTPUT_ENCODING:SCENARIO_OUTPUT_ENCODING
  if(JSON.stringify(expandScenarioOutput(out,true))!==JSON.stringify(raw))throw new Error('Output scenario non reversibile.')
  return out
}

export function expandScenarioOutput(raw:any,required=false,expectedEncoding?:string):any{
  if(expectedEncoding&&raw?.scenarioEncoding!==expectedEncoding)throw new Error('Output scenari: codifica richiesta non rispettata.')
  if(raw?.scenarioEncoding===DIRECT_SCENARIO_OUTPUT_ENCODING)return directScenarioOutput(raw,true)
  if(![SCENARIO_OUTPUT_ENCODING,CONTEXT_SCENARIO_OUTPUT_ENCODING,INLINE_SCENARIO_OUTPUT_ENCODING].includes(raw?.scenarioEncoding)){if(required)throw new Error('Output scenari: codifica a tabelle richiesta.');return raw}
  const inline=raw.scenarioEncoding===INLINE_SCENARIO_OUTPUT_ENCODING,contextual=inline||raw.scenarioEncoding===CONTEXT_SCENARIO_OUTPUT_ENCODING
  const out=clone(raw);delete out.scenarioEncoding
  if(!Array.isArray(out.scenarios))throw new Error('Output scenari: casi mancanti.')
  for(const s of out.scenarios){
    const eventTables=contextual?CONTEXT_EVENT_TABLES:['eventTable']
    const tableNames=[...eventTables,...inline?[]:['moveTable','energyTable'],'auditTable']
    // Inspect the complete reachable graph before any expansion. A dangling
    // index must not hide other bad references or declarations left unused.
    const referenced=new Map<string,Set<number>>(),bad:string[]=[]
    const mark=(name:string,n:any,path:string):any=>{
      if(!Array.isArray(s[name])||!Number.isSafeInteger(n)||n<0||n>=s[name].length){bad.push(`${path}: riferimento ${name}[${n}] assente o non intero.`);return null}
      if(!referenced.has(name))referenced.set(name,new Set());referenced.get(name)!.add(n)
      return s[name][n]
    }
    const graphEvent=(name:string,n:any,path:string)=>{const raw=mark(name,n,path);if(raw==null||inline)return
      const e=scenarioOutputKeys(raw,true)
      for(const [i,v]of (Array.isArray(e.moves)?e.moves:[]).entries())mark('moveTable',v,path+`.moves[${i}]`)
      for(const [i,v]of (Array.isArray(e.energyRoutes)?e.energyRoutes:[]).entries())mark('energyTable',v,path+`.energyRoutes[${i}]`)
    }
    const graphTurn=(t:any,side:string,setup:boolean,path:string)=>{if(!t)return
      for(const field of ['events','beforeAttack','afterAttack'])for(const [i,n]of (Array.isArray(t[field])?t[field]:[]).entries())graphEvent(contextual?scenarioEventTable(side,setup):'eventTable',n,`${path}.${field}[${i}]`)
      if(t.attack!=null)graphEvent(contextual?'ourFinalAttacks':'eventTable',t.attack,path+'.attack')
      if(t.tactical!=null)mark('auditTable',t.tactical,path+'.tactical')
    }
    graphTurn(s.firstOpponentTurn,'opponent',true,'firstOpponentTurn')
    for(const [i,r]of (s.setupRounds??[]).entries())for(const side of ['ours','opponent'])graphTurn(r[side],side,true,`setupRounds[${i}].${side}`)
    for(const [phase,t]of Object.entries(s.turns??{}))graphTurn(t,phase==='opponent'?'opponent':'ours',false,'turns.'+phase)
    const replies=s.replyComparison?.replies
    for(const o of [replies?.direct,replies?.access,replies?.defend,...replies?.others??[]].filter(Boolean))for(const [phase,t]of Object.entries(o.turns??{}))graphTurn(t,phase==='opponent'?'opponent':'ours',false,`${o.id}.turns.${phase}`)
    if(bad.length){
      const unused=tableNames.flatMap<any>(name=>Array.isArray(s[name])?s[name].flatMap((value:any,index:number)=>referenced.get(name)?.has(index)?[]:[{table:name,index,value:scenarioOutputKeys(value,true)}]):[{table:name,missing:true}])
      throw new Error(`${s.id}: grafo dei riferimenti non valido: ${JSON.stringify(bad)}. Dati non referenziati nelle tabelle: ${JSON.stringify(unused)}. Correggere insieme tutti gli indici e i rami prima dell'espansione; nessun dato è stato collegato, cancellato o applicato automaticamente.`)
    }
    if(eventTables.reduce((n,name)=>n+(Array.isArray(s[name])?s[name].length:0),0)>512)throw new Error(`${s.id}: oltre 512 dichiarazioni di evento.`)
    const used=new Map<string,Set<number>>();let expandedCharacters=0
    const ref=(name:string,n:any)=>{
      const table=s[name]
      if(!Array.isArray(table)||!Number.isSafeInteger(n)||n<0||n>=table.length)throw new Error(`${s.id}: riferimento ${name}[${n}] assente o non intero.`)
      expandedCharacters+=JSON.stringify(table[n]).length
      if(expandedCharacters>2_000_000)throw new Error(`${s.id}: espansione scenario oltre il limite verificabile.`)
      if(!used.has(name))used.set(name,new Set());used.get(name)!.add(n)
      return scenarioOutputKeys(clone(table[n]),true)
    }
    const event=(n:any,table:string)=>{const e=ref(table,n)
      if(contextual){
        const setup=table==='ourSetupEvents'||table==='opponentSetupEvents'
        if(setup?(Object.hasOwn(e,'action')||Object.hasOwn(e,'affectedSide')):(!Object.hasOwn(e,'action')||!Object.hasOwn(e,'affectedSide')))throw new Error(`${s.id}: ${table}[${n}] campi action/affectedSide incompatibili con il contesto.`)
        if(table==='ourFinalAttacks'&&!e.attack)throw new Error(`${s.id}: attacco finale senza carta/attacco esplicito.`)
      }
      if(!Array.isArray(e.moves)||!Array.isArray(e.energyRoutes))throw new Error(`${s.id}: evento senza movimenti/percorsi.`)
      if(!inline){e.moves=e.moves.map((n:any)=>ref('moveTable',n));e.energyRoutes=e.energyRoutes.map((n:any)=>ref('energyTable',n))}return e
    }
    const turn=(t:any,side:string,setup=false)=>{
      if(!t)return
      const table=contextual?scenarioEventTable(side,setup):'eventTable'
      if(t.events)t.events=t.events.map((n:any)=>event(n,table))
      if(t.beforeAttack)t.beforeAttack=t.beforeAttack.map((n:any)=>event(n,table))
      if(t.attack!=null)t.attack=event(t.attack,contextual?'ourFinalAttacks':'eventTable')
      if(t.afterAttack)t.afterAttack=t.afterAttack.map((n:any)=>event(n,table))
      if(t.tactical!=null)t.tactical=ref('auditTable',t.tactical)
    }
    turn(s.firstOpponentTurn,'opponent',true)
    for(const r of s.setupRounds??[]){turn(r.ours,'ours',true);turn(r.opponent,'opponent',true)}
    for(const [phase,t]of Object.entries(s.turns??{}))turn(t,phase==='opponent'?'opponent':'ours')
    const c=s.replyComparison,r=c?.replies
    if(!r?.direct||!r.access||!r.defend||!Array.isArray(r.others)||!Array.isArray(c.optionOrder))throw new Error(`${s.id}: servono rami completi nei tre ruoli direct/access/defend.`)
    const options=[r.direct,r.access,r.defend,...r.others],ids=options.map((o:any)=>o.id)
    if(new Set(ids).size!==ids.length||c.optionOrder.length!==ids.length||new Set(c.optionOrder).size!==ids.length||c.optionOrder.some((id:any)=>!ids.includes(id)))throw new Error(`${s.id}: ID di replica duplicati o ordine dei rami incoerente.`)
    for(const o of options)for(const [phase,t]of Object.entries(o.turns??{}))turn(t,phase==='opponent'?'opponent':'ours')
    if(['direct','access','defend'].some(role=>r[role].id!==c.coverage?.[role]))throw new Error(`${s.id}: ruolo della replica non coerente con coverage.`)
    s.replyComparison=Object.fromEntries(Object.entries(c).filter(([k])=>k!=='optionOrder').map(([k,v])=>k==='replies'?['options',c.optionOrder.map((id:string)=>options.find((o:any)=>o.id===id))]:[k,v]))
    const usage:Record<string,string>={ourSetupEvents:'setupRounds[*].ours.events',opponentSetupEvents:'firstOpponentTurn.events o setupRounds[*].opponent.events',ourLineEvents:'turns.ours.events o turns.next.beforeAttack/afterAttack (anche nei rami)',opponentLineEvents:'turns.opponent.events (anche nei rami)',ourFinalAttacks:'turns.next.attack (anche nei rami)',eventTable:'events/beforeAttack/attack/afterAttack',moveTable:'m/moves di un evento referenziato',energyTable:'e/energyRoutes di un evento referenziato',auditTable:'tactical di un turno'}
    const unused=[]
    for(const name of tableNames){
      if(!Array.isArray(s[name]))throw new Error(`${s.id}: ${name} non è una tabella.`)
      const entries=s[name].flatMap((value:any,index:number)=>used.get(name)?.has(index)?[]:[{index,value:scenarioOutputKeys(value,true)}])
      if(entries.length)unused.push({table:name,requiredUse:usage[name],entries})
    }
    if(unused.length)throw new Error(`${s.id}: dati non referenziati nelle tabelle: ${JSON.stringify(unused)}. Correggere TUTTI i riferimenti e i rami insieme. La tabella segue il giocatore DI TURNO, non affectedSide: una promozione avversaria dopo il nostro KO appartiene a ourLineEvents. Non eliminare fatti o prove necessari né dichiarare una riga usata senza eseguirla; distinguere eventuali duplicati di elaborazione. Nessuna riga è stata applicata, collegata o cancellata automaticamente.`)
    for(const name of tableNames)delete s[name]
    if(JSON.stringify(s).length>2_000_000)throw new Error(`${s.id}: espansione scenario oltre il limite verificabile.`)
  }
  return out
}

/** Explicit non-completion is not a missing index to patch. Rebuild a complete,
 * smaller case; never turn placeholders into invented events or zero damage. */
export function assertConstructedScenarios(raw:any,inspectDecision=false):void{
  for(const s of raw?.scenarios??[]){
    const r=s.replyComparison?.replies,options=s.replyComparison?.options??(r?[r.direct,r.access,r.defend,...r.others??[]]:[])
    const ids=options.map((o:any)=>o?.id)
    const admission=/non (?:ho |abbiamo |è stato |sono stati )?(?:completat[oaie]|costruit[oaie]|ricostruit[oaie]) (?:il |lo |la |i |gli |le )?(?:caso|registro|scenario|ram[oi]|replic[ae]|confronto)|(?:caso|registro|scenario|ramo)(?: consegnato| presentato| richiesto)? (?:è (?:ancora )?incompleto|non (?:è (?:stato )?)?(?:completato|costruito)|non supera la (?:verifica|validazione)|richiede (?:ancora )?correzion)|non consegno un caso|non (?:sono|è) stat[oa] costruit|segnaposto non eseguibil|(?:i turni|il registro|i rami) non (?:sono|è) stat[oi] ricostruit[oi]/i
    const placeholder=/^(?:(?:ramo|opzione|replica|caso) )?(?:non (?:ancora )?(?:costruit[oa]|completat[oa])|da (?:costruire|completare)|segnaposto|placeholder|todo|tbd)(?:[.!:]|$)/i
    const refusal=[...(raw.limitations??[]),...(s.assumptions??[]),...(inspectDecision?[s.decision??'']:[]),raw.changeSummary??'',...options.map((o:any)=>o?.outcome??'')].find(t=>typeof t==='string'&&(admission.test(t)||placeholder.test(t.trim())))
    const access=r?.access??options.find((o:any)=>o?.id===s.replyComparison?.coverage?.access)
    const emptyAccess=access&&Array.isArray(access.turns?.opponent?.events)&&access.turns.opponent.events.length===0
    const turns=[s.firstOpponentTurn,...(s.setupRounds??[]).flatMap((r:any)=>[r.ours,r.opponent]),...Object.values(s.turns??{}),...options.flatMap((o:any)=>Object.values(o?.turns??{}))].filter(Boolean) as any[]
    const stale=raw.scenarioEncoding===DIRECT_SCENARIO_OUTPUT_ENCODING&&turns.flatMap(t=>[...t.events??[],...t.beforeAttack??[],...t.afterAttack??[],...t.attack?[t.attack]:[]]).some(e=>{
      const native=scenarioOutputKeys(e,true)
      return native&&/^evento (?:sostituito|non utilizzato|obsoleto)/i.test(native.description??'')&&!native.moves?.length&&!native.energyRoutes?.length&&!native.attack&&!native.trainer
    })
    if(refusal||emptyAccess||stale||ids.some((id:any)=>typeof id!=='string'||/(?:^|[-_])(?:non[-_ ]costruit[oa]|placeholder|segnaposto|todo|tbd)(?:$|[-_])/i.test(id))||new Set(ids).size!==ids.length)
      throw new Error(`${s.id}: COSTRUZIONE NON COMPLETATA, rami segnaposto o ID duplicati.${refusal?' Dichiarazione originale: '+refusal:''} Non correggere soltanto nomi o accessProof: ricostruisci un caso più semplice e realistico con setup, diretta, accesso aggiuntivo reale, migliore difesa e nostro attacco successivo, mantenendo tutti gli audit, rami e prove. Non inventare fatti né sostituire un ramo con zero danni.`)
  }
}

/** A repair's explicit non-completion is a failed construction, even when
 * applying its empty transaction leaves an otherwise well-formed old case. */
export function assertConstructedRepair(raw:any):void{
 const text=typeof raw?.changeSummary==='string'?raw.changeSummary:''
 if(/(?:riparazione|transazione|correzione)(?:\s+(?:richiesta|proposta))?\s+(?:(?:è|resta|rimane)\s+)?(?:incomplet[ao]|non\s+(?:è\s+(?:stata\s+)?|ancora\s+)?(?:completat[ao]|eseguit[ao]|riuscit[ao]))|non\s+(?:ho|abbiamo)\s+completato\s+(?:la\s+)?(?:riparazione|transazione|correzione)/i.test(text))
  throw new Error('RIPARAZIONE NON COMPLETATA: '+text+' Nessun riesame o prosa su una transazione dichiarata incompleta: correggere realmente i contenuti e tutti i rami interessati.')
}
