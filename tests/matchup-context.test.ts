import { describe, expect, it } from 'vitest'
import { matchupHistoryContext } from '../src/main/codex-matchup'
import type { MatchupDiscussion, MatchupReport } from '../src/shared/meta-matchups'

describe('contesto delle revisioni Matchup', () => {
  it('usa il riepilogo e gli ultimi turni senza perdere la guida precedente', () => {
    const report: MatchupReport = {
      projectId: 'project', metaId: 'meta', opponentId: '284', deckHash: 'hash',
      generatedAt: '2026-10-23T00:00:00.000Z', sampleDeckUrl: null,
      strengths: 'Punto forte', weaknesses: 'Debolezza', ourKeyCards: 'Carta nostra',
      theirKeyCards: 'Carta avversaria', strategy: 'Piano più recente', limitations: 'Nessun match osservato'
    }
    const discussion: MatchupDiscussion = {
      id: 'discussion', projectId: 'project', metaId: 'meta', opponentId: '284', deckHash: 'hash',
      parentId: null, current: true, createdAt: report.generatedAt,
      contextSummary: 'L’utente ipotizza un avvio più lento; nessun risultato giocato.', summarizedThrough: 5,
      turns: Array.from({ length: 10 }, (_, index) => ({
        id: String(index), feedback: index ? `Osservazione ${index}` : null,
        createdAt: report.generatedAt, report: { ...report, strategy: index === 9 ? 'Piano più recente' : `Piano ${index}` },
        changeSummary: index ? `Motivo ${index}` : null
      }))
    }
    const context = matchupHistoryContext(discussion)
    expect(context).toContain('avvio più lento')
    expect(context).toContain('Osservazione 9')
    expect(context).toContain('Piano più recente')
    expect(context).not.toContain('Osservazione 1')
    expect(context).toContain('Nessun match osservato')
  })
})
