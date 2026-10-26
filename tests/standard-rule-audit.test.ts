import { expect, it } from 'vitest'
import { auditStandardRuleSources, checkRuleSourceText } from '../src/main/standard-rule-audit'
import { loadPromoPackage } from '../src/main/promo-package'

const rotation = `<html><body><article>Cards with the “G” regulation mark will no longer be legal for play.
Cards with “H,” “I,” and “J” regulation marks will be legal to use.
For in-person Play! Pokémon events, the Standard format rotation will go into effect on April 10, 2026.</article></body></html>`
const release = `<html><body><article>Pokémon TCG products will become legal for official tournament play
two weeks following the release date of an expansion’s respective Booster Display.
Sets such as Mega Evolution—Ascended Heroes have been adjusted to March 6, 2026.</article></body></html>`

function promoPage(change = false): string {
  const entries = [...loadPromoPackage().registry.entries.values()]
  const upcoming = entries.filter((entry) => entry.state === 'upcoming')
  const available = entries.filter((entry) => entry.state === 'available')
  const code = (entry: typeof entries[number]) => `${entry.code} ${entry.number}`
  const date = (entry: typeof entries[number]) => entry.legalDate
    ? `${entry.legalDate.slice(5, 7)}/${entry.legalDate.slice(8, 10)}/${entry.legalDate.slice(0, 4)}`
    : 'Upon Release'
  return `<html><body><div><h2 id="upcoming-promo-cards">Upcoming Promo Cards</h2></div>
    <div><table><tr><th>Card</th><th>Card Number</th><th>Legal Date</th></tr>
    ${upcoming.map((entry) => `<tr><td>Card</td><td>${code(entry)}</td><td>${date(entry)}</td></tr>`).join('')}</table></div>
    <div><h2 id="available-promo-cards">Available Promo Cards</h2></div>
    <div><table><tr><th>Card</th><th>Card Number</th></tr>
    ${available.slice(change ? 1 : 0).map((entry) => `<tr><td>Card</td><td>${code(entry)}</td></tr>`).join('')}</table></div></body></html>`
}

const page = (url: string, changedPromo = false) => url.includes('promo-card-legality-status')
  ? promoPage(changedPromo) : url.includes('rotation') ? rotation : release

it('confronta le affermazioni rilevanti e conserva la verifica offline', async () => {
  expect(checkRuleSourceText('rotation-2026', rotation)).toBe(true)
  expect(checkRuleSourceText('set-admission-2026', release)).toBe(true)
  expect(checkRuleSourceText('rotation-2026', rotation.replace('April 10', 'April 11'))).toBe(false)
  const fetcher = (async (url: string) => new Response(page(url),
    { status: 200 })) as typeof fetch
  const matching = await auditStandardRuleSources(null, fetcher)
  expect(matching.status).toBe('matching')
  expect(matching.verifiedAt).toBe(matching.checkedAt)
  const unavailable = await auditStandardRuleSources(matching, (async () => { throw new Error('offline') }) as typeof fetch)
  expect(unavailable.status).toBe('unavailable')
  expect(unavailable.verifiedAt).toBe(matching.verifiedAt)
  const changed = await auditStandardRuleSources(matching, (async (url: string) =>
    new Response(url.includes('rotation') ? rotation.replace('April 10', 'April 11') : page(url),
      { status: 200 })) as typeof fetch)
  expect(changed.status).toBe('changed')
  expect(changed.sources[0].status).toBe('changed')
  expect(changed.verifiedAt).toBe(matching.verifiedAt)
  const blocked = await auditStandardRuleSources(matching, (async (url: string) =>
    new Response(url.includes('rotation') ? 'Request unsuccessful. Incapsula incident ID 123' : page(url),
      { status: 200 })) as typeof fetch)
  expect(blocked.sources[0].status).toBe('unavailable')
  expect(blocked.status).toBe('unavailable')
  const changedPromo = await auditStandardRuleSources(matching, (async (url: string) =>
    new Response(page(url, true), { status: 200 })) as typeof fetch)
  expect(changedPromo.status).toBe('changed')
  expect(changedPromo.sources[2].status).toBe('changed')
  expect(changedPromo.sources[2].detail).toContain('1 assenti')
  const unreadablePromo = await auditStandardRuleSources(matching, (async (url: string) =>
    new Response(url.includes('promo-card-legality-status') ? '<html>blocked</html>' : page(url),
      { status: 200 })) as typeof fetch)
  expect(unreadablePromo.status).toBe('unavailable')
  expect(unreadablePromo.sources[2].status).toBe('unavailable')
  const oldPackage = await auditStandardRuleSources({ ...matching, packageVersion: '2026-10-24.3' },
    (async () => { throw new Error('offline') }) as typeof fetch)
  expect(oldPackage.verifiedAt).toBeNull()
})
