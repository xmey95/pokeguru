export const CATALOG_SOURCE = 'TCGdex REST v2/en'
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
  sourceTotal: number
  sampleTotal: number
  fetchedAt: string
  releaseDate?: string | null
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
  identityBasis: 'trainer-text' | 'unverified' | null
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
  source: typeof CATALOG_SOURCE
  sourceLanguage: 'en'
  scope: { setIds: readonly string[]; names: readonly string[]; kind?: 'sample' | 'standard-marks' }
  standardCoverage?: { expected: number; acquired: number; missing: number; marks: readonly string[];
    releaseSource: { url: string; version: number; checkedAt: string };
    bySet: { setId: string; name: string; sourceTotal: number; releaseDate?: string | null;
      officialReleaseDate: string | null; expected: number;
      acquired: number; missing: number; promo: boolean; promoVerified: number; promoUnchecked: number }[];
    promos: { expected: number; acquired: number; missing: number; series: number;
      available: number; upcoming: number; unlisted: number; unchecked: number } }
  promoAudit?: PromoAudit
  syncedAt: string | null
  sets: CatalogSet[]
  prints: CatalogPrint[]
}
