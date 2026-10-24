import type { CatalogPrint, CatalogView } from './catalog'
import type { DeckBaseline, DeckLine } from './deck-import'
import { OFFICIAL_SET_CODES } from './set-codes'
import { gameplaySummary } from './card-gameplay'
import type { StandardDeckEvaluation } from './standard-deck'

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

function normalizedNumber(value: string): string {
  return value.toUpperCase().replace(/^0+(?=\d)/, '')
}

function sameCode(line: DeckLine, print: CatalogPrint): boolean {
  if (!line.setCode || !line.cardNumber || /ALT/i.test(line.setCode)) return false
  const code = line.setCode.toUpperCase()
  return (code === print.setId.toUpperCase() || code === OFFICIAL_SET_CODES[print.setId]) &&
    normalizedNumber(line.cardNumber) === normalizedNumber(print.localId)
}

export function suggestPrints(line: DeckLine, catalog: CatalogView, search = ''): PrintCandidate[] {
  if (line.kind !== 'card' || !line.name) return []
  const term = normalizedName(search)
  return catalog.prints
    .filter((print) => print.detailAt !== null && print.identityId !== null)
    .map((print): PrintCandidate | null => {
      if (term && !`${print.name} ${print.id} ${print.setName} ${print.rarity ?? ''}`.toLocaleLowerCase().includes(term)) return null
      const printCode = sameCode(line, print)
      const name = normalizedName(line.name!) === normalizedName(print.name)
      if (printCode && name) return { print, reason: 'same-print' }
      if (printCode) return { print, reason: 'code-conflict' }
      if (name) return { print, reason: 'same-name' }
      if (term) return { print, reason: 'search' }
      return null
    })
    .filter((candidate): candidate is PrintCandidate => candidate !== null)
    .sort((a, b) => {
      const score: Record<CandidateReason, number> = { 'same-print': 0, 'code-conflict': 1, 'same-name': 2, search: 3 }
      return score[a.reason] - score[b.reason] || a.print.name.localeCompare(b.print.name) || a.print.id.localeCompare(b.print.id)
    })
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
  for (const print of prints) {
    const group = byIdentity.get(print.identityId!) ?? []
    group.push(print)
    byIdentity.set(print.identityId!, group)
  }
  const overrides = new Map(reconciliation?.mappings.map((item) => [item.lineNumber, item]) ?? [])
  const entries = new Map<string, DeckCardEntry>()
  for (const line of baseline.lines.filter((item) => item.kind === 'card')) {
    const sameName = prints.filter((print) => normalizedName(print.name) === normalizedName(line.name ?? ''))
    const exact = sameName.filter((print) => sameCode(line, print))
    const identities = [...new Set(sameName.map((print) => print.identityId!))]
    const exactIdentities = [...new Set(exact.map((print) => print.identityId!))]
    const override = overrides.get(line.lineNumber)
    // A catalog enrichment can replace a provisional identity without invalidating
    // the user's exact printing choice.
    const overridePrint = override && prints.find((print) => print.id === override.print.id)
    let identityId: string | null = overridePrint?.identityId ?? null
    if (!identityId && exactIdentities.length === 1) identityId = exactIdentities[0]
    if (!identityId && !line.setCode && identities.length === 1 &&
      sameName[0]?.identityBasis !== 'unverified') identityId = identities[0]
    const identityPrints = identityId ? byIdentity.get(identityId) ?? [] : []
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
      `ultimo aggiornamento della fonte ${errata.lastUpdated}. Nel perimetro H/I/J di questo snapshot ` +
      'non sono elencate correzioni specifiche di stampa; le stampe storiche restano fuori perimetro.' :
      'REGISTRO ERRATA: non disponibile nel catalogo locale.')
}

export function matchupDeckContext(baseline: DeckBaseline, reconciliation: DeckReconciliation,
  catalog?: CatalogView | null, standard: StandardDeckEvaluation | null = null): string {
  if (catalog) {
    const cards = buildDeckCards(baseline, catalog, reconciliation)
    const cardDescriptions = cards.slice(0, 120).map((card) => {
      const print = card.importedPrintIds.map((id) => card.prints.find((candidate) => candidate.id === id))
        .find((candidate) => !!candidate?.gameplay) ?? card.prints.find((candidate) => !!candidate.gameplay)
      const status = card.status === 'recognized' ? 'identità da testo di gioco coincidente'
        : card.status === 'unverified' ? 'stampa esatta nota; equivalenza fra ristampe da verificare'
          : card.status === 'ambiguous' ? 'identità ambigua' : 'nessuna corrispondenza nel catalogo locale'
      return `${card.quantity} ${card.name} — ${status}` +
        (print?.gameplay ? `; scheda ${print.id}: ${gameplaySummary(print.gameplay)}; fonte ${print.sourceUrl}` : '')
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
