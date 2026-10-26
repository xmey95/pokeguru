/** Group repeated per-line diagnostics for display without changing the underlying checks. */
export function reviewSummary(reasons: string[]): string[] {
  const grouped = new Map<string, Set<string>>()
  for (const reason of reasons) {
    const match = /^Riga (\d+) — (.*)$/.exec(reason)
    const key = !match ? reason : /Catalogo locale non sincronizzato/.test(match[2])
      ? 'Catalogo non sincronizzato: rotazione e ammissione da verificare.'
      : /Stampa non identificata univocamente/.test(match[2])
        ? 'Stampa non identificata: rotazione e ammissione da verificare.' : match[2]
    const lines = grouped.get(key) ?? new Set<string>()
    if (match) lines.add(match[1])
    grouped.set(key, lines)
  }
  return [...grouped].map(([reason, lines]) => lines.size ? `${reason} Righe ${[...lines].join(', ')}.` : reason)
}
