# Audit delle prestazioni SQLite — 29 ottobre 2026

## Esito e perimetro

L'analisi ha trovato costi evitabili nel database **e nel codice che lo interroga**. I problemi principali sono controlli delle chiavi esterne senza indici, paginazioni che rileggono le righe precedenti, ordinamenti non coperti, ricostruzione ripetuta dei riepiloghi AI e lettura di grandi JSON per mostrare piccoli riepiloghi Evento. Non emerge la necessità di cambiare motore di database.

Intervento locale APP-174, esteso su richiesta dell'utente a tutta l'app; requisiti R-01, R-02, R-03, R-06, R-07, R-10, R-13, R-14. Base Git `f3d287508deed43faf9574076d3d139770819367`, ramo `task/app-172-desktop-refinements`, con lavoro locale APP-172/173/174 già presente e conservato. Nessun merge, rilascio o upgrade del profilo personale eseguito. La versione applicativa resta 0.3.7; il primo audit introduce schema 15; il completamento APP-175/176 porta il sorgente a **schema 16**, successivo allo schema 14 della release pubblicata.

Sono stati censiti gli accessi SQL in `ProjectStore`, `CatalogStore`, `TournamentStore`, `AiJobStore`, `AiEvidenceArchive`, `DailySyncStore`, migrazioni/backup e i loro chiamanti nel backend e nel renderer. Le misure usano SQLite reale su disco, dati sintetici, compressione reale e metodi di produzione. Nessuna latenza del modello o dei servizi esterni è inclusa. Non è una misura di CPU, I/O, contesa o tempi sul profilo che aveva mostrato 187/187: non dimostra quale query abbia occupato quei 40 minuti.

## Completamento APP-175/176: pagine profonde e storici

L'ulteriore richiesta del 29-10-2026 autorizza anche i tre interventi strutturali rimasti. Sono implementati nel codice locale, con originali e vecchi endpoint conservati per compatibilità; il renderer e i percorsi AI correnti usano le nuove letture limitate.

- **Eventi:** ogni filtro materializza una sola volta gli identificativi ordinati in una tabella SQLite TEMP della connessione. Le pagine cercano l'ordinale nell'indice, anche ripartendo da un offset molto avanzato. Restano identici offset, chiavi dei checkpoint, ordine data/piazzamento/nulli/chiave e sottostringhe `instr`; nessuna sostituzione con ricerca per parole. Cache LRU di otto filtri, eliminata alla chiusura e ricostruibile anche in lettura sola. Il primo filtro continua a dover esaminare i testi corrispondenti; le pagine successive non li riesaminano.
- **Versioni e candidate:** finestre di 50 elementi per sequenza, con pulsanti per raggiungere le precedenti. Annotazione, ripristino, base di una strategia e adozione leggono la versione/candidata specifica. L'adozione storica resta riconoscibile anche fuori dalla prima pagina. Il selettore Strategie trasporta solo metadati, senza il testo delle candidate di partenza.
- **Matchup:** pagine di 20 basi con cursore composto data/rowid; la base corrente si trova con un lookup separato anche quando è molto vecchia. Disponibilità delle guide da una proiezione compatta; report completi soltanto per la discussione selezionata, 20 revisioni per richiesta, numerazione assoluta. Indici dedicati alla base corrente e alle guide del contesto corrente. La ricerca degli avversari storici legge il singolo archetipo del relativo snapshot, senza trasferire ogni payload Meta di ogni discussione.
- **Contesto AI:** ultimi 12 messaggi e ultima candidata per la preparazione delle Strategie, insieme a **tutte** le note utente ancora senza risposta lette come solo testo; l'apertura della conversazione non perde il primo messaggio AI. Recupero dei risultati già applicati tramite indice del turno. I riepiloghi Matchup leggono cinque revisioni alla volta con numeri assoluti; i checkpoint precedenti rimangono compatibili. Le risposte già salvate non vengono rigenerate.
- **Retention:** riferimenti a snapshot/stampe e identità delle righe delle liste derivati una volta dai dati esistenti. Trigger di inserimento, modifica e cancellazione li mantengono nella stessa transazione degli originali, comprese le cancellazioni in cascata. Coperti messaggi, report/revisioni legacy, partecipazioni annidate, vincoli, corrispondenze correnti e revisioni delle correzioni, baseline/versioni/candidate. Chiavi dei proprietari stabili anche dopo VACUUM; normalizzazione NFKC delle identità conservata in JavaScript. Le proiezioni sono ricostruibili e non sostituiscono gli originali.

