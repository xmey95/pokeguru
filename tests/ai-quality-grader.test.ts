import { expect, it } from 'vitest'
import { gradeQualitySummary, oracleQualityResponse, qualityCards, qualityOccurrence } from './fixtures/ai-quality-corpus'

const cards = qualityCards(0)
const allowed = [...cards.map((card) => `card:${card.printId}`), 'list:quality-field']
const facts = [...cards.map((card) => card.evaluationFact), qualityOccurrence.evaluationFact].join('\n')

it('accepts each expected fact and source, including the real versioned Budew mechanic', () => {
  expect(gradeQualitySummary(facts, '', allowed, allowed).filter((check) => !check.passed)).toEqual([])
  const budew = cards.find((card) => card.printId === 'sv08.5-004')!
  expect(budew.sourceUrl).toContain('/sv08.5/004/high.webp')
  expect(budew.gameplay).toMatchObject({ attacks: [{ cost: [], damage: '10' }] })
})

it('detects omitted facts, changed numbers, unsupported free costs, merged printings, scope loss and foreign sources', () => {
  const mutations: [string, string][] = [
    ['Q1', facts.replace('Item cards from their hand during their next turn', 'all Trainer cards forever')],
    ['Q2', facts.replace('print beta draws 3', 'print beta draws 2')],
    ['Q3', facts.replace('denominator 10 matches', 'denominator 20 matches')],
    ['Q4', facts.replace('Its cost is unknown, not proven free', 'Its cost is free')],
    ['Q5', facts.split('\n').filter((line) => !line.startsWith('Q5')).join('\n')],
    ['Q6', facts.replace('one distinct printing, not two independent observations', 'two independent observations')]
  ]
  for (const [id, changed] of mutations)
    expect(gradeQualitySummary(changed, '', allowed, allowed).find((check) => check.id === id)?.passed, id).toBe(false)
  expect(gradeQualitySummary(facts, '', [...allowed, 'invented'], allowed).at(-1)?.passed).toBe(false)
  expect(gradeQualitySummary(facts, '', allowed.slice(1), allowed).at(-1)?.passed).toBe(false)
})

it('the oracle uses only facts and source IDs supplied by its actual batch', () => {
  const group = [{ sourceIds: [allowed[0]], data: { original: cards[0] } }]
  const result = oracleQualityResponse(`Test\nDATI: ${JSON.stringify(group)}\nRestituisci JSON`)
  expect(result.summary).toBe(cards[0].evaluationFact)
  expect(result.summary).not.toContain('Q2')
  expect(result.sourceIds).toEqual([allowed[0]])
})

it('accepts an explicit no-winrate scope statement without accepting a positive user matchup claim', () => {
  const record = 'Q3 The record is 6 wins, 3 losses and 1 tie across 10 matches against the event field. '
  const passed = (ending: string) => gradeQualitySummary(record + ending, '', allowed, allowed)
    .find((check) => check.id === 'Q3')?.passed
  expect(passed('It establishes no winrate against the user deck.')).toBe(true)
  expect(passed('It supplies no winrate for the user\'s deck.')).toBe(true)
  expect(passed('It establishes a winrate against the user deck.')).toBe(false)
  expect(passed('There is no uncertainty about the winrate against the user deck.')).toBe(false)
  expect(passed('No data is missing: this is the winrate against the user deck.')).toBe(false)
  expect(passed('The winrate against the user deck is 60%.')).toBe(false)
})
