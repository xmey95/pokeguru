# APP-151 — diagnosi e candidata di recupero locale (27-10-2026)

## Stato

Il profilo Windows `%APPDATA%\Pokeguru\data\pokeguru.sqlite` fallisce anche in sola lettura con `malformed database schema`; per questo Eventi Play mostra «Archivio tornei non leggibile». La causa iniziale della corruzione non è determinata. Nessun file del profilo attivo è stato sostituito. L'app è stata chiusa prima della copia.

I tre file attivi (`pokeguru.sqlite`, `pokeguru.sqlite-wal`, `pokeguru.sqlite-shm`) hanno copie byte per byte, con SHA-256 coincidenti, in `%APPDATA%\Pokeguru\data\backups\forensic-app151-20261027\`. I rispettivi hash sono `901EBA962B11C2E0D37E0E3D96D7667F084FB5CA35B0CA041EF93833C359E6E3`, `CB7087BE935656A16E719B9A6A8684DFEECC94746BC295EFDF26321BE29F9B29` e `8F84ED0477A4F21B83BEC08B305ACDE88BFC3E30A858E47089B80464B7B04788`.

## Copie confrontate

| Dato | Backup integro del 26 ottobre | Candidata ibrida |
| --- | ---: | ---: |
| Progetti / versioni / Thread | 1 / 3 / 4 | 1 / 3 / 4 |
| Messaggi Thread | 32 | 37 |
| Stampe Catalogo / target | 3303 / 3275 | 3303 / 3275 |
| Snapshot Play / eventi distinti | 296 / 296 | 355 / 324 |
| Snapshot Regional / eventi distinti | 23 / 16 | 23 / 16 |
| Discussioni / turni Matchup | 3 / 5 | 3 / 5 |
| Job AI | 20 | 24 |

Il backup sorgente è `%APPDATA%\Pokeguru\data\backups\pokeguru-pre-catalog-rotation-2026-04-10-b25ae37c-5873-4219-99c8-067aa3ca53b0.sqlite`, modificato il 26 ottobre alle 11:31:55 UTC, SHA-256 `5E95B3B625693C815E22C755E769C9168947BCCF3257A0D292B6493B54B704FF`. Passa `integrity_check` e `foreign_key_check`.

La candidata è `%APPDATA%\Pokeguru\data\backups\pokeguru-app151-hybrid-2026-10-27.sqlite`, SHA-256 `092FC1AF3A20F621D368276313EB3E269761910DA97E8CA62F1BC28F8E0EC198`. È stata costruita su una copia del backup aggiungendo 59 snapshot Play validi, 5 messaggi Thread e 4 record di job AI con stato `applied` estratti dalla copia danneggiata insieme al WAL; la data di aggiornamento del Thread interessato è stata riallineata. Gli snapshot aggiunti arrivano al 27 ottobre, 19:13:42 UTC. I payload Play aggiunti sono JSON validi con ID ed evento coerenti. Una riga con forma di snapshot aveva payload vuoto ed è stata esclusa. Nessuna riga recuperata ha sovrascritto record già presenti nel backup.

Il recupero è stato eseguito con il client SQLite ufficiale 3.54.1, `.recover --ignore-freelist` dopo `PRAGMA writable_schema=ON` su una copia. SQLite [avverte](https://www.sqlite.org/recovery.html) che il recupero può produrre righe mancanti, alterate o precedentemente eliminate: la candidata non dimostra la completezza del profilo originale. Due discussioni Matchup successive al backup sono identificabili, ma le istantanee Meta cui fanno riferimento e i relativi report non sono ricostruibili dal dump; non sono state inserite come record incompleti. I quattro job AI aggiunti non contengono più richiesta o risultato, quindi non ripristinano quelle guide.

## Verifiche e prossima azione

Sulla candidata conservata: `PRAGMA integrity_check` → `ok`, `PRAGMA foreign_key_check` → nessuna violazione, nessun payload Play JSON invalido. Build e typecheck del ramo `task/app-151-sqlite-recovery` riusciti. In Electron avviato con un profilo temporaneo distinto e aggiornamento automatico disattivato, le API di Progetti, versioni, Thread, Catalogo, Play e Regional sono riuscite; un evento Play e un Thread si aprono, e la pagina Eventi non mostra l'errore. Non è stata eseguita una prova sull'installazione utente con la candidata attiva.

Attendere la scelta esplicita dell'utente tra la candidata ibrida e il solo backup integro prima di sostituire i file del profilo attivo. In entrambi i casi mantenere intatta la copia forense. La candidata conserva più dati recenti, ma le due analisi Matchup citate restano mancanti; il solo backup perde anche i 59 snapshot Play, i 5 messaggi Thread e i 4 record di job AI recuperati.
