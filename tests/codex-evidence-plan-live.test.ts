import { expect, it } from 'vitest'
import { planEvidenceQueriesWithCodex } from '../src/main/codex-evidence-plan'

it.skipIf(process.env.POKEGURU_LIVE_CODEX !== '1')('selects a bounded local query with real Codex',
  async () => {
    const plan = await planEvidenceQueriesWithCodex(
      'L’utente chiede il testo della carta Rare Candy MEG 001. ' +
      'Scegli una catalog.search con printIds=["me01-001"] e nessuna query Eventi. ' +
      'Restituisci solo JSON conforme allo schema.',
      { provider: 'codex', source: 'global', model: null, reasoningEffort: null })
    expect(plan).toHaveProperty('queries')
    expect((plan as { queries: unknown[] }).queries).toContainEqual(
      expect.objectContaining({ operation: 'catalog.search', printIds: ['me01-001'] }))
    console.log('Codex planner token usage:', (plan as { __usage?: unknown }).__usage ?? 'not exposed')
  }, 240_000)
