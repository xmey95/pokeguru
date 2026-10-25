export interface CardPreviewLookup {
  name: string
  printId?: string | null
  identityId?: string | null
  setCode?: string | null
  cardNumber?: string | null
}

export interface CardPreviewData {
  name: string
  printLabel: string | null
  image: string | null
  reason: 'available' | 'source-missing' | 'not-cached' | 'not-in-catalog' | 'ambiguous' | 'unavailable'
  sample: boolean
}
