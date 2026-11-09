# APP-225 — Riparazione dei soli campi autorizzati

Stato: verifica offline completata dopo lo stop dell’epoca 6, 03/11/2026 alle 13:32 Europe/Rome. Nessuna nuova guida valida, nessuna nuova chiamata reale dopo la 57 principale. Questo documento non sostituisce la prova reale della generazione completa.

## Risultato reale precedente

L’utente ha autorizzato 80 chiamate cumulative per guida, 128 nel ciclo v28, riservandone 24 a ciascuna guida successiva. L’epoca 6 ha aggiunto due invocazioni prima dello stop globale concordato:

- La 56 ha restituito una classificazione valida `text`, limitata a `comparison`. La decisione è conservata e viene riusata in ripresa.
- La 57 è terminata con exit 1 dopo 4,206 secondi, senza file risultato, turni o item completati. Il classificatore ha rilevato `output-limit`; nessun testo è stato applicato. La causa precisa upstream resta indeterminata. Durata breve e assenza di output visibile non dimostrano il rifiuto preventivo della richiesta.

Contabilità: 57 principali + 3 diagnostiche = **60 v28**, **136** incluse le 76 precedenti. Altri due job assenti, **0/3 guide valide**. I 55 tentativi importati nel database diagnostico non sono altre 55 invocazioni nuove. Archivio immutabile `campaign-v28-epoch6-archive/manifest.json`: 496 file, 473 impronte del live intatte, tre SQLite della campagna e due SQLite diagnostici congelati conservati; binding e chunk confrontati.

## Cambiamento generale

Il protocollo narrativo `pg-premise-text-repair-2` chiede esclusivamente i campi selezionati dal routing, oltre ai tre identificativi di legame. Prima richiedeva anche di ricopiare i testi non autorizzati come stringhe costanti: questa ripetizione non concedeva modifiche e consumava output inutilmente. Ora quei testi rimangono nell’input immutabile e il lettore li conserva esattamente.

Tutti i limiti narrativi originali rimangono nello schema e nel lettore nativo. La risposta viene inserita senza tagli o completamenti automatici in una copia del turno originale; il turno intero attraversa di nuovo i controlli. La cache deve ricostruire lo stesso oggetto completo, inclusi i campi non selezionati, la fisica e lo sviluppo. Rimangono tutti i rilievi negativi, il nuovo riesame indipendente, lo scaling e le riserve. Il routing v1 non cambia: il verdetto pagato alla 56 non deve essere ricomprato.

Il protocollo non contiene nomi di carte o condizioni sui tre matchup. Le regressioni coprono tutte le sette combinazioni non vuote di campi, scope/fonti estranei, campi aggiuntivi, limiti, no-op, alterazioni della cache e interruzioni prima della patch e prima della nuova critica. Le alternative eseguibili continuano a richiedere il turno completo.

## Diagnostica separata dalla causa del guasto

Un test locale riproduce una classificazione errata indipendente: un parametro `max_output_tokens` dichiarato non supportato veniva interpretato come esaurimento output per la sola presenza del suo nome. Il classificatore ora distingue rifiuti espliciti di parametro/schema e HTTP 400/422/5xx da risposte incomplete. Questo non dimostra che la 57 avesse quel difetto.

Le nuove diagnostiche registrano soltanto codici e nomi di parametri strutturati presenti in whitelist, senza messaggi grezzi, prompt, valori arbitrari o credenziali. Codici non ammessi vengono scartati. Nessun cambiamento a modello, effort, configurazione dell’utente, timeout reali, retry o tetti di chiamate.

## Evidenze offline

- 39 test mirati passati su riparazione, classificazione e trasporto.
- Tre replay su copie passati, senza provider: Crustle riusa il routing reale 56 e raggiunge direttamente una richiesta `comparison` v2; gli altri due arrivano soltanto al piano. Tutti i 57 tentativi e i 30 checkpoint precedenti rimangono presenti, database originali invariati. Nessuna classificazione sintetica necessaria.
- Freeze di verifica: 479 file, hash `c2ec11f9e8694bf156f3157565710c1f030da9974f9fb08f7fdf772b8dc17b8d`. Nessun cambiamento dei sorgenti durante le verifiche.
- La suite ampia con due worker ha avuto tre test e una preparazione in timeout: 612 passati, 50 esclusi anziché i 44 attesi. Il log negativo è conservato. La riesecuzione dei tre file correnti con un worker passa tutti i **19 test** in 266,60 secondi, exit 0, con timer e asserzioni originali. La copertura cumulativa è **621 test unici verificati**, con i 44 esclusi originari; non è un singolo run completo verde. Il test scaduto a 30 secondi passa in 13,76; il ciclo nativo scaduto a 90 passa in 51,95. La prima selezione isolata ometteva l’esclusione di `.verify` e includeva le copie congelate dei test: interrotta con exit 1, non è un pass. La selezione corretta esclude esplicitamente quelle copie e usa un log separato `selected-text-isolated-root-suite.log`.
- Typecheck finale, compresi runner dell’epoca 7 e replay, e build passati, exit 0. Nessun sorgente cambiato dopo il freeze.
- Preservazione verde: sette archivi v28/diagnostico, 479 impronte correnti, 473 congelate del live precedente; esattamente sette file di codice/test cambiati dopo lo stop e altri 466 invariati. Le 76 chiamate precedenti, 254 sorgenti e undici archivi sono integri.

Log e report in `.verify/app225-segments-20261102/`: `verification-selected-text.json`, `selected-text-targeted.log`, `selected-text-replay.log`, `selected-text-final-suite.log`, `selected-text-isolated-suite.log`, `selected-text-isolated-root-suite.log`, `selected-text-final-typecheck.log`, `selected-text-final-build.log`, `selected-text-preservation.json` e `preservation.json`. Le prove negative non sono convertite in pass. L’hash del freeze citato sopra usa JSON compatto; lo SHA256 dei byte del manifest è `f32bbfcf1c00cd12d96d6cdc4977c1dc663a7a784a0ea95933602b07a0222b15`.

## Budget e ripresa

Entro gli stessi tetti 80/128/24 rimangono al massimo **68** invocazioni nel ciclo: **20** per Crustle e 24 riservate a ciascuna guida successiva. Il limite del job principale resta 77, perché tre diagnostiche sono già imputate alla stessa guida. Il replay arriva alla richiesta pendente con dieci chiamate riservate alle fasi successive; il minimo di accesso è 11, non una previsione di convergenza o un costo garantito della guida.

La ripresa proposta non aumenta il budget. Richiede un nuovo consenso per riaprire lo stop globale sul codice corretto e congelato; non utilizzare il vecchio grant per rilanciare l’epoca terminata. Nessun grant per l’epoca 7 prima di tale consenso, nessuna chiamata per gli altri matchup prima di una guida valida, stop globale al primo non valido, held-out esclusi. Default dell’app v27 e guardia reale v28 conservati. Tre guide reali, verifica UI/persistenza, generalità e consegna dell’app rimangono criteri aperti dell’obiettivo.
