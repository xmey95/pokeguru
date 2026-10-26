import type { CatalogPrint, CatalogView } from './catalog'
import type { DeckBaseline, DeckLine } from './deck-import'
import { knownPrintCodes } from './set-codes'
import { gameplaySummary } from './card-gameplay'
import { effectiveCardGameplay } from './card-errata'
import { localCalendarDate } from './calendar-date'
import type { StandardDeckEvaluation } from './standard-deck'
import { basicEnergyType } from './basic-energy-name'

export interface MappedPrint {
  id: string
  name: string
  category: string | null
  setId: string
  setName: string
  localId: string
  rarity: string | null
  variants: Record<string, boolean> | null
  identityId: string
  identityBasis: CatalogPrint['identityBasis']
  sourceUrl: string
  sourceUpdated: string | null
}

export interface DeckLineMapping {
  lineNumber: number
  rawLine: string
  originalName: string
  sourceLanguage: string | null
  print: MappedPrint
  selectedAt: string
}

export interface IdentityTotal {
  identityId: string
  name: string
  quantity: number
  printIds: string[]
}

export interface DeckReconciliation {
  projectId: string
  importedAt: string | null
  mappings: DeckLineMapping[]
  identityTotals: IdentityTotal[]
  resolvedLines: number
  unresolvedLines: number
  resolvedCopies: number
  unresolvedCopies: number
}

export interface SaveLineMappingInput {
  projectId: string
  importedAt: string
  lineNumber: number
  rawLine: string
  printId: string
  sourceLanguage?: string | null
}

export interface ClearLineMappingInput {
  projectId: string
  importedAt: string
  lineNumber: number
  rawLine: string
}

export type CandidateReason = 'same-print' | 'code-conflict' | 'same-name' | 'search'
export interface PrintCandidate { print: CatalogPrint; reason: CandidateReason }

export interface DeckCardEntry {
  key: string
  name: string
  quantity: number
  identityId: string | null
  identityBasis: CatalogPrint['identityBasis']
  status: 'recognized' | 'unverified' | 'ambiguous' | 'outside-catalog'
  lines: DeckLine[]
  prints: CatalogPrint[]
  importedPrintIds: string[]
  staleCorrection: boolean
  candidateIdentities: { identityId: string; name: string; printId: string; basis: CatalogPrint['identityBasis'] }[]
}

function normalizedName(value: string): string {
  return value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase()
}

function printNameMatches(lineName: string, print: CatalogPrint): boolean {
  if (normalizedName(lineName) === normalizedName(print.name)) return true
  const requested = basicEnergyType(lineName)
  return !!requested && print.category === 'Energy' &&
    print.energyType?.toLowerCase() === 'normal' && requested === basicEnergyType(print.name)
}

function normalizedNumber(value: string): string {
  return value.toUpperCase().replace(/^0+(?=\d)/, '')
}

function sameCode(line: DeckLine, print: CatalogPrint, catalog: CatalogView): boolean {
  if (!line.setCode || !line.cardNumber || /ALT/i.test(line.setCode)) return false
  const code = line.setCode.toUpperCase()
  return (knownPrintCodes(print.setId, catalog.sets.find((set) => set.id === print.setId)?.abbreviation)
    .includes(code) || code === print.historicalSetCode) &&
    normalizedNumber(line.cardNumber) === normalizedNumber(print.localId)
}

interface SuggestIndex {
  byName: Map<string, CatalogPrint[]>
  byEnergyType: Map<string, CatalogPrint[]>
  byCode: Map<string, CatalogPrint[]>
}

// CatalogView instances are snapshots. Weak keys release their search index with the snapshot.
const suggestionIndexes = new WeakMap<CatalogView, SuggestIndex>()

function suggestionIndex(catalog: CatalogView): SuggestIndex {
  const cached = suggestionIndexes.get(catalog)
  if (cached) return cached
  const index: SuggestIndex = { byName: new Map(), byEnergyType: new Map(), byCode: new Map() }
  const setCodes = new Map(catalog.sets.map((set) => [set.id, set.abbreviation]))
  const addCode = (print: CatalogPrint): void => {
    const number = normalizedNumber(print.localId)
    for (const code of new Set([...knownPrintCodes(print.setId, setCodes.get(print.setId)), print.historicalSetCode])) {
      if (!code) continue
      const key = `${code}\0${number}`
      const group = index.byCode.get(key) ?? []
      group.push(print)
      index.byCode.set(key, group)
    }
  }
  for (const print of catalog.prints) {
    if (!print.detailAt || !print.identityId) continue
    const name = normalizedName(print.name)
    const named = index.byName.get(name) ?? []
    named.push(print)
    index.byName.set(name, named)
    if (print.category === 'Energy' && print.energyType?.toLowerCase() === 'normal') {
      const type = basicEnergyType(print.name)
      if (type) {
        const energy = index.byEnergyType.get(type) ?? []
        energy.push(print)
        index.byEnergyType.set(type, energy)
      }
    }
    addCode(print)
  }
  for (const print of catalog.referencePrints ?? []) {
    if (print.detailAt && print.identityId) addCode(print)
  }
  suggestionIndexes.set(catalog, index)
  return index
}