### Misure appaiate aggiuntive

Windows/Node 24.19, stesso processo e stesso database temporaneo. Dati e parametri in [DATABASE-HISTORY-METRICS.json](DATABASE-HISTORY-METRICS.json); fixture sintetiche, nessuna misura sul profilo personale. Gli accessi Evento confrontano la precedente query OFFSET con la nuova query, comprese le stesse decompressioni/verifiche SHA degli originali (payload minimo per isolare il costo di accesso). I tempi degli storici e della retention sono mediane di sette letture dopo riscaldamento.

| Operazione | Prima | Dopo |
| --- | ---: | ---: |
| 20 letture dell'ultima pagina su 80.000 partecipazioni | 22.925 ms | 173 ms |
| Apertura versioni: tutte le 3.000 → prima finestra di 50 | 31,31 ms | 2,13 ms |
| Apertura conversazione: 3.000 messaggi, 24 MB aggiuntivi → finestra di 50 | 116,04 ms | 3,60 ms |
| Riferimenti citati: scansione JSON → indice, identici 100 ID | 83,10 ms | 0,81 ms |

La prima materializzazione degli Eventi misura **782 ms** con cache applicativa vuota (non è una prova di disco freddo); la proiezione TEMP di quel filtro occupa **1.126.400 byte**. Il payload delle versioni scende da 1.824.847 a 30.451 caratteri per la prima apertura. Tutte le altre versioni rimangono consultabili.

Il lavoro viene in parte spostato sulle scritture: 200 inserimenti di messaggi, misurati in savepoint e annullati dopo ogni campione, passano da **3,29 a 39,19 ms** includendo i riferimenti (circa 0,18 ms aggiuntivi per messaggio nella fixture). Questo confronto misura il lavoro SQL/trigger, non un commit durevole su disco. Gli indici e le proiezioni richiedono spazio; non vengono duplicati i grandi report nelle proiezioni. Una prima prova di 200 letture del vecchio OFFSET ha superato il timeout del benchmark: la prova finale usa 20 letture e termina regolarmente. Le variazioni fra esecuzioni non permettono di promettere questi fattori in produzione.

### Verifiche del completamento

- Suite canonica: **325 test passati, 41 opzionali esclusi**; benchmark aggiuntivo appaiato passato separatamente. Build/typecheck passati. Regressioni SQL su pagine profonde, cache espulsa, ordine/nulli, date uguali, limiti, isolamento e riapertura read-only; piani indicizzati senza scansione/sort delle pagine.
- Storici reali SQLite: 131 versioni, 131 candidate manuali/AI mescolate, recupero dell'adozione della prima candidata, 161 messaggi, tutte le 60 note non risposte, 56 basi e 138 turni dopo una nuova revisione. Contesto corrente fuori dalla prima pagina, numeri assoluti, batch AI, annotazione/ripristino, isolamento e riapertura verificati.
- Migrazione v15→v16: backup `.verified` prima delle proiezioni, originali byte per byte, backfill idempotente, rollback, aggiornamento, cancellazioni e `foreign_key_check` passati. Le regressioni della rotazione preservano riferimenti legacy e copie recuperabili.
- Electron Windows: navigazione di 131 versioni/candidate, 161 messaggi e 137 revisioni in 56 basi; annotazione di v1, ritorno alla base corrente fuori pagina, 1280/640 px senza overflow e riapertura passati. SQLite, worker e IPC reali; soltanto il fetch esterno Meta usa una fixture. Smoke offline, ripristino storico e caricamento/errore/riprova Matchup passati. Pausa/ripresa, applicazione una sola volta e reattività del worker passati con risposte modello sintetiche.
- Due fixture che ricostruiscono v8 dal nuovo schema sono state corrette eliminando l’indice dipendente prima di rimuovere le colonne; il cleanup Windows mascherava l’errore della fixture. La suite finale supera entrambe le migrazioni.
- La prima fixture Electron è stata corretta per installare il sostituto del fetch Meta dopo la registrazione dei canali IPC e per dichiarare lo schema corrente: un archivio sintetico con `user_version=0` veniva correttamente trattato dall'app come legacy. Non sono state richieste modifiche al profilo personale per queste prove.

Riproduzione aggiuntiva (Node 24):

