# APP-174 — Raccolta locale, avanzamento e ripresa

Verifica del 29 ottobre 2026, Windows x64, Node 24.18.0. Questo rapporto riguarda la raccolta delle prove AI e il suo avanzamento; l'audit più ampio di query, indici e riepiloghi SQLite è completato in [DATABASE-PERFORMANCE.md](DATABASE-PERFORMANCE.md), con misure separate sul sorgente a schema 15.

## Riscontro e cause riprodotte

Nel report v0.3.7 identificato dall'utente tramite 187/187 lotti, la sintesi termina alle 22:58:55 UTC e il secondo piano alle 22:59:11 UTC del 28 ottobre. All'export delle 23:38:55 il job è ancora attivo senza chiamata modello o risposta finale preparata. Le pagine locali aggiornavano i contatori diagnostici, ma non `updated_at`, la fase o la cronologia visibile. L'evento del piano dichiarava inoltre completate le query prima della loro esecuzione.

La prova con SQLite reale e dati sintetici riproduce tre costi evitabili: rilettura e decompressione di tutte le schede già acquisite a ogni pagina; ricostruzione di tutti i riepiloghi delle ricerche a ogni aggiornamento; ricalcolo dei denominatori Eventi invarianti per ogni pagina. Il report storico non contiene tempi per pagina: questi costi sono dimostrati sul campione, ma non attribuiscono con certezza tutti i 40 minuti del Thread reale. Nessun deadlock del caso personale è stato riprodotto.

## Modifiche

- Fase persistita `collecting`, con descrizione della raccolta locale, partecipazioni/schede acquisite sul totale noto e pagine salvate. La pianificazione comunica ricerche **selezionate**. Il pannello distingue raccolta da analisi e risposta; le vecchie sintesi restano nello storico.
- Aggiornamenti visibili a inizio/fine ricerca e durante il progresso, limitati a uno al secondo durante le pagine veloci. Non si aggiunge un battito fittizio: gli aggiornamenti corrispondono a operazioni reali. Il polling rileva timestamp e sequenza nuovi.
- Diagnostica opzionale `collection`: operazione e passaggio, timestamp, pagine, elementi/totale/residui, tempi cumulativi di query, persistenza e dipendenze, massimo tempo di pagina. Nessun testo di query, ID, nome, percorso o contenuto delle prove. I tempi riguardano la raccolta corrente, non l'intero job.
- Disponibilità delle schede mantenuta in memoria per la singola traccia, ricostruita dagli originali alla riapertura; aggiornamento del solo riepilogo cambiato; cache limitata a 32 denominatori Eventi per archivio/job sullo snapshot immutabile.
- La ricostruzione delle dipendenze dalle liste già salvate cede il controllo e rispetta la pausa. Restano identici cursori, dimensioni delle pagine, dati originali, chiavi dei piani e dei risultati del modello. La correzione della raccolta non richiede di cancellare o ricreare il Thread.

## Misure

Fixture: 2.000 partecipazioni, 500 liste distinte, 500 schede, 123 ricerche, 622 pagine totali (500 Eventi), 3.449.899 byte di risultati. Tutti questi conteggi sono identici prima e dopo. Nessuna chiamata Codex o rete; vengono usati motore, SQLite, compressione e recupero delle dipendenze reali.

| Misura | Baseline `f3d2875` | Correzione raccolta |
| --- | ---: | ---: |
| Raccolta complessiva | 38,42 s | 11,64 s |
| Schede archiviate rilette durante la prima raccolta | 220.820 | 0 |
| Letture dei riepiloghi | 61.743 | 622 |
| Tempo di rilettura delle schede | 15,55 s | <0,01 s |
| Tempo dei riepiloghi | 7,03 s | 0,45 s |
| Query Eventi | 5,21 s | 3,14 s |

Riduzione osservata del tempo di raccolta: circa 70%, su questo singolo confronto strumentato. Il primo passaggio esplorativo, con cache di sistema e carico differenti, aveva impiegato circa 147 secondi complessivi: non è usato come denominatore del confronto. I tempi non sono una promessa per ogni archivio o macchina.

Una successiva prova sul workspace con le ottimizzazioni SQLite concorrenti e il nuovo progresso attivo misura **8,03 s**, con gli stessi conteggi; questo ulteriore risultato include il lavoro dell'audit degli indici e delle istruzioni preparate. File locali di misura ignorati da Git: `.verify/app-174-baseline.json`, `.verify/app-174-after.json`, `.verify/app-174-with-progress.json`.

Per ripetere la prova con Node 24, impostare `POKEGURU_PERF=1` ed eventualmente `POKEGURU_PERF_OUTPUT` a un percorso locale, quindi eseguire `node node_modules/vitest/vitest.mjs run tests/ai-collection-performance.test.ts --exclude '**/.verify/**' --maxWorkers=1`. L'esclusione impedisce di includere la copia isolata della baseline.

## Verifiche e limiti

- Suite canonica: 317 test passati, 39 saltati. Dopo l'ultimo caso aggiunto e le modifiche concorrenti, 46 test pertinenti passati su raccolta, snapshot, archivio, pipeline, lotti, job e diagnostica. Typecheck e build passati; `git diff --check` passato.
- Pausa dopo due pagine, riapertura sul cursore salvato, completamento delle pagine restanti, riuso del piano già presente e del risultato AI precedente; un nuovo piano è consentito solo per valutare le prove appena raccolte. Verificati anche pausa prima della prima query, mancato avanzamento del cursore e ripristino di dipendenze incomplete.
- Il caso 187/187 conserva i contatori dei lotti nello storico e mostra la nuova raccolta. Il test rifiuta l'esecuzione della chiamata modello già completata, verificandone il recupero dalla cache. Le regressioni esistenti coprono isolamento, copie SQLite, originali oltre 64 MB e citazioni.
- Electron Windows: produzione del progresso tramite il collector/store reali su profilo temporaneo, UI 1280/640 senza overflow, polling, cronologia e rimozione della vecchia sintesi dal riquadro corrente; pausa volontaria conservata alla riapertura e risultato precedente recuperato. Dati delle query e risposta del modello sono fixture dichiarate. Screenshot ispezionati in `.verify/app-174-collection-*.png`. L'avvio Electron ha richiesto esecuzione fuori sandbox.
- Nessun intervento sul database personale, nessuna nuova analisi autenticata, installazione o release. Le correzioni sono locali. La ripresa del Thread personale va verificata sulla build aggiornata; il nuovo export permette di distinguere i tempi delle operazioni locali.

L'eventuale migrazione di schema per gli indici dell'audit esteso è documentata separatamente; non è necessaria per i nuovi campi facoltativi del progresso.
