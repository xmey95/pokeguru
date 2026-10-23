export const CATALOG_SOURCE = 'TCGdex REST v2/en'
export const CATALOG_SET_IDS = ['sv01', 'sv02', 'sv04.5'] as const
export const CATALOG_NAMES = [
  'Arven', 'Boss\'s Orders', 'Iono', 'Mew ex', 'Nest Ball',
  'Professor\'s Research', 'Rare Candy', 'Ultra Ball'
] as const

export interface CatalogSet {
  id: string
  name: string
  sourceTotal: number
  sampleTotal: number
  fetchedAt: string
}

export interface CatalogPrint {
  id: string
  setId: string
  setName: string
  localId: string
  name: string
  category: string | null
  rarity: string | null
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
  scope: { setIds: readonly string[]; names: readonly string[] }
  syncedAt: string | null
  sets: CatalogSet[]
  prints: CatalogPrint[]
}
