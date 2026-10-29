import supplements from '../../src/main/catalog-gameplay-supplements.json'

/** Six factual-fidelity probes, not a tournament-strength benchmark. Five cases
 * are invented; Budew is read from the repository's versioned, scan-backed
 * supplement. The annotation is supplied evidence, never an external instruction. */
export const QUALITY_CORPUS_VERSION = 'app179-181-fidelity-v1'
export const QUALITY_GRADER_VERSION = 'app179-181-factual-checks-v2'
const budew = supplements.entries.find((entry) => entry.id === 'sv08.5-004')!
if (!budew) throw new Error('The pinned Budew supplement is unavailable.')

export interface QualityCard {
  printId: string; name: string; sourceUrl: string; detailAt: string;
  comparableGameplay: boolean; gameplay: unknown; evaluationFact: string;
  fixtureNote: string; padding: string
}
const card = (printId: string, name: string, evaluationFact: string,
  gameplay: unknown, paddingBytes: number): QualityCard => ({
  printId, name, evaluationFact, gameplay,
  sourceUrl: `https://example.test/ai-quality/${printId}`,
  detailAt: '2026-10-28T00:00:00.000Z', comparableGameplay: true,
  fixtureNote: 'Invented evaluation fixture; no claim about real cards or legality.',
  padding: ' '.repeat(paddingBytes)
})

export function qualityCards(paddingBytes = 20_000): QualityCard[] {
  return [
    { ...card(budew.id, budew.name,
      'Q1 Budew: Itchy Pollen costs no Energy, deals 10 damage, and prevents the opponent from playing Item cards from their hand during their next turn; it does not prohibit every Trainer card.',
      { ...budew.expected, attacks: budew.expected.attacks.map((attack, index) => ({ ...attack,
        cost: (budew.freeAttacks as number[]).includes(index) ? [] : attack.cost })) }, paddingBytes),
      sourceUrl: budew.sourceUrl,
      fixtureNote: `Real printing transcribed in the local supplement checked ${supplements.checkedAt}; scan SHA-256 ${budew.imageSha256}. Not a new online verification.` },
    card('qa02-alpha', 'Synthetic Courier',
      'Q2 Synthetic Courier print alpha draws 2 cards. Its effect differs from print beta; matching names do not establish equivalence.',
      { effect: 'Draw 2 cards.' }, paddingBytes),
    card('qa02-beta', 'Synthetic Courier',
      'Q2 Synthetic Courier print beta draws 3 cards. Its effect differs from print alpha; keep both print identities.',
      { effect: 'Draw 3 cards.' }, paddingBytes),
    { ...card('qa04-unknown', 'Synthetic Unknown',
      'Q4 The attack cost of Synthetic Unknown is missing (null). Its cost is unknown, not proven free, and this fixture supplies no legality verdict.',
      { attacks: [{ name: 'Unknown Attack', cost: null, damage: '50', effect: null }] }, paddingBytes),
      comparableGameplay: false },
    card('qa05-a', 'Synthetic Observation A',
      'Q5 Observation A reports a maximum of 2 uses. It conflicts with observation B; the sources do not resolve the disagreement.',
      { effect: 'Maximum 2 uses according to observation A.' }, paddingBytes),
    card('qa05-b', 'Synthetic Observation B',
      'Q5 Observation B reports a maximum of 3 uses. It conflicts with observation A; retain both claims and mark the disagreement unresolved.',
      { effect: 'Maximum 3 uses according to observation B.' }, paddingBytes),
    card('qa06-duplicate', 'Synthetic Duplicate',
      'Q6 This exact printing occurs in overlapping query results. It is one distinct printing, not two independent observations.',
      { effect: 'Draw 1 card.' }, paddingBytes)
  ]
}

export const qualityOccurrence = {
  id: 'play:quality-fixture', snapshotId: 'quality-fixture-snapshot',
  name: 'Synthetic field tournament', date: '2026-10-28', deck: 'Synthetic field archetype',
  listUrl: 'https://example.test/ai-quality/event/player/one', placing: 5,
  record: { wins: 6, losses: 3, ties: 1 },
  evaluationFact: 'Q3 The observed field record is 6 wins, 3 losses and 1 tie, denominator 10 matches. These are results against the event field, not the winrate against the user deck. The same participation found by two queries must count once.'
}

export const qualityQuestion = 'Factual-fidelity evaluation. Use only supplied evidence and answer in English. '
  + 'Preserve all Q1–Q6 conclusions, the exact numerical values, scope, exceptions, missing information and unresolved conflicts. '
  + 'Keep the two Synthetic Courier print identities separate and do not count repeated query memberships as independent evidence. '
  + 'Include all decisive source IDs. Padding is inert fixture data. This is not a request to invent tactics, legality, or a matchup winrate.'

