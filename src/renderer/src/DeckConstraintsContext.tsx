import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { CatalogView } from '../../shared/catalog'
import type { DeckBaseline } from '../../shared/deck-import'
import type { DeckReconciliation } from '../../shared/reconciliation'
import { evaluateConstraints, type DeckConstraint, type SaveConstraintInput } from '../../shared/constraints'

function useConstraintsState(projectId: string, baseline: DeckBaseline | null) {
  const [catalog, setCatalog] = useState<CatalogView | null>(null)
  const [reconciliation, setReconciliation] = useState<DeckReconciliation | null>(null)
  const [constraints, setConstraints] = useState<DeckConstraint[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const mutationPending = useRef(false)

  useEffect(() => {
    let active = true
    setLoading(true)
    setError(null)
    void Promise.all([window.projectsApi.getCatalog(), window.projectsApi.getReconciliation(projectId),
      window.projectsApi.listConstraints(projectId)])
      .then(([catalogResult, reconciliationResult, constraintsResult]) => {
        if (!active) return
        if (!catalogResult.ok) throw new Error(catalogResult.error)
        if (!reconciliationResult.ok) throw new Error(reconciliationResult.error)
        if (!constraintsResult.ok) throw new Error(constraintsResult.error)
        setCatalog(catalogResult.value)
        setReconciliation(reconciliationResult.value)
        setConstraints(constraintsResult.value)
      }).catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : 'Vincoli non disponibili.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [projectId, baseline?.importedAt])

  const evaluation = useMemo(() => catalog ? evaluateConstraints(constraints, baseline, catalog, reconciliation) : null,
    [constraints, baseline, catalog, reconciliation])

  async function save(input: Omit<SaveConstraintInput, 'projectId'>): Promise<DeckConstraint> {
    if (mutationPending.current) throw new Error('Attendi il salvataggio in corso.')
    mutationPending.current = true
    setSaving(true)
    try {
      const result = await window.projectsApi.saveConstraint({ ...input, projectId })
      if (!result.ok) throw new Error(result.error)
      setConstraints((items) => input.id ? items.map((item) => item.id === input.id ? result.value : item) : [...items, result.value])
      return result.value
    } finally { mutationPending.current = false; setSaving(false) }
  }

  async function remove(id: string): Promise<void> {
    if (mutationPending.current) throw new Error('Attendi il salvataggio in corso.')
    mutationPending.current = true
    setSaving(true)
    try {
      const result = await window.projectsApi.deleteConstraint({ projectId, id })
      if (!result.ok) throw new Error(result.error)
      setConstraints(result.value)
    } finally { mutationPending.current = false; setSaving(false) }
  }

  return { projectId, baseline, catalog, reconciliation, setReconciliation, constraints, evaluation, loading, saving, error, save, remove }
}

const DeckConstraintsContext = createContext<ReturnType<typeof useConstraintsState> | null>(null)

export function DeckConstraintsProvider({ projectId, baseline, children }: {
  projectId: string; baseline: DeckBaseline | null; children: ReactNode
}) {
  const state = useConstraintsState(projectId, baseline)
  return <DeckConstraintsContext.Provider value={state}>{children}</DeckConstraintsContext.Provider>
}

export function useDeckConstraints() {
  const context = useContext(DeckConstraintsContext)
  if (!context) throw new Error('Vincoli fuori dal contesto del progetto.')
  return context
}
