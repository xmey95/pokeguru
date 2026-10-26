import bundled from './western-rule-package.json'
import type { CardGameplay } from './catalog'

export interface RulePeriod {
  version: string
  effectiveFrom: string
  effectiveUntil: string
  firstAllowedMark: string
  lastConfirmedMark: string
  sourceUrl: string
}

export interface SetAdmissionRule {
  setId: string
  /** Qualifying official product release for a derived two-week date. */
  releaseDate?: string
  legalDate: string
  method: 'two-weeks' | 'explicit'
  sourceUrl: string
  releaseSourceUrl?: string
}

export interface WesternRulePackage {
  schema: 1
  version: string
  circuit: 'WESTERN'
  checkedAt: string
  standardBans: { checkedAt: string; sourceUrl: string; cardNames: string[] }
  errata: { checkedAt: string; sourceUrl: string; lastUpdated: string;
    corrections?: { printId: string; effectiveFrom: string; sourceUrl: string;
      printed: CardGameplay; corrected: CardGameplay }[] }
  rotations: RulePeriod[]
  setAdmissions: SetAdmissionRule[]
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Pacchetto regole non valido.')
  return value as Record<string, unknown>
}

function isoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value
}

function officialSource(value: unknown): value is string {
  if (typeof value !== 'string') return false
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && ['www.pokemon.com', 'community.pokemon.com', 'press.pokemon.com', 'play.pokemon.com', 'worlds.2024.pokemon.com']
      .includes(url.hostname) && !url.username && !url.password
  } catch { return false }
}