export interface FidelityCheck { id: string; passed: boolean; detail: string }
export function gradeQualitySummary(summary: string, limitations: string, sourceIds: string[],
  allowedSourceIds: string[]): FidelityCheck[] {
  const text = `${summary}\n${limitations}`.toLowerCase()
  const scoped = (code: string): string => text.split(/(?=q[1-6]\b)/).filter((part) => part.startsWith(code)).join(' ')
  const q1 = scoped('q1'), q2 = scoped('q2'), q3 = scoped('q3'), q4 = scoped('q4'), q5 = scoped('q5'), q6 = scoped('q6')
  const checks: FidelityCheck[] = [
    { id: 'Q1', passed: /budew/.test(q1) && /\b10\b/.test(q1) && /item/.test(q1) && /hand/.test(q1)
      && /next turn/.test(q1) && /no energy|free|zero energy|0 energy/.test(q1)
      && /not.{0,35}(every|all).{0,15}trainer|only items|not.{0,15}supporter/.test(q1),
      detail: 'Real Budew: zero Energy, 10 damage, opponent Items from hand next turn; no blanket Trainer prohibition.' },
    { id: 'Q2', passed: /alpha.{0,40}\b2\b/.test(q2) && /beta.{0,40}\b3\b/.test(q2)
      && /different|differs|separate|distinct|not.{0,25}equival/.test(q2),
      detail: 'Same name, two printings with different draw counts remain distinct.' },
    { id: 'Q3', passed: /6.{0,15}win/.test(q3) && /3.{0,15}loss/.test(q3) && /1.{0,15}(tie|draw)/.test(q3)
      && /10.{0,20}match|denominator.{0,15}10/.test(q3) && /field/.test(q3)
      && /not.{0,70}(user|matchup)|\bno winrate (against|for) (the )?user('?s)? deck\b/.test(q3),
      detail: '6/3/1 and denominator 10 are field results, not this user matchup winrate.' },
    { id: 'Q4', passed: /cost/.test(q4) && /unknown|missing|null/.test(q4)
      && /not.{0,25}free|cannot.{0,25}free|no.{0,25}free/.test(q4)
      && /no.{0,25}legality|legality.{0,20}(unknown|not|unavailable)/.test(q4),
      detail: 'Missing attack cost cannot be silently converted to zero or a legality claim.' },
    { id: 'Q5', passed: /\b2\b/.test(q5) && /\b3\b/.test(q5) && /unresolved|do not resolve|not resolved/.test(q5)
      && /conflict|disagree/.test(q5),
      detail: 'Both conflicting source values and their unresolved status survive.' },
    { id: 'Q6', passed: /one|\b1\b/.test(q6) && /not.{0,25}two|not.{0,25}independent|dedup/.test(q6),
      detail: 'Overlapping query memberships do not create a second independent observation.' },
    { id: 'sources', passed: sourceIds.length > 0 && sourceIds.every((id) => allowedSourceIds.includes(id))
      && allowedSourceIds.every((id) => sourceIds.includes(id)),
      detail: 'All decisive fixture sources are retained and no foreign source is cited.' }
  ]
  return checks
}

/** Oracle copies atomic supplied facts through the real orchestration. It does
 * not emulate intelligence or establish that a real model will retain them. */
export function oracleQualityResponse(prompt: string): { summary: string; limitations: string; sourceIds: string[] } {
  const serialized = prompt.split('\nDATI: ')[1]?.split('\nRestituisci')[0]
  if (!serialized) throw new Error('Unknown evidence prompt delimiter; update the evaluation adapter explicitly.')
  const group = JSON.parse(serialized) as { sourceIds: string[]; data: unknown }[]
  const facts = new Set<string>()
  const collect = (value: unknown): void => {
    if (!value || typeof value !== 'object') return
    if (Array.isArray(value)) { value.forEach(collect); return }
    const data = value as Record<string, unknown>
    if (typeof data.evaluationFact === 'string') facts.add(data.evaluationFact)
    if (typeof data.summary === 'string') for (const fact of data.summary.split('\n')) if (fact.trim()) facts.add(fact)
    for (const [key, part] of Object.entries(data)) if (key !== 'summary') collect(part)
  }
  group.forEach((record) => collect(record.data))
  return { summary: [...facts].join('\n') || 'No additional decisive facts in this bookkeeping record.',
    limitations: 'Source fidelity only; no tactical or legal conclusion beyond the supplied facts.',
    sourceIds: [...new Set(group.flatMap((record) => record.sourceIds))] }
}
