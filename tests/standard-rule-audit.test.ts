import { expect, it } from 'vitest'
import { auditStandardRuleSources, checkRuleSourceText } from '../src/main/standard-rule-audit'

const rotation = `<html><body><article>Cards with the “G” regulation mark will no longer be legal for play.
Cards with “H,” “I,” and “J” regulation marks will be legal to use.
For in-person Play! Pokémon events, the Standard format rotation will go into effect on April 10, 2026.</article></body></html>`
const release = `<html><body><article>Pokémon TCG products will become legal for official tournament play
two weeks following the release date of an expansion’s respective Booster Display.
Sets such as Mega Evolution—Ascended Heroes have been adjusted to March 6, 2026.</article></body></html>`

it('confronta le affermazioni rilevanti e conserva la verifica offline', async () => {
  expect(checkRuleSourceText('rotation-2026', rotation)).toBe(true)
  expect(checkRuleSourceText('set-admission-2026', release)).toBe(true)
  expect(checkRuleSourceText('rotation-2026', rotation.replace('April 10', 'April 11'))).toBe(false)
  const fetcher = (async (url: string) => new Response(url.includes('rotation') ? rotation : release,
    { status: 200 })) as typeof fetch
  const matching = await auditStandardRuleSources(null, fetcher)
  expect(matching.status).toBe('matching')
  expect(matching.verifiedAt).toBe(matching.checkedAt)
  const unavailable = await auditStandardRuleSources(matching, (async () => { throw new Error('offline') }) as typeof fetch)
  expect(unavailable.status).toBe('unavailable')
  expect(unavailable.verifiedAt).toBe(matching.verifiedAt)
  const changed = await auditStandardRuleSources(matching, (async (url: string) =>
    new Response(url.includes('rotation') ? rotation.replace('April 10', 'April 11') : release,
      { status: 200 })) as typeof fetch)
  expect(changed.status).toBe('changed')
  expect(changed.sources[0].status).toBe('changed')
  expect(changed.verifiedAt).toBe(matching.verifiedAt)
  const blocked = await auditStandardRuleSources(matching, (async (url: string) =>
    new Response(url.includes('rotation') ? 'Request unsuccessful. Incapsula incident ID 123' : release,
      { status: 200 })) as typeof fetch)
  expect(blocked.sources[0].status).toBe('unavailable')
  expect(blocked.status).toBe('unavailable')
})
