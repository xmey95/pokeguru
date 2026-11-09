import {beforeAll,afterAll,it,expect} from 'vitest'
import {DatabaseSync} from 'node:sqlite'
import {guideObligationFixture} from './fixtures/guide-obligation'
import {readGuideWitnessLibrary,type GuideWitnessLibrary} from '../src/main/guide-witness-library'
import {GuideAtomicProofStore,readVerifiedAtomicCoverage,type GuideAtomicFact,type GuideAtomicFactReceipt,type GuideAtomicPredicate,type GuideAtomicUnit} from '../src/main/guide-atomic-proofs'
import {guideHash} from '../src/main/matchup-guide-packet'

let f:Awaited<ReturnType<typeof guideObligationFixture>>,base:GuideWitnessLibrary,grown:GuideWitnessLibrary
beforeAll(async()=>{
  f=await guideObligationFixture();base=readGuideWitnessLibrary(f.main,f.options)
  f.setConstructorNote('A new synthetic native declaration, not a manual edit of a real guide.')
  await f.adopt();grown=readGuideWitnessLibrary(f.main,f.options)
  expect(base.complete).toBe(true);expect(grown.members.length).toBeGreaterThan(base.members.length)
},60000)
afterAll(()=>f?.close())
const frame={firstTurnHash:null,drawsHash:null}
const environment=()=>({evidenceHash:guideHash(f.options.packet),sourceIds:f.options.packet.sources.map(s=>s.id),contractHash:'synthetic-atomic-contract-1'})
function fixture(library=base){
  const store=new GuideAtomicProofStore(library,environment()),receipts:GuideAtomicFactReceipt[]=[]
  let ordinal=0
  const atom=(kind:'exists-line'|'all-pairs'='exists-line')=>store.predicate('Synthetic unit predicate; not an AI quality claim.','Exact root, sources and explicitly declared conditional frames.',['card:p'],
    kind==='exists-line'?{kind,frame}:{kind,frame,focusId:null,frameMode:'declared-conditional'},['synthetic-proposer'])
  const review=(a:GuideAtomicPredicate,u:GuideAtomicUnit,verdict:GuideAtomicFact['verdict']='proves',changeFact:Partial<GuideAtomicFact>={},changeReceipt:Partial<GuideAtomicFactReceipt>={})=>{
    const read=u.witnesses.map(w=>{const member=library.members.find(m=>m.id===w.id)??grown.members.find(m=>m.id===w.id)!;return {id:w.id,nativeHash:w.nativeHash,turnNumbers:member.journal.segments.map((_,i)=>i+1),producerRequestIds:[...new Set(member.producers.flatMap(p=>p.references.map(r=>r.unitId)))]}})
    const fact:GuideAtomicFact={atomId:a.id,unitId:u.id,verdict,reason:'Synthetic independent judgment for the complete assigned bodies.',sourceIds:['card:p'],witnesses:read.map(({producerRequestIds,...ref})=>ref),needs:verdict==='incomplete'?'numeric-evaluation':'none',...changeFact}
    const receipt:GuideAtomicFactReceipt={protocol:'guide-atomic-proof-1',requestId:'synthetic-independent-'+ ++ordinal,scopeHash:store.scopeHash,contextHash:store.contextHash,
      atomId:a.id,unitId:u.id,responseHash:guideHash(fact),sourceIds:['card:p'],readWitnesses:read,...changeReceipt}
    store.addFact(a,u,fact,receipt);receipts.push(receipt);return {fact,receipt}
  }
  return {store,receipts,atom,review}
}

it('separates an existential proof from a complete negative search, with no vacuous success',()=>{
  const t=fixture(),a=t.atom(),units=t.store.units(a)
  expect(t.store.derive(a).status).toBe('needs-evaluation')
  for(const u of units.slice(0,-1))t.review(a,u,'does-not-prove')
  expect(t.store.derive(a).constructionAuthorized).toBe(false)
  t.review(a,units.at(-1)!,'does-not-prove')
  expect(t.store.derive(a).status).toBe('needs-construction')
  expect(t.store.coverage(a)).toBeUndefined()
  const empty=t.store.predicate('An unmatched condition','Unresolved frame',['card:p'],{kind:'exists-line',frame:{firstTurnHash:'unseen',drawsHash:null}},['proposer'])
  expect(t.store.derive(empty)).toMatchObject({status:'blocked',constructionAuthorized:false})
})

