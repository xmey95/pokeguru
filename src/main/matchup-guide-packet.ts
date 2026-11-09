import { createHash } from 'node:crypto'
import type { CatalogView, CatalogPrint } from '../shared/catalog'
import type { DeckBaseline } from '../shared/deck-import'
import { parseDeck } from '../shared/deck-import'
import { buildDeckCards, type DeckReconciliation } from '../shared/reconciliation'
import { effectiveCardGameplay } from '../shared/card-errata'
import type { MatchupTournamentEvidence } from '../shared/meta-matchups'
import { GUIDE_PROMPT_VERSION, type GuideBasis, type GuideList, type GuideSource } from '../shared/matchup-guide'
import {guidePrizeRuleSources} from './guide-prize-rule-sources'

export const guideHash = (value: unknown): string => createHash('sha256').update(JSON.stringify(value) ?? 'undefined').digest('hex')
export interface GuidePacket {
  basis: GuideBasis; ourList: GuideList; opponentLists: GuideList[]; sources: GuideSource[]
  matchup: string; deckContext: string; gaps: string[]
}
export interface GuideListRequest { cardName: string | null; offset: number }
function cardSource(print: CatalogPrint, catalog: CatalogView, asOf: string): GuideSource {
  const effective = effectiveCardGameplay(print, asOf, catalog.rulePackage)
  return guideSource(`card:${print.id}`, 'card', print.name, print.sourceUrl, {
    printId: print.id, name: print.name, category: print.category, stage: print.stage, energyType: print.energyType,
    rarity: print.rarity, regulationMark: print.regulationMark,
    identityId: print.identityId, detailAt: print.detailAt, gameplay: effective.effective,
    ...(effective.status === 'applied' ? { printedGameplay: effective.printed } : {}),
    errata: { status: effective.status, sourceUrl: effective.errataSourceUrl, ruleVersion: effective.ruleVersion } })
}
export function guideSource(id: string, kind: GuideSource['kind'], label: string, url: string | null, value: unknown): GuideSource {
  const content = typeof value === 'string' ? value : JSON.stringify(value)
  return { id, kind, label, url, content, hash: guideHash(content) }
}

/** Resolve each physical line separately, retaining manual corrections and exact print quantities. */
export function resolveGuideList(baseline: DeckBaseline, catalog: CatalogView, reconciliation?: DeckReconciliation): GuideList['cards'] {
  if (baseline.lines.some(l => l.kind === 'unparsed')) throw new Error('La lista contiene righe non interpretate.')
  const quantities = new Map<string, GuideList['cards'][number]>()
  for (const line of baseline.lines.filter(l => l.kind === 'card')) {
    const entry = buildDeckCards({ ...baseline, lines: [line] }, catalog, reconciliation)[0]
    const override = reconciliation?.mappings.find(m => m.lineNumber === line.lineNumber)?.print.id
    const exact = entry?.importedPrintIds.map(id => entry.prints.find(p => p.id === id)).filter((p): p is CatalogPrint => !!p)
    const chosen = override ? entry?.prints.find(p => p.id === override)
      : exact?.length === 1 ? exact[0] : entry?.status === 'recognized' && entry.prints.length ? entry.prints[0] : undefined
    if (!chosen?.gameplay || !line.quantity || !entry || entry.staleCorrection)
      throw new Error(`Scheda o stampa non risolta: ${line.raw}.`)
    const current = quantities.get(chosen.id)
    quantities.set(chosen.id, { printId: chosen.id, name: chosen.name, count: (current?.count ?? 0) + line.quantity })
  }
  const cards = [...quantities.values()]
  if (cards.reduce((n, c) => n + c.count, 0) !== 60) throw new Error('La guida richiede una lista completa di 60 carte.')
  return cards
}

