import type { GuideSetupLedger } from './guide-setup-ledger'
type CombatEvent = Pick<GuideSetupLedger['events'][number], 'side' | 'turn' | 'kind' | 'description' | 'moves'> & {
  action: string; affectedSide: string; attackName?: string | null; energyRoutes?: any[]
}

/** Preserve event indices. Only an explicit, adjacent, same-turn prize award
 * can be folded into its declared KO. No inferred KO, recipient or prize card.
 * Original output remains in turn blocks and the response archive. */
export function normalizeCombatEvents<T extends CombatEvent>(raw: T[]): T[] {
  const events = raw.map(e=>structuredClone(e))
  for (const [i, e] of events.entries()) {
    if(['active-ko','bench-ko'].includes(e.action)&&!e.moves.some(m=>m.side===e.affectedSide&&m.from===(e.action==='active-ko'?'active':'bench')&&['discard','lost'].includes(m.to)&&m.count===1))
      throw new Error('KO dichiarato senza rimozione esplicita della vittima dal campo.')
    const awards = e.moves.filter(m => m.from === 'prizes' && m.to === 'hand')
    if (!awards.length) continue
    if (e.action === 'active-ko' || e.action === 'bench-ko') {
      if (awards.some(m => m.side === e.affectedSide)) throw new Error('Premi attribuiti al lato del Pokémon KO.')
      continue
    }
    const ko = events[i - 1]
    if (e.kind !== 'prize' || e.action !== 'other' || e.attackName != null || awards.length !== e.moves.length ||
      !ko || !['active-ko', 'bench-ko'].includes(ko.action) || ko.turn !== e.turn || ko.side !== e.side ||
      !ko.moves.some(m => m.side === ko.affectedSide && m.from === (ko.action === 'active-ko' ? 'active' : 'bench') && ['discard', 'lost'].includes(m.to) && m.count === 1) ||
      ko.moves.some(m => m.from === 'prizes') || awards.some(m => m.side === ko.affectedSide))
      throw new Error('Evento Premio non collegato in modo univoco a un KO immediatamente precedente dello stesso turno.')
    if(ko.moves.length+awards.length>80)throw new Error('KO e Premi superano ottanta movimenti dichiarati.')
    ko.moves.push(...awards)
    if (e.energyRoutes?.length) ko.energyRoutes = [...ko.energyRoutes ?? [], ...e.energyRoutes]
    ko.description = `${ko.description} ${e.description}`
    Object.assign(ko, { prizeFoldedFrom: i })
    e.moves = []; e.energyRoutes = []
    e.description = 'I Premi dichiarati per il KO precedente sono già presi con quel KO.'
    Object.assign(e, { prizeResolvedAt: i - 1 })
  }
  return events
}
