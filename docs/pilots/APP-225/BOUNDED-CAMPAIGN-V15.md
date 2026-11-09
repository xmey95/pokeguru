# APP-245 — Ripresa reale v15 conclusa sul limite di output previsto

06-11-2026. **2 chiamate nuove,54,630s,0/3 nuove guide valide.** Sessione38645/processo21300,exit1. Stop al primo esito non valido rispettato;gli altri due matchup non sono partiti. Nessun invio o riavvio dopo il terminale.

## Risultato reale

È ripreso lo stesso job Crustle–N’s Zoroark0793c786-e318-44d9-9f4c-a52357d68202,con10invii già pagati,due rifiuti e il secondo setup conservati. Non sono stati ricomprati piano,critico iniziale,quadri o turni;nessuna terza costruzione. I8177valori di evidenza precedenti e tutti gli altri job coincidono con la sorgente. La campagna è b2295c2e-30a2-430e-ba8b-c99e2efb8229,seal ed7d67ff4eafe824aa91c598174abe6ea531af293a367f4e85bca683dccd8797.

Il nuovo ordine delle posizioni permette di raggiungere la fase audit sul secondo native autentico (hash1bab4f4a0bdb4d96821e1a43a5203d0c4165ca2e8dc5d9454fa1e0f49c615212). La chiamata11 produce la motivazione dell’assegnazione e il confronto del primo turno avversario nel formato guide-finite-audit-4. I testi finali sono rispettivamente **540 e544 caratteri**,entro600,con uguaglianza esatta ai frammenti espansi;schema e controlli quantitativi passano. La chiamata12 è il riesame semantico indipendente: **pass,zero findings**. Entrambe le richieste riescono al servizio.

Questi pass riguardano soltanto l’audit del primo turno storico,non l’intero setup o la guida. Il setup completo non viene approvato,nessun report o capitolo consegnato;non ci sono nuove guide da verificare in UI.

## Blocco successivo

Il costruttore passa all’audit ordinario del secondo turno globale,nostro:3 motivazioni di scelta più il confronto,4destinazioni,semanticRound0. Non è una riparazione chiesta da un critico negativo;il precedente riesame ha dato pass e non ci sono nuovi rifiuti di formato o semantici.

La stima specifica del trasporto boundedAuditOutputCharacters restituisce19.936caratteri. La conversione in unità di riserva genera8unità,che il pianificatore generale traduce in120.000caratteri previsti e48.000token output riservati. Il limite locale invariato è100.000caratteri:il gate ferma la richiesta prima del provider con request-limit e motivo response-size. Non è una risposta realmente lunga,un errore del servizio,la quota Codex esaurita o l’insufficienza delle chiamate residue.

Lo scaling dinamico resta attivo,ma qui il gruppo contiene una sola unità logica di audit del turno:la suddivisione dei gruppi non può dividerne le4destinazioni. Occorre riesaminare in modo generale la relazione tra stima specifica,unità e stima generale,oppure partizionare quell’unità senza perdere confronti e legami. È registrato APP-246 Backlog;nessuna correzione durante la campagna congelata e nessun limite alzato. Il pass dei primi due testi non garantisce il successo degli audit seguenti.

## Contabilità e controlli

| Voce | Stato |
| --- | ---: |
| Nuove richieste riuscite /precedenti conservate |2 /10|
| Totale job /raw |12 /12|
| Totale v28 /storico |399 /475|
| Guide nuove valide |0/3|
| Tetti cumulativi |551 /500 /500|
| Residui per guida |152 /500 /500|
| Pool /residuo |1500 /1101|
| Riserve successive |24 +24|
| Crediti usati /residui |4 /12|
| Campioni attuali |379|
| Usage sole2nuove,input /output /cached |91664 /2014 /0|

Il blocco prenota19chiamate come minimo della fase nota,con152residue:non è una previsione del completamento e non giustifica aumenti. Un nuovo primo job completo richiederebbe164contro152;non viene creato. Tutti i controlli,scaling e contabilità conservati,nessun contenuto manuale,held-out esclusi.

## Verifiche e ripresa

Codice applicativo APP-244/260test,build e UI invariato e sigillato. Runner di ripresa compilato e verificato sullo stesso avvio/generazione reale,su tre copie prima del provider;picco659,69MiB entro768 e tempi entro60s/10s. Confronti JSON di persistenza con integrità completa e sigilli obbligatori. Nessuna nuova esecuzione dei test applicativi dopo il congelamento,poiché il codice non cambia.

Tre backup terminali verificati su39tabelle ciascuno,sorgenti immutati,archivio terminale nuovo799file. Sette archivi precedenti799/794/798/784/783/903/892file intatti. Le risposte raw e i due rifiuti iniziali restano originali,nessuna promozione manuale.

Due riaperture su copie mantengono12invii/12raw,379campioni e lo stesso request-limit120000/100000 senza raggiungere il provider. La classificazione coincide con il live. Questo verifica il riuso delle risposte pagate e lo stop;non approva la guida. Le evidenze successive all’archiviazione vengono conservate separatamente con impronte di chiusura,senza riscrivere il manifesto.

Prima di proporre altra rete occorre una verifica offline del dimensionamento dell’unità successiva,non soltanto della prima richiesta. La campagna resta conclusa e non va rilanciata automaticamente. APP-245 Done per esecuzione e verifica negativa,APP-246 Backlog;APP-232/APP-225 Blocked e obiettivo generale incompleto.

Evidenze in .verify/app245-resume-v15-20261106:terminal.json,verification-terminal-v15.json,stop-inspection-v15.json,stopped-replay-v15.json,budget-terminal.json. Archivio .verify/app245-bounded-v15-20261106-archive/manifest.json;log .verify/app245-live.log.