function sortedCandidates(candidates: PrintCandidate[]): PrintCandidate[] {
  const score: Record<CandidateReason, number> = { 'same-print': 0, 'code-conflict': 1,
    'same-name': 2, search: 3 }
  return candidates.sort((a, b) => score[a.reason] - score[b.reason] ||
    a.print.name.localeCompare(b.print.name) || a.print.id.localeCompare(b.print.id))
}

export function suggestPrints(line: DeckLine, catalog: CatalogView, search = ''): PrintCandidate[] {
  if (line.kind !== 'card' || !line.name) return []
  const term = normalizedName(search)
  if (!term) {
    const index = suggestionIndex(catalog)
    const codeKey = line.setCode && line.cardNumber && !/ALT/i.test(line.setCode)
      ? `${line.setCode.toUpperCase()}\0${normalizedNumber(line.cardNumber)}` : null
    const coded = codeKey ? index.byCode.get(codeKey) ?? [] : []
    const candidates: PrintCandidate[] = coded.map((print) => ({ print,
      reason: printNameMatches(line.name!, print) ? 'same-print' : 'code-conflict' }))
    const seen = new Set(coded)
    const named = index.byName.get(normalizedName(line.name)) ?? []
    const energy = basicEnergyType(line.name)
    const energyPrints = energy ? index.byEnergyType.get(energy) ?? [] : []
    for (const print of [...named, ...energyPrints]) {
      if (!seen.has(print)) candidates.push({ print, reason: 'same-name' })
      seen.add(print)
    }
    return sortedCandidates(candidates)
  }
  const referencePrints = (catalog.referencePrints ?? []).filter((print) => sameCode(line, print, catalog))
  const candidates = [...catalog.prints, ...referencePrints]
    .filter((print) => print.detailAt !== null && print.identityId !== null)
    .map((print): PrintCandidate | null => {
      if (term && !`${print.name} ${print.id} ${print.setName} ${print.rarity ?? ''}`.toLocaleLowerCase().includes(term)) return null
      const printCode = sameCode(line, print, catalog)
      const name = printNameMatches(line.name!, print)
      if (printCode && name) return { print, reason: 'same-print' }
      if (printCode) return { print, reason: 'code-conflict' }
      if (name) return { print, reason: 'same-name' }
      if (term) return { print, reason: 'search' }
      return null
    })
    .filter((candidate): candidate is PrintCandidate => candidate !== null)
  return sortedCandidates(candidates)
}

export function snapshotPrint(print: CatalogPrint): MappedPrint {
  if (!print.detailAt || !print.identityId) throw new Error('Stampa senza dettagli verificati nel catalogo.')
  return {
    id: print.id, name: print.name, category: print.category,
    setId: print.setId, setName: print.setName, localId: print.localId,
    rarity: print.rarity, variants: print.variants, identityId: print.identityId,
    identityBasis: print.identityBasis, sourceUrl: print.sourceUrl, sourceUpdated: print.sourceUpdated
  }
}

/** Derive the competitive list from the imported text and the local catalog.
 * A code identifies provenance; grouping happens only on a catalog identity.
 */
