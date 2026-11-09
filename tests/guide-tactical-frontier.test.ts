import {expect,it} from 'vitest'
import {tacticalFrontier,checkTacticalAudit} from '../src/shared/guide-tactical-frontier'
import {guideSource} from '../src/main/matchup-guide-packet'
import {deriveNativeAudit} from '../src/shared/guide-native-decisions'
const card=(printId:string,category:string,attacks:string[]=[])=>guideSource('card:'+printId,'card',printId,null,JSON.stringify({printId,category,gameplay:{attacks:attacks.map(name=>({name}))}}))
const sources=[card('basic','Pokemon',['Cheap KO']),card('stage','Pokemon',['Big attack']),card('recovery','Trainer'),card('energy','Energy'),card('other','Pokemon',['Other attack'])]
const move=(side:string,printId:string,from:string,to:string)=>({side,printId,from,to,count:1})
function fixture():any{return {id:'case',setupLedger:{openingHands:[{side:'ours',printId:'basic',count:1},{side:'ours',printId:'stage',count:1},{side:'opponent',printId:'other',count:2}],openingPrizes:[],events:[{turn:0,side:'ours',moves:[move('ours','basic','hand','active')]},{turn:0,side:'opponent',moves:[move('opponent','other','hand','active'),move('opponent','other','hand','bench')]}]},lineEvents:[{turn:3,side:'ours',moves:[move('ours','recovery','deck','hand')]},{turn:3,side:'ours',moves:[move('ours','basic','active','evolution'),move('ours','stage','hand','active')]},{turn:4,side:'opponent',moves:[]}],replyComparison:{options:[{id:'direct',expandedLineEvents:[{turn:3,side:'ours',moves:[move('ours','energy','deck','discard')]}]},{id:'defend',expandedLineEvents:[{turn:3,side:'ours',moves:[]}]}]}}}
const audit=(s:any)=>tacticalFrontier(s,sources).map(g=>({lineIds:[g.lineId],turn:g.turn,side:g.side,attacks:g.attacks,cards:[...new Set([...g.cards.map(c=>c.printId),...g.promotions.flatMap(p=>p.printIds)])],comparison:'Synthetic comparison only, not a competitive verdict.'}))

it('includes attached cards across temporal windows and branches without inventing playable cards or attacks',()=>{
 const s=fixture()
 s.setupLedger.events.push({turn:0,side:'ours',moves:[move('ours','energy','deck','attached')]})
 s.lineEvents=[{turn:3,side:'ours',moves:[move('ours','energy','attached','discard')]},{turn:4,side:'opponent',moves:[]}]
 s.replyComparison.options[0].expandedLineEvents=[{turn:3,side:'ours',moves:[]}]
 const legacy=tacticalFrontier(s,sources),current=tacticalFrontier(s,sources,2)
 expect(legacy.find(g=>g.lineId==='direct')!.cards.some(c=>c.printId==='energy')).toBe(false)
 expect(current.find(g=>g.lineId==='direct')!.cards.find(c=>c.printId==='energy')!.zones).toEqual(['attached'])
 expect(current.find(g=>g.lineId==='main'&&g.turn===3)!.cards.find(c=>c.printId==='energy')!.zones).toEqual(['attached','discard'])
 expect(current.find(g=>g.lineId==='main'&&g.turn===4)!.cards.some(c=>c.printId==='energy')).toBe(false)
 expect(current.flatMap(g=>g.attacks).some(a=>a.printId==='energy')).toBe(false)
 s.tacticalAudit=audit(s)
 expect(checkTacticalAudit(s,sources)).toEqual([])
 expect(checkTacticalAudit(s,sources,2).join('\n')).toContain('energy')
 const before=JSON.stringify(s)
 checkTacticalAudit(s,sources,2)
 expect(JSON.stringify(s)).toBe(before)
})

it('keeps attacks before evolution, new access and recoverable resources separate for each branch',()=>{
  const s=fixture(),groups=tacticalFrontier(s,sources),main=groups.find(g=>g.lineId==='main'&&g.turn===3)!
  expect(main.attacks).toEqual([{printId:'basic',attackName:'Cheap KO'},{printId:'stage',attackName:'Big attack'}])
  expect(main.cards.find(c=>c.printId==='recovery')!.zones).toContain('hand')
  expect(groups.find(g=>g.lineId==='direct')!.cards.find(c=>c.printId==='energy')!.zones).toEqual(['discard'])
  expect(groups.find(g=>g.lineId==='defend')!.cards.some(c=>c.printId==='energy')).toBe(false)
  s.tacticalAudit=audit(s);expect(checkTacticalAudit(s,sources)).toEqual([])
  const branches=s.tacticalAudit.filter((r:any)=>r.lineIds.some((id:string)=>['direct','defend'].includes(id)))
  s.tacticalAudit=s.tacticalAudit.filter((r:any)=>!branches.includes(r))
  s.tacticalAudit.push({...branches[0],lineIds:['direct','defend'],cards:[...new Set(branches.flatMap((r:any)=>r.cards))]})
  expect(checkTacticalAudit(s,sources)).toEqual([]) // Shared row covers the union, without dropping either branch.
  s.tacticalAudit=audit(s)
  s.tacticalAudit.find((r:any)=>r.lineIds.includes('main')&&r.turn===3).attacks.shift()
  expect(checkTacticalAudit(s,sources).join('\n')).toContain('basic / Cheap KO')
  s.tacticalAudit=audit(s);s.tacticalAudit=s.tacticalAudit.filter((r:any)=>!r.lineIds.includes('defend'))
  expect(checkTacticalAudit(s,sources).join('\n')).toContain('audit tattico omesso defend')
})

