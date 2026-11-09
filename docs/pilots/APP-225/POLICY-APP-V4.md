# Budget applicativo: copia aggiornata e verifica UI

04 novembre 2026, Europe/Rome. **Copia isolata, non adottata.** La campagna reale resta ferma a167 chiamate v28,243 storiche e0/3 nuove guide valide. La richiesta di consenso per l’epoca17 è già pendente; questa verifica non la riapre.

La v4 riallinea i13 file della policy e i sei test al codice corrente della compattazione dei riferimenti. Le impronte di base sono ricontrollate; v3, sorgenti canonici e campagna restano intatti.472 input e47 file nativi ufficiali congelati. Typecheck/build e30 test mirati passati,un test UI inizialmente escluso. Non è una nuova suite completa della copia:663/44 è la suite canonica corrente,669/44 appartiene alla precedente v3 prima della correzione.

Il test UI separato passa in5,12 secondi su Electron,preload e worker reali. Il job è esplicitamente sintetico,il provider disabilitato e il profilo una nuova copia isolata. Verifica estensione16→32,tre tentativi conservati,ripresa disponibile soltanto tramite azione separata e riapertura con lo stesso limite. Nessun modello viene invocato e il database sorgente resta identico. La sola risposta Meta è congelata dopo la registrazione dei canali;letture dei job e aggiornamento del budget passano dal backend effettivo.

Screenshot a1440 e640px ispezionati:nessun errore renderer o overflow. Il pannello distingue3 chiamate consumate su32,29 residue e i dati dell’ultimo controllo,senza trattare il reset della quota account come aumento del budget locale. La guida sintetica precedente resta visibile mentre la nuova analisi è ferma.

Il primo avvio nel sandbox esterno fallisce prima della finestra,con tre errori Playwright secondari;non è una prova verde. Lo stesso test,senza modifiche o timeout più ampi,passa fuori dal sandbox esterno. Entrambi i log sono conservati. Le impronte dei472 input/dipendenze native e dei485 input dell’epoca17,nonché i database della baseline della campagna,sono ricontrollati dopo la prova. Nessun grant/live17 è creato.

Questa prova riguarda l’estensione del budget di un job sintetico. Non verifica una nuova generazione reale dalla UI,non calibra il massimo iniziale e non sostituisce l’approvazione/persistenza/UI delle tre guide reali. L’attivazionev28 resta subordinata ai criteri completi di APP-225;defaultv27 e guardv28 sono invariati.

Evidenze in `.verify/app225-segments-20261102/`: `policy-app-v4-preparation.json`, `policy-app-v4-freeze/manifest.json`, `policy-app-v4-{build,targeted,ui,ui-2}.log`, `policy-app-v4-ui/{result.json,budget-1440.png,budget-640.png}`, `verification-policy-app-v4.json` e `verification-policy-app-v4-ui.json`.
