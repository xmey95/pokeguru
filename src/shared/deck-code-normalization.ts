import { parseDeck } from './deck-import'
import { OFFICIAL_SET_CODES } from './set-codes'

export interface DeckCodeNormalization {
  rawText: string
  conversions: { from: string; to: string; lineNumber: number }[]
  unsupported: { code: string; lineNumber: number }[]
}

/** Preserve the candidate as saved; return the text used for adopting/exporting it. */
export function normalizeDeckCodes(rawText: string): DeckCodeNormalization {
  const parsed = parseDeck(rawText)
  const conversions: DeckCodeNormalization['conversions'] = []
  const unsupported: DeckCodeNormalization['unsupported'] = []
  const chunks = rawText.split(/(\r\n|\n|\r)/)
  for (const line of parsed.lines) {
    if (line.kind !== 'card' || !line.setCode?.includes('.')) continue
    const to = OFFICIAL_SET_CODES[line.setCode.toLowerCase()]
    const chunkIndex = (line.lineNumber - 1) * 2
    const rawLine = chunks[chunkIndex]
    const position = rawLine.toUpperCase().lastIndexOf(line.setCode.toUpperCase())
    if (!to || position < 0) {
      unsupported.push({ code: line.setCode, lineNumber: line.lineNumber })
      continue
    }
    chunks[chunkIndex] = `${rawLine.slice(0, position)}${to}${rawLine.slice(position + line.setCode.length)}`
    conversions.push({ from: line.setCode, to, lineNumber: line.lineNumber })
  }
  return { rawText: chunks.join(''), conversions, unsupported }
}
