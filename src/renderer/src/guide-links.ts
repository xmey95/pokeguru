import type { MatchupReport } from '../../shared/meta-matchups'

export type GuideTarget = { kind: 'catalog'; identityId: string } | { kind: 'source' | 'limitless'; url: string }
export interface GuideReference { label: string; target: GuideTarget }
export interface GuideSegment { text: string; target?: GuideTarget }

function sourceLabel(url: string, references: GuideReference[]): string {
  const names = [...new Set(references.filter((item) => item.target.kind !== 'catalog' && item.target.url === url).map((item) => item.label))]
  if (names.length === 1) return names[0]
  const source = new URL(url)
  if (source.hostname === 'api.tcgdex.net') return source.pathname.includes('/cards/') ? 'Scheda TCGdex' : 'Espansione TCGdex'
  if (source.hostname === 'play.limitlesstcg.com') return source.pathname.endsWith('/decklist') ? 'Lista Limitless Play' : 'Torneo Limitless Play'
  if (source.pathname.startsWith('/tournaments/')) return 'Torneo Limitless'
  if (source.pathname.startsWith('/decks/list/')) return 'Lista Limitless'
  return /\/decks\/\d/.test(source.pathname) ? 'Archetipo Limitless' : 'Meta Limitless'
}

// Match the existing external-opening IPC routes; never navigate the Electron renderer.
export function externalGuideTarget(input: string): GuideTarget | undefined {
  if (input.length > 500) return
  try {
    const url = new URL(input)
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return
    if (url.hostname === 'limitlesstcg.com' && /^\/decks(?:\/\d+|\/list\/\d+)?\/?$/.test(url.pathname))
      return { kind: 'limitless', url: url.href }
    if (url.search || url.hash || input.length > 300) return
    const tcgdex = url.hostname === 'api.tcgdex.net' && /^\/v2\/en\/(cards|sets)\/[a-zA-Z0-9.-]+$/.test(url.pathname)
    const play = url.hostname === 'play.limitlesstcg.com' && /^\/tournament\/[a-f0-9]{24}(?:\/player\/[a-zA-Z0-9_-]+\/decklist)?$/.test(url.pathname)
    const event = url.hostname === 'limitlesstcg.com' && /^\/tournaments\/\d+$/.test(url.pathname)
    if (tcgdex || play || event) return { kind: 'source', url: url.href }
  } catch { /* Untrusted or unsupported references remain text. */ }
}

export function reportGuideReferences(report: MatchupReport): GuideReference[] {
  const references: GuideReference[] = []
  const add = (label: string, url?: string | null) => {
    const target = url ? externalGuideTarget(url) : undefined
    if (target) references.push({ label, target })
  }
  for (const card of report.sampleDeckMechanics ?? []) add(card.name, card.sourceUrl)
  for (const card of report.tournamentEvidence?.observedCards ?? []) add(card.name, card.cardSourceUrl)
  for (const event of report.tournamentEvidence?.events ?? []) add(event.name, event.url)
  if (report.tournamentEvidence?.eventName) add(report.tournamentEvidence.eventName, report.tournamentEvidence.eventUrl)
  return references
}

const key = (value: string) => value.toLocaleLowerCase('it').replaceAll('’', "'")
const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/['’]/g, "['’]")

export function guideSegments(text: string, references: GuideReference[]): GuideSegment[] {
  const grouped = new Map<string, GuideReference[]>()
  for (const reference of references) {
    const name = key(reference.label)
    if (!name.trim()) continue
    grouped.set(name, [...(grouped.get(name) ?? []), reference])
  }
  // A name with multiple destinations is deliberately left unlinked.
  const unique = [...grouped.values()].filter((items) => new Set(items.map((item) => JSON.stringify(item.target))).size === 1)
    .map((items) => items[0]).sort((a, b) => b.label.length - a.label.length)
  const names = unique.length ? `|(?<![\\p{L}\\p{N}])(?:${unique.map((item) => escape(item.label)).join('|')})(?![\\p{L}\\p{N}])` : ''
  const pattern = new RegExp(`\\[([^\\]\\n]+)\\]\\(([^\\s)]+)\\)|https?:\\/\\/[^\\s<>\\]]+${names}`, 'giu')
  const result: GuideSegment[] = []
  let cursor = 0
  for (const match of text.matchAll(pattern)) {
    if (match.index > cursor) result.push({ text: text.slice(cursor, match.index) })
    if (match[1] !== undefined) {
      const target = externalGuideTarget(match[2])
      result.push(target ? { text: match[1], target } : { text: `${match[1]} (${match[2]})` })
    } else if (/^https?:\/\//i.test(match[0])) {
      const url = match[0].replace(/[.,;:!?)}]+$/, '')
      const target = externalGuideTarget(url)
      result.push({ text: target ? sourceLabel(url, references) : url, target })
      if (url.length < match[0].length) result.push({ text: match[0].slice(url.length) })
    } else {
      const reference = unique.find((item) => key(item.label) === key(match[0]))
      const suffix = text.slice(match.index + match[0].length)
      result.push({ text: match[0], target: /^\s+(?:ex|V|VMAX|VSTAR|GX|BREAK)\b/i.test(suffix) ? undefined : reference?.target })
    }
    cursor = match.index + match[0].length
  }
  if (cursor < text.length) result.push({ text: text.slice(cursor) })
  return result
}
