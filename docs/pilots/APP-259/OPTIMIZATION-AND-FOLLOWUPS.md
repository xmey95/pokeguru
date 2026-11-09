# Ottimizzazione e completamento dei matchup rimanenti

08-11-2026, APP-259 In progress. La prima guida Crustle–N’s Zoroark rimane approvata e consultabile. Questa fase attua l’istruzione «prima una guida definitiva, poi ottimizziamo», quindi prosegue verso gli altri due matchup dell’obiettivo.

## Ottimizzazione verificata offline

Il profilo CPU della ripresa reale su copia misura 86,679 secondi: circa 46,5 sono spesi nella verifica quantitativa, ripetendo lo stesso storico per ogni linea. La versione finale richiede **37,684 secondi e 647,137 MiB**, mantenendo la stessa richiesta successiva.

Il controllo ora autentica lo storico una volta per un gruppo sincrono di linee, poi esamina comunque ogni campo di ogni linea. Nessuna vista di approvazione sopravvive alla funzione, a un await o a una riapertura. Una doppia rilettura dello stesso giudizio è stata eliminata, mantenendo tutti i confronti di scope, target, fonti e quantità.

Il runtime non trattiene più con riferimenti forti ogni richiesta terminata e il relativo grafo di dati. Il validatore del batch conserva le richieste pendenti; prima del commit il runtime rilegge e autentica il descrittore corrente. Dopo gli esiti durevoli il coordinatore cede il controllo all’event loop: cancellazioni e rilascio dei dati vengono gestiti anche con un provider sintetico che risolve attraverso microtask.

Il percorso completo sintetico con due liste distinte, tre cicli di riparazione e sei giudizi negativi passa **28,583 s a freddo / 0,700 s alla riapertura / 678,664 MiB**, entro 60 s / 10 s / 768 MiB. Produce 44 risposte sintetiche, senza provider reale. I precedenti picchi negativi di 901,648 e 798,910 MiB restano negli artefatti; non sono dichiarati superati mediante una sola ripetizione sul medesimo codice.

## Controlli conservati

- 106 test correnti in dieci file, typecheck e build passati. Rapporto aggregato esplicito: il file contenente una simulazione di manomissione è rieseguito integralmente dopo aver corretto il test, che inizialmente chiedeva all’API immutabile di sovrascrivere un originale. Ora modifica esternamente il binding SQLite e verifica il rifiuto prima del commit. Nessun doppio conteggio; il negativo originario resta disponibile.
- Rifiuto di un testo non riesaminato nell’ultima linea del gruppo, di prove manomesse tra due invocazioni e di un descrittore modificato durante l’attesa del provider. Ripristinata una prova sintetica, la lettura successiva torna valida senza riutilizzare un’approvazione memorizzata.
- Cancellazione ricevuta dall’event loop: esito già pagato conservato e nessun invio del gruppo successivo.
- Prompt, schema e budget della richiesta successiva identici nei tre replay di riferimento, con 119 risposte complete conservate. Scaling, conteggio dei token, calibrazione e condizioni di ammissibilità non cambiano.
- Due guardie residue a due errori di formato ora rispettano l’autorità until-valid; i job storici conservano il loro limite. Il ciclo completo supera tre risposte critiche malformate senza accettarle come valide.
- Guida Crustle riletta con i lettori attuali e UI reale a 1440/1280/640 pixel, selezionando esplicitamente il job corretto. Contenuti, database e approvazioni restano identici.
- Archivio v17 ricontrollato: 814 file immutati, 30 risposte originali leggibili e 9.542 riferimenti conservati. APP-250 risultava già Done nella qualificazione precedente; le evidenze attuali aggiungono la verifica senza cancellare il vecchio gate negativo.

## Avvio dei due nuovi job

`startUntilValidCampaignCase` è lo stesso ingresso usato dalle copie offline e dal runner reale. Isola la risorsa della campagna, verifica la lista corrente, crea l’autorità prima del primo invio e non trasferisce approvazioni dai vecchi job. La ripresa richiede l’identificativo effettivo del job interrotto e verifica configurazione e autorità prima di rilasciare un blocco di trasporto.

Le prove offline di entrambi i matchup raggiungono soltanto il primo piano: **0,913 s / 528,855 MiB** per Alakazam/Dudunsparce–Basic Box, **1,449 s / 549,453 MiB** per Dhelmise–Lucario/Hariyama. Conservano 570 campioni di calibrazione reali. La configurazione assente nella vecchia preparazione è stata intercettata prima del provider e corretta usando la configurazione della guida effettivamente approvata; i due tentativi offline falliti sono conservati. Nessun contenuto AI è stato modificato.

