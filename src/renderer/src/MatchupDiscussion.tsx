import type { ReactNode } from 'react'
import type { MatchupDiscussion as Discussion, MatchupTurn } from '../../shared/meta-matchups'
import { GuideText } from './GuideText'
import { reportGuideReferences } from './guide-links'
import { MatchupPlan } from './MatchupPlan'
import { AiDiagnostics, AiEvidenceLimit } from './AiDiagnostics'

export interface RevisionInFlight {
  discussionId: string
  feedback: string
  createdAt: string
}

const date = (value: string) => new Intl.DateTimeFormat('it-IT', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
const revisionLabel = (index: number) => index === 0 ? 'Guida iniziale' : `Revisione ${index}`

export function MatchupDiscussion({ discussion, feedback, onFeedback, onSubmit, onRetry, onContinue,
  onOpenCatalogCard, cardTargets, generating, inFlight, error, canRevise, canRetry, canContinue, absentFromMeta, cached, aiControls }: {
  discussion: Discussion
  feedback: string
  onFeedback(value: string): void
  onSubmit(): void
  onRetry(turnId: string): void
  onContinue(): void
  onOpenCatalogCard(identityId: string): void
  cardTargets: ReadonlyMap<string, string>
  generating: boolean
  inFlight: RevisionInFlight | null
  error: string | null
  canRevise: boolean
  canRetry: boolean
  canContinue: boolean
  absentFromMeta: boolean
  cached: boolean
  aiControls: ReactNode
}) {
  const pending = discussion.turns.find((turn) => !turn.report)
  const submitting = inFlight?.discussionId === discussion.id ? inFlight : null
  const optimistic: MatchupTurn | null = submitting && !pending
    ? { id: 'submitting', feedback: submitting.feedback, createdAt: submitting.createdAt, report: null, changeSummary: null } : null
  const latest = pending ?? optimistic ?? discussion.turns.at(-1)
  const previous = discussion.turns.filter((turn) => turn.id !== latest?.id)
  const latestIndex = optimistic ? discussion.turns.length : discussion.turns.findIndex((turn) => turn.id === latest?.id)
  const text = (value: string, turn: MatchupTurn, list = false) => <GuideText key={`${turn.id}:${value}`} text={value} list={list}
    references={turn.report ? reportGuideReferences(turn.report, cardTargets) : []} cardTargets={cardTargets} onOpenCatalogCard={onOpenCatalogCard} />
  const exchange = (turn: MatchupTurn) => <>
    {turn.feedback && <div className="discussion-observation"><h4>Tu</h4><p>{turn.feedback}</p></div>}
    {turn.changeSummary && <div className="discussion-change"><h4>Cosa cambia <span>· Codex</span></h4>{text(turn.changeSummary, turn)}</div>}
  </>

  return <section className="matchup-discussion" aria-labelledby="matchup-discussion-heading">
    <h3 id="matchup-discussion-heading" tabIndex={-1}>Discussione</h3>
    {latest && <article className="discussion-latest" aria-label="Ultimo scambio">
      <div className="discussion-turn-heading">
        <span>{revisionLabel(latestIndex)} <span className="discussion-date">· <time dateTime={latest.createdAt}>{date(latest.createdAt)}</time></span></span>
        {latest.report && <span className="discussion-version-state">{discussion.current ? 'Guida attuale' : 'Ultima di questa base'}</span>}
      </div>
      {exchange(latest)}
      {!latest.report && <div className="discussion-pending">
        {submitting ? <p className="content-note" role="status">La guida precedente resta disponibile durante la revisione.</p>
          : <p role="status">Revisione non completata. La guida precedente resta disponibile.</p>}
        {error && <p className="error-banner" role="alert">{error}</p>}
      </div>}
    </article>}
    {discussion.current && (pending || submitting) && <div className="discussion-retry-actions">
      {aiControls}
      {pending && <button type="button" className="primary-button"
        onClick={() => onRetry(pending.id)} disabled={generating || !canRetry}>Riprova la revisione</button>}
    </div>}
    {discussion.current && !pending && !submitting && <div className="feedback-form">
      <label htmlFor="matchup-feedback">Aggiungi un’osservazione</label>
      <textarea id="matchup-feedback" value={feedback} maxLength={5000}
        onChange={(event) => onFeedback(event.target.value)} disabled={generating}
        placeholder="Per esempio: terrei una carta di ricerca per il turno successivo…" />
      {error && <p className="error-banner" role="alert">{error}</p>}
      {cached && <p className="content-note">Aggiorna Limitless per rivedere la guida.</p>}
      {aiControls}
      <button type="button" className="primary-button" onClick={onSubmit}
        disabled={!feedback.trim() || generating || !canRevise}>Aggiorna guida</button>
    </div>}
    {!discussion.current && canContinue && <div className="discussion-continue-actions">{aiControls}<button type="button" className="primary-button discussion-continue"
      onClick={onContinue} disabled={generating || cached || !canRetry}>
      {generating ? 'Codex sta rivalutando…' : 'Continua sulla nuova base'}
    </button></div>}
    {absentFromMeta && <p className="content-note">Avversario assente dal meta attuale. Guida consultabile.</p>}
    {previous.length > 0 && <details className="discussion-history" id={`discussion-history-${discussion.id}`}>
      <summary>Revisioni precedenti ({previous.length})</summary>
      <div className="discussion-history-list">
        {[...previous].reverse().map((turn) => <article className="discussion-history-item" key={turn.id}>
          <div className="discussion-turn-heading"><span>{revisionLabel(discussion.turns.indexOf(turn))} <span className="discussion-date">· <time dateTime={turn.createdAt}>{date(turn.createdAt)}</time></span></span></div>
          {exchange(turn)}
          {turn.report && <details className="discussion-version" id={`discussion-version-${turn.id}`}>
            <summary>Leggi versione</summary>
            <div className="discussion-version-body">
              <h4>Piano di gioco</h4><MatchupPlan scope={`history-${turn.id}`} report={turn.report} renderText={(value) => text(value, turn)} />
              <div className="discussion-version-limits"><h4>Limiti dell’analisi</h4>{text(turn.report.limitations, turn)}<AiEvidenceLimit trace={turn.report.aiQueries} /></div>
              <h4>Le nostre carte chiave</h4>{text(turn.report.ourKeyCards, turn, true)}
              <h4>Le loro carte chiave</h4>{text(turn.report.theirKeyCards, turn, true)}
              <h4>Punti forti</h4>{text(turn.report.strengths, turn, true)}
              <h4>Debolezze</h4>{text(turn.report.weaknesses, turn, true)}
              <details className="discussion-version-sources"><summary>Fonti e dettagli</summary>
                {turn.report.sampleDeckUrl && text(`[Lista avversaria](${turn.report.sampleDeckUrl})`, turn)}
                {turn.report.metaSourceUrl && text(`[Metagame](${turn.report.metaSourceUrl})`, turn)}
                <AiDiagnostics trace={turn.report.aiQueries} audit={turn.report.promptAudit}>
                  <p>Impronta lista: {turn.report.deckHash}<br />Snapshot Meta: {turn.report.metaId}</p>
                </AiDiagnostics>
              </details>
            </div>
          </details>}
        </article>)}
      </div>
    </details>}
  </section>
}
