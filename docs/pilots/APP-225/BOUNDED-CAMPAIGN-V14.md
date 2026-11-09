# APP-243 — Prova reale v14 conclusa al primo setup non valido

06-11-2026. Campagna conclusa dopo **10 chiamate nuove, 6m13s e 0/3 nuove guide valide**. Sessione90475,processo38796,exit1. Stop al primo esito non valido rispettato: Alakazam/Dudunsparce–Basic Box e Dhelmise–Lucario/Hariyama non sono partiti. Nessun riavvio o ulteriore invio dopo lo stop.

## Esecuzione e risultato

Autorizzazione diretta per nuovo job isolato e551 chiamate cumulative sulla prima guida,1500 nel ciclo e riserva24 per ciascuna successiva. Tetti delle altre guide500 ciascuna. Nuova campagna b2295c2e-30a2-430e-ba8b-c99e2efb8229,job Crustle–N’s Zoroark0793c786-e318-44d9-9f4c-a52357d68202. Seal750bacd493eddc37b5acb9ec468c7dba24391cc970921b91e6a82f16d2328bc6. Identità isolata,nessun pass trasferito;367 campioni ereditati e contabilità precedente conservata.

Il codice APP-242 dei255test/27file,typecheck/build/UI non è cambiato. Prima della rete,tre copie eseguono le stesse funzioni di avvio e generazione del live,due aperture ciascuna,intercettando il provider. Tempi entro60s/10s,picco590,10MiB entro768. Vecchi job e valori identici. Questi gate dimostrano isolamento e avvio,non il completamento di una guida reale.

Piano e critico iniziale passano,poi sono costruiti due setup completi frammentati per scenario-1. Tutte le10 risposte del servizio sono riuscite;9 unità figlie risultano conformi al loro schema. Il controllo del registro completo respinge entrambe le costruzioni sulle alternative disponibili prima dell’assegnazione manuale di un’Energia al primo turno avversario. Arresto draft-limit dopo il secondo setup respinto. Nessun setup completo,guida,capitolo o report viene approvato;non ci sono nuove guide da verificare in UI.

## Punto di arresto verificato sugli originali

La chiamata a repairGuideSetupPosition precede repairGuideNativeAudits in constructFiniteGuideSetup. Il calcolo preliminare collectGuideSetupPosition usa il registro con il controllo decisionProof.cards già attivo: incontra liste di candidati ancora vuote e respinge il setup prima che la fase audit possa completarle. Per il primo evento il registro richiede7 candidati,la dichiarazione originale ha cards vuoto. Lo stesso problema si ripete in7 scelte per ciascuna delle due costruzioni.

Ispezione offline: entrambi i native coincidono con la ricostruzione delle risposte originali autentiche; la proiezione preliminare delle posizioni riproduce esattamente i rifiuti. Il raccoglitore dedicato collectGuideAuditCandidates termina sugli stessi originali e ricava gli elenchi attesi senza modificare gli input. Questo risultato non è una ricevuta di approvazione fisica o semantica e non dimostra che,risolto l’ordine,ogni altro controllo passerà.

**Il nuovo contratto audit600 non è stato raggiunto dal vivo:** zero descrittori guide-finite-audit-4 e zero richieste della fase dedicata. La prova non lo valida né dimostra un suo rifiuto. Il prossimo intervento generale deve distinguere i fatti necessari alla costruzione dalle approvazioni,permettere di completare gli audit nella fase prevista e conservare tutti i gate finali. Registrato APP-244 Backlog,non sviluppato durante questa campagna congelata.

## Contabilità e conservazione

| Voce | Risultato |
| --- | ---: |
| Chiamate nuove /raw nuovi |10 /10|
| Totale v28 /storico |397 /473|
| Guide nuove valide |0/3|
| Tetti cumulativi |551 /500 /500|
| Residui per guida |154 /500 /500|
| Pool /residuo |1500 /1103|
| Riserve successive |24 +24|
| Crediti del nuovo job usati /residui |4 /12|
| Campioni attuali |377|
| Usage nuove,input /output /cached |436773 /15486 /0|

Tutti i controlli e lo scaling conservati,nessun contenuto manuale,held-out esclusi. Tutti i job precedenti e7612 valori di evidenza della prima sorgente restano intatti;anche il vecchio job e i suoi rifiuti restano conservati. I tre database sorgente hanno le impronte precedenti. Sigillo/codice invariati,tre backup verificati su39tabelle ciascuno,sei archivi precedenti intatti (794/798/784/783/903/892file). Archivio terminale nuovo immutabile:799file.

Due riaperture su copia conservano10invii/10raw,377campioni e due rifiuti;si arrestano senza provider con lo stesso draft-limit. Tempi0,260s/0,238s,picco312,52MiB entro le soglie invariate. Nessuna risposta respinta viene promossa a pass.

La storia è terminale e le154 chiamate residue non autorizzano un terzo setup o una riapertura. Un nuovo primo job completo richiederebbe disponibilità164,superiore alle154 residue;nessun aumento deciso o proposto automaticamente. Stop mantenuto,nessuna nuova campagna preparata dopo l’esito.

## Evidenze e ripresa

Evidenze in .verify/app243-bounded-v14-20261106: terminal.json,verification-terminal-v14.json,stop-inspection-v14.json,stopped-replay-v14.json,budget-terminal.json. Archivio .verify/app243-bounded-v14-20261106-archive/manifest.json. Log .verify/app243-live.log. I file di ispezione e replay successivi all’archiviazione sono conservati separatamente con impronte nella chiusura;il manifesto terminale non è riscritto.

APP-243 Done per esecuzione e verifica negativa. APP-244 Backlog per l’ordine tra proiezione delle posizioni e completamento degli audit. APP-232/APP-225 Blocked e obiettivo generale incompleto. Non rilanciare il runner terminale.
