# APP-252 — Budget delle correzioni e ripresa verificata offline

Verifica del 7 novembre 2026. La campagna v18 è terminata con **0/3 nuove guide valide**. Il primo job conserva 40 risposte complete, 41 tentativi, 432 campioni di consumo e tutti i 9.768 riferimenti presenti al terminale. La contabilità resta **453 chiamate v28 / 529 storiche**. Questa attività non invia richieste reali e non riapre la campagna terminata.

## Correzione generale

Il preflight ora considera separatamente invocazioni totali, posizioni base e riserva per le correzioni. Prima di inviare un gruppo verifica tutti i gruppi non ancora pagati e i riesami obbligatori già noti, deduplicando le posizioni. I metadati di prenotazione restano nel coordinatore: non cambiano dati, schema, istruzioni o identità delle richieste AI.

Un token plan entro i limiti non basta per dichiarare una richiesta pronta. Se mancano correzioni, il job registra un blocco strutturato con disponibilità e minimo necessario, senza impegnare un tentativo. L’interfaccia riconosce anche lo stop v18 già persistito: mostra 123 invocazioni residue e **0 correzioni residue su 16**, con almeno una necessaria per la fase pendente. Il messaggio spiega che il lavoro è salvato e che serve un’autorizzazione esplicita; non suggerisce di ricrearlo per azzerare i consumi.

Le prenotazioni rappresentano il lavoro già noto, non il costo garantito dell’intera guida. Scelte, partizioni, risultati e rilievi successivi possono rivelare altre richieste. Il preflight viene rivalutato ogni volta, insieme allo scaling e alla calibrazione originali.

## Eventuale estensione esplicita

Il default resta 16 correzioni e il manifest originale rimane immutato: 148 posizioni base, massimo 164 invocazioni. Un’API riservata al codice chiamante può aggiungere una concessione collegata a job, progetto, manifest e prefisso esatto della storia, solo dopo una decisione esplicita. Non esiste un percorso dall’output del modello a questa API; essa non riprende il job né invoca il provider.

Le ricevute precedenti restano v1; quelle successive a una concessione sono v2 e includono il suo hash. Il lettore verifica la catena completa, impedisce aumenti retroattivi, diramazioni, ancore superate, concessioni durante richieste senza esito e superamento della capacità residua. Il limite dei due errori di formato e dei due giudizi negativi per posizione logica resta invariato, anche dopo una concessione.

La proposta sottoposta a decisione è **16→32 correzioni per ciascuno dei tre job**, conservando il massimo totale 164 per job. È una diversa ripartizione della capacità locale, non un aumento delle invocazioni totali o dei tetti cumulativi. Il codice non adotta questa proposta sui database reali. Manca ancora un comando dedicato nell’interfaccia per concedere e riprendere: l’API e la diagnostica non equivalgono a quel percorso di prodotto completo.

## Verifiche

Le prove e i risultati finali sono registrati in `.verify/app252-repair-budget-20261107/verification.json`. Non sono prove della qualità di una nuova guida reale.

- Test di preflight, prenotazioni, isolamento, ancore, concatenazione, riapertura e permanenza dei limiti; regressione pertinente, typecheck e build.
- Percorso sintetico completo con due liste distinte, due setup inizialmente privi di audit, lettori originali completi, approvazione finale indipendente, persistenza e riapertura senza provider. Con concessione simulata: **35,703 s a freddo / 1,080 s a caldo / 654,324 MiB**, entro le soglie invariate 60 s / 10 s / 768 MiB. Anche il percorso senza concessione è verificato; il risultato precedente rimane conservato.
- Copia del job fermato senza concessione: due aperture restituiscono `repair-calls` senza nuovi tentativi. Copia con concessione simulata: raggiunge soltanto `review-premise-main`, con prompt identico alla richiesta 42 non inviata nella v18 (**92.104 byte**, hash `9361ddae93ffbd4c30d62985abe0d3f6123bf5f1f7f6747eb3d122dd77991598`). Un provider fittizio interrompe ogni apertura prima di qualsiasi rete. Le 40 risposte e i 9.768 riferimenti rimangono identici.
- Le simulazioni con interruzione consumano tentativi solo nelle copie; non sono richieste gratuite trasferibili al job reale. I risultati su copie non diventano approvazioni del contenuto originale.
- Guida sintetica storica riaperta con 36 tentativi invariati, otto capitoli e zero invii; compatibilità del formato precedente conservata.
- Electron/SQLite/IPC e renderer verificati a 1440, 1280 e 640 pixel: guida completa e diagnostica nuova/precedente, nessun errore renderer o overflow. Metagame congelato e database isolati; nessuna integrazione AI reale dichiarata verificata da questi test.
- 580 file source/test improntati: 15 modificati e due nuovi rispetto alla qualificazione v18, altri 563 invariati. Tutte le 39 tabelle di ciascuno dei tre database reali, inclusa `sqlite_sequence`, confrontate con l’archivio; undici archivi precedenti verificati. Nessuna concessione sui job reali.

