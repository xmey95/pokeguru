import { expect, it } from 'vitest'
import { codexReasoningSummary } from '../src/main/codex-progress'

it('accepts only completed user-facing reasoning summaries from Codex JSONL', () => {
  expect(codexReasoningSummary(JSON.stringify({ type: 'item.completed', item: {
    type: 'reasoning', text: '  Verifico   le schede.\nConfronto i tornei.  ' } })))
    .toBe('Verifico le schede. Confronto i tornei.')
  expect(codexReasoningSummary(JSON.stringify({ type: 'item.completed', item: {
    type: 'agent_message', text: 'Risposta finale' } }))).toBeNull()
  expect(codexReasoningSummary(JSON.stringify({ type: 'item.started', item: {
    type: 'reasoning', text: 'Non ancora disponibile' } }))).toBeNull()
  expect(codexReasoningSummary('{not json')).toBeNull()
})
