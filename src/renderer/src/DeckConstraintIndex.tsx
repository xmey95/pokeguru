import { useMemo } from 'react'
import { buildDeckCards } from '../../shared/reconciliation'
import { CardConstraints } from './CardConstraints'
import { useDeckConstraints } from './DeckConstraintsContext'

/** Keeps constraints on cards outside the current list reachable without a general editor. */
export function DeckConstraintIndex() {
  const { baseline, catalog, reconciliation, constraints, loading, error } = useDeckConstraints()
  const inDeck = useMemo(() => new Set((baseline ? buildDeckCards(baseline, catalog, reconciliation) : [])
    .map((card) => card.identityId).filter((id): id is string => !!id)), [baseline, catalog, reconciliation])
  const outside = useMemo(() => {
    const byIdentity = new Map<string, { name: string; count: number }>()
    for (const constraint of constraints) {
      if (inDeck.has(constraint.identityId)) continue
      const entry = byIdentity.get(constraint.identityId) ?? { name: constraint.identityName, count: 0 }
      entry.count++
      byIdentity.set(constraint.identityId, entry)
    }
    return [...byIdentity.entries()].sort((a, b) => a[1].name.localeCompare(b[1].name) || a[0].localeCompare(b[0]))
  }, [constraints, inDeck])
  if (loading || error || outside.length === 0) return null
  return <section className="offdeck-constraints" aria-label="Carte vincolate fuori lista">
    <h2>Carte vincolate fuori lista</h2>
    <p className="content-note">Questi vincoli restano nel progetto anche quando la carta non compare nella lista principale.</p>
    {outside.map(([identityId, entry]) => <details key={identityId} className="offdeck-card">
      <summary>{entry.name} <span>{entry.count} {entry.count === 1 ? 'vincolo' : 'vincoli'}</span></summary>
      <CardConstraints identityId={identityId} name={entry.name} />
    </details>)}
  </section>
}