## Budget prima di una nuova decisione reale

| Risorsa | Crustle–N’s Zoroark | Alakazam/Dudunsparce–Basic Box | Dhelmise–Lucario/Hariyama |
| --- | ---: | ---: | ---: |
| Chiamate cumulative usate | 453 | 0 | 0 |
| Tetto cumulativo | 576 | 500 | 500 |
| Disponibilità cumulativa | 123 | 500 | 500 |
| Massimo delle nuove richieste nei profili preparati | 123 | 164 | 164 |
| Correzioni già usate nel job da riprendere | 16 | 0 | 0 |
| Quota locale proposta, da autorizzare | 32 | 32 | 32 |

Pool 1.500, residuo 1.047 e riserva 24 per ciascuna guida successiva invariati. I profili consentirebbero al massimo **451 nuove invocazioni**, 904 v28 / 980 storiche se fossero tutte consumate: è un limite, non una previsione né una quota da consumare. Per la prima fase pendente il minimo osservato è nove invocazioni complessive, inclusa la riserva futura già nota, e almeno un credito di correzione; non è una stima del completamento.

La eventuale campagna v19 riprende il medesimo primo job su una copia isolata collegata alla contabilità precedente; gli altri due job sono nuovi e partono solo dopo una guida valida, persistita, riaperta e verificata in UI. Stop globale al primo esito non valido, nessun riavvio o aumento automatico, nessun contenuto AI corretto manualmente, held-out esclusi. Stessi dati pubblici e servizio OpenAI tramite Codex.

La vecchia autorizzazione v18 è consumata. **Nessuna nuova chiamata prima della decisione esplicita sulla quota di correzione e sulla riapertura**, dopo il superamento dei gate offline. Le tre nuove guide e il riesame della generalità con esiti reali restano da completare; l’app non è ancora dichiarata pronta alla prova finale dell’utente.

## Qualificazione conclusiva

**361 test distinti / 35 file pertinenti, zero fallimenti o skip**, typecheck/build e gate offline passati. Non è la suite completa del repository. Il primo tentativo del nuovo test delle risorse conteneva un timeout per un fixture di140invocazioni: conservato il rapporto negativo, sostituito il fixture con il controllo esatto del confine, senza aumentare i timeout. Nessun test archiviato contato.

La v19 è preparata e congelata in .verify/app253-resume-v19-20261107, sigillo 1a3c85346b293d317c398f5f4734ee384e8ec534fcc3f08db6a0f04838c8a136. Tutti e tre gli avvii usano lo stesso coordinatore della prova reale, con concessione simulata esclusivamente sulle copie di replay: sei ingressi intercettati, nessun provider, nessun nuovo job nei database preparati. Confermate tutte le39tabelle per ciascuno dei tre database. Nessuna autorizzazione, concessione effettiva o run-started creati. APP-252 Done per questo incremento offline; APP-253 Ready tecnico, senza autorità di rete.

Riesame successivo in sola lettura: [generalità e matrice di completamento APP-255](GENERALITY-COMPLETION-AUDIT.md). Non cambia codice, sigillo, proposta o autorità di rete.