L’autorità continua dell’utente per completare le guide, con chiamate reali sbloccate e senza tetti numerici, governa i nuovi job. Restano tutti i controlli, i limiti tecnici del servizio e la contabilità storica: **601 tentativi v28 / 677 storici prima dell’avvio**. Ogni nuovo tentativo è attribuito al proprio job; nessun reset o doppio conteggio degli archivi ereditati. I casi held-out restano esclusi.

Ordine: Alakazam/Dudunsparce–Basic Box, poi Dhelmise–Lucario/Hariyama soltanto dopo una guida valida, salvata, riaperta attraverso un nuovo work context e verificata nella UI sul job esatto. Un esito tecnico terminale ferma il passaggio al matchup successivo; eventuali correzioni richiedono nuovi gate offline e ripresa esplicita dello stesso job nell’autorità continua già esistente.

## Ripresa operativa

Root `.verify/app259-followups-20261108`, preparazione e sigillo congelati. Alakazam avviata con sessione **65337**, PID **12728**, job **5e408dcd-30ad-48c7-89eb-7047242d79a5**. Monitorare questo handle e `live-status.json`; non modificare sorgenti o compilati mentre è attivo. Il terzo matchup non è avviato. `outcome.json` è autorevole solo dopo il termine della relativa sessione.

Evidenze di ottimizzazione in `.verify/app259-optimize-20261108`: profili CPU, replay, `request-equivalence.json`, `legacy-preservation.json`, `qualified-tests.json`, `standalone-integration.json`, rilettura e UI della guida approvata. `qualification.json` nel root dei follow-up lega questi gate alla preparazione corrente. Il vecchio report negativo dei test e le due misure di memoria non qualificate restano conservati.

Restano necessari gli esiti reali delle altre due guide, il riesame dei contenuti e della generalità, e la qualificazione dell’avvio ordinario nell’app. Il flag generale del generatore non è ancora abilitato.


## Ripresa dopo il falso positivo sul singolare

La prima epoca del secondo job è stata sospesa al confine della richiesta28:27risposte complete restano autentiche, per629chiamate v28/705storiche complessive. Il critico citava correttamente il lancio di una moneta; il parser delle fonti non riconosceva “a coin”. La correzione generale aggiunge coin e damage counter ai singolari espliciti controllati e rifiuta forme ambigue e composti. Nessun contenuto della guida o verdetto è stato modificato manualmente.

77test in4file, typecheck/build e lettura completa della prima guida passano. Il replay sullo stesso percorso di avvio reale intercetta solo review-premise-audit-language, mantiene27raw e tutti gli esiti originali, con identico hash del prompt pendente. Epoca1 e negativo di una precedente asserzione di test conservati; qualifica corrente in .verify/app259-followups-20261108/qualification.json. Le nuove chiamate riprendono soltanto dopo sigillo e guardia, sullo stesso job.

## Distinzione fra mano e candidati nel critico anticipato

La seconda epoca è stata sospesa alla richiesta49, prima del provider, dopo47raw completi:650tentativi v28/726storici e1/3guide valide. Il critico anticipato chiedeva ripetutamente di aggiungere alle ricevute dei Supporter ancora in mano dopo quello già giocato. Il replay li esclude dai candidati, conservandoli integralmente in mano per conteggi ed effetti. Il protocollo5 del critico anticipato consegna le due viste esplicite dal medesimo registro autenticato; la critica finale già distingueva questi concetti. Nessun verdetto è scritto dal codice.

I cinque riesami pagati restano legati ai loro originali4, inclusi i negativi. Otto finestre reali con Supporter ancora in mano rilette;47raw e tutti gli esiti originali conservati. Il replay intercetta soltanto il quantitativo interrotto e mantiene l’hash del prompt49. La prima guida resta valida al lettore corrente. Typecheck/build passati; prova completa sintetica31,113s/0,751s/767,492MiB,44risposte/sei giudizi negativi/sette crediti di riparazione, salvataggio e riapertura passano. Il margine memoria è minimo e non viene nascosto. Un processo Vitest combinato misura820,340MiB e fallisce quel controllo; rapporto negativo conservato. La misura dedicata usa lo stesso harness precedente, con soglia768invariata; le verifiche funzionali4/4 sono separate dalla misura di processo.

Un primo comando di regressione ha selezionato anche138copie storiche sotto .verify: runner annullato senza dichiararne risultati. La selezione corretta, verificata prima dell’avvio, usa --dir tests ed esattamente cinque file correnti. I814file dell’archivio v17,30raw e9542riferimenti sono nuovamente verificati intatti dopo quell’annullamento. I rapporti negativi dei test iniziali mantengono anche due errori del solo test: ordine dei candidati trattato erroneamente come significativo e metodo value mancante nel finto archivio. Nessun validatore è stato indebolito per risolverli.
