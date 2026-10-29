import { createHash } from 'node:crypto'
import type { AiEvidenceQueryTrace } from '../shared/ai-evidence'
import type { CatalogEvidenceMatch } from './catalog-evidence-search'
import type { AiEvidenceEngine } from './ai-evidence-engine'
import { archiveReferences, evidenceArchive, evidenceCards } from './ai-evidence-access'

/** Search explanations are not card rules: overlapping queries can change them
 * without changing the original that the model needs to verify. */
export function deliveredCardFingerprint(card: CatalogEvidenceMatch): string {
  const { reason: _reason, matchedTerms: _terms, ...original } = card
  return createHash('sha256').update(JSON.stringify(original)).digest('hex')
}

export function selectedEvidenceCards(trace: AiEvidenceQueryTrace, printIds?: readonly string[]): CatalogEvidenceMatch[] {
  const archive = evidenceArchive(trace)
  const selected = printIds ? new Set(printIds) : undefined
  const records = archive
    ? (function* () {
      // Bind variables in groups to avoid SQLite's parameter ceiling on broad questions.
      const ids = selected ? [...selected] : undefined
      if (!ids) { for (const record of archive.records('card')) yield record.data as CatalogEvidenceMatch; return }
      for (let offset = 0; offset < ids.length; offset += 200)
        for (const record of archive.records('card', ids.slice(offset, offset + 200).map((id) => `card:${id}`)))
          yield record.data as CatalogEvidenceMatch
    })()
    : evidenceCards(trace)
  const cards = new Map<string, CatalogEvidenceMatch>()
  for (const card of records) if (!selected || selected.has(card.printId)) cards.set(card.printId, card)
  return [...cards.values()]
}

/** Select useful originals, without claiming they have already been sent. */
export function prepareEvidenceDelivery(trace: AiEvidenceQueryTrace, engine: AiEvidenceEngine,
  texts: readonly string[]): void {
  const named = engine.cardTargets([...texts, trace.analysis?.summary ?? '', trace.analysis?.limitations ?? ''].join('\n'))
    .flatMap((target) => target.printIds)
  const cited = (trace.analysis?.sourceIds ?? []).filter((id) => id.startsWith('card:')).map((id) => id.slice(5))
  trace.focusedPrintIds = [...new Set([...(trace.focusedPrintIds ?? []), ...named, ...cited])]
  archiveReferences(trace)
}

/** Delivery bookkeeping describes serialization, not a change to model input. */
export function evidenceCallContext(trace: AiEvidenceQueryTrace): unknown {
  const { deliveredCards: _delivery, durationMs: _duration, ...context } = trace
  return context
}

/** Called only by the prompt serializer, for the originals included in that
 * exact prompt. Earlier prompts/session state cannot satisfy this registry. */
export function recordEvidenceDelivery(trace: AiEvidenceQueryTrace, cards: readonly CatalogEvidenceMatch[]): void {
  trace.deliveredCards = cards.map((card) => ({ printId: card.printId, fingerprint: deliveredCardFingerprint(card) }))
}

/** Call after collecting any cards introduced by the draft. Even an existing
 * source needs revision when its actual content was absent from the prompt. */
export function draftNeedsEvidenceReview(trace: AiEvidenceQueryTrace, engine: AiEvidenceEngine, text: string): boolean {
  const ids = [...new Set(engine.cardTargets(text).flatMap((target) => target.printIds))]
  const before = new Set(trace.focusedPrintIds ?? [])
  trace.focusedPrintIds = [...new Set([...before, ...ids])]
  if (!trace.deliveredCards) return ids.length > 0
  const supplied = new Map(trace.deliveredCards.map((card) => [card.printId, card.fingerprint]))
  const actual = new Map(selectedEvidenceCards(trace, ids).map((card) => [card.printId, deliveredCardFingerprint(card)]))
  return ids.some((id) => !actual.has(id) || supplied.get(id) !== actual.get(id))
}

/** Only an exact duplicate is replaced. Different printed/effective rules,
 * missing fields, errata provenance and all originals remain unchanged. */
export function cardForPrompt(card: CatalogEvidenceMatch): unknown {
  if (card.gameplay && card.printedGameplay && JSON.stringify(card.gameplay) === JSON.stringify(card.printedGameplay)) {
    const { printedGameplay: _printed, ...rest } = card
    return { ...rest, printedGameplayRef: 'gameplay' }
  }
  return card
}

export const CARD_REFERENCE_NOTE = 'printedGameplayRef="gameplay" significa che il testo stampato è esattamente identico al campo gameplay della stessa scheda. cardRef rimanda alla scheda originale in cardDefinitions. Nessuna regola è omessa da questi riferimenti.'

/** Compact overlapping query pages only when the lossless representation is
 * actually smaller. Per-query reasons and every page envelope remain intact. */
export function queryPagesForPrompt(pages: AiEvidenceQueryTrace['requests']):
  { requests: unknown[]; cardDefinitions?: Record<string, unknown>; cardReferenceNote: string } {
  const definitions: Record<string, unknown> = {}
  let references = 0
  const compact = pages.map((page) => {
    const data = page.data as { matches?: CatalogEvidenceMatch[] } | null
    if (!data || !Array.isArray(data.matches)) return page
    return { ...page, data: { ...data, matches: data.matches.map((card) => {
      const key = `card:${card.printId}:${deliveredCardFingerprint(card)}`
      const { reason, matchedTerms, ...original } = card
      definitions[key] ??= cardForPrompt(original as CatalogEvidenceMatch)
      references++
      return { cardRef: key, ...(reason === undefined ? {} : { reason }),
        ...(matchedTerms === undefined ? {} : { matchedTerms }) }
    }) } }
  })
  const direct = pages.map((page) => {
    const data = page.data as { matches?: CatalogEvidenceMatch[] } | null
    return data && Array.isArray(data.matches)
      ? { ...page, data: { ...data, matches: data.matches.map(cardForPrompt) } } : page
  })
  const candidate = { requests: compact, cardDefinitions: definitions, cardReferenceNote: CARD_REFERENCE_NOTE }
  const fallback = { requests: direct, cardReferenceNote: CARD_REFERENCE_NOTE }
  return references > Object.keys(definitions).length &&
    Buffer.byteLength(JSON.stringify(candidate)) < Buffer.byteLength(JSON.stringify(fallback)) ? candidate : fallback
}
