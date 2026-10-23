import type { CatalogPrint, CatalogView } from './catalog'
import type { DeckBaseline, DeckLine } from './deck-import'
import { buildDeckCards, suggestPrints, type DeckReconciliation } from './reconciliation'

export type ConstraintKind = 'required' | 'minimum' | 'exact'

export interface DeckConstraint {
  id: string
  projectId: string
  identityId: string
  identityName: string
  printId: string | null
  kind: ConstraintKind
  quantity: number
  createdAt: string
  updatedAt: string
}

export interface SaveConstraintInput {
  projectId: string
  id?: string
  identityId: string
  printId?: string | null
  kind: ConstraintKind
  quantity: number
}

export interface DeleteConstraintInput { projectId: string; id: string }

export interface ConstraintResult {
  constraint: DeckConstraint
  status: 'met' | 'unmet' | 'indeterminate' | 'conflict'
  certainCopies: number
  possibleCopies: number
  message: string
}

export interface ConstraintEvaluation {
  results: ConstraintResult[]
  conflicts: string[]
  legality: 'indeterminate'
}

function targetQuantity(constraint: DeckConstraint): number {
  return constraint.kind === 'required' ? 1 : constraint.quantity
}

function exactPrint(line: DeckLine, catalog: CatalogView): CatalogPrint | null {
  const matches = suggestPrints(line, catalog).filter((candidate) => candidate.reason === 'same-print')
  return matches.length === 1 ? matches[0].print : null
}

/** Works for the current baseline and for future complete candidate decks. */
export function evaluateConstraints(constraints: DeckConstraint[], baseline: DeckBaseline | null,
  catalog: CatalogView, reconciliation?: DeckReconciliation | null): ConstraintEvaluation {
  const cards = baseline ? buildDeckCards(baseline, catalog, reconciliation) : []
  const hasUnparsedLines = baseline?.lines.some((line) => line.kind === 'unparsed') ?? false
  const conflicts: string[] = []
  const conflicted = new Set<string>()
  const byTarget = new Map<string, DeckConstraint[]>()
  for (const constraint of constraints) {
    const key = `${constraint.identityId}\u0000${constraint.printId ?? ''}`
    const group = byTarget.get(key) ?? []
    group.push(constraint)
    byTarget.set(key, group)
  }
  for (const group of byTarget.values()) {
    const exacts = group.filter((item) => item.kind === 'exact')
    const exactValues = new Set(exacts.map(targetQuantity))
    const minimum = Math.max(0, ...group.filter((item) => item.kind !== 'exact').map(targetQuantity))
    if (exactValues.size > 1 || exacts.some((item) => targetQuantity(item) < minimum)) {
      conflicts.push(`Vincoli incompatibili per ${group[0].identityName}${group[0].printId ? ` · ${group[0].printId}` : ''}.`)
      group.forEach((item) => conflicted.add(item.id))
    }
  }
  const identityGroups = new Map<string, DeckConstraint[]>()
  for (const constraint of constraints) {
    const group = identityGroups.get(constraint.identityId) ?? []
    group.push(constraint)
    identityGroups.set(constraint.identityId, group)
  }
  let requiredSlots = 0
  for (const group of identityGroups.values()) {
    const identity = group.filter((item) => !item.printId)
    const printGroups = [...new Set(group.filter((item) => item.printId).map((item) => item.printId!))]
      .map((id) => group.filter((item) => item.printId === id))
    const printMinimum = printGroups.reduce((sum, items) =>
      sum + Math.max(0, ...items.map(targetQuantity)), 0)
    const identityMinimum = Math.max(0, ...identity.map(targetQuantity))
    const identityExact = identity.find((item) => item.kind === 'exact')
    if (identityExact && printMinimum > targetQuantity(identityExact)) {
      conflicts.push(`Le stampe richieste di ${identityExact.identityName} superano il totale esatto della carta.`)
      group.forEach((item) => conflicted.add(item.id))
    }
    requiredSlots += Math.max(identityMinimum, printMinimum)
  }
  if (requiredSlots > 60) {
    conflicts.push(`I minimi richiedono ${requiredSlots} carte: un mazzo contiene 60 carte.`)
    constraints.forEach((item) => conflicted.add(item.id))
  }

  const results = constraints.map((constraint): ConstraintResult => {
    const target = targetQuantity(constraint)
    let certainCopies = 0
    let possibleCopies = 0
    for (const card of cards) {
      if (card.identityId === constraint.identityId) {
        if (!constraint.printId) {
          certainCopies += card.quantity
          possibleCopies += card.quantity
        } else {
          for (const line of card.lines) {
            const print = exactPrint(line, catalog)
            if (print?.id === constraint.printId) {
              certainCopies += line.quantity ?? 0
              possibleCopies += line.quantity ?? 0
            } else if (!print) {
              possibleCopies += line.quantity ?? 0
            }
          }
        }
      } else if (!card.identityId &&
        (card.candidateIdentities.some((item) => item.identityId === constraint.identityId) ||
          card.name.localeCompare(constraint.identityName, undefined, { sensitivity: 'base' }) === 0)) {
        possibleCopies += card.quantity
      }
    }
    let status: ConstraintResult['status']
    if (conflicted.has(constraint.id)) status = 'conflict'
    else if (!catalog.syncedAt) status = 'indeterminate'
    else if (constraint.kind === 'exact') {
      status = certainCopies > target || (!hasUnparsedLines && possibleCopies < target) ? 'unmet'
        : certainCopies === target && possibleCopies === target ? 'met' : 'indeterminate'
    } else {
      status = certainCopies >= target ? 'met'
        : !hasUnparsedLines && possibleCopies < target ? 'unmet' : 'indeterminate'
    }
    const message = status === 'conflict' ? 'Incompatibile con altri vincoli.'
      : status === 'met' ? `Quantità verificata: ${certainCopies}.`
        : status === 'unmet' ? `Richieste ${target}; copie certe ${certainCopies}, possibili ${possibleCopies}.`
          : !catalog.syncedAt ? 'Catalogo non disponibile: quantità da verificare.'
            : hasUnparsedLines ? `Copie certe ${certainCopies}: ci sono righe non interpretate da chiarire.`
              : `Copie certe ${certainCopies}, possibili ${possibleCopies}: identità o stampa da chiarire.`
    return { constraint, status, certainCopies, possibleCopies, message }
  })
  return { results, conflicts, legality: 'indeterminate' }
}
