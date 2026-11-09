# Policy applicativa allineata al codice corrente

**Aggiornamento04-11-2026 Europe/Rome:** [policy v3](POLICY-APP-V3.md) allineata agli input app659/epoca16:669 test passati/44 esclusi,typecheck/build e audit dei tre contratti v28 effettivi. Copia isolata non adottata;defaultv27/guardv28 invariati. Il controllo UI delle guide reali è preparato e tipizzato,non eseguito. La campagna corrente è in CAMPAIGN-EPOCH16.md;le note successive descrivono checkpoint storici e non lo stato attuale di APP-225.

La copia isolata `policy-app-v2` prepara l’adozione della scelta e dell’estensione del budget. Non cambia il checkout applicativo, il profilo personale o il codice congelato dell’epoca 10. La copia precedente e i suoi 462 input verificati sono conservati.

Sono stati allineati i tre moduli correnti di selezione delle varianti, riserva e scheduler, insieme ai relativi test. Il collegamento della policy interessa 13 file sorgente e sei test aggiuntivi: `policy-app-v2-adoption-plan.json` conserva le impronte del checkout e della copia. L’adozione dovrà ricontrollare quelle impronte e preservare eventuali modifiche intervenute nel frattempo.

La policy mantiene un massimo cumulativo scelto dall’utente per la singola analisi. Le ricevute persistenti collegano scelta, job, progetto e fonti congelate; fallimenti e tentativi precedenti restano conteggiati. Un’estensione è un’azione esplicita ammessa per un arresto dovuto al limite locale di chiamate. Salva il nuovo massimo senza riprendere il job: “Riprendi” resta un’azione separata. Un limite insufficiente, una quota del servizio o un errore di contesto non vengono risolti automaticamente aumentando il budget. Il main process verifica stato, proprietario, risorsa, ultimo job e concorrenza, senza fidarsi del solo stato del renderer.

La previsione all’ultimo controllo è distinta dal massimo salvato e dalla quota Codex. Il costo può cambiare dopo una nuova scelta o revisione. L’estensione non azzera il consumo, non rinnova i retry di trasporto e non modifica le riserve native, i metadata, i critici o lo scaling dei token. L’analisi continua autonomamente entro il massimo e si ferma appena è valida oppure incontra un limite o un errore che impedisce di proseguire.

Passano **35 test mirati in dieci file**, typecheck e build. Coprono SQLite e riapertura, grant estranei, idempotenza e limiti non validi, backend worker reale, compatibilità del pacchetto nativo ufficiale e una generazione completa con runner sintetico e tutti i gate ordinari. Nessun provider AI viene invocato.

Il test interattivo Electron passa in **18,49 secondi**, con gli stessi timeout del test precedente. La correzione del test attende la finestra prima di sostituire la sola risposta Meta; evita la race con la registrazione dei canali del main process. Tramite preload e worker reali verifica estensione 16→32, tre chiamate conservate, comparsa di “Riprendi” senza avvio automatico e riapertura con lo stesso limite. Screenshot a 1440 e 640 px ispezionati: nessun errore renderer o overflow. Il progetto è esplicitamente sintetico, il provider è disabilitato e il database sorgente resta identico.

La suite completa di compatibilità della copia è terminata con exit0: **654 test passati,44 esclusi**,110 file passati e37 esclusi su147. È una singola esecuzione verde sullo stesso codice congelato,processo `59328`,log `policy-app-v2-full-suite.log`. Il test interattivo positivo è separato ed è fra quelli esclusi nella suite ampia. Il freeze conserva 462 sorgenti/test/configurazioni e le impronte di 47 file del pacchetto nativo Windows, copiato dalla dipendenza ufficiale già installata senza un nuovo download.

L’audit dei 13 file di policy non trova riferimenti nominativi ai matchup del pilota o della campagna corrente. Le costruzioni native corrispondono al checkout verificato con 644 test. Questo sostiene il riuso strutturale; non dimostra che la generazione converga per ogni mazzo o entro un numero prefissato di chiamate.

Restano aperti calibrazione numerica iniziale, adozione e verifica del codice definitivo, attivazione e prova della build destinata all’utente. Il selettore iniziale della nuova guida resta nascosto con default v27: il test Electron verifica l’estensione di un job sintetico, non quel selettore o una nuova generazione reale dalla UI. Nessuna delle tre nuove guide reali è valida; i loro audit di salvataggio, riapertura e UI non sono ancora eleggibili.

L’epoca 10 resta in attesa del consenso già richiesto, senza duplicare la domanda: 115 chiamate v28, 191 includendo le 76 precedenti, tetti 128/176 e riserva 24 invariati. Questi controlli offline non riaprono lo stop concordato e non autorizzano l’uso degli held-out.

Evidenze locali in `.verify/app225-segments-20261102/`: `policy-app-v2-preparation.json`, `policy-app-v2-freeze/manifest.json`, `policy-app-v2-targeted.log`, `policy-app-v2-typecheck.log`, `policy-app-v2-build.log`, `policy-app-v2-ui.log`, `policy-app-v2-ui/result.json`, `policy-app-v2-adoption-plan.json` e `policy-app-v2-generality.json`.

Verifica conclusiva: `verification-policy-app-v2.json`. Tutti i462 input della copia,i47 file del pacchetto ufficiale,la vecchia copia congelata,i478 input epoca10 e i tre database della baseline risultano identici dopo le prove. Nessun grant è stato creato e nessuna nuova guida reale è stata approvata.

## Follow-up del selettore iniziale

Il controllo interattivo standalone passa anche sul selettore iniziale a1440/640:valore15,frazione32,5 e9007199254740992 disabilitano l’invio;32 lo abilita. L’invio tramite preload ebackend reali viene respinto dal guard della versione non attiva prima di creare un job. Solo le risposte readonly di disponibilità eMeta sono simulate per mostrare il controllo altrimenti nascosto;il Meta sintetico usa un ID numerico valido. Job,tentativi,report e database sorgente restano invariati,zeroAI e nessun errore renderer/overflow. Screenshot ispezionati. Questo verifica UI/validazione e guardia,non un’accettazione del nuovo percorso o la calibrazione iniziale.

I primi tentativi non sono verdi:query di audit su una colonna inesistente e ID non numerico della vecchia fixture;corretti soltanto nello script. Log policy-initial-ui{,-2,-3}.log e failure.json conservati;pass in policy-initial-ui-4.log e policy-initial-ui/result.json. Tutti i462 input della copia e478 della campagna restano identici,quindi la suite654 non è stata ripetuta.

Il consenso epoca10 resta pendente da tre turni consecutivi;il lavoro offline necessario è completato e la prossima attività dipende dalla riapertura esplicita. TaskAPP-225 Blocked,obiettivo non completato. initial-ui-block-audit.json conserva controllo del blocco e limiti delle prove.