```powershell
npm test -- tests/history-pagination.test.ts tests/retention-index.test.ts tests/database-query-plans.test.ts --exclude '**/.verify/**' --maxWorkers=2
npm run build
node tests/history-pagination-ui.mjs
$env:POKEGURU_HISTORY_PERF = '1'
$env:POKEGURU_HISTORY_PERF_OUTPUT = 'docs/DATABASE-HISTORY-METRICS.json'
npm test -- tests/history-performance.test.ts --exclude '**/.verify/**' --maxWorkers=1
Remove-Item Env:POKEGURU_HISTORY_PERF
Remove-Item Env:POKEGURU_HISTORY_PERF_OUTPUT
```

## Misure APP-174

Windows, Node 24.19.0, SQLite 3.53.3. La fixture SQL contiene 12.000 job, record, pagine e partecipazioni, 2.000 ricerche, 12.000 attività, 12.000 valori e 2.000 oggetti non referenziati. I tempi sotto sono **totali per il carico indicato**, non per singola chiamata. Le esecuzioni iniziali e finali sono distinte e il carico della macchina varia: non sono p95 di produzione né una garanzia di fattore di accelerazione. I cambi di piano SQL e le verifiche dei risultati forniscono evidenza ulteriore rispetto al cronometro.

| Operazione | Prima | Dopo | Riscontro |
| --- | ---: | ---: | --- |
| Ultimo job di una risorsa, 500 letture | 565,86 ms | 4,45 ms | Scansione e ordinamento sostituiti da ricerca indicizzata. |
| Cronologia attività profonda, 200 letture | 235,25 ms | 11,12 ms | Il cursore diventa un limite dell'indice. |
| Ultima pagina della ricerca, 500 letture | 4.090,20 ms | 4,20 ms | Indice per ricerca e sequenza; nessun ordinamento temporaneo. |
| Eventi, 200 pagine da 50 partecipazioni | 5.274,14 ms | 1.407,16 ms | Ordine comprensivo dei piazzamenti nulli coperto dall'indice; filtri vuoti eliminati. |
| Lettura di 6.000 record carta | 646,32 ms | 293,47 ms | Ricerca per tipo e chiave successiva; statement riutilizzati. |
| Lettura di 12.000 valori | 1.390,70 ms | 715,59 ms | Seek sulla chiave, senza rileggere ogni prefisso. |
| Raccolta di 2.000 oggetti non più referenziati | 72.658,57 ms | 20,92 ms | Indici sulle relazioni entranti; la semantica di conservazione non cambia. |

Una seconda fixture contiene 180 snapshot con circa 46 MB di contenuti: il riepilogo precedente con `json_extract` richiede **79,83 ms**, quello nuovo **1,01 ms**, mediana di sette letture dopo una di riscaldamento nello stesso processo. Le proiezioni occupano 39.200 byte logici; gli originali restano invariati. La vecchia misura restituisce solo righe SQL, quella nuova comprende anche conversione al modello applicativo.

Il confronto della pipeline AI comprende anche le correzioni locali di APP-174: su 2.000 partecipazioni, 500 carte, 500 mazzi distinti e pagine Evento da quattro partecipazioni, la prima misura richiedeva **92,54 s**. La misura successiva ha richiesto **7,67 s**. Entrambe conservano 123 ricerche complete, 622 pagine, 3.449.899 byte di risultati, 500 carte, 500 mazzi e 2.000 partecipazioni. Le schede carta rilette durante la raccolta passano da 220.820 a zero nel caso nuovo senza storico da ricostruire; i riepiloghi di ricerca ricostruiti da 61.743 a 622. La riapertura continua a ricostruire lo stato dagli originali persistiti. La misura finale ripetuta è conservata nel JSON allegato; i tempi possono variare.

La ripetizione finale, escludendo le copie dei test in `.verify`, misura **13,02 s**. Il rapporto della raccolta [AI-COLLECTION-APP-174.md](AI-COLLECTION-APP-174.md) registra anche una baseline di 38,42 s con Node 24.18.0: la differenza fra esecuzioni evidenzia l'influenza del runtime e del carico concorrente. Non si ricava quindi un fattore stabile da 92,54/7,67; l'evidenza più robusta è l'eliminazione delle riletture, a conteggi invariati.

I numeri e i piani completi sono in [DATABASE-PERFORMANCE-METRICS.json](DATABASE-PERFORMANCE-METRICS.json). La baseline della raccolta proviene dalla copia isolata precedente alle ottimizzazioni APP-174; non è presentata come misura della sola aggiunta degli indici.

## Riscontri e correzioni

### 1. Cancellazioni e raccolta delle evidenze — priorità alta