it('requires promotion alternatives of the affected side and rejects fake attack pairs and duplicate coverage',()=>{
  const s=fixture();s.lineEvents.push({turn:4,side:'opponent',moves:[move('ours','stage','active','discard')]},{turn:4,side:'opponent',moves:[move('ours','basic','deck','bench'),move('ours','basic','bench','active')]})
  // A separate event places the candidate before promotion, as in an executed ledger.
  s.lineEvents.splice(-1,0,{turn:4,side:'opponent',moves:[move('ours','other','deck','bench')]})
  s.tacticalAudit=audit(s);expect(checkTacticalAudit(s,sources)).toEqual([])
  const row=s.tacticalAudit.find((r:any)=>r.lineIds.includes('main')&&r.turn===4)
  row.cards=row.cards.filter((id:string)=>id!=='other')
  expect(checkTacticalAudit(s,sources).join('\n')).toContain('promozione diretta omessa')
  s.tacticalAudit=audit(s);s.tacticalAudit[0].attacks.push({printId:'stage',attackName:'Cheap KO'})
  expect(checkTacticalAudit(s,sources).join('\n')).toContain('attacco dell\'audit non valido')
  s.tacticalAudit=audit(s);s.tacticalAudit.push(structuredClone(s.tacticalAudit[0]))
  expect(checkTacticalAudit(s,sources).join('\n')).toContain('duplicato o estraneo')
})

it('requires explicit AI reasons for every promotion of the non-turn side and never fills missing reviews',()=>{
  const s:any={id:'promotions',firstOpponentTurn:null,setupRounds:[],setupLedger:{openingHands:[{side:'ours',printId:'basic',count:1},{side:'opponent',printId:'other',count:1},{side:'opponent',printId:'basic',count:1},{side:'opponent',printId:'stage',count:1}],openingPrizes:[],events:[{turn:0,side:'ours',moves:[move('ours','basic','hand','active')]},{turn:0,side:'opponent',moves:[move('opponent','other','hand','active'),move('opponent','basic','hand','bench'),move('opponent','stage','hand','bench')]}]},lineEvents:[{turn:1,side:'ours',moves:[move('opponent','other','active','discard')]},{turn:1,side:'ours',moves:[move('opponent','basic','bench','active')]},{turn:2,side:'opponent',moves:[]},{turn:3,side:'ours',moves:[]}],replyComparison:{options:[]},turns:{}}
  for(const g of tacticalFrontier(s,sources))s.turns[g.turn===1?'ours':g.turn===2?'opponent':'next']={events:[],tactical:{attacks:g.attacks,cards:g.cards.map(c=>c.printId),comparison:'Synthetic fixture only.',promotions:g.promotions.flatMap(p=>p.printIds.map(printId=>({side:p.side,printId,reason:'Synthetic explicit evaluation, not a competitive assessment.'})))}}
  const before=JSON.stringify(s.turns),complete=structuredClone(s)
  deriveNativeAudit(complete,sources,true)
  expect(JSON.stringify(complete.turns)).toBe(before)
  expect(checkTacticalAudit(complete,sources)).toEqual([])
  expect(complete.tacticalAudit[0].cards).toContain('stage')
  const incomplete=structuredClone(s);incomplete.turns.ours.tactical.promotions.shift()
  expect(incomplete.turns.ours.tactical.cards).toContain('basic') // An own card with the same print ID is not a promotion review.
  expect(()=>deriveNativeAudit(incomplete,sources,true)).toThrow('opponent|basic')
  expect(incomplete.turns.ours.tactical.promotions).toHaveLength(1)
  const fake=structuredClone(s);fake.turns.ours.tactical.promotions.push({side:'opponent',printId:'recovery',reason:'Not a candidate'})
  expect(()=>deriveNativeAudit(fake,sources,true)).toThrow('estraneo')
  const empty=structuredClone(s);empty.turns.ours.tactical.promotions[0].reason=''
  expect(()=>deriveNativeAudit(empty,sources,true)).toThrow('senza motivo')
})
