# APP-256 — Coerenza delle fasi e riparazione delle spiegazioni

7 novembre 2026. Incremento esclusivamente offline nell’obiettivo riattivato. **Zero nuove chiamate reali, 455 v28 / 531 storiche, 0/3 nuove guide valide.** Il job v19 mantiene due giudizi negativi e non viene riaperto per inviare richieste. Le 42 risposte, 43 tentativi, 434 campioni e i 9.801 riferimenti presenti al suo terminale sono conservati.

## Problema e correzione generale

La nota respinta nella v19 è in una spiegazione del setup, fuori da tactical e decisionProof. Il vecchio routing ammetteva soltanto audit oppure ricostruzione originale; non poteva richiedere una correzione mirata di quella spiegazione conservando tutte le azioni. La dichiarazione intermedia può avere audit null, ma una motivazione definitiva non deve attribuire quel vincolo temporaneo alla posizione di gioco.

Le istruzioni della sola fase dichiarativa ora separano esplicitamente trasporto e motivazioni del giocatore. Non cambia la legalità delle azioni né viene introdotto un filtro lessicale: parole come null e nomi di carte restano ammissibili. Le dichiarazioni già pagate continuano a recuperare le loro istruzioni originali autenticate; non vengono riscritte per far passare nuovi controlli.

Il nuovo routing v2 ha tre modalità coerenti fra schema, istruzioni e lettore: audit, testo e originale. La modalità testo può selezionare soltanto foglie narrative prodotte dal codice dal prefisso valido e dallo schema nativo: spiegazioni di decisione nei turni storici e reason/pivot dello sviluppo. Non può indicare percorsi arbitrari, cambiare azioni o mescolare modifiche fisiche e testuali. Rilievi con azioni proposte o controlinee richiedono la ricostruzione originale. La classificazione resta un giudizio AI autenticato sui rilievi completi, non una deduzione da severità, nome della carta o parole chiave.

Il costruttore restituisce soltanto gli identificativi congelati e i testi autorizzati. Il codice usa **esattamente le stringhe AI**, non cancella frasi né sintetizza le spiegazioni precedenti. I limiti derivano dallo schema nativo completo. Fonte, apertura, pescate, movimenti, attacchi, pagamenti, inventario, sviluppo e audit non selezionati rimangono identici. La patch passa nuovamente i lettori completi e viene collegata al suo originale, al routing, al rilievo e al prefisso precedente.

## Ancoraggi, riserve e storia

Una modifica narrativa può cambiare l’ancoraggio degli audit anche se il testo degli audit resta identico. Il percorso li **ricertifica con il critico quantitativo esistente** prima di accettare il nuovo checkpoint; non trasferisce le vecchie approvazioni su un ancoraggio diverso. Recupero e rilettura verificano risposta AI originale, immutabilità del registro e tutte le certificazioni correnti.

Il preflight riserva prima della patch il costo conservativo dei riesami già noti: nuova critica della premessa e fino a quattro gruppi per ciascun turno il cui ancoraggio può cambiare. La riserva è metadato del chiamante, escluso da prompt, schema e identità di trasporto. Consuma la capacità di riparazione esistente e non crea nuove posizioni di gioco o aumenta il massimo locale164. Il riesame quantitativo riusa la posizione logica dell’audit originale, quindi viene contato come riparazione. La modalità v2 del routing mantiene la posizione v1 per conservare anche i vecchi errori di formato.

Le ricevute v1 del routing sono ancora lette con il costruttore v1, senza reinterpretarne la scelta come una nuova autorizzazione testuale. Restano obbligatori il nuovo riesame completo della premessa, la critica degli scenari prima della prosa e la critica finale. Nessun nuovo pass viene trasferito dalle prove sintetiche al job reale. **Due negativi o due errori di formato restano due anche dopo la patch, in ripresa e al cambio di schema.**

## Verifiche e loro portata

Risultati conclusivi in `.verify/app256-phase-text-20261107/verification.json`.