function daysAfter(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`)
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}

function cardGameplay(value: unknown): value is CardGameplay {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const game = value as Partial<CardGameplay>
  const nullableText = (item: unknown): boolean => item === null || typeof item === 'string'
  const modifier = (item: unknown): boolean => !!item && typeof item === 'object' &&
    typeof (item as { type?: unknown }).type === 'string' &&
    typeof (item as { value?: unknown }).value === 'string'
  return (game.hp === null || Number.isInteger(game.hp) && (game.hp ?? 0) > 0) &&
    Array.isArray(game.types) && game.types.every((item) => typeof item === 'string') &&
    nullableText(game.evolveFrom) && Array.isArray(game.attacks) &&
    game.attacks.every((item) => item && typeof item.name === 'string' &&
      (item.cost === null || Array.isArray(item.cost) && item.cost.every((cost) => typeof cost === 'string')) &&
      nullableText(item.damage) && nullableText(item.effect)) &&
    Array.isArray(game.abilities) && game.abilities.every((item) => item &&
      typeof item.name === 'string' && typeof item.effect === 'string' && nullableText(item.type)) &&
    nullableText(game.effect) && nullableText(game.trainerType) &&
    Array.isArray(game.weaknesses) && game.weaknesses.every(modifier) &&
    Array.isArray(game.resistances) && game.resistances.every(modifier) &&
    (game.retreat === null || Number.isInteger(game.retreat) && (game.retreat ?? -1) >= 0)
}

/** Validate curated data before it can replace the bundled snapshot. */
export function parseWesternRulePackage(input: unknown): WesternRulePackage {
  const value = record(input)
  if (value.schema !== 1 || value.circuit !== 'WESTERN' ||
    typeof value.version !== 'string' || !/^\d{4}-\d{2}-\d{2}\.\d+$/.test(value.version) ||
    !isoDate(value.checkedAt) || !Array.isArray(value.rotations) || !Array.isArray(value.setAdmissions) ||
    value.rotations.length === 0 || value.rotations.length > 10 || value.setAdmissions.length > 150) {
    throw new Error('Versione o struttura del pacchetto regole non valida.')
  }
  const bans = record(value.standardBans)
  const errata = record(value.errata)
  if (!isoDate(bans.checkedAt) || bans.checkedAt > value.checkedAt || !officialSource(bans.sourceUrl) ||
    !Array.isArray(bans.cardNames) || bans.cardNames.length > 100 ||
    !bans.cardNames.every((name) => typeof name === 'string' && name.length > 0 && name.length <= 100) ||
    new Set(bans.cardNames.map((name: string) => name.toLocaleLowerCase())).size !== bans.cardNames.length ||
    !isoDate(errata.checkedAt) || errata.checkedAt > value.checkedAt ||
    !officialSource(errata.sourceUrl) || !isoDate(errata.lastUpdated) ||
    errata.lastUpdated > errata.checkedAt) {
    throw new Error('Fonti o elenco delle carte vietate non validi nel pacchetto.')
  }
  const errataCheckedAt = errata.checkedAt as string
  const corrections = errata.corrections === undefined ? [] : errata.corrections
  if (!Array.isArray(corrections) || corrections.length > 200) throw new Error('Errata non valide nel pacchetto.')
  const correctedPrints = new Set<string>()
  const parsedCorrections = corrections.map((entry): NonNullable<WesternRulePackage['errata']['corrections']>[number] => {
    const correction = record(entry)
    if (typeof correction.printId !== 'string' ||
      !/^[a-zA-Z0-9.]+-[a-zA-Z0-9.]+$/.test(correction.printId) ||
      !isoDate(correction.effectiveFrom) || correction.effectiveFrom > errataCheckedAt ||
      !officialSource(correction.sourceUrl) ||
      !cardGameplay(correction.printed) || !cardGameplay(correction.corrected) ||
      JSON.stringify(correction.printed) === JSON.stringify(correction.corrected) ||
      correctedPrints.has(correction.printId)) throw new Error('Errata per stampa non valida o duplicata.')
    correctedPrints.add(correction.printId)
    return correction as unknown as NonNullable<WesternRulePackage['errata']['corrections']>[number]
  })
  const rotations: RulePeriod[] = value.rotations.map((raw) => {
    const rule = record(raw)
    if (typeof rule.version !== 'string' || !/^play-\d{4}-\d{2}-\d{2}$/.test(rule.version) ||
      !isoDate(rule.effectiveFrom) || !isoDate(rule.effectiveUntil) || rule.effectiveFrom > rule.effectiveUntil ||
      typeof rule.firstAllowedMark !== 'string' || !/^[A-Z]$/.test(rule.firstAllowedMark) ||
      typeof rule.lastConfirmedMark !== 'string' || !/^[A-Z]$/.test(rule.lastConfirmedMark) ||
      rule.firstAllowedMark > rule.lastConfirmedMark || !officialSource(rule.sourceUrl)) {
      throw new Error('Intervallo di rotazione non valido nel pacchetto.')
    }
    return rule as unknown as RulePeriod
  })
  for (let i = 1; i < rotations.length; i++) {
    if (rotations[i - 1].effectiveUntil >= rotations[i].effectiveFrom) {
      throw new Error('Intervalli di rotazione sovrapposti o non ordinati.')
    }
  }
  const seen = new Set<string>()
  const setAdmissions: SetAdmissionRule[] = value.setAdmissions.map((raw) => {
    const rule = record(raw)
    if (typeof rule.setId !== 'string' || !/^[a-z0-9.]{2,20}$/.test(rule.setId) ||
      !isoDate(rule.legalDate) || !['two-weeks', 'explicit'].includes(String(rule.method)) ||
      !officialSource(rule.sourceUrl) || seen.has(rule.setId) ||
      (rule.method === 'two-weeks' && (!isoDate(rule.releaseDate) ||
        !officialSource(rule.releaseSourceUrl) ||
        daysAfter(rule.releaseDate, 14) !== rule.legalDate)) ||
      (rule.method === 'explicit' && (rule.releaseDate !== undefined ||
        rule.releaseSourceUrl !== undefined))) {
      throw new Error('Data di ammissione non valida o duplicata nel pacchetto.')
    }
    seen.add(rule.setId)
    return rule as unknown as SetAdmissionRule
  })
  return { schema: 1, version: value.version, circuit: 'WESTERN', checkedAt: value.checkedAt,
    standardBans: bans as unknown as WesternRulePackage['standardBans'],
    errata: { checkedAt: errata.checkedAt as string, sourceUrl: errata.sourceUrl as string,
      lastUpdated: errata.lastUpdated as string, corrections: parsedCorrections },
    rotations, setAdmissions }
}

export const BUNDLED_WESTERN_RULE_PACKAGE = parseWesternRulePackage(bundled)
