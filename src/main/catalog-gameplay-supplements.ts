import { isDeepStrictEqual } from 'node:util'
import type { CatalogPrint } from '../shared/catalog'
import data from './catalog-gameplay-supplements.json'

const entries = new Map(data.entries.map(entry => [entry.id, entry]))

/** Curated transcription from the exact printing's scan. Never infer a free
 * attack or copy an effect from another printing just because its name matches.
 * Upstream corrections take precedence; changed payloads fail closed. */
export function supplementCatalogGameplay(print: CatalogPrint): CatalogPrint {
  const entry = entries.get(print.id)
  if (!entry || !print.detailAt || print.gameplaySchemaVersion !== 1 || !print.gameplay ||
    print.name !== entry.name || print.category !== entry.category || (print.stage ?? null) !== entry.stage ||
    print.setId !== entry.id.split('-')[0] || print.localId !== entry.id.split('-')[1] ||
    !isDeepStrictEqual(print.gameplay, entry.expected)) return print
  return { ...print, gameplay: { ...print.gameplay,
    attacks: print.gameplay.attacks.map((attack, index) => (entry.freeAttacks as number[]).includes(index)
      ? { ...attack, cost: [] } : attack),
    effect: entry.effect ?? print.gameplay.effect },
  gameplaySupplement: { version: data.version, checkedAt: data.checkedAt, sourceUrl: entry.sourceUrl,
    fields: entry.effect ? ['effect'] : entry.freeAttacks.map(index => `attacks.${index}.cost`) } }
}
