# APP-178 — Costi, durata e qualità delle analisi Codex

**Data:** 29 ottobre 2026. **Perimetro:** Strategie, guide e revisioni Matchup, raccolta delle evidenze, sintesi e ripresa. Ricerca avanzata Catalogo non sottoposta a un audit equivalente. Audit con due subagent, esperto AI e Performance, in sola lettura; integrazione e prove a cura dell'agente principale.

**Conclusione:** la prima leva è evitare di elaborare nuovamente le stesse evidenze. La cache esiste e funziona sugli input identici, ma l'inserimento di una sola scheda può cambiare quasi tutti i lotti. Prima di ridurre modello o ragionamento conviene stabilizzare questo riuso, evitare revisioni della risposta provocate da schede già consegnate e completare la contabilità dei consumi. Non è ancora misurabile un risparmio percentuale complessivo sui lavori personali.

## Base e attendibilità delle conclusioni

Il checkout è `task/app-172-desktop-refinements`, HEAD `f3d2875`, con molte modifiche preesistenti. I 21 file confrontati del flusso AI e dei supporti SQLite coincidono, normalizzando i terminatori di riga, con `origin/dev` `4642862c7eeace4e6721de7ee6339b2cbd4a0167`. Il manifest locale riporta ancora 0.3.7; la documentazione di consegna registra la release 0.3.8. Questo audit riguarda i sorgenti verificati, non una nuova prova del pacchetto distribuito. Per implementare, ripartire dal dev aggiornato senza riapplicare le modifiche già integrate.

Tre livelli di evidenza sono tenuti separati:

- **Codice:** flussi, chiavi della cache, limiti, informazioni salvate e punti di chiamata ispezionati.
- **Misura offline:** archivio SQLite, partizione, cache e progressi reali; risposte modello sintetiche. Misura chiamate richieste e lavoro locale, non latenza o qualità Codex.
- **Ipotesi da valutare:** dimensioni dei lotti, concorrenza, modello/effort per fase e qualità tattica. Nessun miglioramento di queste proprietà è dichiarato già ottenuto.

Non sono stati modificati codice applicativo, preferenze AI, dati personali o sessioni Codex dell'app. Nessuna nuova generazione autenticata dell'app, commit, PR o release. Il lavoro di audit in questa chat e dei suoi subagent resta distinto dalle generazioni dell'app.

## Come si moltiplicano le chiamate

Il flusso principale congela configurazione e input, prepara schede e liste locali, pianifica ulteriori query, acquisisce tutte le pagine delle query scelte, analizza le evidenze grandi, rivede il piano e genera la risposta. Il controllo sulle carte citate può recuperare altri originali e richiedere una nuova risposta. Le discussioni Matchup lunghe possono aggiungere chiamate per riassumere lo storico.

| Componente | Comportamento osservato | Impatto |
| --- | --- | --- |
| Planner | Fino a quattro query per piano. Nel percorso con archivio può proseguire finché trova prove nuove; il limite storico di 24 giri riguarda il percorso senza archivio. | Un solo turno utente può causare diversi cicli. |
| Raccolta | Tutte le pagine dei filtri scelti; deduplicazione di liste e partecipazioni con provenienza. | Costo locale e crescita delle evidenze. |
| Lotti | Sintesi estesa da 120.000 byte; lotti iniziali da 60.000 byte, riducibili dopo errore di contesto. | Tante chiamate seriali, stesso modello/effort del job. |
| Sintesi | Livelli successivi fino a un risultato; massimo 2.400 caratteri di sintesi, 1.200 di limiti e 64 fonti per risposta. | Ulteriore latenza e possibile perdita di dettaglio. |
| Risposta | Fino a quattro bozze nel ciclo di arricchimento delle schede. | Ripetizione della generazione completa. |
| Tentativi | Per errori transitori fino a tre tentativi; due per risposta invalida, uno per altri errori, secondo classificazione. | Attese e consumi aggiuntivi da distinguere. |

