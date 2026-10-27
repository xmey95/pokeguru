import type { CardGameplay, CatalogAdvancedMatch, CatalogAdvancedPage, CatalogBrowseGroup,
  CatalogPrint, CatalogView } from '../shared/catalog'
import { gameplaySummary } from '../shared/card-gameplay'
import { effectiveCardGameplay } from '../shared/card-errata'
import { localCalendarDate } from '../shared/calendar-date'

export const CATALOG_ADVANCED_PLAN_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['mode', 'interpretation', 'category', 'stage', 'type', 'minHp', 'maxHp',
    'maxRetreat', 'textGroups'],
  properties: {
    mode: { type: 'string', enum: ['exact', 'interpretive'] },
    interpretation: { type: 'string' },
    category: { type: ['string', 'null'] },
    stage: { type: ['string', 'null'] },
    type: { type: ['string', 'null'] },
    minHp: { type: ['integer', 'null'] },
    maxHp: { type: ['integer', 'null'] },
    maxRetreat: { type: ['integer', 'null'] },
    textGroups: { type: 'array', items: { type: 'array', items: { type: 'string' } } }
  }
} as const

export const CATALOG_ADVANCED_ASSESSMENT_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['assessments'],
  properties: { assessments: { type: 'array', items: {
    type: 'object', additionalProperties: false,
    required: ['key', 'status', 'reason', 'conditions'],
    properties: { key: { type: 'string' },
      status: { type: 'string', enum: ['supported', 'possible', 'exclude'] },
      reason: { type: 'string' }, conditions: { type: ['string', 'null'] } }
  } } }
} as const

export type CatalogAdvancedPlan = {
  mode: 'exact' | 'interpretive'
  interpretation: string
  category: string | null
  stage: string | null
  type: string | null
  minHp: number | null
  maxHp: number | null
  maxRetreat: number | null
  /** AND across groups, OR within each group for exact mode; OR across groups for interpretive mode. */
  textGroups: string[][]
}

export type CatalogAdvancedCandidate = {
  group: CatalogBrowseGroup
  printIds: string[]
  setIds: string[]
  representative: CatalogPrint
  gameplay: string
  matchedPhrases: string[]
  score: number
}

export type CatalogAdvancedAssessment = {
  key: string
  status: 'supported' | 'possible' | 'exclude'
  reason: string
  conditions: string | null
}

function normalize(value: string): string {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('en').replace(/[^a-z0-9]+/g, ' ').trim()
}

const RETRIEVAL_STOP_WORDS = new Set(['a', 'an', 'and', 'any', 'are', 'as', 'at', 'be',
  'by', 'card', 'cards', 'each', 'for', 'from', 'has', 'have', 'in', 'into', 'is', 'it',
  'of', 'on', 'one', 'or', 'opponent', 'opponents', 'pokemon', 'that', 'the', 'their',
  'this', 'to', 'up', 'your', 'you'])

function retrievalTokens(value: string): string[] {
  return [...new Set(normalize(value).split(' ').filter((word) =>
    word.length > 1 && !RETRIEVAL_STOP_WORDS.has(word)))]
}

export function hasCatalogAdvancedCriteria(plan: CatalogAdvancedPlan): boolean {
  return plan.textGroups.length > 0 || [plan.category, plan.stage, plan.type,
    plan.minHp, plan.maxHp, plan.maxRetreat].some((value) => value !== null)
}

