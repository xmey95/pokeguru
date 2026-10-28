import { expect, it } from 'vitest'
import { codexReasoningSummary } from '../src/main/codex-progress'

it('accepts only completed user-facing reasoning summaries from Codex JSONL', () => {
  expect(codexReasoningSummary(JSON.stringify({ type: 'item.completed', item: {
    type: 'reasoning', text: '  Verifico   le schede.\nConfronto i tornei.  ' } })))
    .toBe('Verifico le schede.\nConfronto i tornei.')
  expect(codexReasoningSummary(JSON.stringify({ type: 'item.completed', item: {
    type: 'agent_message', text: 'Risposta finale' } }))).toBeNull()
  expect(codexReasoningSummary(JSON.stringify({ type: 'item.started', item: {
    type: 'reasoning', text: 'Non ancora disponibile' } }))).toBeNull()
  expect(codexReasoningSummary('{not json')).toBeNull()
})

it('preserves Markdown paragraphs and lists while bounding the summary', () => {
  const summary = '**Carte da confrontare**\r\n\r\n- Prima carta\r\n- Seconda carta'
  const event = (text: string) => JSON.stringify({ type: 'item.completed', item: { type: 'reasoning', text } })
  expect(codexReasoningSummary(event(summary))).toBe(summary.replace(/\r\n/g, '\n'))
  expect(codexReasoningSummary(event('a'.repeat(1200)))).toHaveLength(900)
  expect(codexReasoningSummary(event(' \n\t '))).toBeNull()
})
