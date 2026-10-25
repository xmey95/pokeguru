# Archivio SQLite e recupero

Pokéguru conserva progetti, versioni, Thread, candidate, evidenze AI, Catalogo ed Eventi in `data/pokeguru.sqlite` sotto la cartella dati dell'app. Le preferenze AI sono in un file separato e non fanno parte del backup SQLite.

## Upgrade dello schema

La versione corrente è `PRAGMA user_version = 3`. La versione 0 indica l'archivio precedente alla registrazione esplicita delle migrazioni; la versione 1 precede il registro dei job Codex e la versione 2 precede l'archiviazione dei progetti. Prima di aprire gli store con una versione precedente, l'app crea con l'API backup di SQLite una copia consistente in `data/backups/pokeguru-pre-v<versione>-*.sqlite`. Un file accanto con suffisso `.verified` indica che, al momento della creazione, la copia ha superato `integrity_check` e `foreign_key_check`. I nomi sono univoci: una nuova prova dopo un'interruzione non sovrascrive il primo backup.

Solo dopo l'apertura degli store e i controlli di integrità dell'archivio aggiornato l'app registra la versione 3. Se l'upgrade si interrompe, la versione precedente resta registrata e il successivo avvio ripete i passaggi idempotenti. Una versione più nuova di quella supportata ferma l'apertura. Le revisioni Regional precedenti all'upgrade vengono conservate tutte.

## Archivio e cancellazione dei progetti

`projects.archived_at` è nullo per i progetti attivi, compresi quelli preesistenti dopo la migrazione. **Archivia** nasconde un progetto dalle viste operative senza modificarne liste, vincoli, Thread, candidate, guide o evidenze; **Ripristina** lo riattiva. Un job Codex in corso deve terminare o essere annullato prima di archiviare. La cancellazione è disponibile solo per progetti archiviati e richiede il nome esatto. In una transazione vengono rimossi i job AI e il progetto con le sue relazioni; Catalogo, snapshot Metagame ed Eventi globali restano condivisi. I file temporanei dei job registrati vengono puliti dopo la transazione.

La cancellazione rimuove il progetto dal database attivo, ma **non cancella i backup pre-upgrade già creati**. Queste copie sono indipendenti, possono contenere dati storici e vanno gestite dall'utente separatamente dopo aver valutato le esigenze di recupero. Anche i normali meccanismi del sistema, come copie esterne o pagine SQLite già scritte, non sono una garanzia di cancellazione fisica irreversibile.

## Job Codex e risultati

Un job Thread o Matchup in corso conserva il contesto in `ai_jobs` e l'output CLI in `data/ai-jobs/<id>/`. Dopo un'interruzione, all'avvio l'app applica un risultato completo una volta sola; un job senza risultato viene segnato come interrotto e può essere ripetuto dall'interfaccia. La cancellazione è registrata prima dell'arresto del processo. Quando il risultato è applicato o il job termina senza risultato, il contesto e la risposta duplicati vengono rimossi dal registro; le evidenze associate ai messaggi Thread e alle guide Matchup restano nell'archivio. Le directory temporanee di un processo terminato bruscamente possono richiedere pulizia successiva dopo aver verificato che il job non sia recuperabile.

## Prova di recupero senza sovrascrivere il profilo attivo

1. Chiudi Pokéguru. Conserva una copia dell'intera cartella dati attuale, inclusi eventuali file `pokeguru.sqlite-wal` e `pokeguru.sqlite-shm`.
2. Scegli un backup `.sqlite` accompagnato dal file `.verified`. Copialo in una **nuova cartella vuota** come `<profilo-di-prova>/data/pokeguru.sqlite`.
3. Avvia Pokéguru con la variabile d'ambiente `POKEGURU_DATA_DIR` impostata a `<profilo-di-prova>`. L'app può aggiornare questa copia alla versione corrente. Verifica progetti, versioni dei mazzi, Thread, evidenze, Catalogo ed Eventi offline.
4. Solo dopo questa prova valuta il ripristino del profilo attivo, mantenendo prima la sua copia. Non mescolare un database ripristinato con file WAL/SHM di un altro database.

Il backup pre-upgrade non è un archivio periodico: protegge quel passaggio di schema. La prova automatica usa esclusivamente database temporanei e verifica anche un backup creato mentre il database sorgente è in modalità WAL e aperto.