Riferimenti: `src/main/ai-evidence-queries.ts:261–309`, `ai-analysis-work.ts:179–183,205,285–323`, `backend.ts:1381–1435`, `ai-call-retry.ts`. I limiti non sono tutti cumulabili come un tetto fisso del job: i nuovi workflow sono adattivi.

La contabilità utile è:

```text
invocazioni effettive = planner + lotti non in cache + sintesi non in cache
                     + bozze finali + riepiloghi dello storico + tentativi aggiuntivi

durata totale = preparazione e raccolta locale + lavoro locale delle sintesi
              + cammino critico delle chiamate + attese + validazione/salvataggio
```

Una invocazione CLI può a sua volta contenere attività del fornitore: il suo numero non sostituisce i token effettivi. Parallelizzare riduce potenzialmente il cammino critico; evitare una chiamata riduce anche il lavoro richiesto al modello.

## Prova ripetibile della perdita di riuso

[Script opt-in](../scripts/ai-analysis-audit.test.ts) e [metriche della prima esecuzione riuscita](AI-ANALYSIS-AUDIT-METRICS.json). Node 24.18.0, Windows, Vitest 5.0.5. Fixture volutamente grande: 300 schede distinte con 7.500 caratteri ASCII di effetto ciascuna. Non rappresenta la lunghezza tipica delle carte reali: serve a esercitare la partizione. Le risposte sintetiche mantengono forma e fonti ammesse, senza svolgere ragionamento tattico.

I quattro passaggi avvengono in sequenza sullo stesso job:

| Passaggio | Schede | Nuove chiamate: lotti + sintesi | Risultati recuperati dalla cache | Byte dei prompt delle nuove chiamate | Letture di record |
| --- | ---: | ---: | ---: | ---: | ---: |
| Prima analisi | 300 | 43 + 1 = **44** | 0 | 2.406.272 | 932 |
| Replay identico | 300 | **0** | 44 | 0 | 932 |
| Aggiunta di una chiave in fondo | 301 | 1 + 1 = **2** | 42 | 82.705 | 935 |
| Successiva aggiunta di una chiave all'inizio | 302 | 44 + 1 = **45** | 0 | 2.424.206 | 938 |

Nel quarto passaggio tutte le 302 schede vengono riconsegnate ai lotti. Le cardinalità dei due inserimenti differiscono perché la prova è sequenziale: non è un confronto statistico appaiato di due corpus identici. Dimostra comunque che una singola aggiunta può invalidare quasi tutta la partizione. Una seconda esecuzione dello script definitivo ha riprodotto gli stessi conteggi e byte.

La diagnostica conserva 40 voci anche dopo le 44 invocazioni iniziali. Il replay non richiama il modello, ma continua a leggere 932 record: tre scansioni complete delle 300 schede più 32 letture per le fonti selezionate. I tempi locali della prima esecuzione sono 671, 374, 432 e 702 ms circa. Sono tempi con callback sintetica e disco locale, non tempi Codex né stime sul profilo personale. Il campo `newlyDeliveredSources` nelle metriche conta le fonti consegnate alle nuove invocazioni, comprese quelle già viste nei passaggi precedenti.

## Riscontri e interventi

### 1. Completare la misurazione prima di dichiarare risparmi

La lista diagnostica è troncata a 40 chiamate sia durante il lavoro sia nella sanitizzazione. Registra byte e timestamp, non token per chiamata. L'invoker dei lotti legge `__usage`, ma `validate()` restituisce un oggetto che lo esclude. Si perde così la contabilità proprio delle fasi che possono dominare il job. I riepiloghi dello storico Matchup passano da `snapshotAsync`, fuori dal registro `work.run`.

Il timer della chiamata comprende tentativi e attese. Inoltre i token del planner recuperato dall'archivio entrano nel riepilogo del piano: descrivono il lavoro originale, non necessariamente nuovo consumo della ripresa. `inputBytes` non include schema, istruzioni aggiunte dalla CLI o storico remoto. Modello/effort nulli indicano Automatico; non provano quale configurazione sia stata usata dal servizio.

