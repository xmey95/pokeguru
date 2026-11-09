# APP-232 — Campagna reale v9

## Esito terminale verificato

La campagna è terminata con exit1, dopo **una nuova invocazione** e **76,718 secondi di esecuzione del runner** (preparazione esclusa). Totali **355v28 /431storiche**, **0/3 nuove guide valide**. Residui **145/500/500**, **1.145pool**. Il provider è riuscito: input56.614, output2.323, cached0; una sola risposta costruttiva accettata localmente. Non è un’approvazione indipendente della guida.

Il successivo riesame quantitativo4 comprende **10 target /57 span /7.073 caratteri di testo**, corrispondenti a6 unità di output. La prenotazione è60.000 token e108.000 caratteri contro il massimo100.000. Il predicato anticipato guideRequestOutputFits lo respinge prima della tokenizzazione/invio; scaleGuideUnits non può dividere una singola unità semantica. Nessuna chiamata al critico è stata eseguita. La richiesta è stata ricostruita esattamente dal descrittore originale, con stessi target, fonti, schema e identità.

La diagnostica UI è anche imprecisa: il catch di generateDeepGuide rimappa draft-limit in request-limit usando lastBudget della costruzione precedente, che risulta ready. Due riaperture su copie ritrovano invece direttamente draft-limit/«Unità della guida troppo grande anche da sola», senza nuovo lastBudget. Entrambe si fermano prima del provider: **zero chiamate,335 campioni e61 tentativi invariati**. Questo dimostra la persistenza del blocco, senza riaprire la campagna reale.

Stop globale rispettato: gli altri matchup non sono stati avviati, nessun report è stato pubblicato e nessun riavvio automatico è avvenuto. La guardia del runner rifiuta anche una nuova invocazione live prima di qualsiasi modifica. Archivio **903 file** verificato; precedente v8 **892 file** integro, **881 input congelati** invariati, **540 source/test** identici alla verifica precedente. Tre DB: schema e righe di39tabelle equivalenti agli archivi;151 compilati condivisi identici. Conservati tutti i65 raw precedenti,5 pass quantitativi e19 fonti fisiche; unico nuovo raw accettato66. Un turno principale costruito, nessun critico completo della premessa, nessuna guida finale/UI da verificare.

Il prossimo difetto tecnico da risolvere in modo generale è la **partizione del riesame semantico degli audit**, con copertura e aggregazione di tutti i target/span e tutti i gate finali conservati. Va corretta anche la diagnostica del budget della fase realmente bloccata. Aumentare le chiamate non risolve questo limite di dimensione. Nessuna di queste modifiche è stata introdotta nella campagna congelata; nessuna ulteriore chiamata è stata avviata.

APP-232 resta In progress, APP-225 Blocked; obiettivo completo aperto. Campagna v9 chiusa e consenso per questa singola esecuzione consumato.

## Perimetro e autorizzazione

Ultima istruzione diretta dell’utente: ripresa reale dei tre matchup, nessun intervento manuale, tutti i controlli e lo scaling, massimi cumulativi 500 per guida / 1.500 v28 / riserva 24. Una sola esecuzione congelata: successive solo dopo una valida, stop globale al primo esito non valido; nessun riavvio automatico, held-out esclusi. Stessi dati pubblici e OpenAI tramite Codex; regole ufficiali dei Premi già verificate nel [rapporto precedente](JSON-CITATIONS-PRIZE-RULES.md).

Avvio: sessione tool **64475**, runner **21212**, shell3956; codice congelato **881 input**, seal **0c41a299b06e4120650239ca21aa87cacb229232b54f998a584d8fc4f0129470**. Root .verify/app225-segments-20261102/campaign-finite-v9. Monitorare questa sola sessione e live-status.json. Default applicativo v27/guardv28 e policy isolata non adottata restano invariati.

## Preparazione osservata

I **540 source/test** coincidono esattamente con la verifica precedente: **526 test distinti / 1 esclusione storica / 51 file**, typecheck/build. Sono prove della verifica precedente, non un nuovo suite run. Due ottimizzazioni sperimentali delle letture e un aumento della cache sono stati provati e integralmente scartati; i relativi54 test non sono aggiunti al conteggio. Nessun contenuto AI è stato corretto manualmente.

Tre DB isolati: schema e tutte le righe delle39 tabelle uguali alle sorgenti v8; sorgenti e archivio892 intatti. 151 file compilati condivisi identici. Primo packet/job nativo invariati; i nuovi due packet incorporano dall’inizio le tre fonti ufficiali dei Premi. Le due invocazioni storiche respinte restano raw immutati: l’ultima è reinterpretata come revise4, senza nuovo critico né pass. Conservati5 pass quantitativi e19 fonti fisiche; la riparazione riceve entrambe le diagnostiche e le tre fonti.

I tre replay su copie intercettano la richiesta prima del provider, senza risposte sintetiche o invocazioni reali. Crustle riparte dal solo audit del secondo turno; gli altri dal piano. La lettura corretta, la provenienza e i vincoli di token/budget passano. La latenza Crustle **18,748s fredda /16,028s calda /569,73MiB** supera l’obiettivo caldo10s; il profilo rimane esplicitamente fallito per prestazioni. Gli altri: **1,238/0,097s/325,82MiB** e **2,172/0,645s/357,92MiB**. Non dichiariamo superata la soglia60s/10s/768MiB per il primo. La readiness della prova reale considera separatamente la correttezza funzionale; il limite prestazionale resta aperto e non diventa un’approvazione delle guide. Nessun controllo di contenuti, gioco, inventari, fonti, riesami, token o chiamate è stato rimosso.

## Budget iniziale e misure

Baseline **354v28 /430storiche**, 0/3 nuove valide:351 principali+3diagnostiche;76 precedenti conservate. Residui **146/500/500**, **1.146pool**; stesso jobCrustle ce9ad11a-09a5-45a6-bc4c-f2c6fd4fc57e,60 tentativi su massimo206. Calibrazione334 campioni reali, fattore1,5933849345675073; nessun campione sintetico. Soglie d’ingresso26/59/59, non stime di completamento. Prossima riparazione74.640 input stimati /24.000 output /8.192 margine,25 altre chiamate riservate. Riferimenti condizionali residui per Crustle102/126/154/194, ultimi due oltre146: nessun aumento automatico.

## Stato

Campagna terminata negativa; esito e prove nella sezione iniziale. APP-232 In progress, APP-225 Blocked; obiettivo complessivo non raggiunto. La verifica UI e la generalità non sono dichiarate completate.

## Tracce

- campaign-finite-v9/authorization.json, seal.json, offline-verification.json, guard.json, session-start.json, live-status.json.
- app232-v9-budget.json e app232-v9-preflight-0/1/2.json; i profili sperimentali falliti sono conservati separatamente.
- verification-app232-json-rules.json e app232-json-rules-integrity.json per la verifica precedente a codice identico.