`collectUnusedEvidence` costruisce l'insieme degli oggetti ancora raggiungibili, poi elimina gli altri. Per ogni oggetto SQLite verifica le tabelle che lo referenziano: mancavano gli indici su `child_hash` e sugli `object_hash` di valori, record, pagine e inventario Eventi. Il costo cresceva con il prodotto fra oggetti rimossi e appartenenze conservate. La cancellazione di un progetto o di una Strategia può invocare questo percorso anche con molti dati di altri progetti.

Aggiunti i cinque indici inversi. L'audit ha individuato anche nove relazioni non adeguatamente indicizzate fra progetti/versioni/adozioni/ripristini/guide, job e set Catalogo; sono ora coperte da indici specifici o dall'indice composto della cronologia job. Le tabelle figlie già coperte da PK o indici unici non ricevono duplicati.

Il controllo automatico per prefissi segnala ancora `deck_main_heads(project_id, version_id)`: è un falso positivo utile da esplicitare. `project_id` è già univoco, quindi il controllo legge al massimo una riga prima di confrontare `version_id`. Un secondo indice non eviterebbe una scansione. Gli oggetti condivisi fra job/progetti, le appartenenze attive e i checkpoint rimangono protetti dai vincoli e dal grafo di raggiungibilità.

### 2. Archivio AI e paginazione — priorità alta

- Sostituiti i filtri `(? IS NULL OR key > ?)` e gli equivalenti su tipo/cursore con forme SQL distinte per filtro presente/assente. I valori restano parametrizzati. Ora `EXPLAIN QUERY PLAN` mostra anche la chiave/cursore come limite della ricerca.
- Aggiunti gli indici per ultima pagina/sequenza, scorrimento per job/ricerca in ordine di `rowid`, ricerche per job e nomi archetipo. Gli indici con `rowid` implicito servono all'ordine di inserimento: un indice che aggiunge un'altra colonna fra job e `rowid` non è equivalente.
- L'indice Eventi precedente non copriva `placing IS NULL`. È sostituito da `(job_id, date DESC, placing IS NULL, placing, key)`, mantenendo ordine e collocazione dei valori nulli.
- La cache limitata dei conteggi resta per singolo archivio immutabile. La chiave distingue campo mazzo e campo carta anche quando uno dei filtri è vuoto; l'acquisizione dello snapshot la invalida. Non contiene tutti gli originali o i risultati delle ricerche.
- Riutilizzo limitato a 128 statement per connessione in archivio AI, job e Catalogo. Gli iteratori che possono restare aperti mentre il chiamante è sospeso conservano statement indipendenti. La lettura degli originali continua a verificarne dimensioni, ordine dei blocchi e SHA-256 dopo decompressione.
- Eliminato un ordinamento per chiave non necessario per sommare le statistiche di partecipazione; i risultati e l'ordine finale dei piazzamenti rimangono identici.

### 3. Polling, Strategie e Matchup — priorità alta/media

Il renderer controlla il job selezionato ogni 1,5 secondi. L'indice parziale dei soli job attivi proteggeva l'unicità ma non la ricerca dell'ultimo job, che include la cronologia. Aggiunto `(project_id, resource_id, created_at)`: la scansione inversa copre anche il tie-breaker `rowid DESC`, senza includere request/result JSON nell'indice.

La cronologia attività usa il limite `id < ?` direttamente; quella messaggi usa il confronto `(created_at, rowid) < (?, ?)`, conservando l'ordine dei timestamp uguali. I payload completi rimangono caricati solo nei percorsi che li richiedono. Gli elenchi di Strategie usano già riepiloghi e l'apertura della conversazione già limita i messaggi iniziali a 50.

Il recupero di un risultato Matchup cercava il `jobId` con `json_extract` su ogni revisione. L'indice di espressione consente una ricerca puntuale senza rileggere tutte le guide. Aggiunti indici per discussioni per archetipo, cronologia per progetto e ultimo Metagame. Le chiavi uniche e i controlli di appartenenza restano invariati.

### 4. Eventi Play e Regional — priorità alta/media

I riepiloghi estraevano piccoli campi dal JSON completo di ogni snapshot più recente: anche una risposta IPC piccola poteva leggere e analizzare megabyte di liste. Lo schema 15 aggiunge due tabelle di proiezione, `tournament_snapshots_summaries` e `main_tournament_snapshots_summaries`. Trigger transazionali seguono inserimenti e aggiornamenti; FK con cascade seguono eliminazioni. Il backfill aggiunge solo le proiezioni mancanti.

