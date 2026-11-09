# APP-224 — Prefissi verificati e controprove locali

02 novembre 2026. Incremento locale verso il nuovo obiettivo completo. Nessuna nuova chiamata AI, guida approvata o release.

## Risultato

Il registro esistente ora ha un percorso separato di costruzione per uno, due o tre turni completi. Non richiede turni futuri fittizi o rami segnaposto. Riusa proiezione delle zone, copie fisiche, pagamenti, legalità dei turni, promozioni obbligatorie, osservazioni del mazzo, audit e controlli sulle transizioni applicabili. I controlli di completezza su sviluppo, repliche, calcoli finali, capitoli ed esercizi restano nel percorso completo di pubblicazione.

Un journal conserva dichiarazioni native e ricevute per ogni turno. È vincolato a progetto, job, dipendenze, configurazione e packet completo. Le ricevute sono ricalcolate quando il journal viene riletto: l’hash non sostituisce i validatori. Un’append non valida non cambia il journal accettato; una diramazione copia soltanto un prefisso già verificato, con le medesime carte disponibili. Il prototipo verifica il roundtrip JSON, non ancora il collegamento al ciclo produttivo SQLite dell’app.

Le controprove del critico hanno caso, turno, lato, hash della linea criticata e hash del prefisso. Il seguito usa gli stessi schemi nativi e le stesse pescate ordinarie del caso; deve arrivare all’orizzonte esaminato o dimostrare una fine effettiva. Una variazione soltanto della prosa non è una controlinea. È possibile esaminare già il primo turno, prima di costruire tutto il seguito. Il risultato certifica soltanto l’eseguibilità meccanica modellata: effetti condizionali, danni e superiorità tattica richiedono critica indipendente. Nessuna controprova approva la guida o elimina automaticamente un rilievo.

## Evidenze

- Inventario in `.verify/app224-segments-20261102/critic-inventory.json`: 15 critiche formalmente accettate, 27 contestazioni, tutte con azioni alternative descritte. Il contratto precedente non conteneva controlinee eseguite dal validatore. Questo dato non dimostra che le contestazioni siano errate: verdetti e testi originali restano invariati.
- Replay in `replay.json` e `replay.log`: 12 linee native archiviate, 36 turni accettati separatamente, eventi finali uguali agli eventi proiettati originali. Sei linee Crustle, tre Alakazam e tre Dhelmise. Database aperti in sola lettura, hash prima/dopo identici, zero report nei tre archivi. Le linee sono versioni di costruzioni locali; nessuna diventa una guida approvata.
- Nove test indipendenti in `tests/guide-segments.test.ts`: prefisso incompleto non pubblicabile, stock e audit, ordine e primo turno, roundtrip e isolamento dei contesti, append atomica, rami indipendenti, manomissioni, transizioni e promozioni, controlinee impossibili/incomplete, pescate cambiate e sole riscritture respinte, critica anticipata sull’orizzonte di un turno.
- Suite ampia `full-tests.log`: 545 passati, quattro errori e 44 esclusi. Tre errori erano timeout espliciti a 20 secondi nei test di recupero; rieseguiti isolatamente con timeout e asserzioni originali, tre passati (`recovery-recheck.log`). Il quarto era EACCES sul solo listener 127.0.0.1; il file passa con accesso loopback (`loopback.log`, tre test). Due ulteriori casi del nuovo file sono stati aggiunti e verificati dopo la raccolta della suite ampia. Totale univoco verificato: 551 test, senza modificare asserzioni o timeout dei test storici.
- `preservation.json`: 254 file della copia sorgente usata dal vivo in epoch6 e tutti gli 11 manifest degli archivi precedenti corrispondono agli hash originali. Il sorgente di lavoro ora contiene modifiche locali successive: non è il codice congelato della prova reale.

I log di typecheck e build e il riepilogo finale sono nella stessa directory di verifica. I test locali non attestano convergenza AI, miglioramento competitivo, integrazione del nuovo generatore o generalizzazione su nuove guide reali.

## Lavoro ancora necessario

APP-225 collega questi contratti al generatore, alla persistenza del lavoro, alla critica anticipata e alla ripresa, conservando prompt/cache storici e tutti i controlli finali. Occorre invalidare i discendenti quando cambia un prefisso e pianificare le richieste con la riserva di conclusione. Una risposta o controprova critica non valida deve tornare al critico, senza promuovere il contenuto.

Il risultato complessivo resta 0/3 guide valide e 76 chiamate storiche. I limiti esterni restano 28 per guida, 84 totali, residue 2/3/3 sugli stessi job. Nuovi job o tetti richiedono consenso prima delle prove reali, con codice, dati, budget e stop fissati. Dopo tre guide complete valide restano integrità, persistenza, isolamento, UI ed evidenze e una valutazione su casi non usati per tarare il metodo.
