# APP-185 — Panoramica e aggregati degli Eventi

## Risultato e perimetro

Nei nuovi workflow v3 partecipazioni e abbinamenti alimentano aggregati deterministici per lista esatta, evento e avversario. Carte e liste restano integrali; gli originali non vengono eliminati. Modello ed effort non cambiano. Lista base, vincoli, data di riferimento e schema delle tabelle accompagnano ogni foglia e sintesi.

L'incremento parte da dev 677a8c3, dopo APP-179–181. È autorizzato fino al merge in dev; non comprende release, aggiornamento dell'app installata o nuove chiamate AI reali. Il job personale avviato con v0.3.8 non è stato interrotto o modificato. I workflow v1/v2 mantengono rappresentazione e checkpoint precedenti.

## Contratto delle evidenze

- `events.overview` accetta la finestra temporale senza obbligare a scegliere prima un archetipo. Restituisce frequenze delle etichette della fonte, liste complete, partecipanti restituiti e lacune. Il denominatore riguarda le liste locali complete, non il metagame globale. I nuovi snapshot censiscono anche eventi senza liste; quelli precedenti dichiarano questa mancanza.
- Ogni lista esatta riceve partecipazioni, risultati nel torneo, piazzamenti e segmenti per evento. Le etichette originali non sono normalizzate in una tassonomia competitiva.
- I matchup contano separatamente i lati dei giocatori selezionati, associati tramite evento e identificativo del giocatore. W/L/T è il denominatore; bye, doppie sconfitte, esiti mancanti o invalidi e identità ambigue sono distinti. Non si sommano i due lati come incontri unici. Il risultato complessivo nel torneo non viene spacciato per risultato di un matchup.
- `events.details` recupera gli originali di una lista esatta già acquisita nel job, con filtro evento opzionale e paginazione. Tutte le pagine richieste entrano nell'analisi; la dimensione della pagina non limita il totale dei risultati.
- Materializzazione, inventario e metriche sono persistiti per job e contenuto. Un lotto completato si riusa dopo pausa/ripresa; un altro progetto non può leggerne aggregati o dettagli. Nessuna migrazione SQLite.
- La diagnostica esporta solo conteggi e byte: tipo di record, lotti toccati e query identificate da ordine/operazione. Non esporta domande, filtri, liste, persone, identificativi, percorsi o credenziali. L'attribuzione per query conta soltanto record introdotti per la prima volta; sui vecchi archivi non misurati il valore è assente, non zero.

## Misura sul campione reale APP-184

Il benchmark legge esclusivamente la copia privata già verificata da [APP-184](AI-LIVE-JOB-AUDIT.md), senza invocazioni del modello e senza scritture nella copia. L'ordine dei record e il partizionamento da 60.000 byte corrispondono alla nuova preparazione dell'analisi. Risultati pubblicabili in [AI-EVENT-AGGREGATES-METRICS.json](AI-EVENT-AGGREGATES-METRICS.json).

| Misura | Originale | Con aggregati |
| --- | ---: | ---: |
| Record destinati all'analisi | 101.505 | 15.930 |
| Lotti foglia | 872 | 344 |
| Byte JSON dei lotti | 51.974.677 | 20.036.920 |

Riduzione delle foglie: **60,55%**. Riduzione dei byte: **61,45%**. L'obiettivo di massimo 350 foglie sul campione è raggiunto includendo gli aggregati sostitutivi; non è un tetto applicato ai dati. Restano 1.010 schede, 7.343 liste esatte, 7.343 aggregati, 233 record di ricerca e un riepilogo di copertura.

La riconciliazione controlla tutti i 7.343 aggregati contro risultati e piazzamenti precedenti; riconta 16.212 partecipazioni, 69.364 abbinamenti unici e 80.405 lati dei giocatori selezionati. La somma degli esiti dei matchup coincide con questi ultimi. Nel campione non risultano abbinamenti non associati o identità selezionate ambigue; i casi mancanti e ambigui sono coperti separatamente con fixture.

La misura mantiene le query già eseguite: non predice quali query sceglierà un futuro planner grazie alla panoramica. Non misura token, costo, durata complessiva o equivalenza della qualità tattica. Una prova appaiata con il modello reale resta un esperimento successivo con budget autorizzato. Nessun dato personale o database del campione è versionato.

## Verifica e riproduzione

I test dedicati verificano conteggi, ambiguità, metadati, paginazione, contabilità, persistenza, isolamento e compatibilità. La prova di pausa usa risposte sintetiche e controlla il mancato reinvio della foglia completata. Le prove Electron offline usano profili temporanei; non certificano una nuova analisi AI reale.

Comandi ordinari con Node 24: `npm run typecheck`, `npm test -- --maxWorkers=2 --testTimeout=15000`, `npm run build`. Il benchmark privato è escluso normalmente: si abilita indicando `POKEGURU_EVENT_SNAPSHOT`, `POKEGURU_EVENT_JOB` e, facoltativamente, `POKEGURU_EVENT_METRICS`, poi eseguendo `npx vitest run tests/ai-event-aggregates.test.ts`. Il file viene aperto in sola lettura; la destinazione delle metriche deve essere distinta dal database.

Gli esiti finali di consegna e i riferimenti CI sono nel task APP-185 del [backlog](BACKLOG.md); il merge verificato è registrato dalla PR e dalla cronologia Git.