- Test di immutabilità, percorsi protetti, limiti dei testi, output superfluo o identico, fonte AI mancante, certificazione rimossa, conservazione dei due negativi e dei vecchi errori di routing. Nessun nuovo timeout aumentato.
- Percorso completo con due liste sintetiche diverse, due setup da completare e una spiegazione volutamente incoerente. La critica la respinge, il routing seleziona il solo testo, il modello sintetico lo corregge, gli ancoraggi vengono ricertificati e la critica completa precede la prosa. Otto capitoli, due casi, esercizi, approvazione finale, salvataggio e rilettura senza nuovi invii.
- Misura sul codice finale: **22,521 s a freddo / 0,618 s a caldo / 725,461 MiB**, entro le soglie invariate60s/10s/768MiB.44invocazioni sintetiche e4crediti di correzione; **non sono guide generate dal servizio reale** né stime di costo per un matchup reale.
- Lettura diretta del database sintetico: il negativo e il testo originale rimangono nelle evidenze; il nativo corrente contiene la stringa esatta della risposta AI e le attestazioni finali sono legate agli originali.
- Due aperture della copia reale v19 con il codice nuovo: draft-limit senza provider,43tentativi/42raw/434campioni/18correzioni invariati; tutti i9.801riferimenti intatti. Misure circa3,3s/3,8s e490MiB. Il vecchio job non acquisisce una nuova possibilità di riparazione.
- Lo stesso ingresso usato dai job reali rifiuta un nuovo primo job164con121disponibili **prima di creare il job**. Non viene ridotto il formato per aggirare l’ammissione.
- Guida sintetica storica riaperta con36tentativi invariati,8capitoli e zero provider. UI del risultato sintetico tramite SQLite/IPC reali a1440/1280/640pixel, nessun errore renderer.
- Dieci file source/test modificati e un nuovo modulo rispetto alla v19; altri570invariati.581file improntati. Tre DB terminali v19 e sorgenti v18 intatti;12archivi precedenti verificati.

Sono conservati anche i risultati intermedi: un primo typecheck rilevava il tipo del nuovo metadato da inoltrare; un test ha trovato la mancata esclusione dei target duplicati; il primo ciclo completo ha mostrato un riesame contato come posizione nuova. Sono stati corretti, conservando limiti e test, e la contabilità finale verifica quattro riparazioni. Il task v2 sostituisce integralmente le istruzioni incompatibili v1; non le aggiunge come eccezione contraddittoria. La regressione e il percorso completo finali sono ripetuti dopo quest’ultimo allineamento.

Le prove attestano il percorso tecnico e gli stop, non la riuscita competitiva o la qualità del modello su tutte le carte. Nessuna nuova API reale, nessun held-out e nessuna integrazione AI dichiarata verificata tramite soli mock. Rete normale dell’app ancora disabilitata; comando utente APP-254 e tre guide reali ancora da completare.

## Budget attuale ed eventuale campagna successiva

I limiti attualmente autorizzati restano **576/500/500**, pool1.500 e riserva24. Sono consumate455v28/531storiche: residui121/500/500 e1.045nel pool. Il job fermato conserva18correzioni su32, ma i due negativi impediscono nuovi invii.

Un nuovo profilo completo richiede164di disponibilità alla partenza;alla prima guida ne mancano43. La proposta tecnica APP-257 è un **nuovo job isolato per ciascun matchup**, con tutte le vecchie evidenze e la contabilità conservate, senza trasferire approvazioni. Per ammetterlo occorre portare il solo tetto della prima guida a **619** (455+164). Gli altri restano500, il pool1.500 e la riserva24 non cambiano. Massimo164invocazioni per ciascun nuovo job, quota locale32 esplicita entro164.

I tre profili consentirebbero al massimo492nuove invocazioni,947v28/1.023storiche se consumate tutte. È una capienza massima, **non una stima di completamento, un obiettivo di spesa o una garanzia**. La disponibilità di token del servizio e il dimensionamento di ogni richiesta restano vincolanti.

Preparazione e replay della proposta sono solo offline. **Nessun aumento è adottato, nessuna autorizzazione o run-started sono creati.** Servirà una nuova decisione esplicita sul nuovo job e sul tetto619prima di qualsiasi invio. Stessi dati pubblici e OpenAI tramite Codex; successive solo dopo una guida valida,persistita,riaperta e verificata inUI;stop globale al primo non valido,nessun riavvio o aumento automatico,held-out esclusi.

## Qualificazione conclusiva

**393casi distinti /40file pertinenti,zero fallimenti o skip**,senza conteggio doppio delle esecuzioni precedenti;typecheck/build eUI passano sul codice finale. Non è la suite completa del repository. Gli esiti precedenti all’ultimo allineamento del task restano conservati e non sostituiscono la regressione conclusiva.

APP-257 è preparata in .verify/app257-proposed-v20-20261107,sigillo ce489ac5e256d819fd2635d9b8aa284f36707107186413fbadb02fe614c8708e. Tre avvii e sei ingressi intercettati sullo stesso percorso del reale;177compilati comuni corrispondono alla qualificazione. Le39tabelle di ogni DB preparato coincidono con il terminale v19;vecchi job e prove restano intatti. Tutti i job nuovi e le concessioni simulate esistono solo nelle copie di replay. Nessuna autorità o esecuzione reale creata.

APP-256 Done per questo incremento;APP-257 Ready soltanto tecnico. Restano0/3nuove guide reali valide,verifica competitiva e prontezza finale dell’app da completare.