export function readCatalogAdvancedPlan(input: unknown): CatalogAdvancedPlan {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new Error('Codex non ha restituito un filtro valido.')
  const value = input as Record<string, unknown>
  if (!['exact', 'interpretive'].includes(value.mode as string) ||
    typeof value.interpretation !== 'string' || !value.interpretation.trim() ||
    value.interpretation.includes('\0') || !Array.isArray(value.textGroups))
    throw new Error('Codex non ha restituito un filtro valido. Riprova la ricerca.')
  const optionalText = (item: unknown): string | null =>
    typeof item === 'string' && item.trim() && !item.includes('\0')
      ? item.trim().slice(0, 40) : null
  const optionalInt = (item: unknown, max: number): number | null =>
    Number.isInteger(item) && Number(item) >= 0 && Number(item) <= max ? Number(item) : null
  let remaining = 64
  const textGroups: string[][] = []
  for (const rawGroup of value.textGroups) {
    if (!Array.isArray(rawGroup) || remaining === 0) continue
    const group = [...new Set(rawGroup.filter((item): item is string =>
      typeof item === 'string' && !!item.trim() && !item.includes('\0'))
      .map((item) => item.trim().slice(0, 80)))].slice(0, remaining)
    if (!group.length) continue
    textGroups.push(group)
    remaining -= group.length
    if (textGroups.length === 8) break
  }
  const plan: CatalogAdvancedPlan = {
    mode: value.mode as CatalogAdvancedPlan['mode'],
    interpretation: value.interpretation.trim().slice(0, 300),
    category: optionalText(value.category), stage: optionalText(value.stage),
    type: optionalText(value.type), minHp: optionalInt(value.minHp, 1000),
    maxHp: optionalInt(value.maxHp, 1000), maxRetreat: optionalInt(value.maxRetreat, 10),
    textGroups
  }
  // Literal effect terms are retrieval hints, never proof of a semantic effect.
  return plan.mode === 'exact' && plan.textGroups.length ? { ...plan, mode: 'interpretive' } : plan
}

function textFor(print: CatalogPrint, effective: CardGameplay | null): {
  text: string; gameplay: string } {
  const gameplay = effective ? gameplaySummary(effective, print) : ''
  const text = normalize([print.name, print.category, print.stage, print.energyType,
    gameplay].filter(Boolean).join(' '))
  return { text, gameplay }
}

/** Examine every active print before grouping or limiting the model context. */
export function advancedCatalogCandidates(catalog: CatalogView, plan: CatalogAdvancedPlan,
  asOf = localCalendarDate()): CatalogAdvancedCandidate[] {
  const allGroups = new Map<string, CatalogBrowseGroup>()
  for (const print of catalog.prints) {
    const key = print.identityId ?? `pending-${print.id}`
    const group = allGroups.get(key) ?? { key, name: print.name, category: print.category,
      basis: print.identityBasis, printCount: 0 }
    group.printCount++
    allGroups.set(key, group)
  }
  const groups = new Map<string, CatalogAdvancedCandidate>()
  const normalizedGroups = plan.textGroups.map((items) => items.map((item) => ({
    phrase: normalize(item), tokens: retrievalTokens(item) })).filter((item) => item.phrase))
  for (const print of catalog.prints) {
    const game = effectiveCardGameplay(print, asOf, catalog.rulePackage).effective
    if (plan.category && normalize(print.category ?? '') !== normalize(plan.category)) continue
    if (plan.stage && normalize(print.stage ?? '') !== normalize(plan.stage)) continue
    if (plan.type && ![...(game?.types ?? []), print.energyType ?? '']
      .some((type) => normalize(type) === normalize(plan.type!))) continue
    if (plan.minHp !== null && (game?.hp === null || game?.hp === undefined || game.hp < plan.minHp)) continue
    if (plan.maxHp !== null && (game?.hp === null || game?.hp === undefined || game.hp > plan.maxHp)) continue
    if (plan.maxRetreat !== null && (game?.retreat === null || game?.retreat === undefined ||
      game.retreat > plan.maxRetreat)) continue
    const { text, gameplay } = textFor(print, game)
    const words = normalizedGroups.length ? new Set(text.split(' ')) : null
    const matches = normalizedGroups.map((alternatives) => {
      let best = { phrase: '', quality: 0 }
      for (const item of alternatives) {
        let quality = 0
        if (text.includes(item.phrase)) quality = 2 + Math.min(5, item.tokens.length) / 5
        else if (item.tokens.length >= 2) {
          const shared = item.tokens.filter((word) => words!.has(word)).length
          const threshold = Math.max(2, Math.ceil(item.tokens.length * 0.6))
          if (shared >= threshold) quality = 1 + shared / item.tokens.length
        }
        if (quality > best.quality) best = { phrase: item.phrase, quality }
      }
      return best
    })
    const matchedCount = matches.filter((item) => item.quality > 0).length
    const score = matches.reduce((total, item) => total + item.quality, 0)
    if (normalizedGroups.length && (plan.mode === 'exact' ? matchedCount !== normalizedGroups.length
      : matchedCount === 0)) continue
    const phrases = matches.filter((item) => item.quality > 0).map((item) => item.phrase)
    const key = print.identityId ?? `pending-${print.id}`
    const existing = groups.get(key)
    if (existing) {
      existing.printIds.push(print.id)
      if (!existing.setIds.includes(print.setId)) existing.setIds.push(print.setId)
      if (score > existing.score || score === existing.score && gameplay.length > existing.gameplay.length) {
        existing.representative = print
        existing.gameplay = gameplay
        existing.matchedPhrases = phrases
        existing.score = score
      }
    } else {
      groups.set(key, { group: allGroups.get(key)!, printIds: [print.id], setIds: [print.setId],
        representative: print, gameplay,
        matchedPhrases: phrases, score })
    }
  }
  return [...groups.values()].sort((a, b) => b.score - a.score ||
    a.group.name.localeCompare(b.group.name) || a.group.key.localeCompare(b.group.key))
}

