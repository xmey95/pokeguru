import type { GuideScenario, GuideSource } from './matchup-guide'

/** Structural coverage, not an assertion of legal effects or optimal play. */
export function checkReplyCoverage(s:GuideScenario,sources:GuideSource[]):string[]{
  const errors:string[]=[],comparison=s.replyComparison,coverage=comparison?.coverage
  const fail=(message:string)=>errors.push(`${s.id}: ${message}`)
  if(!coverage||!comparison){fail('confronto v10 privo di copertura diretta/accesso/difesa.');return errors}
  const ids=[coverage.direct,coverage.access,coverage.defend]
  if(new Set(ids).size!==3||ids.some(id=>!comparison.options.some(o=>o.id===id)))fail('servono tre repliche distinte e presenti: diretta, accesso aggiuntivo e difesa.')
  const defend=comparison.options.find(o=>o.id===coverage.defend)
  if(defend&&defend.intent!=='defend')fail('la replica difensiva non dichiara intento difensivo.')
  const access=comparison.options.find(o=>o.id===coverage.access)
  if(access)errors.push(...checkReplyAccess(s,access,sources))
  return errors
}

/** Shared physical/source gate; selecting a finite comparison cannot turn an
 * ordinary turn draw into an additional access or bypass its source receipt. */
export function checkReplyAccess(s:GuideScenario,access:NonNullable<GuideScenario['replyComparison']>['options'][number],sources:GuideSource[]):string[]{
  const errors:string[]=[],fail=(message:string)=>errors.push(`${s.id}: ${message}`)
    const proof=access.accessProof,events=(access as any).expandedLineEvents??[]
    const extra=events.some((e:any)=>e.turn===access.replyTurn&&e.side==='opponent'&&e.kind!=='turn-draw'&&
      e.moves.some((m:any)=>m.side==='opponent'&&['deck','discard','lost'].includes(m.from)&&['hand','attached','bench','active'].includes(m.to)))
    if(!extra)fail('replica con accesso aggiuntivo senza ricerca, recupero o pesca da effetto nel turno della risposta.')
    const known=new Set(sources.map(c=>c.id))
    if(!proof||proof.sourceIds.some(id=>!known.has(id))||!proof.sourceIds.some(id=>{
      const source=sources.find(c=>c.id===id);if(source?.kind!=='card')return false
      try{return JSON.parse(source.content).category!=='Energy'}catch{return false}
    }))fail('accesso aggiuntivo senza prova e fonte della carta che lo consente.')
  return errors
}