**Proposta APP-179:** registro persistente per tentativo e aggregati per fase/job senza troncamento dei totali. Separare numero di invocazioni, token input/cached/output, eventuali dettagli reasoning quando disponibili, configurazione richiesta/effettiva, tempo locale, attesa, esecuzione e hit della cache locale. Campi non disponibili restano nulli. Conservare soltanto categorie e numeri nell'export R-14. Rendere idempotente la contabilità dopo riapertura e distinguere consumo storico da consumo aggiuntivo.

Riferimenti: `ai-analysis-work.ts:88–128,269–280`; `src/shared/ai-diagnostics.ts:45–47,86`; `codex-evidence-plan.ts:52,77–78`; `ai-evidence-queries.ts:271–276`; `backend.ts:341–342`.

### 2. Stabilizzare lotti e sintesi incrementali

Gli originali sono ordinati per chiave e riempiono sequenzialmente lotti fino al budget. Una chiave iniziale sposta i confini successivi: cambia il prompt e il relativo hash. Le sintesi includono inoltre una `generation` derivata dal descrittore dell'intero archivio, anche nelle chiavi dei record dei livelli superiori. La raccolta crescente può invalidare più lavoro del necessario.

**Proposta APP-180:** manifesto persistente di lotti stabili, identificati da contenuto e dipendenze; nuovi record in lotti aggiuntivi. Sintesi superiori identificate dai figli effettivi, con ricalcolo dei soli rami cambiati e una rivalutazione globale delle contraddizioni. Un checkpoint della sintesi completa evita di ripercorrere tutto quando l'archivio è invariato.

La chiave deve comprendere domanda/contesto utile, record e provenienza, statistiche, modello/effort, versioni di prompt/schema/regole. Conteggi uguali non bastano. Nessun riuso fra contesti privati non equivalenti. Preservare anche nuove query che cambiano la copertura senza aggiungere carte, correzioni delle fonti, perdita dei file temporanei, pausa e riapertura. Il riuso riguarda input equivalenti, non una cache approssimata di domande simili.

**Beneficio atteso:** elevato sui job che ampliano ripetutamente le evidenze; nullo sui lotti nuovi della prima lettura. La prova dimostra il problema, non quantifica ancora il risultato di una soluzione non implementata. La diversa composizione dei lotti può modificare le sintesi AI: serve anche confronto qualitativo.

Riferimenti: `ai-evidence-archive.ts:470–485`; `ai-evidence-partition.ts:44`; `ai-analysis-work.ts:92–100,229–239,300–307`; `ai-evidence-queries.ts:267`; `backend.ts:1394,1430`.

### 3. Consegnare subito gli originali utili e registrare quelli realmente inviati

Per le evidenze sintetizzate il prompt riceve soltanto le carte in `focusedPrintIds` oltre alla sintesi. Il focus viene ampliato dopo la bozza. Una carta nominata può quindi attivare `needsFocus` e una nuova risposta anche se era già rappresentata nelle schede iniziali della lista.

**Proposta APP-181:** preparare prima della generazione i testi originali delle carte della lista, dell'avversario e della domanda, più le carte decisive recuperate dalle evidenze; registrare esattamente quali schede/campi entrano nel prompt. Chiedere una revisione quando arrivano informazioni nuove o mancanti, conservando il controllo sulle carte introdotte dalla bozza. Impostare un flag senza inviare i testi non è una soluzione.

Eliminare una revisione evitabile risparmia una risposta completa, non automaticamente metà del job: il peso dei lotti può essere dominante. Evitare di includere indiscriminatamente tutte le carte dell'archivio, che annullerebbe il beneficio.

Riferimenti: `ai-evidence-queries.ts:316–326`; `backend.ts:474–482,1405–1435`.

### 4. Ridurre duplicazioni esatte del contesto

