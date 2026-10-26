import type { CardGameplay, CatalogPrint } from './catalog'
import type { WesternRulePackage } from './western-rule-package'

export interface EffectiveCardGameplay {
  /** The TCGdex fields remain intact in the Catalog and in this result. */
  printed: CardGameplay | null
  effective: CardGameplay | null
  status: 'no-correction' | 'not-yet-effective' | 'applied' |
    'source-already-corrected' | 'missing-source' | 'source-mismatch'
  errataSourceUrl: string | null
  ruleVersion: string | null
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object') {
    const entry = value as Record<string, unknown>
    return `{${Object.keys(entry).sort().map((key) =>
      `${JSON.stringify(key)}:${canonical(entry[key])}`).join(',')}}`
  }
  return JSON.stringify(value) ?? 'undefined'
}

/** Apply only a curated correction for an exact print whose source text matches. */
export function effectiveCardGameplay(print: CatalogPrint, asOf: string,
  rules: WesternRulePackage | null | undefined): EffectiveCardGameplay {
  const base = { printed: print.gameplay ?? null, effective: print.gameplay ?? null,
    errataSourceUrl: null, ruleVersion: rules?.version ?? null }
  const correction = rules?.errata.corrections?.find((item) => item.printId === print.id)
  if (!correction) return { ...base, status: 'no-correction' }
  const withSource = { ...base, errataSourceUrl: correction.sourceUrl }
  if (asOf < correction.effectiveFrom) return { ...withSource, status: 'not-yet-effective' }
  if (!print.gameplay) return { ...withSource, status: 'missing-source' }
  if (canonical(print.gameplay) === canonical(correction.corrected)) {
    return { ...withSource, status: 'source-already-corrected' }
  }
  if (canonical(print.gameplay) !== canonical(correction.printed)) {
    return { ...withSource, status: 'source-mismatch' }
  }
  return { ...withSource, effective: correction.corrected, status: 'applied' }
}
