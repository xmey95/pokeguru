# Archivio SQLite e recupero

Pokéguru conserva progetti, versioni, Thread, candidate, evidenze AI, Catalogo ed Eventi in `data/pokeguru.sqlite` sotto la cartella dati dell'app. Le preferenze AI sono in un file separato e non fanno parte del backup SQLite.

## Analisi AI in sospeso

Da v0.3.4 lo stato del job è in SQLite e il workflow con i lotti completati è in `data/ai-jobs/<id>`. Questi file contengono dati privati del progetto: includili nel backup dell'intera cartella dati se vuoi conservare anche la possibilità di riprendere un'analisi. La sola copia SQLite non include i checkpoint. L'app riaperta mostra la ripresa disponibile ma non avvia chiamate Codex automaticamente; i checkpoint vengono rimossi dopo applicazione o annullamento dell'analisi.

## Upgrade dello schema

La versione corrente è `PRAGMA user_version = 9`. La versione 0 indica l'archivio precedente alla registrazione esplicita delle migrazioni; la versione 1 precede il registro dei job Codex, la versione 2 precede il collegamento persistente del primo messaggio AI del Thread (APP-109), la versione 3 precede l'archiviazione dei progetti (APP-106), la versione 4 precede l'attesa persistente dei job Catalogo (APP-104), la versione 5 precede gli ID delle corse Catalogo (APP-121), la versione 6 precede le tabelle di rotazione (APP-123), la versione 7 precede l'aggiornamento giornaliero (APP-120) e la versione 8 precede lo storico strutturato delle liste (APP-125). Prima di aprire gli store con una versione precedente, l'app crea con l'API backup di SQLite una copia consistente in `data/backups/pokeguru-pre-v<versione>-*.sqlite`. Un file accanto con suffisso `.verified` indica che, al momento della creazione, la copia ha superato `integrity_check` e `foreign_key_check`. I nomi sono univoci: una nuova prova dopo un'interruzione non sovrascrive il primo backup.

Solo dopo l'apertura degli store e i controlli di integrità dell'archivio aggiornato l'app registra la versione 9. Se l'upgrade si interrompe, la versione precedente resta registrata e il successivo avvio ripete i passaggi idempotenti. Una versione più nuova di quella supportata ferma l'apertura. Le revisioni Regional precedenti all'upgrade vengono conservate tutte.

## Versioni della lista e correzioni

`deck_versions` conserva il testo immutabile delle liste principali e `deck_main_heads` indica la versione corrente. Un testo diverso importato, un'adozione o un ripristino di contenuto diverso crea una nuova `vN`. La provenienza del ripristino è in `deck_restores`; etichette e note sono in `deck_version_annotations`. Le correzioni d'identità sono snapshot separati in `deck_resolution_revisions`: cambiarle non incrementa `vN`. Ogni ripristino applica le correzioni salvate con la versione scelta, quando disponibili, e crea una revisione nuova. Per versioni storiche anteriori a v9 è nota soltanto la correzione della lista corrente al momento della migrazione; le altre rimangono non ricostruibili e richiedono una nuova verifica. Il ripristino è transazionale e rifiuta una versione o revisione corrente cambiata nel frattempo.

Un Thread registra versione e revisione di partenza; se la lista principale cambia, la prosecuzione da una candidata apre un Thread collegato e lascia l'originale intatto. Le nuove guide Matchup conservano entrambi gli ID oltre allo snapshot del Metagame. Una guida precedente viene associata alla corrente solo se il suo hash coincide con il contesto corrente e una sola versione conserva quel testo; in tutti gli altri casi rimane storica senza `vN` attribuita. L'hash può includere le correzioni d'identità, quindi il solo testo non prova una corrispondenza. Una vecchia guida non ritorna corrente solo perché il testo viene ripristinato in una nuova `vN`.

## Archivio e cancellazione dei progetti

`projects.archived_at` è nullo per i progetti attivi, compresi quelli preesistenti dopo la migrazione. **Archivia** nasconde un progetto dalle viste operative senza modificarne liste, vincoli, Thread, candidate, guide o evidenze; **Ripristina** lo riattiva. Un job Codex in corso deve terminare o essere annullato prima di archiviare. La cancellazione è disponibile solo per progetti archiviati e richiede il nome esatto. In una transazione vengono rimossi i job AI e il progetto con le sue relazioni; Catalogo, snapshot Metagame ed Eventi globali restano condivisi. I file temporanei dei job registrati vengono puliti dopo la transazione.

La cancellazione rimuove il progetto dal database attivo, ma **non cancella i backup pre-upgrade già creati**. Queste copie sono indipendenti, possono contenere dati storici e vanno gestite dall'utente separatamente dopo aver valutato le esigenze di recupero. Anche i normali meccanismi del sistema, come copie esterne o pagine SQLite già scritte, non sono una garanzia di cancellazione fisica irreversibile.

## Job Codex e risultati

