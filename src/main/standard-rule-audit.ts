import { load } from 'cheerio'
import { WESTERN_ROTATION_RULES } from '../shared/standard-rotation'
import { SET_ADMISSION_RULE_SOURCE } from '../shared/standard-admission'
import { STANDARD_RULE_PACKAGE_VERSION, type RuleSourceAudit, type StandardRuleAudit } from '../shared/standard-rule-audit'

const sources = [
  { id: 'rotation-2026', url: WESTERN_ROTATION_RULES[1].sourceUrl },
  { id: 'set-admission-2026', url: SET_ADMISSION_RULE_SOURCE }
] as const

function normalizedText(html: string): string {
  const $ = load(html)
  $('script, style, nav, footer').remove()
  return $('body').text().normalize('NFKC').replace(/[^\p{L}\p{N}]+/gu, ' ')
    .toLocaleLowerCase().replace(/\s+/g, ' ').trim()
}

/** An exact semantic guard. A missing phrase means review, never an auto-applied rule. */
export function checkRuleSourceText(id: RuleSourceAudit['id'], html: string): boolean {
  const text = normalizedText(html)
  if (id === 'rotation-2026') return [
    'april 10 2026',
    'cards with the g regulation mark will no longer be legal',
    'cards with h i and j regulation marks will be legal'
  ].every((phrase) => text.includes(phrase))
  return [
    'two weeks following the release date',
    'mega evolution ascended heroes',
    'march 6 2026'
  ].every((phrase) => text.includes(phrase))
}

export async function auditStandardRuleSources(previous: StandardRuleAudit | null,
  fetcher: typeof fetch = fetch): Promise<StandardRuleAudit> {
  const checkedAt = new Date().toISOString()
  const results = await Promise.all(sources.map(async ({ id, url }): Promise<RuleSourceAudit> => {
    try {
      const response = await fetcher(url, { headers: { Accept: 'text/html' }, signal: AbortSignal.timeout(12_000) })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const html = await response.text()
      if (html.length > 2_000_000) throw new Error('Pagina troppo grande')
      if (/request unsuccessful|incapsula incident id/i.test(html))
        throw new Error('La fonte ha bloccato la richiesta automatica')
      return checkRuleSourceText(id, html)
        ? { id, url, status: 'matching', detail: 'Affermazioni del pacchetto locale presenti nella fonte.' }
        : { id, url, status: 'changed', detail: 'La pagina non conferma tutte le affermazioni del pacchetto locale: revisione necessaria.' }
    } catch (cause) {
      return { id, url, status: 'unavailable',
        detail: `Fonte non raggiungibile: ${cause instanceof Error ? cause.message : String(cause)}` }
    }
  }))
  const status = results.some((result) => result.status === 'changed') ? 'changed'
    : results.some((result) => result.status === 'unavailable') ? 'unavailable' : 'matching'
  return { packageVersion: STANDARD_RULE_PACKAGE_VERSION, checkedAt,
    verifiedAt: status === 'matching' ? checkedAt : previous?.verifiedAt ?? null,
    status, sources: results }
}
