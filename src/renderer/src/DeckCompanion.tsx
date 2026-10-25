import { LoadingSkeleton } from './Loading'
import { useMemo } from 'react'
import { useCardPreview } from './CardPreview'
import type { DeckBaseline, DeckLine } from '../../shared/deck-import'

interface DeckGroup {
  name: string
  lines: DeckLine[]
  total: number
}

function sectionName(raw: string): string {
  if (/pok[eé]mon/i.test(raw)) return 'Pokémon'
  if (/trainer|allenator[ei]/i.test(raw)) return 'Allenatori'
  if (/energ/i.test(raw)) return 'Energie'
  return 'Altre carte'
}

function groupCards(baseline: DeckBaseline): DeckGroup[] {
  const groups: DeckGroup[] = []
  let current: DeckGroup | null = null
  for (const line of baseline.lines) {
    if (line.kind === 'section') {
      current = { name: sectionName(line.raw), lines: [], total: 0 }
      groups.push(current)
    } else if (line.kind === 'card') {
      if (!current) {
        current = { name: 'Carte importate', lines: [], total: 0 }
        groups.push(current)
      }
      current.lines.push(line)
      current.total += line.quantity ?? 0
    }
  }
  return groups.filter((group) => group.lines.length > 0)
}

function deckState(baseline: DeckBaseline | null, loading: boolean): string {
  if (loading) return 'Caricamento'
  if (!baseline) return 'Da costruire'
  if (baseline.diagnostics.some((item) => item.code === 'UNPARSED' || item.code === 'TOTAL_MISMATCH')) return 'Testo da correggere'
  if (baseline.interpretedTotal !== 60) return 'Lista incompleta'
  return 'Pronta per controllo'
}

export function DeckCompanion({ baseline, loading }: { baseline: DeckBaseline | null; loading: boolean }) {
  const preview = useCardPreview()
  const groups = useMemo(() => baseline ? groupCards(baseline) : [], [baseline])
  const namedGroups = groups.filter((group) => group.name !== 'Carte importate')
  return <aside className="deck-companion" aria-label="Lista principale persistente" data-testid="deck-companion">
    <div className="companion-top">
      <h2>Lista principale</h2>
    </div>
    <div className="companion-summary">
      <div className="companion-total"><strong>{baseline?.interpretedTotal ?? 0}<span>/60</span></strong><span className="companion-state" data-tone={baseline && (baseline.interpretedTotal !== 60 || baseline.diagnostics.some((item) => item.code === 'UNPARSED' || item.code === 'TOTAL_MISMATCH')) ? 'warning' : 'neutral'}>{deckState(baseline, loading)}</span></div>
      {namedGroups.length > 0 ? <div className="companion-counts">{namedGroups.map((group, index) =>
        <div key={`${group.name}-${index}`}><strong>{group.total}</strong><span>{group.name}</span></div>)}</div>
        : baseline && <p className="companion-count-note">Sezioni non indicate nel testo.</p>}
    </div>
    <div className="companion-list" tabIndex={0} role="region" aria-label="Carte della lista principale">
      {loading ? <LoadingSkeleton label="Caricamento lista…" rows={3} /> : !baseline ? <p>Aggiungi una lista dalla sezione Lista.</p>
        : groups.map((group, index) => <section className="companion-group" key={`${group.name}-${index}`}>
            <h3>{group.name}<span>{group.total}</span></h3>
            {group.lines.map((line) => <div className="companion-row" key={line.lineNumber} tabIndex={0}
              {...preview({ name: line.name ?? line.raw, setCode: line.setCode, cardNumber: line.cardNumber })}>
              <strong>{line.quantity}</strong><span title={line.name}>{line.name}</span>
              {line.setCode && <small>{line.setCode} {line.cardNumber}</small>}</div>)}
          </section>)}
    </div>
  </aside>
}
