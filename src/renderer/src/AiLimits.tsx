import type {AiQuota} from '../../shared/ai-limits'
import type {AiJobSummary} from '../../shared/ai-job'
import {hasRepairBudgetBlock} from '../../shared/ai-job-lifecycle'

const number=(n:number)=>n.toLocaleString('it-IT')
export function AiQuotaView({quota}:{quota?:AiQuota}){
  return <section className="ai-quota" aria-label="Disponibilità Codex">
    <h3>Disponibilità Codex</h3>
    {!quota||quota.status==='unavailable'?<p className="content-note">Quota residua non disponibile dal servizio.</p>:<>
      {quota.buckets.map(bucket=><div key={bucket.id} className="ai-quota-bucket">
        <strong>{bucket.name??bucket.id}</strong>
        {(['primary','secondary'] as const).map(key=>{const w=bucket[key];if(!w)return null
          const remaining=Math.max(0,100-w.usedPercent)
          const duration=w.windowDurationMins===10080?'settimanale':w.windowDurationMins===300?'di 5 ore':w.windowDurationMins?`di ${number(w.windowDurationMins)} minuti`:key==='primary'?'principale':'secondaria'
          return <div key={key}><span>{number(remaining)}% disponibile · finestra {duration}</span>
            <progress max={100} value={Math.min(100,remaining)} aria-label={`Quota disponibile ${bucket.name??bucket.id}, finestra ${duration}`} />
            {w.resetsAt!==null&&<span className="content-note">Reset previsto: {new Date(w.resetsAt*1000).toLocaleString('it-IT')}</span>}
          </div>
        })}
      </div>)}
      <p className="content-note">Rilevato il {new Date(quota.fetchedAt).toLocaleString('it-IT')}. Aggiorna stato per rileggere la quota.</p>
      {quota.availableResets!==null&&<p className="content-note">Reset disponibili comunicati dal servizio: {number(quota.availableResets)}.</p>}
    </>}
    <p className="content-note">La quota dell’account è distinta dal budget di ogni analisi. La percentuale non indica un numero di token residui.</p>
  </section>
}

