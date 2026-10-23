import type { DeckBaseline, DeckLine } from './deck-import'

export interface DeckExportRequest {
  projectId: string
  importedAt: string
}

export interface DeckExportPreview {
  text: string
  cardTotal: number
  canExport: boolean
  notes: string[]
}

type Section = 'Pokémon' | 'Trainer' | 'Energy'

function sectionName(line: DeckLine): Section | null {
  const heading = line.raw.trim()
  if (/^Pok[eé]mon/i.test(heading)) return 'Pokémon'
  if (/^(?:Trainers?|Allenatori)/i.test(heading)) return 'Trainer'
  if (/^(?:Energy|Energies|Energie)/i.test(heading)) return 'Energy'
  return null
}

export function prepareDeckExport(baseline: DeckBaseline): DeckExportPreview {
  const cards = baseline.lines.filter((line) => line.kind === 'card')
  const unparsed = baseline.lines.filter((line) => line.kind === 'unparsed')
  const notes: string[] = []
  const cardTotal = cards.reduce((sum, line) => sum + (line.quantity ?? 0), 0)

  if (unparsed.length) notes.push(`${unparsed.length} righe non interpretate: correggi la lista prima di esportarla, per non perdere carte.`)
  if (!cards.length) notes.push('La lista non contiene carte interpretabili.')
  if (baseline.declaredTotal !== null && baseline.declaredTotal !== cardTotal) {
    notes.push(`Totale aggiornato da ${baseline.declaredTotal} a ${cardTotal}, calcolato dalle quantità delle carte.`)
  }
  if (cardTotal !== 60) notes.push(`La lista contiene ${cardTotal} carte. La legalità Standard non è verificata.`)
  if (cards.some((line) => line.setCode && /ALT/i.test(line.setCode))) {
    notes.push('Codici ALT conservati senza sostituzioni: Limitless potrebbe non riconoscere alcune stampe. Verifica la carta nel client prima di inviare la lista.')
  }
  if (cards.some((line) => !line.setCode)) {
    notes.push('Alcune carte non indicano set e numero: il riconoscimento della stampa nel client resta da verificare.')
  }

  const sections: { name: Section; cards: DeckLine[] }[] = []
  let current: { name: Section; cards: DeckLine[] } | null = null
  const leadingCards: DeckLine[] = []
  for (const line of baseline.lines) {
    if (line.kind === 'section') {
      const name = sectionName(line)
      if (name) {
        current = { name, cards: [] }
        sections.push(current)
      }
    } else if (line.kind === 'card') {
      if (current) current.cards.push(line)
      else leadingCards.push(line)
    }
  }
  if (leadingCards.length && sections.length) {
    notes.push('Alcune carte sono fuori dalle sezioni: controlla la loro categoria nel client.')
  } else if (!sections.length) {
    notes.push('La lista non ha sezioni Pokémon/Trainer/Energy: verifica l’importazione nel client di destinazione.')
  }

  // Both destinations accept PTCG Live text. Preserve each card line, including ALT codes,
  // leading zeroes and suffixes such as PH; normalize only section and grand totals.
  const blocks: string[] = []
  if (leadingCards.length) blocks.push(leadingCards.map((line) => line.raw.trim()).join('\n'))
  for (const section of sections) {
    if (!section.cards.length) continue
    blocks.push(`${section.name}: ${section.cards.length}\n${section.cards.map((line) => line.raw.trim()).join('\n')}`)
  }
  const canExport = !unparsed.length && cards.length > 0
  const text = canExport ? `${blocks.join('\n\n')}\n\nTotal Cards: ${cardTotal}\n` : ''
  return { text, cardTotal, canExport, notes }
}
