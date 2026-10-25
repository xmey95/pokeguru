import type { MatchupReport, MatchupTournamentEvidence, MetaDeck, MetaSnapshot } from '../../shared/meta-matchups'
import { GuideText } from './GuideText'
import { useCardPreview } from './CardPreview'
import { ExpandablePreviewDeck, PreviewDeckLines } from './PreviewDeckLines'

export type MatchupAction = 'generate' | 'revise' | 'continue'

export function MatchupDataPreview({ action, total, deckContext, opponent, snapshot, report,
  currentEvidence, evidenceLoading, evidenceError, feedback, cardTargets, onOpenCatalogCard }: {
  action: MatchupAction
  total: number
  deckContext: string | null
  opponent: MetaDeck
  snapshot: MetaSnapshot
  report?: MatchupReport | null
  currentEvidence: MatchupTournamentEvidence | null
  evidenceLoading: boolean
  evidenceError: string | null
  feedback: string
  cardTargets: ReadonlyMap<string, string>
  onOpenCatalogCard(identityId: string): void
}) {
  const cardPreview = useCardPreview()
  const revising = action === 'revise'
  const savedEvidence = revising ? report?.tournamentEvidence : undefined
  const evidence = savedEvidence ?? currentEvidence
  const savedCards = revising ? report?.sampleDeckCards : undefined
  const text = (value: string) => <GuideText text={value} inline cardTargets={cardTargets} onOpenCatalogCard={onOpenCatalogCard} />
  const evidenceSummary = evidence ? evidence.status === 'matched'
    ? `${evidence.matchedCompleteLists} ${evidence.matchedCompleteLists === 1 ? 'lista completa' : 'liste complete'} · ${savedEvidence ? 'evidenze salvate nella guida' : 'archivio attuale'}`
    : evidence.status === 'incompatible' ? 'Evidenze non compatibili' : 'Evidenze non disponibili'
    : evidenceLoading ? 'Caricamento evidenze…' : 'Evidenze non leggibili'
  return <div className="matchup-data-preview">
    <h4>{revising ? 'Per aggiornare la guida' : action === 'continue' ? 'Per continuare sulla nuova base' : 'Per generare una nuova guida'}</h4>
    <dl className="matchup-data-summary">
      <div><dt>Lista</dt><dd>{total} carte · versione principale attuale</dd></div>
      <div><dt>Avversario</dt><dd>{opponent.name}<span>{savedCards !== undefined ? 'Lista avversaria salvata nella guida.' : 'Lista pubblica cercata al momento dell’invio.'}</span></dd></div>
      <div><dt>Tornei</dt><dd>{evidenceSummary}</dd></div>
      {action !== 'generate' && <div><dt>Discussione</dt><dd>{revising ? 'La tua osservazione, la guida precedente e lo storico.' : 'Guida e osservazioni della base precedente, da rivalutare.'}</dd></div>}
    </dl>
    {!savedEvidence && evidenceError && <p className="error-banner" role="alert">{evidenceError}</p>}
    <details className="matchup-data-details"><summary>Dettagli e fonti</summary>
      <h4>Lista e controllo Standard</h4>
      <pre>{deckContext ?? 'Corrispondenze della lista non ancora disponibili.'}</pre>
      <h4>Metagame</h4>
      <p>{snapshot.period} · {new Intl.DateTimeFormat('it-IT', { dateStyle: 'medium' }).format(new Date(snapshot.fetchedAt))}. Quota {opponent.share.toLocaleString('it-IT', { maximumFractionDigits: 2 })}%, {opponent.points} punti; non è un winrate.</p>
      <p>{text(`[Fonte meta](${snapshot.sourceUrl})`)} · {text(`[Archetipo avversario](${opponent.url})`)}</p>
      <h4>Lista avversaria</h4>
      {savedCards !== undefined ? <>
        {savedCards.length ? <PreviewDeckLines lines={savedCards} /> : <p>La guida precedente non dispone di carte avversarie.</p>}
        {report?.sampleDeckUrl && <p>{text(`[Lista usata dalla guida](${report.sampleDeckUrl})`)}</p>}
        {!!report?.sampleDeckMechanics?.length && <details><summary>Schede avversarie salvate</summary>
          {report.sampleDeckMechanics.map((card, index) => <div key={index}><h4>{text(`[${card.name}](${card.sourceUrl})`)}</h4><p>{card.text}</p></div>)}
        </details>}
      </> : <p>Lista e schede avversarie saranno acquisite, se disponibili, durante la richiesta.</p>}
      <h4>Evidenze torneo</h4>
      <p>{evidence?.detail ?? evidenceSummary}</p>
      {evidence?.events && <ul>{evidence.events.map((event) => <li key={`${event.source}:${event.eventId}`}>
        {text(`[${event.name}](${event.url})`)} · {event.matchedLists} liste dell’archetipo / {event.completeLists} liste acquisite
      </li>)}</ul>}
      {!evidence?.events?.length && evidence?.eventUrl && <p>{text(`[${evidence.eventName ?? 'Evento osservato'}](${evidence.eventUrl})`)}</p>}
      {!!evidence?.sampleLists.length && <ul>{evidence.sampleLists.map((list, index) => <li key={list.url}>{text(`[Lista osservata ${index + 1}${list.eventName ? ` · ${list.eventName}` : ''}](${list.url})`)}
        {!!list.cards?.length && <ExpandablePreviewDeck summary="Carte osservate" lines={list.cards} />}</li>)}</ul>}
      {!!evidence?.observedCards.length && <details><summary>Carte osservate ({evidence.observedCards.length})</summary>
        <ul>{evidence.observedCards.map((card) => <li key={card.name} tabIndex={0}
          {...cardPreview({ name: card.name, identityId: card.catalogIdentityId })}>
          {card.cardSourceUrl ? text(`[${card.name}](${card.cardSourceUrl})`) : card.name} · {card.lists}/{evidence.matchedCompleteLists} liste
          {card.gameplay && <p>{card.gameplay}</p>}
        </li>)}</ul>
      </details>}
      {revising && <><h4>Osservazione</h4><p>{feedback.trim() || 'Nessuna osservazione scritta.'}</p></>}
      {action !== 'generate' && <p>Il contesto comprende la guida precedente e i turni recenti. Gli scambi più vecchi possono essere riassunti.</p>}
      <p className="content-note">Le schede possono essere aggiornate all’invio. Nessun dato di altri progetti.</p>
      <p className="content-note">Durante l'analisi l'AI può scegliere automaticamente query di sola lettura al Catalogo e alle liste Eventi locali. Questa scelta richiede un turno Codex aggiuntivo, con tempi e token propri; richieste e risultati effettivi saranno salvati nella guida.</p>
    </details>
  </div>
}
