import type { CatalogView } from './catalog'
import type { DeckConstraint } from './constraints'
import { evaluateConstraints } from './constraints'
import type { DeckBaseline } from './deck-import'
import type { DeckCandidate } from './deck-threads'
import { evaluateStandardDeck } from './standard-deck'

export interface CandidateReview {
  blockers: string[]
  toReview: string[]
  passed: string[]
  legal: 'indeterminate'
}

export function candidateBaseline(projectId: string, candidate: DeckCandidate): DeckBaseline {
  return { projectId, rawText: candidate.rawText, source: 'paste', fileName: null,
    importedAt: candidate.createdAt, ...candidate.parsed }
}

export function reviewCandidate(projectId: string, candidate: DeckCandidate,
  catalog: CatalogView, constraints: DeckConstraint[], asOf: string): CandidateReview {
  const baseline = candidateBaseline(projectId, candidate)
  const standard = evaluateStandardDeck(baseline, catalog, asOf)
  const blockers = [...standard.problems]
  if (candidate.parsed.lines.some((line) => line.kind === 'unparsed')) blockers.push('La candidata contiene righe non interpretate.')
  if (candidate.parsed.lines.some((line) => line.kind === 'card' && line.setCode?.includes('.')))
    blockers.push('I codici set con punto non sono ancora verificati nell’export Limitless: correggi la lista prima dell’adozione.')
  if (candidate.parsed.diagnostics.some((item) => item.code === 'TOTAL_MISMATCH')) blockers.push('Il totale dichiarato non corrisponde alle carte interpretate.')
  if (candidate.parsed.diagnostics.some((item) => item.code === 'ALT_PRINT'))
    blockers.push('Le stampe ALT non sono riconosciute in modo affidabile da Limitless: correggi la lista prima dell’adozione.')
  const evaluated = evaluateConstraints(constraints, baseline, catalog)
  blockers.push(...evaluated.conflicts)
  for (const result of evaluated.results) {
    if (result.status === 'unmet') blockers.push(`Vincolo ${result.constraint.identityName}: ${result.message}`)
  }
  const toReview = [...standard.toReview, ...evaluated.results.filter((result) => result.status === 'indeterminate')
    .map((result) => `Vincolo ${result.constraint.identityName}: ${result.message}`)]
  return { blockers: [...new Set(blockers)], toReview, passed: standard.passed,
    legal: 'indeterminate' }
}
