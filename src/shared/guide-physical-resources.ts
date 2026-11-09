import type { GuideList, GuideScenario } from './matchup-guide'
import type { GuideSetupLedger } from './guide-setup-ledger'

type Event = Pick<GuideSetupLedger['events'][number], 'side' | 'turn' | 'moves' | 'deckObservations'>
type Resource = GuideScenario['resources'][number]

/** A possible physical-copy allocation. Recovered/reshuffled copies are reused
 * first. Counts cover revealed copies, including unused draws and prize takes;
 * mutually exclusive paths contribute their maximum, never their sum. */
export function physicalResources(s: GuideScenario, ours: GuideList, opponent: GuideList, paths: Event[][],observed=false) {
  const maximum = new Map<string, number>(), primaryByTurn = new Map<number, Resource[]>()
  for (const [pathIndex, path] of paths.entries()) {
    const zones = new Map<string, string[]>(), seen = new Set<string>(), identity = new Map<string, Resource>()
    for (const [side, list] of [['ours', ours], ['opponent', opponent]] as const) for (const card of list.cards) {
      const ids = Array.from({ length: card.count }, (_, i) => `${side}|${card.printId}|${i}`)
      zones.set(`${side}|${card.printId}|deck`, ids)
      for (const id of ids) identity.set(id, { side, printId: card.printId, count: 1 })
    }
    const counts = () => {
      const result = new Map<string, Resource>()
      for (const id of seen) {
        const r = identity.get(id)!, key = `${r.side}|${r.printId}`, previous = result.get(key)
        result.set(key, { ...r, count: (previous?.count ?? 0) + 1 })
      }
      return [...result.values()]
    }
    const move = (m: Event['moves'][number]) => {
      const from = `${m.side}|${m.printId}|${m.from}`, to = `${m.side}|${m.printId}|${m.to}`, pool = zones.get(from) ?? []
      if (pool.length < m.count) throw new Error(`${s.id}: copie fisiche non disponibili per ${m.printId}.`)
      pool.sort((a, b) => Number(seen.has(b)) - Number(seen.has(a)))
      const moved = pool.splice(0, m.count)
      zones.set(from, pool); zones.set(to, [...zones.get(to) ?? [], ...moved])
      if (!['deck', 'prizes'].includes(m.from) || !['deck', 'prizes'].includes(m.to)) for (const id of moved) seen.add(id)
    }
    for (const [to, cards] of [['hand', s.setupLedger!.openingHands], ['prizes', s.setupLedger!.openingPrizes]] as const)
      for (const c of cards) move({ ...c, from: 'deck', to })
    const observe=(e:Event)=>{
      if(!observed)return
      const used=new Set<string>()
      for(const r of e.deckObservations??[]){
        const pool=[...zones.get(`${r.side}|${r.printId}|deck`)??[]].filter(id=>!used.has(id)).sort((a,b)=>Number(seen.has(b))-Number(seen.has(a)))
        if(pool.length<r.count)throw new Error(`${s.id}: copie osservate non disponibili nel mazzo per ${r.printId}.`)
        for(const id of pool.slice(0,r.count)){used.add(id);seen.add(id)}
      }
    }
    for (const e of s.setupLedger!.events) {for (const m of e.moves) move(m);observe(e)}
    for (const e of path) {
      for (const m of e.moves) move(m)
      observe(e)
      if (pathIndex === 0) primaryByTurn.set(e.turn, counts())
    }
    for (const r of counts()) {
      const key = `${r.side}|${r.printId}`
      maximum.set(key, Math.max(maximum.get(key) ?? 0, r.count))
    }
  }
  return { resources: [...maximum].map(([key, count]) => { const [side, printId] = key.split('|'); return { side, printId, count } as Resource }), primaryByTurn }
}
