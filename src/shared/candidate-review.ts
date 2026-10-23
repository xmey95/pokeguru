import type { CatalogView } from './catalog'
import type { DeckConstraint } from './constraints'
import { evaluateConstraints } from './constraints'
import type { DeckBaseline } from './deck-import'
import type { DeckCandidate } from './deck-threads'
import { evaluateStandardDeck } from './standard-deck'
import { normalizeDeckCodes } from './deck-code-normalization'
import { parseDeck } from './deck-import'

export interface CandidateReview {
  blockers: string[]
  toReview: string[]
  passed: string[]
  normalizedRawText: string
  conversions: { from: string; to: string; lineNumber: number }[]
  legal: 'indeterminate'
}

export function candidateBaseline(projectId: string, candidate: DeckCandidate, rawText = candidate.rawText): DeckBaseline {
  return { projectId, rawText, source: 'paste', fileName: null,
    importedAt: candidate.createdAt, ...parseDeck(rawText) }
}

export function reviewCandidate(projectId: string, candidate: DeckCandidate,
  catalog: CatalogView, constraints: DeckConstraint[], asOf: string): CandidateReview {
  const normalization = normalizeDeckCodes(candidate.rawText)
  const baseline = candidateBaseline(projectId, candidate, normalization.rawText)
  const standard = evaluateStandardDeck(baseline, catalog, asOf)
  const blockers = [...standard.problems]
  if (baseline.lines.some((line) => line.kind === 'unparsed')) blockers.push('La candidata contiene righe non interpretate.')
  if (normalization.unsupported.length)
    blockers.push(`Codici set con punto non verificati in Limitless: ${normalization.unsupported.map((item) => item.code).join(', ')}.`)
  if (baseline.diagnostics.some((item) => item.code === 'TOTAL_MISMATCH')) blockers.push('Il totale dichiarato non corrisponde alle carte interpretate.')
  if (baseline.diagnostics.some((item) => item.code === 'ALT_PRINT'))
    blockers.push('Le stampe ALT non sono riconosciute in modo affidabile da Limitless: correggi la lista prima dell’adozione.')
  const evaluated = evaluateConstraints(constraints, baseline, catalog)
  blockers.push(...evaluated.conflicts)
  for (const result of evaluated.results) {
    if (result.status === 'unmet') blockers.push(`Vincolo ${result.constraint.identityName}: ${result.message}`)
  }
  const toReview = [...standard.toReview, ...evaluated.results.filter((result) => result.status === 'indeterminate')
    .map((result) => `Vincolo ${result.constraint.identityName}: ${result.message}`)]
  return { blockers: [...new Set(blockers)], toReview, passed: standard.passed,
    normalizedRawText: normalization.rawText, conversions: normalization.conversions,
    legal: 'indeterminate' }
}
