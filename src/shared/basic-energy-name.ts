const energySymbols: Readonly<Record<string, string>> = {
  G: 'grass', R: 'fire', W: 'water', L: 'lightning', P: 'psychic',
  F: 'fighting', D: 'darkness', M: 'metal', Y: 'fairy'
}

const energyNames = new Set(Object.values(energySymbols))

/** Limitless uses symbols such as Basic {G} Energy for ordinary Basic Energy. */
export function basicEnergyType(name: string): string | null {
  const match = /^(?:Basic\s+)?(?:\{([A-Z])\}|([A-Za-z]+))\s+Energy$/i.exec(name.trim())
  if (!match) return null
  if (match[1]) return energySymbols[match[1].toUpperCase()] ?? null
  const type = match[2].toLowerCase()
  return energyNames.has(type) ? type : null
}
