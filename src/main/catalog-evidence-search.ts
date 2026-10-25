import { createHash } from 'node:crypto'
import type { CatalogPrint, CatalogView } from '../shared/catalog'
import { hasComparableGameplay } from '../shared/card-gameplay'
import { effectiveCardGameplay, type EffectiveCardGameplay } from '../shared/card-errata'
import { localCalendarDate } from '../shared/calendar-date'

export interface CatalogEvidenceQuery {
  /** Literal English terms. This is a lexical search, not semantic inference. */
  terms?: readonly string[]
  printIds?: readonly string[]
  identityIds?: readonly string[]
  mode?: 'any' | 'all'
  asOf?: string
  offset?: number
  limit?: number
}

export interface CatalogEvidenceMatch {
  printId: string
  identityId: string | null
  name: string
  sourceUrl: string
  detailAt: string | null
  comparableGameplay: boolean
  gameplay: CatalogPrint['gameplay']
  printedGameplay: CatalogPrint['gameplay']
  errataStatus: EffectiveCardGameplay['status']
  errataSourceUrl: string | null
  rarity: string | null
  variants: CatalogPrint['variants']
  reason: 'exact-print' | 'same-identity' | 'text'
  matchedTerms: string[]
}

export interface CatalogEvidenceSearch {
  schemaVersion: 1
  snapshotHash: string
  scope: {
    kind: CatalogView['scope']['kind']
    expected: number
    indexed: number
    notInventoried: number
    withDetail: number
    withGameplay: number
    withoutDetail: number
    incompleteGameplay: number
    missingPreview: string[]
  }
  criterion: { kind: 'literal-tokens'; terms: string[]; mode: 'any' | 'all'; asOf: string;
    printIds: string[]; identityIds: string[] }
  ruleVersion: string | null
  errataCheckedAt: string | null
  totalMatches: number
  unknownPrintIds: string[]
  unknownIdentityIds: string[]
  offset: number
  matches: CatalogEvidenceMatch[]
  remaining: number
  /** Completeness is relative only to this local inventory and literal criterion. */
  completeForLocalCriterion: boolean
}

interface IndexedPrint {
  print: CatalogPrint
  words: Set<string>
  comparable: boolean
  effective: EffectiveCardGameplay
}

interface Index {
  rows: IndexedPrint[]
  byWord: Map<string, number[]>
  byId: Map<string, number>
  byIdentity: Map<string, number[]>
  hash: string
  scope: CatalogEvidenceSearch['scope']
}

const indexes = new WeakMap<CatalogView, Map<string, Index>>()

function words(value: string): string[] {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('en').match(/[a-z0-9]+/g) ?? []
}

function searchableText(print: CatalogPrint, game: CatalogPrint['gameplay']): string {
  return [print.id, print.name, print.category, print.stage, print.energyType,
    game?.hp, game?.types.join(' '), game?.evolveFrom, game?.trainerType,
    game?.effect, game?.retreat,
    ...game?.attacks.flatMap((attack) =>
      [attack.name, attack.cost?.join(' '), attack.damage, attack.effect]) ?? [],
    ...game?.abilities.flatMap((ability) => [ability.name, ability.type, ability.effect]) ?? [],
    ...game?.weaknesses.flatMap((item) => [item.type, item.value]) ?? [],
    ...game?.resistances.flatMap((item) => [item.type, item.value]) ?? []]
    .filter((value) => value !== null && value !== undefined).join(' ')
}

function indexFor(catalog: CatalogView, asOf: string): Index {
  const byDate = indexes.get(catalog)
  const cached = byDate?.get(asOf)
  if (cached) return cached
  const rows: IndexedPrint[] = []
  const byWord = new Map<string, number[]>()
  const byId = new Map<string, number>()
  const byIdentity = new Map<string, number[]>()
  const digest = createHash('sha256')
  let withDetail = 0
  let withGameplay = 0
  const missingPreview: string[] = []
  for (const print of catalog.prints) {
    const effective = effectiveCardGameplay(print, asOf, catalog.rulePackage)
    const comparable = print.detailAt !== null &&
      hasComparableGameplay(print.category, print.stage ?? null, print.energyType ?? null,
        effective.effective) && effective.status !== 'source-mismatch'
    if (print.detailAt) withDetail++
    if (comparable) withGameplay++
    else if (missingPreview.length < 24) missingPreview.push(print.id)
    const row = rows.length
    const tokenSet = new Set(words(searchableText(print, effective.effective)))
    rows.push({ print, words: tokenSet, comparable, effective })
    byId.set(print.id, row)
    if (print.identityId) {
      const rowsForIdentity = byIdentity.get(print.identityId) ?? []
      rowsForIdentity.push(row)
      byIdentity.set(print.identityId, rowsForIdentity)
    }
    for (const word of tokenSet) {
      const rowsForWord = byWord.get(word) ?? []
      rowsForWord.push(row)
      byWord.set(word, rowsForWord)
    }
    digest.update(JSON.stringify({ id: print.id, detailAt: print.detailAt,
      sourceUpdated: print.sourceUpdated, identityId: print.identityId,
      gameplay: print.gameplay, variants: print.variants,
      effective: effective.effective, errataStatus: effective.status }))
  }
  const expected = catalog.standardCoverage?.expected ?? catalog.prints.length
  const scope = { kind: catalog.scope.kind, expected, indexed: rows.length,
    notInventoried: Math.max(0, expected - rows.length),
    withDetail, withGameplay, withoutDetail: rows.length - withDetail,
    incompleteGameplay: rows.length - withGameplay, missingPreview }
  digest.update(JSON.stringify({ source: catalog.source, syncedAt: catalog.syncedAt,
    kind: catalog.scope.kind, expected, asOf, ruleVersion: catalog.rulePackage?.version }))
  const index = { rows, byWord, byId, byIdentity,
    hash: digest.digest('hex'), scope }
  const stored = byDate ?? new Map<string, Index>()
  stored.set(asOf, index)
  indexes.set(catalog, stored)
  return index
}