export function buildGuidePacket(input: {
  basis: Omit<GuideBasis, 'dependencyHash' | 'promptVersion' | 'ruleVersion'>
  /** Main-process compatibility choice: historical revisions keep their native contract. */
  promptVersion?: GuideBasis['promptVersion']
  baseline: DeckBaseline; reconciliation?: DeckReconciliation; catalog: CatalogView
  evidence: MatchupTournamentEvidence; sample: { url: string | null; cards: string[] }
  matchup: string; deckContext: string
}): GuidePacket {
  const { catalog, evidence, basis } = input
  const ourList: GuideList = { id: 'our-list', label: 'La nostra lista', url: null,
    cards: resolveGuideList(input.baseline, catalog, input.reconciliation) }
  const gaps: string[] = []
  const opponentLists: GuideList[] = []
  const candidates = [...evidence.sampleLists.filter(l => l.cards?.length).map(l => ({
    url: l.url, cards: l.cards!, label: `${input.matchup} · ${l.eventName ?? 'torneo'} · posizione ${l.placing ?? 'non disponibile'}` })),
  { ...input.sample, label: `${input.matchup} · lista campione` }]
  for (const candidate of candidates) {
    if (opponentLists.some(l => l.url === candidate.url) || !candidate.cards.length) continue
    try {
      const baseline: DeckBaseline = { ...input.baseline, ...parseDeck(candidate.cards.join('\n')) }
      const cards = resolveGuideList(baseline, catalog)
      opponentLists.push({ id: `opponent-${opponentLists.length + 1}`, label: candidate.label, url: candidate.url, cards })
    } catch (error) { gaps.push(`${candidate.url ?? candidate.label}: ${error instanceof Error ? error.message : 'Lista non risolta'}`) }
  }
  if (!opponentLists.length) throw new Error('Nessuna lista avversaria completa con stampe risolte. Aggiorna Catalogo e Tornei prima di generare la guida approfondita.')
  const sources: GuideSource[] = [guideSource('our-list', 'our-list', 'Lista originale e riconciliazione', null,
    { original: input.baseline.rawText, resolved: ourList, reconciliation: input.reconciliation ?? null }),
  guideSource('tournament-aggregate', 'aggregate', 'Aggregati del matchup', evidence.eventUrl, evidence)]
  for (const list of opponentLists) sources.push(guideSource(list.id, 'list', list.label, list.url,
    { ...list, original: candidates.find(c => c.url === list.url)?.cards }))
  const ids = new Set([...ourList.cards, ...opponentLists.flatMap(l => l.cards)].map(c => c.printId))
  const allPrints = [...catalog.prints, ...catalog.referencePrints ?? []]
  for (const id of ids) {
    const print = allPrints.find(p => p.id === id)!
    const effective = effectiveCardGameplay(print, basis.asOf, catalog.rulePackage)
    sources.push(cardSource(print, catalog, basis.asOf))
    if (['missing-source', 'source-mismatch'].includes(effective.status)) gaps.push(`${print.name}: errata non risolta; non dimostrare linee che dipendono dal testo incerto.`)
  }
  if (catalog.rulePackage) sources.push(guideSource('rules', 'rules', `Regole ${catalog.rulePackage.version}`, null, catalog.rulePackage))
  else gaps.push('Pacchetto di regole non disponibile; timing speciali non dimostrabili.')
  if(basis.analysisContract==='finite-evidence-1')sources.push(...guidePrizeRuleSources(basis.asOf))
  const packet: GuidePacket = { basis: { ...basis, ruleVersion: catalog.rulePackage?.version ?? null,
    dependencyHash: '', promptVersion: input.promptVersion ?? GUIDE_PROMPT_VERSION }, ourList, opponentLists, sources,
  matchup: input.matchup, deckContext: input.deckContext, gaps }
  packet.basis.dependencyHash = packetHash(packet)
  return packet
}

export function packetHash(packet: Pick<GuidePacket, 'basis' | 'ourList' | 'opponentLists' | 'sources'>): string {
  return guideHash({ basis: { ...packet.basis, dependencyHash: '' }, ourList: packet.ourList,
    opponentLists: packet.opponentLists, sources: packet.sources.map(s => [s.id, s.hash]) })
}

/** Explicit, bounded requests into the frozen catalog, never a second unbounded evidence crawl. */
export function extendGuidePacket(packet: GuidePacket, catalog: CatalogView, printIds: string[]): GuidePacket {
  if (printIds.length > 12) throw new Error('Troppe schede aggiuntive richieste per la guida.')
  const result = structuredClone(packet)
  for (const id of new Set(printIds)) {
    if (result.sources.some(s => s.id === `card:${id}`)) continue
    const print = [...catalog.prints, ...catalog.referencePrints ?? []].find(p => p.id === id)
    if (!print?.gameplay) { result.gaps.push(`Scheda aggiuntiva ${id} non disponibile: nessuna linea dimostrata può dipenderne.`); continue }
    result.sources.push(cardSource(print, catalog, packet.basis.asOf))
  }
  result.basis.dependencyHash = packetHash(result)
  return result
}

export function addGuideLists(packet: GuidePacket, catalog: CatalogView, lists: { label: string; url: string; cards: string[] }[]): GuidePacket {
  const result = structuredClone(packet)
  for (const candidate of lists) {
    if (result.opponentLists.some(l => l.url === candidate.url)) continue
    try {
      const rawText = candidate.cards.join('\n')
      const cards = resolveGuideList({ ...parseDeck(rawText), rawText, projectId: packet.basis.projectId,
        source: 'paste', fileName: null, importedAt: packet.basis.asOf }, catalog)
      const list: GuideList = { id: `opponent-${result.opponentLists.length + 1}`, label: candidate.label, url: candidate.url, cards }
      result.opponentLists.push(list)
      result.sources.push(guideSource(list.id, 'list', list.label, list.url, { ...list, original: candidate.cards }))
      for (const c of cards) if (!result.sources.some(s => s.id === `card:${c.printId}`)) {
        const print = [...catalog.prints, ...catalog.referencePrints ?? []].find(p => p.id === c.printId)!
        result.sources.push(cardSource(print, catalog, packet.basis.asOf))
      }
    } catch (error) { result.gaps.push(`${candidate.url}: ${error instanceof Error ? error.message : 'Lista non risolta'}`) }
  }
  result.basis.dependencyHash = packetHash(result)
  return result
}