Le schede Thread contengono `gameplay` e `gameplayText`; le schede iniziali possono sovrapporsi alle pagine delle query. Il prompt contiene gli ultimi 12 messaggi mentre la generazione può usare anche `exec resume`. Le note ancora senza risposta possono ripetere parte dello storico.

**Intervento conservativo, in APP-181:** dizionario canonico di schede/liste/fonti e riferimenti dalle sezioni che le usano. Non perdere le annotazioni sulle errata, la distinzione di stampa o la provenienza presenti solo in una rappresentazione. Gli originali rimangono nell'archivio. Misurare i byte eliminati e verificare equivalenza dei fatti.

La gestione dello storico remoto è un esperimento separato: togliere la cronologia locale fidandosi di `resume` può indebolire recuperabilità e riproducibilità. Confrontare, con token reali, contesto autosufficiente e prosecuzione controllata della sessione.

Riferimenti: `thread-evidence.ts:249–256`; `deck-ai.ts:56–69`; `ai-evidence-queries.ts:318`; `codex-control.ts:214–222`.

### 5. Modello e ragionamento per fase, dopo le correzioni strutturali

Planner, lotti, sintesi e risposta condividono la configurazione del job. Non è disponibile una misura che dimostri che tutte le fasi richiedano lo stesso effort, né che un modello più economico conservi la qualità su queste domande.

**Esperimento APP-182:** mantenere la configurazione attuale sulla decisione tattica e sul finale; confrontare effort inferiore per estrazioni circoscritte e riepiloghi. Il planner va valutato separatamente: una query omessa può sottrarre evidenza a ogni fase successiva. Usare soltanto modelli/effort realmente disponibili e rispettare le preferenze esplicite dell'utente. Non sostituire silenziosamente una scelta manuale.

Non accorciare ulteriormente tutte le sintesi alla cieca: l'intero corpus può già finire in 2.400 caratteri. La validazione attuale verifica forma e appartenenza delle fonti, non il supporto di ogni affermazione. Una rappresentazione con fatti decisivi, eccezioni, contraddizioni e riferimenti può essere più utile della sola prosa breve. I conteggi deterministici devono restare fuori dalle inferenze del modello.

### 6. Concorrenza limitata e lotti calibrati

Le foglie sono seriali. Eseguire due foglie indipendenti contemporaneamente può ridurre la durata, ma non il numero dei token. Altri job possono già coesistere: serve un limite globale e una gestione della quota. `activeCalls` e gli aggiornamenti della lista diagnostica assumono il percorso seriale; un semplice `Promise.all` rischia di sovrascrivere informazioni.

**Esperimento APP-183:** limite globale iniziale di due chiamate, solo sui lotti indipendenti, con risultati fuori ordine, pausa, cancellazione, backoff e checkpoint verificati. Le sintesi attendono i figli. Misurare throughput e p95, non soltanto il tempo medio del singolo lotto. Se la frazione parallelizzabile è `f`, l'accelerazione ideale con due chiamate è `1 / ((1-f) + f/2)`; con `f=0,8` sarebbe 1,67×, cioè il 40% di tempo in meno. È un esempio matematico, non una previsione per Pokéguru; quota e contesa possono ridurlo o annullarlo.

Il lotto da 60 kB non equivale a un numero fisso di token. Valutare budget basati sul tokenizer pertinente e margine per schema, istruzioni, output e contesto. Aumentare il lotto può ridurre gli avvii ma peggiorare il recupero dei dettagli: prova separata, senza taglio arbitrario delle evidenze. L'avvio di una CLI per chiamata è reale; la sua incidenza non è stata misurata, quindi un trasporto persistente ha priorità successiva.

Riferimenti: `ai-analysis-work.ts:41,105–128,179,300–307`; `backend.ts:212–218`; `codex-evidence-plan.ts:18–33`; `codex-control.ts:214–222`.

## Cosa preservare e cosa non riproporre