/** Search every locally inventoried print before applying the response page limit. */
export function searchCatalogEvidence(catalog: CatalogView,
  query: CatalogEvidenceQuery): CatalogEvidenceSearch {
  const asOf = query.asOf ?? localCalendarDate()
  const index = indexFor(catalog, asOf)
  const terms = [...new Set((query.terms ?? []).slice(0, 16).flatMap((term) => words(term.slice(0, 120))))]
  const printIds = [...new Set((query.printIds ?? []).slice(0, 120))]
  const identityIds = [...new Set((query.identityIds ?? []).slice(0, 120))]
  const unknownPrintIds = printIds.filter((id) => !index.byId.has(id))
  const unknownIdentityIds = identityIds.filter((id) => !index.byIdentity.has(id))
  const mode = query.mode ?? 'any'
  const offset = Math.max(0, Math.floor(query.offset ?? 0))
  const limit = Math.max(1, Math.min(200, Math.floor(query.limit ?? 48)))
  const found = new Map<number, CatalogEvidenceMatch['reason']>()
  if (terms.length) {
    const wordRows = terms.map((term) => index.byWord.get(term) ?? [])
    const candidates = mode === 'all'
      ? wordRows.reduce<number[]>((current, next) => {
        const allowed = new Set(next)
        return current.filter((row) => allowed.has(row))
      }, wordRows[0] ?? [])
      : wordRows.flat()
    for (const row of candidates) found.set(row, 'text')
  }
  for (const id of identityIds) for (const row of index.byIdentity.get(id) ?? [])
    found.set(row, 'same-identity')
  for (const id of printIds) {
    const row = index.byId.get(id)
    if (row !== undefined) found.set(row, 'exact-print')
  }
  const ranked = [...found].map(([row, reason]) => {
    const item = index.rows[row]
    const matchedTerms = terms.filter((term) => item.words.has(term))
    return { printId: item.print.id, identityId: item.print.identityId,
      name: item.print.name, sourceUrl: item.print.sourceUrl,
      detailAt: item.print.detailAt, comparableGameplay: item.comparable,
      gameplay: item.effective.effective, printedGameplay: item.effective.printed,
      errataStatus: item.effective.status, errataSourceUrl: item.effective.errataSourceUrl,
      rarity: item.print.rarity, variants: item.print.variants,
      reason, matchedTerms }
  }).sort((a, b) => {
    const priority = { 'exact-print': 3, 'same-identity': 2, text: 1 }
    return priority[b.reason] - priority[a.reason] ||
      b.matchedTerms.length - a.matchedTerms.length || a.printId.localeCompare(b.printId)
  })
  const matches = ranked.slice(offset, offset + limit)
  return { schemaVersion: 1, snapshotHash: index.hash, scope: index.scope,
    criterion: { kind: 'literal-tokens', terms, mode, asOf, printIds, identityIds },
    ruleVersion: catalog.rulePackage?.version ?? null,
    errataCheckedAt: catalog.rulePackage?.errata.checkedAt ?? null,
    totalMatches: ranked.length, unknownPrintIds, unknownIdentityIds, offset, matches,
    remaining: Math.max(0, ranked.length - offset - matches.length),
    completeForLocalCriterion: index.scope.kind === 'standard-marks' &&
      index.scope.expected === index.scope.indexed &&
      index.scope.withGameplay === index.scope.indexed &&
      unknownPrintIds.length === 0 && unknownIdentityIds.length === 0 }
}
