type MatchupPlanPart = { label: 'Piano' | 'Fatti' | 'Ipotesi' | null; text: string }

// Older reports may put these labels on separate lines or run them together.
// Split only for presentation: the saved guide and its links stay untouched.
function matchupPlanParts(source: string): MatchupPlanPart[] {
  const marker = /(^|\s)(?:\*\*(Piano|Fatti|Ipotesi):\*\*|\*\*(Piano|Fatti|Ipotesi)\*\*:|(Piano|Fatti|Ipotesi):)/gimu
  const labels = [...source.matchAll(marker)].map((match) => ({
    start: match.index + match[1].length,
    end: match.index + match[0].length,
    label: (match[2] ?? match[3] ?? match[4]).toLocaleLowerCase('it')
  }))
  if (!labels.length) return [{ label: null, text: source }]

  const parts: MatchupPlanPart[] = []
  const intro = source.slice(0, labels[0].start).trim()
  if (intro) parts.push({ label: null, text: intro })
  for (const [index, marker] of labels.entries()) {
    const text = source.slice(marker.end, labels[index + 1]?.start ?? source.length).trim()
    const label = marker.label === 'piano' ? 'Piano' : marker.label === 'fatti' ? 'Fatti' : 'Ipotesi'
    parts.push({ label, text })
  }
  return parts
}

/** Read older labeled guides as one narrative without changing the stored report. */
export function matchupPlanNarrative(source: string): string {
  const parts = matchupPlanParts(source)
  if (parts.length === 1 && !parts[0].label) return source
  return parts.filter((part) => part.text).map((part) => {
    const text = part.text.replace(/^\p{Ll}/u, (letter) => letter.toLocaleUpperCase('it'))
    return part.label === 'Ipotesi' ? `Questo passaggio è un'ipotesi da verificare. ${text}` : text
  }).join('\n\n')
}
