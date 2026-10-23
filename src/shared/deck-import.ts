export type DeckImportSource = 'paste' | 'file'

export type DeckLineKind = 'blank' | 'section' | 'summary' | 'card' | 'unparsed'

export interface DeckLine {
  lineNumber: number
  raw: string
  kind: DeckLineKind
  quantity?: number
  name?: string
  setCode?: string
  cardNumber?: string
  printVariant?: string
}

export interface DeckDiagnostic {
  lineNumber: number
  code: 'UNPARSED' | 'PRINT_UNKNOWN' | 'ALT_PRINT' | 'TOTAL_MISMATCH'
  message: string
}

export interface ParsedDeck {
  lines: DeckLine[]
  interpretedTotal: number
  declaredTotal: number | null
  diagnostics: DeckDiagnostic[]
}

export interface DeckBaseline extends ParsedDeck {
  projectId: string
  rawText: string
  source: DeckImportSource
  fileName: string | null
  importedAt: string
}

export interface ImportDeckInput {
  projectId: string
  rawText: string
  source: DeckImportSource
  fileName?: string | null
}

const sectionPattern = /^(?:Pok[eé]mon(?: Cards)?|Trainers?(?: Cards)?|Energy(?: Cards)?|Energies|Energie|Allenatori)\s*(?:(?:[:\-–]\s*|\(\s*)(\d+)\s*\)?)?$/i
const summaryPattern = /^(?:Total(?:\s+Cards?|\s+Carte)?|Totale(?:\s+Carte)?)\s*:\s*(\d+)$/i
const bracketedPrintPattern = /^(.+?)\s+\(([A-Z0-9-]{2,12})-([A-Za-z0-9/.-]{1,12})\)$/
const trailingPrintPattern = /^(.+?)\s+([A-Z0-9-]{2,12})\s+([A-Za-z]{0,3}\d[A-Za-z0-9/.-]{0,11})(?:\s+(PH))?$/

export function parseDeck(rawText: string): ParsedDeck {
  const lines: DeckLine[] = []
  const diagnostics: DeckDiagnostic[] = []
  let interpretedTotal = 0
  let declaredTotal: number | null = null

  rawText.split(/\r\n|\n|\r/).forEach((raw, index) => {
    const lineNumber = index + 1
    const trimmed = raw.replace(/^\uFEFF/, '').trim()
    if (!trimmed) {
      lines.push({ lineNumber, raw, kind: 'blank' })
      return
    }
    if (sectionPattern.test(trimmed)) {
      lines.push({ lineNumber, raw, kind: 'section' })
      return
    }
    const summary = trimmed.match(summaryPattern)
    if (summary) {
      declaredTotal = Number(summary[1])
      lines.push({ lineNumber, raw, kind: 'summary' })
      return
    }

    const card = trimmed.match(/^(\d{1,2})\s+(.+)$/)
    if (!card || Number(card[1]) < 1 || Number(card[1]) > 60) {
      lines.push({ lineNumber, raw, kind: 'unparsed' })
      diagnostics.push({ lineNumber, code: 'UNPARSED', message: 'Riga non interpretata: resta nel testo originale.' })
      return
    }

    const quantity = Number(card[1])
    const rest = card[2].trim()
    const print = rest.match(bracketedPrintPattern) ?? rest.match(trailingPrintPattern)
    const name = (print ? print[1] : rest).trim()
    if (!/[\p{L}\p{N}]/u.test(name)) {
      lines.push({ lineNumber, raw, kind: 'unparsed' })
      diagnostics.push({ lineNumber, code: 'UNPARSED', message: 'Nome non riconosciuto: riga conservata senza contarla.' })
      return
    }

    const parsedLine: DeckLine = { lineNumber, raw, kind: 'card', quantity, name }
    if (print) {
      parsedLine.setCode = print[2]
      parsedLine.cardNumber = print[3]
      if (print[4]) parsedLine.printVariant = print[4]
      if (/ALT/i.test(print[2])) {
        diagnostics.push({ lineNumber, code: 'ALT_PRINT', message: 'Codice ALT conservato: la stampa va verificata prima di un export.' })
      }
    } else {
      diagnostics.push({ lineNumber, code: 'PRINT_UNKNOWN', message: 'Stampa non identificata; il nome resta da riconciliare con il catalogo.' })
    }
    interpretedTotal += quantity
    lines.push(parsedLine)
  })

  if (declaredTotal !== null && declaredTotal !== interpretedTotal) {
    diagnostics.push({
      lineNumber: 0,
      code: 'TOTAL_MISMATCH',
      message: `Totale dichiarato ${declaredTotal}, copie interpretate ${interpretedTotal}. Il totale mostrato deriva dalle righe.`
    })
  }

  return { lines, interpretedTotal, declaredTotal, diagnostics }
}