export function buildDeckCards(baseline: DeckBaseline, catalog: CatalogView | null,
  reconciliation?: DeckReconciliation | null): DeckCardEntry[] {
  const prints = (catalog?.prints ?? []).filter((print) => print.detailAt && print.identityId)
  const byIdentity = new Map<string, CatalogPrint[]>()
  const byName = new Map<string, CatalogPrint[]>()
  const byEnergyType = new Map<string, CatalogPrint[]>()
  const byCode = new Map<string, CatalogPrint[]>()
  const byId = new Map<string, CatalogPrint>()
  const printOrder = new Map<CatalogPrint, number>()
  const printSet = new Set(prints)
  const setCodes = new Map(catalog?.sets.map((set) => [set.id, set.abbreviation]) ?? [])
  const addCode = (print: CatalogPrint): void => {
    const number = normalizedNumber(print.localId)
    const codes = knownPrintCodes(print.setId, setCodes.get(print.setId))
    for (const code of codes) {
      if (!code) continue
      const key = `${code}\0${number}`
      const matches = byCode.get(key) ?? []
      matches.push(print)
      byCode.set(key, matches)
    }
  }
  for (const print of prints) {
    const group = byIdentity.get(print.identityId!) ?? []
    group.push(print)
    byIdentity.set(print.identityId!, group)
    const name = normalizedName(print.name)
    const named = byName.get(name) ?? []
    named.push(print)
    byName.set(name, named)
    if (print.category === 'Energy' && print.energyType?.toLowerCase() === 'normal') {
      const energy = basicEnergyType(print.name)
      if (energy) {
        const matching = byEnergyType.get(energy) ?? []
        matching.push(print)
        byEnergyType.set(energy, matching)
      }
    }
    addCode(print)
    byId.set(print.id, print)
    printOrder.set(print, printOrder.size)
  }
  for (const print of catalog?.referencePrints ?? []) {
    if (print.detailAt && print.identityId) addCode(print)
  }
  const overrides = new Map(reconciliation?.mappings.map((item) => [item.lineNumber, item]) ?? [])
  const entries = new Map<string, DeckCardEntry>()
  for (const line of baseline.lines.filter((item) => item.kind === 'card')) {
    const lineName = line.name ?? ''
    const named = byName.get(normalizedName(lineName)) ?? []
    const energy = basicEnergyType(lineName)
    const energyPrints = energy ? byEnergyType.get(energy) ?? [] : []
    const sameName = energyPrints.length ? [...new Set([...named, ...energyPrints])]
      .sort((a, b) => printOrder.get(a)! - printOrder.get(b)!) : named
    const codeKey = line.setCode && line.cardNumber && !/ALT/i.test(line.setCode)
      ? `${line.setCode.toUpperCase()}\0${normalizedNumber(line.cardNumber)}` : null
    const exact = codeKey ? (byCode.get(codeKey) ?? [])
      .filter((print) => printNameMatches(lineName, print))
      .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id)) : []
    const identities = [...new Set(sameName.map((print) => print.identityId!))]
    const exactIdentities = [...new Set(exact.map((print) => print.identityId!))]
    const override = overrides.get(line.lineNumber)
    // A catalog enrichment can replace a provisional identity without invalidating
    // the user's exact printing choice.
    const overridePrint = override && byId.get(override.print.id)
    let identityId: string | null = overridePrint?.identityId ?? null
    if (!identityId && exactIdentities.length === 1) identityId = exactIdentities[0]
    if (!identityId && !line.setCode && identities.length === 1 &&
      sameName[0]?.identityBasis !== 'unverified') identityId = identities[0]
    const identityPrints = identityId ? [...byIdentity.get(identityId) ?? [],
      ...exact.filter((print) => print.identityId === identityId && !printSet.has(print))] : []
    const status: DeckCardEntry['status'] = identityId
      ? identityPrints[0]?.identityBasis !== 'unverified' ? 'recognized' : 'unverified'
      : identities.length > 0 ? 'ambiguous' : 'outside-catalog'
    const key = identityId ? `identity:${identityId}` : `line:${line.lineNumber}`
    const entry = entries.get(key) ?? {
      key, name: identityPrints[0]?.name ?? line.name ?? line.raw,
      quantity: 0, identityId, identityBasis: identityPrints[0]?.identityBasis ?? null,
      status, lines: [], prints: identityPrints,
      importedPrintIds: [], staleCorrection: false, candidateIdentities: []
    }
    entry.quantity += line.quantity ?? 0
    entry.lines.push(line)
    entry.staleCorrection ||= !!override && !overridePrint
    for (const print of exact) {
      if (!entry.importedPrintIds.includes(print.id)) entry.importedPrintIds.push(print.id)
    }
    entry.candidateIdentities = [...new Map([...entry.candidateIdentities, ...sameName.map((print) =>
      ({ identityId: print.identityId!, name: print.name, printId: print.id,
        basis: print.identityBasis }))].map((candidate) => [candidate.identityId, candidate])).values()]
    entries.set(key, entry)
  }
  return [...entries.values()]
}