Le query selezionano ancora **l'ultimo snapshot inserito per evento**, senza cambiarlo con quello dal timestamp più alto. Conservano ordine per data/ID, booleani, copertura e assenza del dato pairing facoltativo. Duplicati `INSERT OR IGNORE` e rollback non alterano la proiezione. La data usata per ordinare gli iteratori arriva dal riepilogo piccolo. Le liste e i riferimenti storici non sono potati più aggressivamente.

### 5. Catalogo, aggiornamenti, avvio e backup

| Percorso analizzato | Valutazione / intervento |
| --- | --- |
| Catalogo per ID, coda e blocchi | PK e ricerca `print_id > ?` già adeguate; statement riutilizzati nei cicli; nuovo indice `set_id` per la FK. |
| Catalogo ricerca / identità / gameplay | Esistono cache e indici in memoria; un nuovo indice SQL sul nome non accelererebbe le ricerche eseguite in JavaScript. Rimangono le invalidazioni su salvataggi, rotazione e data. |
| Salvataggi Catalogo | Blocchi già transazionali; il confronto dei dettagli evita riscritture identiche. Conservate verifiche immagini e invalidazioni: saltarle potrebbe mantenere anteprime mancanti dopo un download. |
| Progetti, baseline, vincoli, adozione e ripristino | PK/indici composti e transazioni già presenti; completati indici FK, nessuna riduzione dei controlli di versione/revisione. |
| Aggiornamento giornaliero | Tre righe di stato, claim atomico, nessuna scansione di grandi tabelle. Nessun indice aggiuntivo utile. |
| Sincronizzazioni Eventi | Lookup evento già indicizzato; pruning legge metadati delle revisioni. APP-176 sostituisce la scansione dei vecchi JSON con riferimenti incrementali indicizzati. |
| Connessioni | Un file condiviso, cinque store più gli archivi AI attivi, backend nel worker. `busy_timeout=5000` uniformato agli store operativi; WAL conservato. SQLite mantiene un solo writer. |
| Pianificatore | Manutenzione `PRAGMA optimize=0x10012` all'avvio, dopo migrazione e prima dei job, con analisi limitata. Contesa BUSY/LOCKED rinvia questa sola manutenzione al prossimo avvio. |
| Integrità / migrazioni | Conservati `integrity_check`, `foreign_key_check`, backup coerente e marker `.verified`. Schema registrato dopo i controlli; upgrade da v14 provato anche con job sospeso, input, originale e risultato di chiamata già completato; v15→v16 verificato con evidenze legacy e proiezioni. |
| Durabilità e spazio | Nessuna modifica a `synchronous`, nessun `VACUUM` automatico, nessun checkpoint bloccante forzato, nessun limite di età che elimini il lavoro AI. |

## Costi e limiti residui

I punti 1–3 descrivono il residuo del primo audit e sono risolti nel completamento riportato sopra. Restano costi intrinseci e limiti di verifica al punto 4.

Gli indici hanno un costo di scrittura e spazio: la fixture SQL passa da 18.305.024 a 26.361.856 byte di pagine allocate, circa **8,1 MB aggiuntivi**. La fixture contiene oggetti quasi vuoti e molte chiavi, quindi questa percentuale non rappresenta il profilo reale con grandi contenuti compressi. Gli indici non includono BLOB, conversazioni, liste o payload delle risposte.

Gli interventi strutturali del primo audit hanno ora il seguente esito:

1. **Chiuso da APP-175 — Pagine Evento profonde:** gli offset salvati rimangono compatibili ma vengono risolti tramite ordinali indicizzati. La ricerca per sottostringa `instr` avviene alla prima materializzazione del filtro; le pagine successive riusano gli identificativi ordinati. Il limite di otto filtri evita una cache senza limite.
2. **Chiuso da APP-176 — Storico Matchup, versioni e candidate:** elenchi a finestre e dettagli mirati coordinati con UI, IPC, contesto AI e recupero; ogni elemento rimane raggiungibile. Gli endpoint integrali sono mantenuti solo per compatibilità.
3. **Chiuso da APP-176 — Riferimenti per retention/rotazione:** backfill delle citazioni legacy e aggiornamento transazionale tramite trigger. Le letture usano indici e identità compatte, conservando evidenze e regole di normalizzazione.
4. **Snapshot, compressione e controlli integrità:** grandi catture iniziali e controllo completo all'avvio restano proporzionali ai dati. Il worker protegge la finestra, ma altre operazioni sul backend possono attendere una fase sincrona. Non è stato verificato un profilo reale multi-GB, un disco lento, un disco pieno fisico o contesa fra più processi dell'app.