Le acquisizioni complete, gli originali, le occorrenze e i denominatori esatti restano parte del contratto T-161/T-162. Un top-k arbitrario, un arresto a un numero fisso di carte o il salto della verifica finale cambierebbero quel contratto. La pianificazione può essere resa più mirata, ma un nuovo criterio di sufficienza deve rendere osservabili copertura e lacune.

APP-174–176 hanno già corretto riletture durante le pagine, riepiloghi, denominatori Eventi, pagine profonde, storici e retention. Le misure storiche 38,42 → 11,64 s, e poi 8,03 s con ulteriori modifiche, riguardano quella fixture di raccolta, non il tempo AI complessivo. Non sono nuovi risparmi ottenuti in APP-178. Restano da attribuire snapshot iniziale, compressione/hash e lavoro sincrono del worker sui grandi archivi. Vedere [audit raccolta](AI-COLLECTION-APP-174.md) e [audit database](DATABASE-PERFORMANCE.md).

## Criterio proposto per conservare la qualità

I test esistenti coprono struttura, persistenza, isolamento e integrazione. Il test live dei lotti chiede di conservare numeri ma non verifica quei valori nella sintesi; il test live del planner suggerisce la query esatta. Non costituiscono un benchmark tattico di non inferiorità (`tests/ai-analysis-work-live.test.ts:27–35`, `tests/codex-evidence-plan-live.test.ts:6–13`).

Per una valutazione successiva:

1. Congelare inizialmente 30–50 casi: domande brevi, sostituzioni con vincoli, analisi ampie, guide nuove/revisioni, schede incomplete, stampe diverse, dati contraddittori, ampliamenti dopo bozza e riprese. Separare casi di sviluppo e holdout.
2. Annotare dagli originali fatti decisivi attesi, fonti, denominatori, eccezioni e lacune. Non usare la risposta precedente come unica verità.
3. Confronti appaiati sugli stessi snapshot/configurazioni, ordine delle varianti alternato e 2–3 repliche quando sostenibile. Dichiarare cache fredda/calda e condizioni dell'account. Il budget live va definito prima dell'esecuzione, non moltiplicato automaticamente.
4. **Zero nuove violazioni critiche nei casi valutati:** lista candidata, vincoli, identità/Standard, isolamento, fonti inventate, winrate infondati e denominatori alterati. Misurare accuratezza e richiamo dei fatti decisivi; valutare alla cieca correttezza delle interazioni, utilità tattica e incertezza.
5. **Margine iniziale proposto, non approvato né dimostrato:** al massimo 0,2 punti di perdita su scala 1–5 per la qualità, con intervallo di confidenza della differenza appaiata e controllo separato delle categorie. Se l'intervallo attraversa il margine, aumentare i casi o mantenere la baseline. Nessuna media deve nascondere una nuova violazione critica. 30–50 casi non garantiscono da soli potenza statistica sufficiente.
6. Confrontare p50/p95 end-to-end, fasi locali, invocazioni/tentativi, token input/cached/output, fallimenti, revisioni e riuso. Un giudice AI può assistere la revisione, senza sostituire i controlli sugli originali e il giudizio umano sui casi tattici.

Per le modifiche alla cache aggiungere equivalenza della copertura, statistiche, invalidazione per contenuto/modello/regole, pausa/riapertura e isolamento. Per la concorrenza verificare anche contabilizzazione esatta e applicazione una sola volta.

## Ordine consigliato

| Task | Risultato successivo | Effetto atteso | Rischio |
| --- | --- | --- | --- |
| APP-179 | Contabilità completa e casi di valutazione definiti | Rende attribuibili costi e miglioramenti | Basso |
| APP-180 | Cache stabile, sintesi incrementale e checkpoint finale | Riduce chiamate e lavoro locale ripetuto | Medio: invalidazione e composizione delle sintesi |
| APP-181 | Originali pronti, registro di consegna e contesto senza duplicazioni esatte | Riduce revisioni evitabili e input | Basso/medio: mantenere errata e schede nuove |
| APP-182 | Confronto controllato di effort/modelli e formato delle sintesi | Possibile riduzione del consumo per chiamata | Medio/alto: qualità da dimostrare |
| APP-183 | Scheduler globale e concorrenza misurata | Possibile riduzione della durata | Medio: quota, race e ripresa |