function matchupStandardContext(standard: StandardDeckEvaluation | null,
  catalog?: CatalogView | null): string {
  if (!standard) return 'CONTROLLO STANDARD: non calcolabile senza dati della lista.'
  const errata = catalog?.rulePackage?.errata
  return `CONTROLLO STANDARD (${standard.asOf}, pacchetto ${catalog?.rulePackage?.version ?? 'non disponibile'}): ` +
    `${standard.legality}. Controlli superati: ${standard.passed.join('; ') || 'nessuno'}. ` +
    `Problemi: ${standard.problems.join('; ') || 'nessuno'}. ` +
    `Da verificare: ${standard.toReview.join('; ') || 'nessuno'}. ` +
    (errata ? `REGISTRO ERRATA UFFICIALE: ${errata.sourceUrl}; verificato ${errata.checkedAt}, ` +
      `ultimo aggiornamento della fonte ${errata.lastUpdated}; ` +
      `${errata.corrections?.length ?? 0} correzioni curate per stampa nel pacchetto.` :
      'REGISTRO ERRATA: non disponibile nel catalogo locale.')
}

export function matchupDeckContext(baseline: DeckBaseline, reconciliation: DeckReconciliation,
  catalog?: CatalogView | null, standard: StandardDeckEvaluation | null = null): string {
  if (catalog) {
    const cards = buildDeckCards(baseline, catalog, reconciliation)
    const cardDescriptions = cards.slice(0, 120).map((card) => {
      const print = card.importedPrintIds.map((id) => card.prints.find((candidate) => candidate.id === id))
        .find((candidate) => !!candidate?.gameplay) ?? card.prints.find((candidate) => !!candidate.gameplay)
      const effective = print ? effectiveCardGameplay(print, standard?.asOf ?? localCalendarDate(),
        catalog.rulePackage) : null
      const status = card.status === 'recognized' ? 'identità da testo di gioco coincidente'
        : card.status === 'unverified' ? 'stampa esatta nota; equivalenza fra ristampe da verificare'
          : card.status === 'ambiguous' ? 'identità ambigua' : 'nessuna corrispondenza nel catalogo locale'
      return `${card.quantity} ${card.name} — ${status}` +
        (print && effective?.effective ? `; scheda ${print.id}: ${gameplaySummary(effective.effective, print)}; fonte ${print.sourceUrl}` +
          (effective.status === 'applied' || effective.status === 'source-already-corrected'
            ? `; errata ${effective.errataSourceUrl}` : effective.status === 'source-mismatch'
              ? '; errata non applicata: testo fonte non corrispondente' : '') : '')
    })
    return `CARTE NOSTRE (testo originale):\n${baseline.lines.filter((line) => line.kind === 'card')
      .slice(0, 120).map((line) => line.raw).join('\n') || 'lista non interpretata'}\n` +
      `LISTA PER CARTA DI GIOCO E REGOLE DELLE STAMPE IDENTIFICATE:\n${cardDescriptions.join('\n') || 'nessuna'}\n` +
      matchupStandardContext(standard, catalog)
  }
  const lines = baseline.lines.filter((line) => line.kind === 'card').slice(0, 120)
  const original = lines.map((line) => `${line.quantity} ${(line.name ?? '').slice(0, 120)}`)
  const byLine = new Map(reconciliation.mappings.map((mapping) => [mapping.lineNumber, mapping]))
  const resolved = lines.flatMap((line) => {
    const mapping = byLine.get(line.lineNumber)
    return mapping ? [`Riga ${line.lineNumber}: ${line.quantity} ${mapping.print.name} — ${mapping.print.setId} ${mapping.print.localId}; rarità ${mapping.print.rarity ?? 'ignota'}; identità ${mapping.print.identityBasis === 'trainer-text' ? 'Trainer con testo coincidente' : 'non verificata'}`] : []
  })
  const totals = reconciliation.identityTotals.slice(0, 120)
    .map((item) => `${item.quantity} ${item.name} (${item.printIds.join(', ')})`)
  return `CARTE NOSTRE DAL TESTO IMPORTATO:\n${original.join('\n') || 'lista non interpretata'}\n` +
    `SCELTE MANUALI DI STAMPA (${reconciliation.resolvedLines} righe; ${reconciliation.unresolvedCopies} copie ancora irrisolte):\n${resolved.join('\n') || 'nessuna'}\n` +
    `TOTALI PER IDENTITÀ DI GIOCO RICONCILIATA:\n${totals.join('\n') || 'nessuno'}\n` +
    matchupStandardContext(standard, catalog)
}
