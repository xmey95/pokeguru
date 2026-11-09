# APP-237 — Prova bounded v11: arresto prima della creazione del job

L’utente ha autorizzato un nuovo job isolato, 522 chiamate cumulative sulla prima guida, 1500 nel ciclo e riserva 24 per ciascun matchup successivo. Gli altri due tetti restano 500. Baseline conservata: 358 chiamate v28, 434 storiche, nessuna delle tre nuove guide valida. Codice applicativo APP-236 invariato.

## Preparazione

Tre copie SQLite dai database terminali della v10 conservano conteggi, dati pubblici, liste esatte e fonti. Il nuovo job non deve riutilizzare i pass precedenti. Sono mantenuti 338 campioni di calibrazione, scaling dinamico, tutti i controlli nativi, semantici e finali. Il massimo prudenziale è 164 invocazioni per job: ora ammesso esattamente sulla prima guida. Massimo teorico di questa campagna 492 nuove invocazioni, 850 v28 e 926 storiche, sempre fermandosi prima se valide o al primo esito non valido.

Le guardie dei tetti asimmetrici, pool e riserve passano. I tre replay intercettano una richiesta prima del provider, senza chiamate reali; compilazione del runner riuscita. Questi replay **non sono sufficienti a qualificare l’avvio reale**: usavano una risorsa diversa da quella del runner reale e hanno quindi mancato un vincolo dello store.

## Esito reale

Il processo 20572 termina con exit 1 dopo 762 ms, prima di creare il nuovo job e prima di qualsiasi invio:

> Riprendi o annulla prima l’analisi in pausa.

Il database copiato conserva il job `2d6a4b8d-3ed2-4d41-8ec0-10961e92d4a2`, interrotto e riprendibile, sulla risorsa `bounded-delivery-1:crustle--n-s-zoroark`. `AiJobStore.start` impedisce correttamente un nuovo job sulla stessa risorsa. La preparazione del runner ha riutilizzato quella risorsa; il replay usava invece `offline-bounded-admission`. È un errore di orchestrazione della verifica, non un errore del servizio AI, un rifiuto del nuovo critico o un’insufficienza di token.

Non è stato cancellato o modificato il job precedente. Nessun nuovo job, raw o giudizio del modello esiste per questa campagna. Gli altri due matchup non sono partiti. Lo stop globale è rispettato; nessun riavvio o ulteriore invio dopo il terminale. Non è corretto dichiarare provato dal vivo il protocollo del critico corretto.

## Contabilità e integrità

| Voce | Risultato |
| --- | ---: |
| Nuove chiamate reali | 0 |
| Totale v28 / storico | 358 / 434 |
| Nuove guide valide | 0/3 |
| Residuo prima / seconda / terza | 164 / 500 / 500 |
| Pool residuo | 1142 |
| Riserve successive | 24 + 24 |

La verifica terminale conferma il sigillo di codice e input, tutti i file degli archivi v10/v9/v8, l’assenza di nuovi job e report e l’identità logica delle 39 tabelle di ciascuna copia rispetto alla relativa sorgente. I tre backup sono confrontati per contenuto logico; 784 file vengono archiviati con impronte. Le liste e i contenuti AI originali restano intatti. Il flag generale della generazione reale nell’app resta disabilitato.

Evidenze: [terminale](../../../.verify/app237-bounded-v11-20261106/terminal.json), [verifica terminale](../../../.verify/app237-bounded-v11-20261106/verification-terminal.json), [archivio immutabile](../../../.verify/app237-bounded-v11-20261106-archive/manifest.json).

## Ripresa

La campagna v11 è conclusa e non va rilanciata. Prima di un’altra campagna occorre predisporre l’isolamento della risorsa e verificare offline **lo stesso percorso di creazione del job usato realmente**, includendo una copia con un job interrotto riprendibile. La soluzione deve mantenere lo storico, i conteggi e la protezione dello store; non eliminare il vecchio job per far passare il gate. Non serve aumentare il budget per correggere questo difetto.

APP-237 è Done limitatamente all’esecuzione tentata e alla verifica dell’esito negativo. APP-238 Backlog per l’orchestrazione e i gate di isolamento. APP-232/APP-225 e l’obiettivo generale restano incompleti. Nessuna nuova campagna è preparata o autorizzata automaticamente.