it('uses a positive complete witness without requiring irrelevant negative searches',()=>{
  const t=fixture(),a=t.atom(),unit=t.store.units(a)[0]
  t.review(a,unit)
  expect(t.store.derive(a).status).toBe('verified')
  const coverage=t.store.coverage(a)!
  expect(readVerifiedAtomicCoverage(coverage).unitIds).toEqual([unit.id])
  expect(()=>readVerifiedAtomicCoverage(JSON.parse(JSON.stringify(coverage)))).toThrow('non verificata')
  expect(()=>{(coverage.policy as any).frame.firstTurnHash='tampered'}).toThrow()
})

it('retains valid local facts when a new witness invalidates the global comparison',()=>{
  const t=fixture(),a=t.atom('all-pairs'),old=t.store.units(a)
  for(const u of old)t.review(a,u)
  const oldCoverage=t.store.coverage(a)!
  expect(t.store.derive(a).status).toBe('verified')
  t.store.useLibrary(grown)
  const current=t.store.derive(a)
  expect(current.status).toBe('needs-evaluation')
  expect(old.every(u=>current.provenUnitIds.includes(u.id))).toBe(true)
  expect(()=>readVerifiedAtomicCoverage(oldCoverage)).toThrow('superata')
  for(const u of t.store.units(a).filter(u=>!current.provenUnitIds.includes(u.id)))t.review(a,u)
  expect(t.store.derive(a).status).toBe('verified')
})

it('invalidates complete absence after domain growth while preserving unchanged negative cells',()=>{
  const t=fixture(),a=t.atom(),old=t.store.units(a)
  for(const u of old)t.review(a,u,'does-not-prove')
  expect(t.store.derive(a).constructionAuthorized).toBe(true)
  t.store.useLibrary(grown)
  const result=t.store.derive(a)
  expect(result.constructionAuthorized).toBe(false)
  expect(old.every(u=>result.negativeUnitIds.includes(u.id))).toBe(true)
  expect(result.incompleteUnitIds.length).toBeGreaterThan(0)
})

it('preserves an existential certificate over the same body when unrelated candidates arrive',()=>{
  const t=fixture(),a=t.atom();t.review(a,t.store.units(a)[0])
  const coverage=t.store.coverage(a)!
  t.store.useLibrary(grown)
  expect(readVerifiedAtomicCoverage(coverage).atomId).toBe(a.id)
})

it('does not turn an incomplete or conflicting critic into permission to close or construct',()=>{
  const t=fixture(),a=t.atom(),u=t.store.units(a)[0]
  t.review(a,u,'incomplete')
  expect(t.store.derive(a).status).toBe('needs-evaluation')
  expect(t.store.pendingWork(a)).toContainEqual({unitId:u.id,needs:'numeric-evaluation'})
  expect(()=>t.review(a,u,'incomplete',{needs:'none'})).toThrow('percorso esplicito')
  t.review(a,u,'proves');const coverage=t.store.coverage(a)!
  t.review(a,u,'does-not-prove')
  expect(t.store.derive(a)).toMatchObject({status:'conflicted',constructionAuthorized:false})
  expect(t.store.pendingWork(a)).toContainEqual({unitId:u.id,needs:'adjudication'})
  expect(()=>readVerifiedAtomicCoverage(coverage)).toThrow('superata')
})

it('requires every mandatory comparison and every referenced member of an irreducible group',()=>{
  const t=fixture(grown),a=t.atom('all-pairs'),units=t.store.units(a)
  expect(units.length).toBeGreaterThan(1)
  for(const u of units.slice(0,-1))t.review(a,u)
  expect(t.store.derive(a).status).toBe('needs-evaluation')
  const group=t.store.predicate('Joint witness','Requires every complete member',['card:p'],{kind:'group',memberIds:grown.members.map(m=>m.id),frameMode:'declared-conditional'},['proposer'])
  const unit=t.store.units(group)[0]
  expect(()=>t.review(group,unit,'proves',{witnesses:[]})).toThrow('citazioni incomplete')
  t.review(group,unit)
  expect(t.store.derive(group).status).toBe('verified')
  const missing=t.store.predicate('Missing group member','No fallback',['card:p'],{kind:'group',memberIds:['unknown'],frameMode:'declared-conditional'},['proposer'])
  expect(t.store.derive(missing).status).toBe('blocked')
})