Non sono stati introdotti parametri di RAM/mmap/cache arbitrariamente grandi, indici su ogni colonna, disattivazione delle FK o compromessi di durabilità per migliorare il benchmark. Non è stata fatta una nuova generazione Codex; le prove di riapertura e reattività usano motore locale/SQLite reali con risposte modello sintetiche dichiarate.

## Verifiche e riproduzione

- Suite canonica: 321 test passati, 40 esclusi per integrazioni/benchmark opt-in; successivo test aggiuntivo v14→v15 passato con i 14 test delle migrazioni. Build/typecheck e controllo whitespace passati.
- Test SQL: accesso senza scansione/sort per ultimo job, ultima pagina, ordine Eventi e recupero Matchup; limiti di ricerca sulle pagine; lookup inversi delle FK; 135 elementi con nulli e parità, filtri interlecciati, iteratori concorrenti, lettura read-only dopo riapertura, isolamento dei job.
- Test proiezioni: backup v14, originali byte per byte, backfill, riapertura, duplicati, rollback, modifica e cascade; ordine determinato dall'inserimento anche con date di acquisizione fuori ordine.
- Electron Windows offline: progetti, import, riapertura, isolamento, migrazione ed errore di persistenza passati. Ripresa automatica, pausa volontaria, deadline quota e applicazione una sola volta del risultato salvato passati. Finestra/renderer reattivi durante cattura di 12.000 liste passati.
- Prova raccolta UI: collector/store reali, aggiornamento fase, polling, storico, 1280/640 px, pausa/riapertura e riuso del lotto completato passati. Il primo lancio Electron nel sandbox non era consentito; esecuzione successiva su profilo temporaneo fuori sandbox. Corretto anche un selettore del test smoke che confondeva progetto e pulsante azioni dopo APP-173.
- Linux/macOS, installazione di una nuova release, rete e carico personale non verificati in questo audit.

Da Node 24, in PowerShell, con `TEMP`/`TMP` diretti a una cartella di verifica autorizzata:

```powershell
npm test -- --exclude '**/.verify/**' --maxWorkers=2 --testTimeout=15000
npm run build
node tests/electron-smoke.mjs --offline

$env:POKEGURU_DB_PERF = '1'
npm test -- tests/database-performance.test.ts tests/tournament-summary.test.ts --exclude '**/.verify/**' --maxWorkers=1
Remove-Item Env:POKEGURU_DB_PERF

$env:POKEGURU_PERF = '1'
$env:POKEGURU_PERF_ROWS = '2000'
npm test -- tests/ai-collection-performance.test.ts --exclude '**/.verify/**' --maxWorkers=1
Remove-Item Env:POKEGURU_PERF
Remove-Item Env:POKEGURU_PERF_ROWS
```

Le variabili `POKEGURU_DB_PERF_OUTPUT`, `POKEGURU_SUMMARY_OUTPUT` e `POKEGURU_PERF_OUTPUT` consentono di salvare le rispettive misure JSON. L'esclusione `.verify` impedisce di eseguire anche le copie storiche locali dei test. I benchmark normali riproducono il codice attuale; i dati di baseline archiviati descrivono il codice precedente, non vengono rigenerati dal sorgente ottimizzato.

## Riferimenti tecnici consultati

- [SQLite — Query Planning](https://www.sqlite.org/queryplanner.html): indici composti, copertura e ordinamento.
- [SQLite — Foreign Keys, indici delle tabelle figlie](https://www.sqlite.org/foreignkeys.html#required_and_suggested_database_indexes): costo dei controlli senza indice sul lato referenziante.
- [SQLite — PRAGMA optimize](https://www.sqlite.org/pragma.html#pragma_optimize): statistiche dopo modifiche dello schema e lavoro di analisi limitato.
- [SQLite — WAL](https://www.sqlite.org/wal.html): coesistenza lettori/scrittore, checkpoint e limiti di concorrenza.
- [SQLite — synchronous](https://www.sqlite.org/pragma.html#pragma_synchronous): differenza fra prestazioni e durabilità al guasto dell'alimentazione; impostazione conservata.

- [SQLite — Row Values / Scrolling Window Queries](https://www.sqlite.org/rowvalue.html#scrolling_window_queries): confronto dei cursori e costo crescente di OFFSET.
