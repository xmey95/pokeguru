import { hasStrategyPhases, type MatchupReport } from '../shared/meta-matchups'

export const legacyMatchupFields = ['strengths', 'weaknesses', 'ourKeyCards', 'theirKeyCards', 'strategy', 'limitations'] as const
export const matchupFields = ['strengths', 'weaknesses', 'ourKeyCards', 'theirKeyCards',
  'opening', 'development', 'closing', 'limitations'] as const

type Analysis = Pick<MatchupReport, typeof legacyMatchupFields[number] | 'strategyPhases'>

/** Both normal completion and interrupted CLI recovery use the same output contract. */
export function readMatchupAnalysis(raw: unknown, version: 1 | 2): Analysis {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Analisi Codex non valida.')
  const value = raw as Record<string, unknown>
  for (const field of version === 2 ? matchupFields : legacyMatchupFields) {
    if (typeof value[field] !== 'string' || value[field].length > 5000 ||
      (version === 2 && !value[field].trim())) throw new Error('Codex ha restituito una guida incompleta. Riprova.')
  }
  const common = { strengths: value.strengths as string, weaknesses: value.weaknesses as string,
    ourKeyCards: value.ourKeyCards as string, theirKeyCards: value.theirKeyCards as string,
    limitations: value.limitations as string }
  if (version === 1) return { ...common, strategy: value.strategy as string }
  const phases = { opening: value.opening, development: value.development, closing: value.closing }
  if (!hasStrategyPhases(phases)) throw new Error('Il piano di gioco è incompleto. Riprova.')
  return { ...common, strategyPhases: phases,
    strategy: `Apertura\n${phases.opening}\n\nSviluppo\n${phases.development}\n\nChiusura\n${phases.closing}` }
}
