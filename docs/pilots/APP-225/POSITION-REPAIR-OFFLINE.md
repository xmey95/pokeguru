# APP-240 — Annotazioni dal campo risultante e diagnostica in ripresa

Correzione generale integrata nel percorso finito v28 e verificata offline. **Nessuna nuova chiamata reale:**375v28/451storiche,0/3 nuove guide valide. La campagna v12 resta conclusa e non è stata riaperta.

## Causa e correzione

Le annotazioni del quadro precedevano la costruzione dei turni di setup, ma il controllo le confrontava correttamente con il campo dopo tutti i turni. Sul secondo setup reale due annotazioni indicavano copie in zona active con disponibilità risultante zero: una nostra e una avversaria. Non erano errori nei conteggi dei tentativi o nel protocollo del critico iniziale.

`collectGuideSetupPosition` ricava inventario e turno successivo dalla stessa proiezione del registro completo. Mantiene controlli di movimenti, risorse, timing, destinatari, Attivi, Premi e Panchina. Il suo risultato è soltanto un contesto di costruzione: non è una ricevuta di setup e non approva posizione, audit o semantica degli effetti. I lettori pubblici conservano tutti i controlli originari.

Se le annotazioni originali sono coerenti, rimangono identiche e non viene richiesta una nuova risposta. Se falliscono il controllo della posizione, `repairGuideSetupPosition` prepara un campo con identità fisse pN: lato, stampa, zona e numero della copia provengono dal registro, senza abbinamenti dedotti dal testo. La richiesta AI può dichiarare soltanto danni, condizioni e modificatori PS con fonti. Deve compilare ogni copia; non può cambiare carte, zone, turni, movimenti o audit. Nessuno zero o valore strategico viene aggiunto dal codice.

Il risultato passa nuovamente lo stesso controllo di presenza, unicità delle copie, PS e fonti. Una ricevuta lega risposta AI autentica, scope, quadro derivato, registro immutato e hash del risultato. Seguono audit, controllo completo del setup e tutte le critiche originarie. I due registri reali respinti e le17 risposte pagate restano immutati: nessun contenuto è stato corretto manualmente o promosso in approvazione.

La nuova fase è una **riparazione dal primo invio**: usa i16 crediti già condivisi, non introduce nuovi slot base, non aumenta il massimo164 e non rinnova i due errori di formato della stessa posizione logica. Test e replay verificano questa contabilizzazione anche al cambiare degli input.

## Diagnostica

Gli errori delle annotazioni indicano il campo risultante, la copia contestata, copie presenti, PS massimi e possibili duplicati. I vincoli su danni, copie e modificatori non sono allentati.

In ripresa, un errore nativo già respinto viene riportato con `draft-limit`, conservando il motivo del controllo e le dichiarazioni autentiche. Non viene rilanciato come errore generico. Restano distinti gli errori AI già classificati, inclusi formato e budget; non si azzerano rifiuti o tentativi. I test verificano doppio rifiuto fisico e riapertura senza nuovi invii, oltre al limite di due risposte invalide nella riparazione.

## Verifiche eseguite

- **169 test distinti passati, zero fallimenti,21 file.** Comprendono riparazione delle sole annotazioni, registri invariati, provenienza e cache, copie mancanti/duplicate, Pokémon non vivi, fonti dei PS, impossibilità fisiche, limiti e credito condiviso; regressioni di segmenti, audit, critico, generazione finita e percorso applicativo completo sintetico.
- Typecheck e build passati. La nuova fase è inclusa nel worker compilato. Verifica UI Electron offline passata a1440/1280/640, senza errori renderer.
- Una guida sintetica completata prima della correzione conserva gli otto capitoli e36 tentativi; recupero senza provider in0,819s. Non è una nuova guida reale.
- Tutti i file di cinque archivi precedenti sono immutati:798/784/783/903/892. Database reali,17 raw e due rifiuti del setup intatti; nessuna ricevuta di nuova riparazione o report aggiunta ai database reali.

| Replay su copia | Esito | Prima apertura /ripresa | Picco |
| --- | --- | ---: | ---: |
| Job Crustle esistente | Arriva alla sola riparazione delle posizioni, senza ripagare piano, critico o costruzioni |1,699s /0,867s|434MiB|
| Nuovo primo job | Respinto prima della generazione:164 richieste di capienza contro147 residue |—|nessun provider|
| Alakazam/Dudunsparce nuovo | Arriva al confine del provider, senza invio |0,507s /0,030s|332MiB|
| Dhelmise nuovo | Arriva al confine del provider, senza invio |1,452s /0,294s|368MiB|

Soglie60s/10s/768MiB invariate. Gli invii intercettati e i relativi tentativi nelle copie non sono chiamate reali né fanno parte della contabilità della campagna. Non è stata fabbricata una risposta AI per correggere il setup reale nella verifica.

## Budget prima di altre chiamate

| Voce | Stato |
| --- | ---: |
| Tetti cumulativi prima /seconda /terza |522 /500 /500|
| Totale v28 /storico |375 /451|
| Residui prima /seconda /terza |147 /500 /500|
| Pool autorizzato /residuo |1500 /1125|
| Riserva per ciascuna guida successiva |24|
| Job corrente, invocazioni usate /massimo |17 /164|
| Crediti di riparazione usati /residui |6 /10|
| Primo invio della nuova riparazione |1 credito,9 residui dopo l’invio|
| Prenotazione minima della fase pendente |1 richiesta +14 future =15|

Il generatore ammette la fase sul **job esistente**, con tutti i consumi conservati. Un nuovo primo job resta non ammesso con147 contro164: la correzione non concede una nuova storia. Il massimo contrattuale di eventuali ulteriori invocazioni sul job corrente più due nuovi job è147+164+164=475, per850v28/926storiche, entro tutti i tetti. Questi valori esprimono capienza e limiti; non stimano il consumo effettivo né garantiscono approvazione.

La richiesta di riparazione dimensionata sul job reale stima42460 token input,6000 output riservati, oltre al margine8192. Conserva355 campioni e fattore massimo osservato1,611489961838394; lo scaling non è stato ridotto o azzerato. Il budget di14 chiamate future della richiesta è distinto dalla riserva di24 per ciascun matchup successivo.

Evidenze: [verifica completa](../../../.verify/app240-position-20261106/verification.json), [budget](../../../.verify/app240-position-20261106/budget.json), [ripresa Crustle](../../../.verify/app240-position-20261106/replay-0.json).

APP-240 Done per codice e verifiche offline. Qualità della nuova risposta AI, convergenza e tre guide reali valide restano da verificare. Nessuna campagna live o autorizzazione nuova è stata creata; una futura ripresa richiede un runner congelato sul codice corretto e un’istruzione esplicita per riaprire lo stop. APP-232/APP-225 e l’obiettivo generale rimangono incompleti.