Gli stati sono esclusivamente in `BACKLOG.md`. L'audit non autorizza automaticamente l'implementazione. Il primo incremento consigliato combina APP-179 con una successiva correzione APP-180, mantenendo inizialmente invariati modello e ragionamento. Non sono stimati giorni di sviluppo o percentuali di risparmio prive di una baseline completa.

## Fonti ufficiali e loro applicabilità

OpenAI raccomanda di ridurre richieste e output superflui, impiegare calcoli deterministici quando adatti e parallelizzare passaggi indipendenti. Sono principi coerenti con i riscontri locali; non forniscono una percentuale trasferibile a questa app. [Latency optimization](https://developers.openai.com/api/docs/guides/latency-optimization), consultata il 29-10-2026.

La cache del fornitore riusa prefissi coincidenti e non evita la generazione di un nuovo output. Va distinta dalla cache locale che evita l'intera chiamata. Stabilizzare istruzioni e schema e misurare `cachedInputTokens` è un esperimento utile; le opzioni e tariffe della Responses API non vanno trasferite automaticamente al percorso CLI con accesso Codex. [Prompt caching](https://developers.openai.com/api/docs/guides/prompt-caching), consultata il 29-10-2026.

L'App Server documenta eventi di utilizzo dei token e flussi di turni. Questo rende plausibile valutare un trasporto persistente, ma non ne dimostra compatibilità completa con l'integrazione locale o beneficio prestazionale. [Codex App Server](https://learn.chatgpt.com/docs/app-server), consultata il 29-10-2026. L'attuale audit non converte token in euro o percentuali di quota: mancano modello effettivo, modalità di consumo e contabilità completa del job.

## Verifiche eseguite e riproduzione

- 36 test pertinenti passati in sette file: `ai-analysis-work`, `ai-evidence-partition`, `ai-evidence-pipeline`, `ai-evidence-collection`, `diagnostics`, `ai-call-retry`, `deck-ai`.
- Harness della prova passato; seconda esecuzione dello script definitivo con identici conteggi e byte. Non è una misurazione live della qualità o del tempo del modello.
- Controllati riferimenti locali e tracciabilità APP-178–183; `git diff --check` passato. Verificato che l'harness sia saltato quando l'opzione di audit non è attiva.
- Il Node predefinito era 20.20.0: utilizzato esplicitamente Node 24.18.0. Dipendenze già disponibili in `.verify/node_modules`; nessuna installazione.
- Primo tentativo senza dipendenze nella radice: modulo Vitest non trovato. Primo tentativo con fixture nel Temp del sandbox: `EPERM` sulla rinomina atomica dello stage. Ripetuto con directory temporanee nel workspace consentito; prove riuscite senza cambiare il codice applicativo e senza escalation.
- Nessuna build o suite completa rieseguita: il prodotto non è stato modificato. Restano da eseguire, dopo un incremento implementativo, prove live appaiate, validazione tattica e verifica sul caso personale 187/187.

Con dipendenze installate e Node 24, dalla radice (PowerShell):

```powershell
$env:POKEGURU_AI_AUDIT = '1'
node node_modules/vitest/vitest.mjs run scripts/ai-analysis-audit.test.ts --maxWorkers=1 --testTimeout=60000
```

Lo script è saltato nelle esecuzioni normali. Salva nuove misure in `.verify/app178-ai-audit-metrics.json`; `POKEGURU_AI_AUDIT_OUTPUT` consente una destinazione esplicita. Conserva la fixture sintetica in una nuova directory `.verify/app178-audit-*` per ispezione. Non legge profili personali e non chiama Codex.