export function readCatalogAdvancedAssessments(input: unknown,
  candidates: readonly CatalogAdvancedCandidate[]): Map<string, CatalogAdvancedAssessment> {
  const value = input && typeof input === 'object' && !Array.isArray(input)
    ? input as { assessments?: unknown } : null
  if (!Array.isArray(value?.assessments) || value.assessments.length > candidates.length)
    throw new Error('Codex non ha restituito una valutazione valida.')
  const allowed = new Set(candidates.map((item) => item.group.key))
  const result = new Map<string, CatalogAdvancedAssessment>()
  for (const raw of value.assessments) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue
    const item = raw as Partial<CatalogAdvancedAssessment>
    if (typeof item.key !== 'string' || !allowed.has(item.key) || result.has(item.key) ||
      !['supported', 'possible', 'exclude'].includes(item.status ?? '') ||
      typeof item.reason !== 'string' || !item.reason.trim() || item.reason.length > 400 ||
      item.conditions !== null && (typeof item.conditions !== 'string' || item.conditions.length > 300)) continue
    result.set(item.key, item as CatalogAdvancedAssessment)
  }
  return result
}

export function advancedCatalogMatches(candidates: readonly CatalogAdvancedCandidate[],
  plan: CatalogAdvancedPlan, assessments: ReadonlyMap<string, CatalogAdvancedAssessment>,
  reviewed: number): CatalogAdvancedMatch[] {
  const matches: CatalogAdvancedMatch[] = []
  for (const [index, candidate] of candidates.entries()) {
    const assessment = assessments.get(candidate.group.key)
    if (assessment?.status === 'exclude') continue
    const modelReviewed = index < reviewed && assessment !== undefined
    const supported = plan.mode === 'exact' || modelReviewed && assessment?.status === 'supported'
    matches.push({ ...candidate.group, assessment: supported ? 'supported' : 'possible',
      reason: assessment?.reason ?? (plan.mode === 'exact' ? plan.interpretation
        : `Indizi testuali: ${candidate.matchedPhrases.join(', ') || 'un criterio della ricerca'}. Da valutare.`),
      conditions: assessment?.conditions ?? (supported ? null : modelReviewed ? null
        : 'Questa carta non è stata valutata singolarmente dall’AI.'),
      sourcePrintId: candidate.representative.id,
      printIds: candidate.printIds, setIds: candidate.setIds })
  }
  return matches.sort((a, b) => a.assessment === b.assessment ? 0
    : a.assessment === 'supported' ? -1 : 1)
}

export function advancedCatalogPage(matches: readonly CatalogAdvancedMatch[], setId: string,
  offset: number, limit = 100): CatalogAdvancedPage {
  const filtered = setId === 'all' ? matches : matches.filter((item) => item.setIds.includes(setId))
  const start = Math.min(Math.max(0, offset),
    Math.max(0, Math.ceil(filtered.length / limit) - 1) * limit)
  return { total: filtered.length, offset: start,
    supported: filtered.filter((item) => item.assessment === 'supported').length,
    possible: filtered.filter((item) => item.assessment === 'possible').length,
    groups: filtered.slice(start, start + limit) }
}
