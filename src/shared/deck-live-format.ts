import type { DeckLine } from './deck-import'
import { LIVE_SET_CODES } from './set-codes'

const knownLiveCodes = new Set(Object.values(LIVE_SET_CODES))

export interface LiveCardLine {
  text: string
  unsupportedCode: string | null
  codeToVerify: string | null
}

/** Format a parsed print like TCG Live's text export. Never guess another print. */
export function liveCardLine(line: DeckLine,
  catalogSetCodes: Readonly<Record<string, string>> = {}): LiveCardLine {
  if (line.kind !== 'card' || !line.setCode || !line.cardNumber) {
    return { text: line.raw.trim(), unsupportedCode: null, codeToVerify: null }
  }
  const sourceCode = line.setCode.toUpperCase()
  const setId = line.setCode.toLowerCase()
  const catalogCode = catalogSetCodes[setId]?.toUpperCase()
  const usableCatalogCode = catalogCode && /^[A-Z0-9-]{2,12}$/.test(catalogCode) ? catalogCode : null
  const liveCode = setId === 'svp' ? 'PR-SV' : usableCatalogCode ?? LIVE_SET_CODES[setId]
  // A TCGdex-looking ID without a known mapping must not be copied as a Live set.
  if (!liveCode && (/^(?:SV|ME)\d/i.test(sourceCode) || sourceCode.includes('.') || sourceCode === '30TH')) {
    return { text: line.raw.trim(), unsupportedCode: line.setCode, codeToVerify: null }
  }
  const number = /^\d+$/.test(line.cardNumber)
    ? line.cardNumber.replace(/^0+(?=\d)/, '') : line.cardNumber
  const variant = line.printVariant ? ` ${line.printVariant}` : ''
  return {
    text: `${line.quantity} ${line.name} ${liveCode ?? sourceCode} ${number}${variant}`,
    unsupportedCode: null,
    codeToVerify: usableCatalogCode && !LIVE_SET_CODES[setId] ? `${sourceCode} → ${usableCatalogCode}`
      : !liveCode && !knownLiveCodes.has(sourceCode) ? sourceCode : null
  }
}
