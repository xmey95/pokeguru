# APP-235 — Prova reale bounded v10

6 novembre 2026. Autorizzazione diretta: «Autorizzo 519 chiamate cumulative sulla prima guida, 1500 totali e riserva 24. Procedi con la prova reale sui tre matchup, senza interventi manuali, mantenendo controlli e scaling. Stop al primo esito non valido.»

## Preparazione

Codice applicativo e controlli identici alla qualificazione APP-234:992 test distinti passati,43 esclusioni esplicite,build/UI e prestazioni verificate. Nessuna correzione al generatore durante la campagna. Il runner specifico prepara nuovi job isolati; non trasferisce pass o correzioni di contenuti dai job precedenti. Il flag generale della generazione nell’app resta disabilitato: solo il runner della campagna, con consenso congelato e guardia alla frontiera di ciascuna invocazione reale, è autorizzato a chiamare il provider.

Ordine: Crustle–N’s Zoroark, Alakazam/Dudunsparce–Basic Box, Dhelmise–Lucario/Hariyama. I tre database precedenti sono copiati senza alterare gli originali; le copie mantengono tutta la contabilità precedente. Si creano i job successivi solo dopo una consegna valida del caso precedente. Stessi dati pubblici congelati, stesso modello/configurazione e servizio OpenAI tramite Codex; isolamento interno e controlli invariati. Nessun contenuto AI è corretto a mano,nessun held-out,nessun riavvio automatico dopo un esito negativo.

| Limite | Prima guida | Seconda | Terza |
| --- | ---: | ---: | ---: |
| Cumulativo autorizzato |519|500|500|
| Già consumato |355|0|0|
| Residuo prima del nuovo job |164|500|500|
| Massimo del singolo nuovo job bounded |164|164|164|

Pool1500,riserva24 per ogni guida successiva ancora da avviare. Il massimo della campagna è492 nuove invocazioni,847 nel ciclo v28 e923 incluse le76 precedenti,fermandosi prima per validità o esito negativo. Non si rinnova il credito tramite i nuovi job. La riserva interna16 per riparazioni/ripetizioni resta un vincolo aggiuntivo;519 non la aumenta.

Guardie provate offline per tetti asimmetrici,conteggio della chiamata già registrata,riserve future e divieto di riavvio. Tre replay sulle copie si arrestano prima del provider con zero chiamate reali e memoria massima360MiB. La calibrazione conserva335 campioni; non importa alcun giudizio precedente. Il checksum del binario è calcolato a blocchi per non allocare in memoria l’intero eseguibile.

Una guida è consegnata solo dopo reader completi,riesami indipendenti,approvazione finale corrispondente agli originali,salvataggio/rilettura del report,ripresa della guida completata senza invii e verifica UI offline. La campagna si ferma al primo esito non valido,anche prima di esaurire i massimi. Nessuna approvazione è garantita dai replay.

Runner e ricevute: `.verify/app235-bounded-20261106/`. `live-status.json` e `terminal.json` sono le fonti dell’esecuzione; gli esiti dei singoli casi sono nei rispettivi `outcome.json`. Le istruzioni di lancio non costituiscono un risultato reale: esiti e conteggi finali saranno registrati dopo la terminazione.

## Avvio reale

Avviata il06-11-2026 alle13:32UTC con sessione4546/processo2704. Primo job2d6a4b8d-3ed2-4d41-8ec0-10961e92d4a2;prima richiesta del piano inviata,356v28/432storiche al primo controllo,zero guide ancora valide. Sigillo7519863c4cebf592256e2c0df9d3d48f2aa0cc7d984a9a5889e49273da3d2b3a. L’avvio non dimostra validità;monitorare gli esiti senza riavviare il runner.

## Esito reale: stop al primo non valido

Campagna terminata il06-11-2026 alle13:33:38UTC,sessione4546 exit1,dopo94,534 secondi. **Tre nuove invocazioni,zero guide valide;358 nel ciclo v28/434 storiche.** Secondo e terzo job non sono stati creati. Residui161/500/500,1142 nel pool; tetti519/500/500,pool1500 e riserva24 rispettati. Nessun ulteriore invio o tentativo di riavvio dopo lo stop.

| Richiesta | Risposta del servizio | Esito applicativo |
| --- | --- | --- |
| Piano iniziale |Riuscita|Piano strutturato prodotto,senza approvazione indipendente valida|
| Critica iniziale |Riuscita|Rifiutata: `verdict="pass"` con `findings` non vuoto|
| Retry della stessa critica |Riuscita|Medesima incoerenza; raggiunto il limite di due risposte non valide|

Gli otto `findings` complessivi sono conferme e precisazioni positive del piano. Non sono stati cancellati,normalizzati o trasferiti a un pass. Il reader applicativo richiede un array vuoto con `pass`,mentre schema di trasporto e istruzioni di quel critico non codificano esplicitamente la stessa condizione. Il feedback del retry comunica soltanto «Critica iniziale senza verdetto coerente»,senza individuare la combinazione di campi. Questo disallineamento del nostro protocollo è la causa osservata dello stop; non è stato generato alcun setup,scenario o capitolo. Le affermazioni tattiche nei raw restano non certificate.

Le tre chiamate sono riuscite al servizio: nessun errore di avvio,rete,quota o timeout. I due rifiuti riguardano i figli del batch,con raw conservati; non vanno confusi con errori di trasporto. Uso comunicato dal servizio:124.007 token input,3.561 output,zero input cached. La riserva globale non è stata rinnovata e il limite di due errori non è stato aggirato.

## Verifica e conservazione

Verifica terminale passata: codice qualificato e compilati congelati identici,tutti i file degli archivi v9/v8 immutati,tre sorgenti reali originali intatte. Il nuovo job contiene esattamente tre raw e due rifiuti del critico,è sospeso per `failure`/`invalid-response` e non è riprendibile automaticamente per shutdown. Zero report persistiti,nessuna attestazione di guida validata,nessun avvio degli altri due matchup. L’arresto globale è verificato sui contatori e sui job effettivi,non soltanto dichiarato dal runner.

Archivio terminale: `.verify/app235-bounded-20261106-archive/manifest.json`. Contiene sorgenti/compilati congelati,metadati,diagnosi e tre backup dei database. Tutte le39 tabelle di ogni backup sono confrontate per contenuto con la relativa copia di lavoro. Il piano e i due raw respinti restano disponibili per una futura correzione generale; nessun contenuto AI è stato corretto a mano. UI e pubblicazione reale non sono raggiunte,quindi non sono dichiarate verificate da questa campagna.

La correzione candidata è allineare schema,istruzioni e feedback del critico iniziale alla medesima regola: `pass` implica `findings=[]`; `revise`/`incomplete` richiedono problemi effettivi. Prima di un’altra proposta reale servono regressioni sui due raw osservati,prove dei negativi e ricalcolo della ripresa senza rinnovo dei limiti. Non viene implementata né rilanciata una correzione in questa campagna congelata. APP-235 Done per l’esecuzione e la verifica dell’esito;APP-232/APP-225 incomplete e obiettivo generale non raggiunto.