Un job Thread o Matchup in corso conserva il contesto in `ai_jobs` e l'output CLI in `data/ai-jobs/<id>/`. Dopo un'interruzione, all'avvio l'app applica un risultato completo una volta sola; un job senza risultato viene segnato come interrotto e può essere ripetuto dall'interfaccia. La cancellazione è registrata prima dell'arresto del processo. Quando il risultato è applicato o il job termina senza risultato, il contesto e la risposta duplicati vengono rimossi dal registro; le evidenze associate ai messaggi Thread e alle guide Matchup restano nell'archivio. Le directory temporanee di un processo terminato bruscamente possono richiedere pulizia successiva dopo aver verificato che il job non sia recuperabile.

## Aggiornamento Catalogo

Il job Catalogo conserva modalità, coda delle stampe e numero di dettagli riusciti in SQLite. Un blocco completato è atomico: dopo un'interruzione si ripartono solo le stampe ancora in coda. Una scheda non disponibile resta in coda, ma non ferma le altre; se tutte le schede di un blocco falliscono, l'app si ferma per limitare le richieste. Dopo 429/503 o un errore temporaneo di rete, l'ora di ripresa viene salvata e rispettata, anche quando la fonte invia `Retry-After`. Nella sessione attiva il job riprova automaticamente al termine dell'attesa; dopo un riavvio resta recuperabile ma non parte senza un clic su Riprendi. La pausa manuale resta tale dopo il riavvio; l'annullamento ferma il job ma conserva le carte già acquisite. Avviare una nuova operazione dopo l'annullamento rilegge il manifest, senza cancellare i dettagli precedenti.

Le miniature WebP TCGdex e PNG Limitless sono file locali in `data/catalog-images`, fuori dal backup SQLite. Dopo il ripristino del solo database, il Catalogo mostra segnaposti per i file mancanti e il successivo aggiornamento online li rimette in coda. Il fallback Limitless è limitato alle stampe esatte dei set `mee`, `mep`, `sve` e `svp`; un 429/503 da indice o CDN sospende il job con la stessa attesa persistente delle richieste TCGdex.

## Cambio della rotazione Standard occidentale

Il Catalogo acquisisce solo i marchi dal primo ammesso dal pacchetto verificato della release. Dopo che tutti i dettagli del job sono stati acquisiti, una transazione toglie da `catalog_prints` le stampe con marchio precedente. Solo quelle con identità verificata e citate da liste, candidate, vincoli, messaggi Thread o guide Matchup restano in `catalog_retired_prints`; i risultati delle query AI salvate contano come citazioni. La mancanza di una stampa nel manifest non autorizza la rimozione di una stampa corrente già acquisita. Le schede storiche esatte possono ancora aiutare la riconciliazione, senza scaricare ristampe vecchie in massa o dichiarare legalità odierna.

Al primo blocco Play o Regional della nuova rotazione, l'app richiede una prima pagina indice leggibile. Poi elimina i payload precedenti da `tournament_snapshots` e `main_tournament_snapshots`; `historical_event_references` conserva solo ID, nome, data e URL degli snapshot citati da messaggi Thread o query AI delle guide. Le evidenze incorporate in Thread e guide restano nei relativi progetti. La stessa transazione azzera entrambe le code e registra i conteggi. Gli elenchi globali e le nuove analisi leggono solo snapshot correnti. Un job precedente non può riscrivere un evento fuori rotazione; se l'indice fallisce o manca una regola inclusa per la data, l'archivio resta intatto.

Prima di eliminare righe esistenti viene creato un backup SQLite consistente con suffisso `.verified` in `data/backups/pokeguru-pre-catalog-rotation-<data>-*.sqlite` o `pokeguru-pre-events-rotation-<data>-*.sqlite`. La transazione rende atomici riferimenti minimi, cancellazione, cursori e risultato. Il backup non comprende le immagini in `data/catalog-images`. SQLite può riutilizzare le pagine liberate senza ridurre subito la dimensione del file; i backup verificati sono copie separate da gestire. I riferimenti non più citati vengono raccolti al successivo passaggio, con un backup prima della loro rimozione.

## Prova di recupero senza sovrascrivere il profilo attivo

1. Chiudi Pokéguru. Conserva una copia dell'intera cartella dati attuale, inclusi eventuali file `pokeguru.sqlite-wal` e `pokeguru.sqlite-shm`.
2. Scegli un backup `.sqlite` accompagnato dal file `.verified`. Copialo in una **nuova cartella vuota** come `<profilo-di-prova>/data/pokeguru.sqlite`.
3. Avvia Pokéguru con la variabile d'ambiente `POKEGURU_DATA_DIR` impostata a `<profilo-di-prova>`. L'app può aggiornare questa copia alla versione corrente. Verifica progetti, versioni dei mazzi, Thread, evidenze, Catalogo ed Eventi offline.
4. Solo dopo questa prova valuta il ripristino del profilo attivo, mantenendo prima la sua copia. Non mescolare un database ripristinato con file WAL/SHM di un altro database.

Il backup pre-upgrade non è un archivio periodico: protegge quel passaggio di schema. La prova automatica usa esclusivamente database temporanei e verifica anche un backup creato mentre il database sorgente è in modalità WAL e aperto.
