# APP-250 — Misure del pianificatore riusate, gate offline superati

Verifica del 7 novembre 2026. **APP-250 Done per le correzioni e la qualificazione offline.** Il percorso completo passa i limiti invariati: **33,298 s a freddo / 0,907 s alla riapertura / 710,348 MiB**. La precedente misura negativa di 60,445 s è conservata nel [rapporto precedente](RESUME-DEVELOPMENT-OFFLINE.md). Non è stata sostituita da una ripetizione sullo stesso codice: il pianificatore ora evita di ricostruire e rimisurare gli stessi testi durante la medesima generazione.

**Zero chiamate reali, zero contenuti AI modificati manualmente, 0/3 nuove guide reali valide.** Restano da autorizzare la ripresa reale e da verificare le guide risultanti prima di rendere disponibile il percorso all’utente. Obiettivo generale e APP-232/APP-225 incompleti.

## Che cosa cambia

Una generazione crea un proprio pianificatore. Una memoria temporanea conserva soltanto prompt, conteggio dei token, byte e posizione dei dati serializzati, identificati da istruzioni, dati completi e schema esatti. Il limite è **64 voci / 8 MiB**, con espulsione delle voci più vecchie; una voce troppo grande non viene conservata. Non esiste riuso della memoria fra job o riaperture.

Ogni invocazione continua a esaminare le stesse codifiche candidate. **Calibrazione, famiglia, unità, output riservato, margine, chiamate disponibili, riserve future e ammissibilità sono ricalcolati sullo stato corrente.** Non si conservano decisioni, approvazioni, crediti o disponibilità di risorse. Un risultato codificato restituito al chiamante non può alterare il testo memorizzato. Cambi di dati, schema o istruzioni producono nuove misure. La tokenizzazione resta quella della libreria esistente, senza approssimazioni o suddivisioni ulteriori.

I soli ulteriori cambiamenti applicativi rispetto alla precedente verifica sono in guide-request-budget.ts e nel collegamento del pianificatore in matchup-guide-generation.ts; si aggiungono quattro test mirati. Restano le correzioni già descritte per ripresa esplicita e sviluppo fisico, senza cambiare i lettori originali o i limiti dei riesami negativi.

## Prove

| Verifica | Evidenza |
| --- | --- |
| Regressione pertinente finale | **338 casi / 34 file, zero fallimenti**, tutti sul codice finale; nessuna copia archiviata e nessun doppio conteggio |
| Typecheck e build | Passati; log .verify/app250-planner-build.log |
| Equivalenza indipendente | **31 richieste originali + 6 varianti di blocco = 37 confronti**; prompt, dati codificati e budget interamente identici al riferimento, anche al secondo uso |
| Autenticità del riferimento | Il JavaScript precedente confrontato è identico al file archiviato della v17; hash e script conservati in planner-reference-binding.json |
| Mutazioni e limiti | Test di variazione di calibrazione/capienza, schema/dati/istruzioni, oggetti restituiti, radice undefined/null, espulsione e istanze separate |
| Percorso completo sintetico | Due liste distinte, due setup con audit inizialmente null, lettori completi, critica finale indipendente, persistenza e riapertura; **38 risposte sintetiche, zero reali**, zero riparazioni |
| UI Electron offline | Otto capitoli, due scenari, esercizio, storico e IPC a 1440/1280/640 px, zero errori renderer |
| Conservazione | **30 risposte / 9.542 riferimenti**, tre DB con tutte le 39 tabelle e dieci archivi intatti |
| Sorgenti | **578 file** improntati: rispetto alla v17 13 modifiche e due nuovi test, altri 563 invariati |

La suite non è quella completa di tutto il repository; copre il percorso modificato, i vincoli, la persistenza, l’isolamento, gli audit e il pianificatore. Timeout e soglie restano invariati. I precedenti rapporti negativi restano leggibili.

La ripresa diretta su copia conserva lo stop senza intervento esplicito. Dopo intervento simulato raggiunge solo segment-finite-setup-scenario-1-round-1-opponent, prima del provider: circa **6,423 s / 5,069 s**, inclusa la verifica esterna dei riferimenti. Il costo stimato della richiesta resta identico: **61.335 token input / 6.000 output / 8.192 margine**, 422 campioni, fattore 1,6560121558488685. Le sole istruzioni dello sviluppo storico sono corrette; non esiste ancora un nuovo sviluppo prodotto e approvato dal modello.

## Avvio condiviso preparato senza rete

La futura ripresa APP-251 è predisposta in .verify/app251-resume-v18-20261107: stesso job Crustle, copie isolate con contabilità ereditata, poi nuovi job per gli altri due matchup. I vecchi database rimangono intatti. La simulazione usa **lo stesso ingresso di avvio e generazione del runner reale**, con un arresto prima del provider, per tutti e tre i matchup e due riaperture ciascuno. Tutte le evidenze ereditate sono confrontate integralmente; 175 moduli applicativi compilati coincidono con quelli qualificati. I replay passano anche i limiti prestazionali; picco 633,527 MiB.

Guardie, preparazione, calibrazione e codice sono sigillati: eba7165ddba44ead25546c7902165f6a214a09ebba417d120f90ff0062c0a81b. **Nessun grant e nessun run-started sono stati creati.** Lo sblocco del journal resta confinato alle copie di prova; dal vivo richiede l’autorizzazione esplicita alla riapertura. Nessun riavvio automatico dopo un esito non valido.

## Budget e lavoro ancora necessario

| Voce | Valore |
| --- | ---: |
| Chiamate già usate v28 / storiche | 443 / 519 |
| Tetti per matchup | 576 / 500 / 500 |
| Pool / riserva per ogni matchup successivo | 1.500 / 24 |
| Residui per matchup / pool | 133 / 500 / 500 — 1.057 |
| Manifest corrente: usate / massimo | 31 / 164 |
| Crediti di riparazione usati / residui | 6 / 10 |
| Massime nuove invocazioni nei profili preparati | 133 + 164 + 164 = **461** |

Il massimo operativo dei profili porterebbe a 904 v28 / 980 storiche. Non è una quota da consumare, una stima di costo o una garanzia di completamento. La sola fase corrente prenota almeno nove richieste, comprese le otto future riservate; non misura tutta la guida. Ogni guida termina appena valida; le successive iniziano solo dopo validità, persistenza, riapertura e UI della precedente. **Stop globale al primo esito non valido**, senza aumenti automatici.

La revisione del codice non trova ramificazioni introdotte per carte, liste o matchup: il riuso è strutturale e opaco rispetto alla strategia. Questo dimostra la generalità del meccanismo, non la qualità competitiva di ogni guida. Restano **tre guide reali valide, loro verifica dei contenuti e riesame della generalizzabilità**, quindi disponibilità dell’app per la prova dell’utente. Gli held-out restano esclusi; GUIDE_DELIVERY_NETWORK_READY resta false.

Evidenze principali: .verify/app250-planner-20261107/{verification.json,integrity.json,planner-equivalence.json,planner-reference-binding.json,standalone-integration.json,budget.json,generality-review.json}, .verify/app250-planner-regression-tests.json e .verify/app251-resume-v18-20261107/{verification.json,replay.json,guard.json,preparation.json,seal.json}.