it('rejects missing bodies, unknown turns, wrong sources and producer self-review without polluting accepted state',()=>{
  const t=fixture(),a=t.atom(),u=t.store.units(a)[0],producer=base.members.find(m=>m.id===u.witnesses[0].id)!.producers[0].references[0].unitId
  expect(()=>t.review(a,u,'proves',{}, {readWitnesses:[]})).toThrow('corpi non letti')
  expect(()=>t.review(a,u,'proves',{sourceIds:[]})).toThrow()
  expect(()=>t.review(a,u,'proves',{witnesses:u.witnesses.map(w=>({...w,turnNumbers:[999]}))})).toThrow('citazioni')
  expect(()=>t.review(a,u,'proves',{}, {requestId:producer})).toThrow('produttore')
  expect(()=>t.review(a,u,'proves',{}, {requestId:'synthetic-proposer'})).toThrow('autocertificata')
  expect(t.store.serialize()).toContain('"records":[]')
  t.review(a,u)
  expect(t.store.derive(a).status).toBe('verified')
})

it('pins persisted history, detects missing opinions and keeps stale contexts from becoming current facts',()=>{
  const t=fixture(),a=t.atom(),u=t.store.units(a)[0]
  t.review(a,u);t.review(a,u,'does-not-prove')
  const raw=t.store.serialize(),reopened=GuideAtomicProofStore.open(raw,guideHash(raw),base,environment(),t.receipts)
  expect(reopened.derive(a).status).toBe('conflicted')
  const changed=JSON.parse(raw);changed.records.pop();const stripped=JSON.stringify(changed)
  expect(()=>GuideAtomicProofStore.open(stripped,guideHash(raw),base,environment(),t.receipts)).toThrow('radice persistita')
  const missing=GuideAtomicProofStore.open(stripped,guideHash(stripped),base,environment(),t.receipts)
  expect(missing.derive(a).status).toBe('needs-evaluation') // trusted negative receipt is still known
  expect(missing.pendingWork(a)).toContainEqual({unitId:u.id,needs:'reload-receipt'})
  const next=GuideAtomicProofStore.open(raw,guideHash(raw),base,{...environment(),evidenceHash:'new-current-evidence'},t.receipts)
  const fresh=next.predicate(a.statement,a.conditions,a.sourceIds,a.policy,a.authorRequestIds)
  expect(next.derive(fresh).status).toBe('needs-evaluation')
  expect(()=>next.derive(a)).toThrow('contesto alterati')
})

it('refuses a self-declared library and policies that silently omit comparison frame conditions',()=>{
  expect(()=>new GuideAtomicProofStore(JSON.parse(JSON.stringify(base)),environment())).toThrow('biblioteca non verificata')
  const t=fixture(),ids=base.members.map(m=>m.id)
  expect(()=>t.store.predicate('Pair','Fixed',['card:p'],{kind:'pair',firstId:ids[0],secondId:ids[1]} as any,['proposer'])).toThrow('campi non validi')
  expect(()=>t.store.useLibrary(JSON.parse(JSON.stringify(grown)))).toThrow('scope o frame')
})

it('allows a complete positive body but no global absence/comparison claim from a partial library',()=>{
  const db=new DatabaseSync(f.file),target=grown.members.find(m=>!base.members.some(old=>old.id===m.id))!
  try{for(const ref of target.producers.at(-1)!.references)db.prepare("DELETE FROM ai_evidence_values WHERE role='guide-segment-unit-result-v1' AND key=?").run(ref.key)}finally{db.close()}
  const partial=readGuideWitnessLibrary(f.main,f.options)
  expect(partial.complete).toBe(false);expect(partial.members.length).toBeGreaterThan(0)
  const t=fixture(partial),a=t.atom()
  for(const u of t.store.units(a))t.review(a,u,'does-not-prove')
  expect(t.store.derive(a).constructionAuthorized).toBe(false)
  const positive=fixture(partial),p=positive.atom();positive.review(p,positive.store.units(p)[0])
  expect(positive.store.derive(p).status).toBe('verified')
  const pair=positive.atom('all-pairs')
  for(const unit of positive.store.units(pair))positive.review(pair,unit)
  expect(positive.store.derive(pair).status).toBe('needs-evaluation')
})
