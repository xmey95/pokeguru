# APP-238 — Isolamento del nuovo job e gate di avvio condiviso

L’incremento corregge il difetto del runner osservato in APP-237. Non modifica il motore delle guide, i controlli di validità, i retry, lo scaling o le protezioni dello store. L’autorizzazione corrente riguarda correzione e verifica offline: nessuna richiesta reale è stata inviata e la campagna v11 terminata non è riaperta.

## Correzione

Il runner mantenuto nel repository è ora `scripts/guide-bounded-campaign.ts`. La funzione `startGuideCampaignCase` in `scripts/lib/guide-campaign-start.ts` viene chiamata dallo stesso `createCase` sia nell’avvio reale sia nel gate offline. Anche la successiva `generateCase` è condivisa: richiesta personalizzata, fonti archiviate, configurazione, pianificatore, controlli della contabilità al confine del provider e generazione restano gli stessi. Nel replay cambia soltanto il provider, sostituito con un’interruzione esplicita prima dell’invio, e la verifica dell’autorizzazione reale, che non viene concessa dal replay.

La preparazione assegna una sola identità UUID alla campagna e la salva nel manifest. La risorsa deriva da questa identità e dal matchup; rimane uguale nel replay e nel runner reale. Non viene generata una nuova identità per ogni tentativo. Un job della stessa campagna già presente, anche interrotto, cancellato o concluso, impedisce un secondo avvio: la funzione non sostituisce una ripresa con un nuovo job.

I vecchi job restano nel database con stato, progressi, raw e prove originali. `AiJobStore.start` continua a impedire un nuovo job sulla risorsa del vecchio job riprendibile. Il nuovo job non eredita pass, scenari o risposte del precedente. Eredita tutti i 338 campioni di calibrazione, senza perdita o azzeramento.

I conteggi restano calcolati sull’intero database collegato, con le diagnostiche pregresse, indipendentemente dalla risorsa appena creata. Prima dell’avvio si verificano lista congelata e progetto, massimali cumulativi, pool, riserve e ammissione del profilo completo. Prima del provider il tentativo pendente viene conteggiato una sola volta con la stessa guardia reale.

## Verifiche eseguite

- **100 test passati, zero fallimenti, 14 file**, inclusi 14 nuovi casi per isolamento, duplicati dopo diversi stati, budget insufficiente, riserve e appartenenza della lista. Rimangono verdi le regressioni del critico, i limiti, gli audit, le partizioni, il percorso completo sintetico delle guide e lo store.
- Typecheck del progetto e compilazione NodeNext del runner passati. Nessun file applicativo `src` cambiato rispetto alla qualifica APP-236: non occorrono nuovi build/UI per questa modifica del solo runner.
- Tre copie dei database reali attraversano la medesima creazione e generazione iniziale del runner, fino al confine del provider, poi vengono riaperte sullo stesso job. Nessuna chiamata reale. I sei tentativi intercettati appartengono soltanto alle copie offline e non alla contabilità reale.
- Sulla copia Crustle è presente il job v10 interrotto riprendibile: il vecchio avvio sulla sua risorsa viene ancora respinto, mentre il nuovo avvio isolato riesce. I dati dei job ereditati e i riferimenti a tutte le loro prove risultano identici prima e dopo.
- Quattro archivi precedenti verificati immutati: v11 784 file, v10 783, v9 903, v8 892. Sorgenti reali, contatori e assenza di nuove guide verificati. Nessun job della nuova campagna nei database destinati all’eventuale prova reale; nessuna autorizzazione o avvio reale creati.

| Matchup | Prima generazione / ripresa fino al provider | Replay complessivo |
| --- | ---: | ---: |
| Crustle–N’s Zoroark | 0,676s / 0,144s | 1,263s |
| Alakazam/Dudunsparce–Basic Box | 0,445s / 0,122s | 0,664s |
| Dhelmise–Lucario/Hariyama | 1,199s / 0,469s | 1,794s |

Il picco condiviso è 586,25 MiB: soglie 60s/10s/768MiB invariate. Un primo replay cumulativo superava la soglia di memoria per ripetute riletture del catalogo e degli eventi. Il runner ora riusa gli stessi input congelati anche nel percorso reale; il replay finale passa senza cambiare soglie o ridurre fonti e controlli.

## Budget e stato

| Voce | Stato invariato |
| --- | ---: |
| Chiamate v28 / storiche | 358 / 434 |
| Tetti cumulativi per guida | 522 / 500 / 500 |
| Pool autorizzato / residuo | 1500 / 1142 |
| Residui per guida | 164 / 500 / 500 |
| Riserve per le successive | 24 + 24 |
| Massimo prudenziale per nuovo job | 164 |
| Nuove chiamate di questa verifica | 0 |
| Nuove guide valide | 0/3 |

Il primo job è ammesso esattamente, senza margine oltre il massimo del contratto. Per questi tre job il massimo prudenziale complessivo è 492 nuove invocazioni: 850 v28 e 926 storiche, entro tutti i massimali. È capienza, non una previsione di consumo o una garanzia di qualità.

I gate offline di avvio e ripresa passano; non dimostrano una generazione reale valida. Il runner è congelato con le evidenze ma non contiene una funzione che si autoautorizza. Non sono presenti `authorization.json` o `run-started.json`; il flag generale dell’app resta disabilitato. Una successiva prova resta sequenziale, si ferma al primo esito non valido e non può rilanciare automaticamente una campagna terminata.

Evidenze: [verifica e budget](../../../.verify/app238-job-isolation-20261106/verification.json), [replay](../../../.verify/app238-job-isolation-20261106/replay.json), [sigillo degli input](../../../.verify/app238-job-isolation-20261106/seal.json).

APP-238 Done per isolamento e gate offline. APP-232/APP-225 e l’obiettivo delle tre guide reali valide restano incompleti.
