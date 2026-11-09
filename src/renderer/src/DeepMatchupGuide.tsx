import { useId, type ReactNode } from 'react'
import { guideChapterKinds, type MatchupGuide } from '../../shared/matchup-guide'

export function DeepMatchupGuide({ guide, renderText }: { guide: MatchupGuide; renderText(text: string): ReactNode }) {
  const prefix = useId()
  const chapters = [...guide.chapters].sort((a, b) => guideChapterKinds.indexOf(a.kind) - guideChapterKinds.indexOf(b.kind))
  const scrollTo = (id: string) => document.getElementById(`${prefix}-${id}`)?.focus({ preventScroll: false })
  const sourceNames = (ids: string[]) => ids.map(id => guide.sources.find(s => s.id === id)?.label ?? id).join(' · ')
  const names = new Map([...guide.ourList.cards, ...guide.opponentLists.flatMap(l => l.cards)].map(c => [c.printId, c.name]))
  return <div className="deep-matchup-guide">
    <p className="deep-guide-intro">Guida sulla tua lista di 60 carte · {guide.opponentLists.length} {guide.opponentLists.length === 1 ? 'lista avversaria di riferimento' : 'liste avversarie di riferimento'} · dati al {guide.basis.asOf}</p>
    <nav className="deep-guide-index" aria-label="Indice della guida">
      {chapters.map(c => <button type="button" className="text-button" key={c.id} onClick={() => scrollTo(c.id)}>{c.title}</button>)}
      <button type="button" className="text-button" onClick={() => scrollTo('scenarios')}>Scenari commentati</button>
      <button type="button" className="text-button" onClick={() => scrollTo('exercises')}>Mettiti alla prova</button>
    </nav>
    {chapters.map(c => <section className="deep-guide-chapter" key={c.id}>
      <h3 id={`${prefix}-${c.id}`} tabIndex={-1}>{c.title}</h3>{renderText(c.body)}
      <details className="deep-guide-evidence"><summary>Prove di questo capitolo</summary><p>{sourceNames(c.sourceIds)}</p></details>
    </section>)}
    <section className="deep-guide-chapter"><h3 id={`${prefix}-scenarios`} tabIndex={-1}>Scenari commentati</h3>
      {guide.scenarios.map(s => <article className="deep-guide-scenario" key={s.id}>
        <h4>{s.title}</h4><p className="content-note">{guide.opponentLists.find(l => l.id === s.opponentListId)?.label}</p>
        {s.analysisScope&&<aside aria-label="Ambito del confronto">
          <p>Questo caso confronta {s.analysisScope.comparedReplyIds.length} risposte nelle condizioni indicate, fino al nostro turno successivo.</p>
          <ul>{s.analysisScope.limits.map((limit,i)=><li key={i}>{renderText(limit)}</li>)}</ul>
          {s.analysisScope.access.replyId===null&&<div><p>Accesso aggiuntivo non confrontato</p>{renderText(s.analysisScope.access.reason)}</div>}
          {s.analysisScope.defend.replyId===null&&<div><p>Difesa non confrontata</p>{renderText(s.analysisScope.defend.reason)}</div>}
        </aside>}
        {renderText(s.state)}
        <details><summary>Come si arriva a questa posizione</summary>{renderText(s.setupHistory)}
          <div className="deep-guide-calculations"><table><thead><tr><th>Lato</th><th>Carta</th><th>Copie</th><th>Zona iniziale</th></tr></thead><tbody>
            {s.inventory.map((r, i) => <tr key={i}><td>{r.side === 'ours' ? 'Noi' : 'Avversario'}</td><td>{names.get(r.printId) ?? r.printId}</td><td>{r.count}</td>
              <td>{{ active: 'Attivo', bench: 'Panchina', evolution: 'Sotto evoluzione', attached: 'Assegnata', hand: 'Mano', discard: 'Scarti', prizes: 'Premi', deck: 'Mazzo', stadium: 'Stadio', lost: 'Zona Perduta' }[r.zone]}</td></tr>)}
          </tbody></table></div></details>
        {!!s.assumptions.length && <details><summary>Ipotesi dello scenario</summary><ul>{s.assumptions.map((a, i) => <li key={i}>{renderText(a)}</li>)}</ul></details>}
        <h5>Sequenza e Premi rimasti</h5>
        <ol className="deep-guide-steps">{s.steps.map((step, i) => <li key={i}>{step.groupDescription && <details><summary>Effetto comune agli ingressi</summary>{renderText(step.groupDescription)}</details>}{renderText(step.description)}
          <p className="content-note">Premi nostri {step.before.ourPrizes} → {step.after.ourPrizes}; avversari {step.before.opponentPrizes} → {step.after.opponentPrizes}.
            {' '}Panchina nostra {step.before.ourBench} → {step.after.ourBench}; avversaria {step.before.opponentBench} → {step.after.opponentBench}.</p>
        </li>)}</ol>
        {!!s.calculations.length && <div className="deep-guide-calculations" role="region" aria-label={`Conti: ${s.title}`} tabIndex={0}>
          <table><thead><tr><th>Conto</th><th>Calcolo</th><th>Risultato</th></tr></thead><tbody>{s.calculations.map((c, i) => <tr key={i}>
            <td>{c.label}</td><td>({c.terms.join(' + ')}) × {c.multiplier}{c.minimum !== null ? `, minimo ${c.minimum}` : ''}</td><td>{c.expected}</td>
          </tr>)}</tbody></table>
        </div>}
        {renderText(s.explanation)}<h5>La risposta avversaria</h5>{renderText(s.opponentResponse)}<h5>Quando cambiare piano</h5>{renderText(s.pivot)}
        {s.replyComparison && <details><summary>Confronto delle repliche e risorse necessarie</summary>
          {renderText(s.replyComparison.objective)}
          {s.replyComparison.options.map(o => <div key={o.id}><h5>{o.intent === 'defend' ? 'Difesa · ' : o.intent === 'attack' ? 'Attacco · ' : ''}{o.id === s.replyComparison!.minimumReplyId ? s.analysisScope?'Linea sufficiente al KO fra quelle confrontate':'Linea sufficiente con meno risorse' : 'Alternativa'}{o.id === s.replyComparison!.preferredReplyId ? ' · scelta commentata' : ''}</h5>
            <ol>{o.sequence.map((line, i) => <li key={i}>{renderText(line)}</li>)}</ol>
            <p>({o.terms.join(' + ')}) × {o.multiplier} = {o.damage}; soglia {s.replyComparison!.threshold}. PS residui dell’attaccante: {o.remainingHp}.</p>
            <p>Nuove assegnazioni: {o.attachments}. Pescate indispensabili: {o.specificDraws.length ? o.specificDraws.map(id => names.get(id) ?? id).join(', ') : 'nessuna carta specifica'}.</p>
            {o.retreatEnergy !== undefined && <p>Energie scartate per ritirarsi: {o.retreatEnergy}.</p>}
            {o.promotionRationale && renderText(o.promotionRationale)}
            {renderText(o.outcome)}<ul>{o.requiredCards.map(c => <li key={c.printId}>{c.count} {names.get(c.printId) ?? c.printId}: {c.access}</li>)}</ul>
          </div>)}
          {renderText(s.replyComparison.conclusion)}
          {!s.analysisScope&&<details><summary>{s.replyComparison.omissionMode === 'consumption-budget' ? 'Impiegando una carta in meno' : 'Se manca una risorsa'}</summary>{s.replyComparison.omissionTests.map(t => <div key={t.printId}>
            <p>{s.replyComparison!.omissionMode === 'consumption-budget' ? `Con una copia in meno di ${names.get(t.printId) ?? t.printId} da impiegare e al massimo ${t.maximumNewCards} nuove carte totali` : `Senza una copia di ${names.get(t.printId) ?? t.printId}`}: {t.remainingDamage} danni.</p>
            {t.terms && t.multiplier !== undefined && <p>({t.terms.join(' + ')}) × {t.multiplier} = {t.remainingDamage}.</p>}{renderText(t.reason)}
          </div>)}</details>}
        </details>}
        <details><summary>{['matchup-guide-9','matchup-guide-10','matchup-guide-11','matchup-guide-12','matchup-guide-13','matchup-guide-14','matchup-guide-15','matchup-guide-16','matchup-guide-17','matchup-guide-18','matchup-guide-19','matchup-guide-20','matchup-guide-21','matchup-guide-22','matchup-guide-23','matchup-guide-24','matchup-guide-25','matchup-guide-26','matchup-guide-27','matchup-guide-28'].includes(guide.basis.promptVersion) ? 'Copie viste o impiegate e fonti' : 'Copie utilizzate e fonti'}</summary>
          {['matchup-guide-9','matchup-guide-10','matchup-guide-11','matchup-guide-12','matchup-guide-13','matchup-guide-14','matchup-guide-15','matchup-guide-16','matchup-guide-17','matchup-guide-18','matchup-guide-19','matchup-guide-20','matchup-guide-21','matchup-guide-22','matchup-guide-23','matchup-guide-24','matchup-guide-25','matchup-guide-26','matchup-guide-27','matchup-guide-28'].includes(guide.basis.promptVersion) && <p>Sono incluse le carte pescate e i Premi presi, anche se non giocati. Per le linee alternative è mostrato il massimo per carta.</p>}
          {(['ours', 'opponent'] as const).map(side => <div key={side}><strong>{side === 'ours' ? 'Nostra lista' : 'Lista avversaria'}</strong>
            <ul>{s.resources.filter(r => r.side === side).map((r, i) => <li key={i}>{r.count} {names.get(r.printId) ?? r.printId} <span className="content-note">({r.printId})</span></li>)}</ul></div>)}
          <p>{sourceNames(s.sourceIds)}</p>
        </details>
      </article>)}
    </section>
    <section className="deep-guide-chapter"><h3 id={`${prefix}-exercises`} tabIndex={-1}>Mettiti alla prova</h3>
      {guide.exercises.map((e, i) => <article className="deep-guide-exercise" key={e.id}><h4>Esercizio {i + 1}</h4>{renderText(e.question)}
        <details><summary>Mostra la soluzione ragionata</summary>{renderText(e.solution)}</details></article>)}
    </section>
    <section className="deep-guide-chapter"><h3>Incertezze e limiti</h3>
      {guide.limitations.map((l, i) => <div key={i}>{renderText(l)}</div>)}
      <p className="content-note">Controlli automatici su quantità, conti e passaggi dichiarati, seguiti da revisione AI. Non sostituiscono il test in partita né risolvono tutti i timing delle regole.</p>
    </section>
    <details className="deep-guide-evidence"><summary>Liste, fonti e controlli della guida</summary>
      {[guide.ourList, ...guide.opponentLists].map(l => <details key={l.id}><summary>{l.label}</summary>{l.url && renderText(l.url)}
        <ul>{l.cards.map(c => <li key={c.printId}>{c.count} {c.name} ({c.printId})</li>)}</ul></details>)}
      <p>{guide.localChecks.quantities} quantità, {guide.localChecks.calculations} conti e {guide.localChecks.transitions} passaggi controllati.</p>
      <ul>{guide.review.checks.map((c, i) => <li key={i}>{c}</li>)}</ul>
      {guide.claims.map(c => <details key={c.id}><summary>{c.assumption ? 'Ipotesi' : 'Affermazione'}: {c.text}</summary><p>{sourceNames(c.sourceIds)}</p></details>)}
      {guide.sources.map(s => <details key={s.id}><summary>{s.label}</summary>{s.url && renderText(s.url)}<pre>{s.content}</pre></details>)}
      <p className="content-note">Formato {guide.formatVersion} · {guide.generation.attempts.length} chiamate effettive · impronta delle prove {guide.basis.dependencyHash}</p>
    </details>
  </div>
}
