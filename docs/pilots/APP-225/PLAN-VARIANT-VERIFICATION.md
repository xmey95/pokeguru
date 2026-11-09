# Conservazione delle varianti del piano — APP-225

Checkpoint del 3 novembre 2026. La campagna epoca8 è terminata senza guide valide: **88 invocazioni v28**, delle quali85 principali e3 diagnostiche. Con le76 precedenti il totale storico è164. Gli altri due matchup non sono stati avviati; lo stop globale concordato è stato rispettato. Archivio epoca8:502 file e477 impronte sorgente intatte. Nessuna nuova invocazione dopo la85 principale.

## Problema osservato

Le invocazioni72–82 hanno completato i sette rami del piano precedente. Le83–84 hanno chiesto testimoni ulteriori, senza approvare gli scenari. La85 ha proposto undici rami, riscrivendo obiettivi o fonti anche di tutti i sette precedenti. Poiché l’identità del ramo comprende l’intero seed, ciò richiedeva undici nuove costruzioni native, anche quando una variante avrebbe potuto restare invariata.

I rilievi includono alternative e difese effettivamente mancanti. Non è dimostrato che le differenze siano soltanto narrative o che basti conservare tutti i vecchi rami. Il codice non dichiara equivalenti due obiettivi e non risolve manualmente i rilievi.

## Correzione generale

Una nuova unità AI sceglie, per ciascun identificativo, la variante originale oppure quella proposta, collegando ogni cambiamento ai requisiti ricevuti. Può omettere soltanto nuove aggiunte non necessarie. Entrambe le varianti sono testi AI già conservati: il programma seleziona copie esatte, senza riscrivere obiettivi, eventi o fonti. I rami esistenti restano se la scelta li conserva, con le stesse identità e gli stessi checkpoint.

La decisione è una pianificazione, non un’approvazione. Tutti i requisiti originali restano nel contesto; varianti nuove richiedono costruzione e validazione native, metadata aggiornati e riesami indipendenti. Contesto, decisione e risultato sono collegati a job, progetto, configurazione, fonti, piano originale, registro e rilievi esatti. Cache alterate, scelte senza requisiti, duplicati e cicli vengono respinti. Le proposte già pagate sono riutilizzate.

Le istruzioni del piano richiedono linee eseguibili separate, alternative economiche e testimoni dei budget di rimozione. I rami difensivi devono eseguire la difesa proposta e il seguito, oltre a descriverli. Schemi e lettori fisici sono invariati; le unità storiche accettate conservano l’identità originale. Nessun nome di carta o matchup governa il nuovo percorso.

## Verifica

I20 test mirati e i quattro replay su copie passano. I replay conservano85 tentativi e67 checkpoint reali senza modificarne i database: nessun provider viene chiamato. I due matchup non iniziati raggiungono soltanto la richiesta di piano nelle copie. La prova sintetica indipendente dimostra che una scelta parziale costruisce soltanto il ramo nuovo e, dopo il completamento, riprende senza chiamate; non dimostra la qualità di una scelta AI reale.

La verifica completa passa con **641 test e 43 esclusi**, 105 file passati e 36 esclusi su 141; anche typecheck e build passano. Scope: `tests/**`, escludendo `.verify/**` e il file `codex-usage-capture.test.ts`, non eseguito in questo checkpoint. Durata 888,54 secondi, un worker. Gli esiti sono registrati in `.verify/app225-segments-20261102/verification-plan-choice.json`. Il primo lancio della suite ha usato accidentalmente Node 20, non supportato dal progetto: è conservato separatamente e non vale come verifica. La suite autorevole usa Node 24.19.0 e il freeze di 485 file, hash `9fd3142ecd60b481bc0254fe6bab83636c3cce73fa58f5b60ca44158be396ecf`.

Nove archivi v28/diagnostico, i binding e tutti i byte dei chunk anteriori sono preservati. Le76 chiamate precedenti, undici archivi e254 sorgenti congelate restano separati e intatti. Nessun contenuto generato è stato corretto a mano.

## Budget e limiti

I tetti autorizzati restano96 per guida e144 nel ciclo, con24 riservate per ciascuna guida successiva. Delle56 chiamate residue nel pool soltanto8 sono disponibili per la prima guida. Il preflight corretto richiede29 chiamate prima della scelta, riservando prudentemente la costruzione dell’intera proposta e le verifiche successive. È una previsione conservativa del controller, non la dimostrazione che qualunque scelta richieda esattamente29 chiamate, né una garanzia di convergenza.

Con il tetto96 la copia si arresta prima del provider. Una copia con tetto ipotetico128 raggiunge soltanto la nuova richiesta di scelta e si ferma prima del provider. Questo valore non è autorizzato e non costituisce una nuova campagna o promessa di successo. Nessuna riapertura dopo lo stop, nuovo runner live o aumento automatico dei tetti è autorizzato.

**0/3 nuove guide valide**: restano la verifica reale della correzione, le altre due guide, persistenza/riapertura/UI delle guide reali, generalità e politica applicativa, abilitazione controllata e build utilizzabile. Defaultv27 e protezione della generazione realev28 restano attivi; gli held-out sono esclusi. APP-225 resta In progress e l’obiettivo completo non è raggiunto.
