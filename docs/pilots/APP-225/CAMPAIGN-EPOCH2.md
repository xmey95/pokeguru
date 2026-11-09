# Ripresa proposta con istruzioni native complete

**Esito finale:** epoca 2 terminata il 02-11-2026 alle 22:16 UTC, handle 90346 exit 1. 37 chiamate v28 cumulative (16 in questa ripresa), 0/3 guide valide; altri due job non creati. Errore terminale Codex exit 1 non classificato; causa non dimostrata. Stop globale rispettato. Archivio campaign-v28-epoch2-archive/manifest.json, 485 file e tre basi SQLite verificate; 461 impronte congelate intatte e precedenti evidenze integralmente conservate. 76 originali separate, totale effettivo 113, saldo v28 59 entro 96. **Non rilanciare questa epoca**: dopo l'archivio il sorgente di lavoro contiene nuove correzioni locali, ancora da provare dal vivo e da autorizzare. Le righe seguenti conservano il protocollo e l'autorizzazione dell'esecuzione conclusa.

Stato: **autorizzata e avviata il 02-11-2026**, risposta esplicita «Autorizzo pool 48/96 con riserva 24». Grant in campaign-v28-epoch2/authorization.json sul seal 2e36696409505f1a5c7f6528d4b664e9da5beb77f16d172333d3b71e4f520662; handle iniziale 90346, log epoch2-live.log. Leggere handle/database/outcome prima di riprendere, senza duplicare processi. La prima campagna termina con 21 nuove invocazioni su Crustle, 0/3 guide valide e altri due job non creati. Tre timeout consecutivi da 600 secondi fermano l'intera campagna. Le 76 invocazioni precedenti restano separate: 97 effettive complessive prima della ripresa. Archivio epoca 1, database e codice effettivamente usato sono conservati; nessuna modifica manuale dei contenuti AI.

## Correzione e verifiche

Le richieste per segmenti non esplicitavano convenzioni che erano già nel contratto v27: pesca materializzata da draw, Energie Base ordinarie implicite, decisionProof completo prima del consumo, copie/destinatari e uscite senza KO. La correzione riusa quei testi nei costruttori e nel critico della premessa, senza cambiare gli schemi o indebolire i controlli. Gli errori spiegano come rappresentare pesca e pagamenti, conservando il rifiuto; i contributi Base modificati da un effetto valido restano ammessi. Nessuna eccezione per carta o matchup.

Applicata soltanto dopo la terminalità. Passano 593 test della suite completa con 43 esterni esclusi, typecheck/build e 12 regressioni mirate. I tre test loopback precedenti verificano codice rimasto invariato. La copia preparatoria aveva passato 23 test e typecheck, compreso il replay del prefisso reale e il rifiuto delle 15 dichiarazioni errate senza modificarle. Gli hash storici delle istruzioni restano conservati.

Il replay su una copia del DB, senza provider, recupera piano, setup e primo turno accettato. La prima richiesta non pagata riguarda soltanto scenario-2 e contiene ora le convenzioni complete: circa 54.177 token stimati, entro i limiti. Si ferma prima della risposta AI; non dimostra convergenza, profondità finale o completamento nelle undici residue del precedente tetto 32.

Una lettura quota senza generazione risponde con 39% usato nella finestra esposta, al momento della verifica. Non prova la causa dei timeout né la disponibilità futura di una generazione; non si convertono percentuali in token o chiamate garantite.

## Budget condiviso proposto

**Sempre massimo 96 nuove invocazioni complessive**, incluse le 21 dell'epoca 1; saldo massimo 75 all'avvio. Non si aumenta il tetto totale e non si azzera nulla. Redistribuzione autorizzata: **massimo 48 per guida**, con **24 invocazioni riservate per ciascuna guida successiva**.

Il limite assegnato al job corrente è il minore tra 48 e quanto resta del pool, aggiungendo le sue chiamate già consumate e togliendo la riserva delle guide successive. Per Crustle è quindi 48 cumulative, fino a 27 aggiuntive. Se diventa valida prima, il risparmio rimane nel pool. Per esempio, Crustle valida a 38 lascia al secondo job fino a 34, conservando 24 per il terzo; la terza guida può usare il residuo effettivo, sempre entro 48 e 96 complessive. La riserva 24 è una scelta di budget, non una garanzia di riuscita.

Si riprende **lo stesso job Crustle**, senza rifare piano/setup/prefisso, e si creano gli altri due job solo dopo una valida. Stessi progetti isolati, liste pubbliche, schede e archivio 1–30 ottobre; stesso modello gpt-6.1-sol e servizio OpenAI tramite Codex. Nessuna correzione manuale, modifica al codice durante la prova o richiesta su nuovi casi. Gli held-out sono esclusi.

Tutti i controlli, le critiche indipendenti e lo scaling rimangono. Budget/timing/output-limit consumano invocazioni; dati parziali non vengono applicati. Il controller si ferma appena la guida è valida o non può proseguire entro i vincoli. **Al primo matchup terminato senza guida valida si arresta tutta l'epoca 2**, senza aumento, redistribuzione ulteriore o rilancio automatici.

## Esecuzione e prove del limite

Runner: `.verify/app225-segments-20261102/campaign-epoch2-live.test.ts`. Controlli e codice congelati in campaign-v28-epoch2; dati/job restano in campaign-v28, con epoca 1 intatta nel suo archivio. Monitor readonly: epoch2-status.mjs. L'autorizzazione deve corrispondere al nuovo seal, al pool, alla riserva e alle 21 già consumate; il grant dell'epoca 1 non basta.

Le modalità seal, preflight e guard non invocano il provider. Il guard verifica rifiuto senza consenso, tetto individuale e totale, preservazione delle riserve e arresto al primo caso invalido. Il preflight conferma baseline 21/0/0 e un solo job esistente. Solo dopo consenso: POKEGURU_V28_EPOCH2=live e `node node_modules/vitest/vitest.mjs run .verify/app225-segments-20261102/campaign-epoch2-live.test.ts --exclude '**/frozen/**' --maxWorkers=1 --reporter=dot`.

Default app v27 e guard v28 restano invariati. Questa è una prova isolata, senza installazione, pubblicazione o modifica del profilo personale. Dopo le tre valide restano gli audit/UI reali, la valutazione held-out e la policy applicativa. L'obiettivo completo non è ancora raggiunto.
