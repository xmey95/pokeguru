import type { GuideList, GuideScenario } from './matchup-guide'

export const guideZones = ['active', 'bench', 'evolution', 'attached', 'hand', 'discard', 'prizes', 'deck', 'stadium', 'lost'] as const
export const guideSetupKinds = ['turn-draw', 'effect', 'play', 'evolve', 'retreat', 'knockout', 'prize', 'setup'] as const
type Side = 'ours' | 'opponent'
type Zone = typeof guideZones[number]
export interface GuideSetupLedger {
  openingHands: { side: Side; printId: string; count: number }[]
  openingPrizes: { side: Side; printId: string; count: number }[]
  events: { side: Side; turn: number; kind: typeof guideSetupKinds[number]; description: string;
    deckObservations?: {side:Side;printId:string;count:number;position:'top'|'bottom';sourceIds:string[]}[];
    moves: { side: Side; printId: string; count: number; from: Zone; to: Zone }[];
    handAfter: { ours: number; opponent: number } }[]
}

export function isGuideSetupLedger(raw: unknown): raw is GuideSetupLedger {
  const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
  const count = (v: unknown) => Number.isSafeInteger(v) && Number(v) >= 0 && Number(v) <= 60
  const card = (v: unknown) => object(v) && ['ours', 'opponent'].includes(String(v.side)) &&
    typeof v.printId === 'string' && /^[a-zA-Z0-9:._-]{1,160}$/.test(v.printId) && count(v.count) && Number(v.count) > 0
  const cards = (v: unknown) => Array.isArray(v) && v.length <= 26 && v.every(card)
  return object(raw) && cards(raw.openingHands) && cards(raw.openingPrizes) && Array.isArray(raw.events) &&
    raw.events.length > 0 && raw.events.length <= 160 && raw.events.every(e => object(e) &&
      ['ours', 'opponent'].includes(String(e.side)) && count(e.turn) && guideSetupKinds.includes(e.kind as never) &&
      typeof e.description === 'string' && !!e.description.trim() && e.description.length <= 2000 &&
      Array.isArray(e.moves) && e.moves.length <= 80 && e.moves.every(m => card(m) && object(m) &&
        guideZones.includes(m.from as Zone) && guideZones.includes(m.to as Zone) && m.from !== m.to) &&
      object(e.handAfter) && count(e.handAfter.ours) && count(e.handAfter.opponent))
}

/** Card conservation and provenance, not a simulator of card effects or turn legality. */
export function checkGuideSetupLedger(s: GuideScenario, ours: GuideList, opponent?: GuideList): string[] {
  if (!s.setupLedger || !opponent) return []
  const errors: string[] = [], ledger = s.setupLedger
  const balances = new Map<string, number>(), draws = { ours: 0, opponent: 0 }, returns = { ours: 0, opponent: 0 }
  const key = (side: Side, print: string, zone: Zone) => `${side}|${print}|${zone}`
  for (const side of ['ours', 'opponent'] as const) for (const card of (side === 'ours' ? ours : opponent).cards)
    balances.set(key(side, card.printId, 'deck'), card.count)
  const move = (side: Side, print: string, count: number, from: Zone, to: Zone, label: string) => {
    const origin = key(side, print, from), destination = key(side, print, to)
    if ((balances.get(origin) ?? 0) < count) errors.push(`${s.id}: registro ${label}, ${side} non dispone di ${print} ×${count} in ${from}.`)
    balances.set(origin, (balances.get(origin) ?? 0) - count)
    balances.set(destination, (balances.get(destination) ?? 0) + count)
  }
  for (const [zone, cards, expected] of [['hand', ledger.openingHands, 7], ['prizes', ledger.openingPrizes, 6]] as const) {
    for (const side of ['ours', 'opponent'] as const) if (cards.filter(c => c.side === side).reduce((n, c) => n + c.count, 0) !== expected)
      errors.push(`${s.id}: registro iniziale ${side}, servono ${expected} carte in ${zone}.`)
    for (const card of cards) move(card.side, card.printId, card.count, 'deck', zone, 'iniziale')
  }
  const drawnTurns = new Set<string>()
  let previousTurn = 0
  for (const [i, event] of ledger.events.entries()) {
    const label = `evento ${i + 1}`
    if (event.turn < previousTurn) errors.push(`${s.id}: registro ${label}, ordine dei turni non valido.`)
    previousTurn = event.turn
    if (event.kind === 'turn-draw') {
      const turnKey = `${event.side}:${event.turn}`
      if (event.turn === 0 || drawnTurns.has(turnKey) || event.moves.length !== 1 || event.moves[0].side !== event.side ||
        event.moves[0].count !== 1 || event.moves[0].from !== 'deck' || event.moves[0].to !== 'hand')
        errors.push(`${s.id}: registro ${label}, pescata di turno non valida.`)
      drawnTurns.add(turnKey); draws[event.side]++
    }
    for (const m of event.moves) {
      move(m.side, m.printId, m.count, m.from, m.to, label)
      if (m.to === 'deck') returns[m.side] += m.count
    }
    for (const side of ['ours', 'opponent'] as const) {
      const hand = [...balances].filter(([k]) => k.startsWith(`${side}|`) && k.endsWith('|hand')).reduce((n, [, count]) => n + count, 0)
      if (hand !== event.handAfter[side]) errors.push(`${s.id}: registro ${label}, mano ${side} dichiarata ${event.handAfter[side]} ma calcolata ${hand}.`)
    }
  }
  const expected = new Map<string, number>()
  for (const row of s.inventory) { const k = key(row.side, row.printId, row.zone); expected.set(k, (expected.get(k) ?? 0) + row.count) }
  for (const k of new Set([...balances.keys(), ...expected.keys()])) if ((balances.get(k) ?? 0) !== (expected.get(k) ?? 0))
    errors.push(`${s.id}: registro finale non coincide con inventory per ${k}.`)
  for (const side of ['ours', 'opponent'] as const) {
    if (draws[side] !== s.setupDraws[side]) errors.push(`${s.id}: registro pescate di turno ${side} non coincide con setupDraws.`)
    if (returns[side] !== s.returnedToDeck[side]) errors.push(`${s.id}: registro ritorni nel mazzo ${side} non coincide con returnedToDeck.`)
  }
  return errors
}