export function AiBudgetStatus({job}:{job:AiJobSummary|null}){
  if(!job)return null
  const d=job.progress?.diagnostics,b=d?.budget,g=d?.guide
  const stopped=['interrupted','failed'].includes(job.status)&&!['user','shutdown','legacy'].includes(d?.suspensionReason??'')
  const labels:Record<string,string>={'token-budget':'Analisi ferma: budget di token insufficiente','call-budget':'Analisi ferma: chiamate insufficienti per completare le verifiche','request-limit':'Analisi ferma: richiesta o risposta oltre il limite di dimensione','quota':'Analisi ferma: quota del servizio Codex raggiunta','context-limit':'Analisi ferma: contesto oltre il limite del servizio','output-limit':'Analisi ferma: limite di output del servizio raggiunto'}
  const repairStop=hasRepairBudgetBlock(job)
  const heading=stopped?(repairStop?'Analisi ferma: riserva per le correzioni insufficiente':b?.reasons.includes('base-slots')?'Analisi ferma: limite di ampiezza della guida raggiunto':labels[d?.failureCode??'']):undefined
  if(!b&&!g&&!heading)return null
  return <section className={`ai-budget-status ${heading?'warning-banner':'content-note'}`} aria-label="Consumo e limiti dell’analisi">
    {heading&&<strong role="status">{heading}</strong>}
    {g&&<p>{g.attemptLimit===Number.MAX_SAFE_INTEGER?`Chiamate effettuate: ${number(g.attempts)} · nessun tetto al numero di chiamate.`:<>Chiamate effettuate: {number(g.attempts)} / {number(g.attemptLimit)} · residue {number(Math.max(0,g.attemptLimit-g.attempts))}.</>}
      {' '}Token contabilizzati: {number(g.inputTokens)} input e {number(g.outputTokens)} output.
      {g.usageIncomplete&&' Consumo parziale: alcune chiamate non hanno restituito i token utilizzati.'}</p>}
    {g?.delivery&&<p>{g.delivery.repairLimit===Number.MAX_SAFE_INTEGER?`Correzioni e ripetizioni utilizzate: ${number(g.delivery.repairsUsed)} · nessun tetto impostato.`:<>Riserva condivisa per riparazioni e ripetizioni: {number(g.delivery.repairsUsed)} / {number(g.delivery.repairLimit)} utilizzate · residue {number(g.delivery.repairLimit-g.delivery.repairsUsed)}.</>} La riapertura conserva il consumo.</p>}
    {b&&<><p>{g?.attemptLimit===Number.MAX_SAFE_INTEGER?'Chiamate senza tetto impostato':`Chiamate disponibili al controllo: ${number(b.remainingCalls)}`} · necessarie: {number(b.requiredCalls)}, comprese le verifiche riservate.</p>
      {b.repairs&&<p>{b.repairs.limit===Number.MAX_SAFE_INTEGER?`Correzioni utilizzate: ${number(b.repairs.used)} · nessun tetto impostato`:`Correzioni disponibili al controllo: ${number(b.repairs.remaining)} · utilizzate ${number(b.repairs.used)} / ${number(b.repairs.limit)}`} · necessarie almeno: {number(b.repairs.required)}, compresi i riesami già noti.</p>}
      {b.estimatedInputTokens!==undefined&&b.inputLimit!==undefined&&<p>Input stimato della richiesta: {number(b.estimatedInputTokens)} / {number(b.inputLimit)} token.</p>}
      <details><summary>Dettaglio del budget</summary>
        {b.calibration?.model==='request-overhead-v1'&&<p>Calibrazione prudenziale: margine del 12% sul conteggio locale e del 10% sul costo aggiuntivo massimo misurato ({number(b.calibration.overheadTokens??0)} token), più 2.048 token. Tutti i {number(b.calibration.samples)} campioni hanno contatori per richiesta riconciliati. È una stima, non la quota residua del servizio.</p>}
        {b.calibration&&!b.calibration.model&&<p>Calibrazione prudenziale: ×{number(b.calibration.factor)} su {number(b.calibration.samples)} campioni; massimo input contabilizzato {number(b.calibration.largestInput)} token. Il consumo comunicato a fine turno Codex non misura il contesto di una singola richiesta al modello. Il fattore conserva il massimo osservato con margine; non indica token residui.</p>}
        {!!b.calibration?.requestSamples&&<p>{number(b.calibration.requestSamples)} campioni hanno contatori per risposta riconciliati con il totale del turno; massimo input per risposta {number(b.calibration.largestRequestInput??0)} token. La calibrazione usa questi massimi e mantiene il totale del turno separato; senza riconciliazione conserva la stima prudenziale precedente.</p>}
        {b.reservedOutputTokens!==undefined&&<p>Output riservato: {number(b.reservedOutputTokens)} token. Margine: {number(b.marginTokens??0)} token.</p>}
        {b.totalLimit!==undefined&&<p>Budget complessivo input, output e margine: {number(b.totalLimit)} token.</p>}
        {b.requestBytes!==undefined&&<p>Richiesta: {number(b.requestBytes)} / {number(b.requestByteLimit??0)} byte.</p>}
        {b.estimatedResponseCharacters!==undefined&&<p>Risposta prevista: {number(b.estimatedResponseCharacters)} / {number(b.responseCharacterLimit??0)} caratteri.</p>}
        <p>Stime locali dell’app, aggiornate il {new Date(b.checkedAt).toLocaleString('it-IT')}. Non misurano la quota residua dell’account.</p>
      </details></>}
    {heading&&<p>{repairStop?'Le chiamate residue non rinnovano la riserva per le correzioni. Per modificarla serve un’autorizzazione esplicita entro il budget totale; nessun aumento automatico. Il lavoro completato resta salvato.':d?.failureCode==='quota'?'Controlla disponibilità e prossimo reset in Impostazioni AI; poi riprendi il lavoro salvato.':'Il reset della quota dell’account non modifica questo limite della richiesta. Il lavoro completato resta salvato.'}</p>}
  </section>
}
