export const CATALOG_SOURCE = 'TCGdex REST v2/en'
export const CATALOG_GAMEPLAY_SCHEMA_VERSION = 1
import type { WesternRulePackage } from './western-rule-package'
export type CatalogSyncMode = 'new' | 'full'
export interface CatalogSyncStatus {
  running: boolean
  mode: CatalogSyncMode | null
  state: 'idle' | 'running' | 'paused' | 'done'
  phase: string
  expected: number
  acquired: number
  error: string | null
}
export const CATALOG_SET_IDS = ['sv01', 'sv02', 'sv04.5', 'me01', 'me02.5'] as const
export interface PromoStatus {
  state: 'available' | 'upcoming' | 'unlisted'
  legalDate: string | null
  dateNote: string | null
  checkedAt: string
}

export interface PromoAudit {
  sourceUrl: string
  checkedAt: string | null
  error: string | null
  series: string[]
  packageVersion?: number
  complete?: boolean
}
export const CATALOG_NAMES = [
  'Arven', 'Boss\'s Orders', 'Iono', 'Mew ex', 'Nest Ball',
  'Professor\'s Research', 'Rare Candy', 'Ultra Ball', 'Mega Absol ex', 'Mega Audino ex'
] as const

export interface CatalogSet {
  id: string
  name: string
  /** Official short code from the detailed TCGdex set response. */
  abbreviation?: string | null
  sourceTotal: number
  sampleTotal: number
  fetchedAt: string
  releaseDate?: string | null
}

export interface CardGameplay {
  hp: number | null
  types: string[]
  evolveFrom: string | null
  attacks: { name: string; cost: string[] | null; damage: string | null; effect: string | null }[]
  abilities: { name: string; effect: string; type: string | null }[]
  effect: string | null
  trainerType: string | null
  weaknesses: { type: string; value: string }[]
  resistances: { type: string; value: string }[]
  retreat: number | null
}

export interface CatalogPrint {
  id: string
  setId: string
  setName: string
  localId: string
  name: string
  category: string | null
  stage?: string | null
  energyType?: string | null
  rarity: string | null
  regulationMark?: string | null
  isPromo?: boolean
  promoStatus?: PromoStatus | null
  variants: Record<string, boolean> | null
  identityId: string | null
  identityBasis: 'trainer-text' | 'pokemon-text' | 'energy-text' | 'unverified' | null
  /** Absent on archives created before gameplay extraction was introduced. */
  gameplaySchemaVersion?: number
  gameplay?: CardGameplay | null
  imageBase: string | null
  thumbnail: string | null
  highImageAvailable: boolean | null
  sourceUpdated: string | null
  sourceUrl: string
  detailAt: string | null
  error: string | null
}

export interface CatalogView {
  circuit: 'WESTERN'
  rulePackage?: WesternRulePackage
  rulePackageError?: string | null
  source: typeof CATALOG_SOURCE
  sourceLanguage: 'en'
  scope: { setIds: readonly string[]; names: readonly string[]; kind?: 'sample' | 'standard-marks' }
  standardCoverage?: { expected: number; acquired: number; missing: number;
    gameplayAcquired: number; gameplayMissing: number; marks: readonly string[];
    releaseSource: { url: string; version: number; checkedAt: string };
    officialSets: { expected: number; present: number; missing: number;
      missingSets: { setId: string; product: string }[] };
    bySet: { setId: string; name: string; sourceTotal: number; releaseDate?: string | null;
      officialReleaseDate: string | null; expected: number;
      acquired: number; missing: number; gameplayAcquired: number; gameplayMissing: number;
      promo: boolean; promoVerified: number; promoUnchecked: number }[];
    promos: { expected: number; acquired: number; missing: number; series: number;
      available: number; upcoming: number; unlisted: number; unchecked: number } }
  promoAudit?: PromoAudit
  syncedAt: string | null
  sets: CatalogSet[]
  prints: CatalogPrint[]
}
