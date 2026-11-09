# APP-220 — Uscite senza KO e ripetizione dei tre matchup

Verifica conclusa il 1 novembre 2026. **0/3 guide valide, 42/48 invocazioni reali**, massimo 16 per guida. Nessun contenuto AI corretto manualmente, nessuna eccezione di budget, tutti i controlli e lo scaling dinamico conservati. Il criterio delle tre guide valide fallisce; la prova circoscritta è completata con esito negativo.

| Matchup, sulla nostra lista esatta di prova | Invocazioni | Residue | Minimo richiesto all’arresto | Esito |
| --- | ---: | ---: | ---: | --- |
| Crustle — N’s Zoroark | 14 | 2 | 5 | Critica degli scenari negativa |
| Alakazam/Dudunsparce — Basic Box | 13 | 3 | 4 | Critica degli scenari negativa |
| Dhelmise — Lucario/Hariyama | 15 | 1 | 2 | Critica finale negativa |

Sono gli stessi sei archetipi, liste e dati di APP-219: liste pubbliche esatte usate in progetti isolati, senza adozione nel profilo personale. Catalogo e tornei archiviati al 30 ottobre, finestra 1–30 ottobre: 128 eventi Play e quattro Main deduplicati. La generazione è reale verso OpenAI tramite Codex, modello gpt-6.1-sol con profondità automatica; non è una nuova acquisizione del metagame. Preparazione e preflight iniziano con zero chiamate. Pacchetti iniziali da 60/75/67 fonti, zero lacune. La selezione non è stata rifatta dopo gli esiti.

## Correzione generale

I nuovi job usano v26. `other` mantiene i suoi vincoli: una uscita è riconosciuta dai movimenti espliciti e genera `board-exit`/`boardExits` derivati, con fonte, pila evolutiva e assegnate. Destinazioni mano, mazzo, scarti e Zona Perduta sono controllate; nessun Premio viene inventato. L’uscita dell’Attivo richiede promozione esplicita se la partita continua. Setup e ogni ramo usano lo stesso tracker, ripristinato dalla posizione iniziale del ramo. Identità ambigue richiedono dichiarazioni del proprietario/copia, senza spostamenti aggiunti dal programma.

Durante la prima epoca un test aggiuntivo ha scoperto un difetto del nuovo tracker dopo il KO di una copia identica. Il codice in esecuzione è rimasto fermo fino alla terminalità e all’archiviazione. Poi sono stati corretti consumo delle assegnate della copia rimossa, scambi atomici fra copie, proprietari non presenti al momento dell’assegnazione e conflitti con i percorsi Energia. Le fixture sono indipendenti dai matchup e dai nomi delle carte.

Il replay originale Alakazam 13 di APP-219 passa con i movimenti AI invariati: le quattro false segnalazioni sul rientro dalla Panchina diventano step derivati controllati. Questo non approva manualmente la vecchia guida. Le proiezioni native già accettate nella nuova campagna rimangono identiche con il tracker finale.

## Due epoche, un solo budget

Prima epoca: 223 file congelati, tre nuovi job/database, tutte le **42 invocazioni reali**. Sei audit passati e [archivio immutabile di 105 file/database](../../../.verify/app220-exits-20261101/archive-epoch1/archive.json).

Dopo la correzione meccanica: 504 test e cinque regressioni supplementari passati, typecheck e build riusciti, 224 file congelati. Ripresi gli **stessi job**, con i contatori 14/13/15 e lo stesso limite 16/48. Il callback del budget ha fermato tutti e tre prima dell’invio: **zero nuove invocazioni**, perché le riserve non coprono la conclusione. Non sono state aumentate le soglie, redistribuite chiamate o create generazioni sostitutive. Gli ultimi affinamenti del tracker sono quindi verificati offline e nella ripresa delle cache; non è dimostrata una nuova generazione completa sul codice finale.

Tutti i valori di evidenza già archiviati sono conservati con gli stessi hash; anche i 46 file dell’archivio APP-219 sono intatti. I sei audit cumulativi finali passano. Zero report salvati: nessuna nuova guida valida da verificare in UI. Le tre guide storiche valide restano leggibili e integre; non sono state rilanciate.

## Cause finali e limiti

- Crustle: dopo le correzioni di Flashing Barrier e dello sviluppo tramite Petrel, il critico rileva una scelta difensiva che consuma Switch ed espone tre Premi senza beneficio dimostrato rispetto all’attacco disponibile di Crustle.
- Alakazam: il critico rileva un attacco che richiede tre Energie Grass alimentato con due Grass e una Psychic; il seguito difensivo omette recupero, evoluzione e attacco più forte. Nei tentativi precedenti vengono respinti segnaposto, carte non disponibili e pescate dai Premi come se fossero nel mazzo.
- Dhelmise: arriva agli otto capitoli, ma il riesame finale rileva una falsa esclusione di Gwynn: Banette era scartabile prima di scegliere l’evoluzione. Una sola chiamata residua non basta a correggere e riesaminare.

Un output-limit è gestito con ricostruzione automatica del singolo caso; nessuna risposta incompleta è applicata. Uso osservato parziale: 2.976.776 token input, 424.750 output, 183.936 cached input; una invocazione senza usage. Questi dati non certificano il consumo completo o il costo economico.

Il tracker non è un simulatore completo: applicabilità e condizioni degli effetti restano oggetto della critica indipendente; la devoluzione parziale non è una uscita dell’intero Pokémon. I testi di fonte usati sono inglesi. Conservati 168 hash storici v11–24 e dodici v25. Nessun routing per nomi o identificativi dei matchup nel nuovo tracker. Questo dimostra riuso strutturale e regressioni risolte, **non affidabilità generale della generazione entro 16 chiamate**. La convergenza e la costruzione vincolata di risorse/costi restano lavoro futuro; le revisioni incrociate fra contratti nativi diversi richiedono copertura dedicata. Nessuna release o installazione effettuata.

## Evidenze

- [Rapporto leggibile, rilievi e bozze conservate](../../../.verify/app220-exits-20261101/report.html), [metriche](METRICS.json), [audit finale](../../../.verify/app220-exits-20261101/final-audit.json).
- [Snapshot prima epoca](../../../.verify/app220-exits-20261101/frozen-code.json), [snapshot finale con contatori iniziali 42](../../../.verify/app220-exits-20261101/frozen-code-final.json), [correzioni fra epoche](../../../.verify/app220-exits-20261101/applied-candidate.json).
- [Chiamate e transazioni](../../../.verify/app220-exits-20261101/campaign-final-audit.json), [token e timeout](../../../.verify/app220-exits-20261101/execution-audit.json), [accessi](../../../.verify/app220-exits-20261101/access-audit.json), [output/schema](../../../.verify/app220-exits-20261101/output-protocol-audit.json), [contesto del critico](../../../.verify/app220-exits-20261101/review-context-audit.json), [readback](../../../.verify/app220-exits-20261101/final-readback.json).
- [Integrità delle epoche e degli input originali](../../../.verify/app220-exits-20261101/code-audit-final.json), [replay originale](../../../.verify/app220-exits-20261101/replay.json), [guide storiche](../../../.verify/app220-exits-20261101/historical.json), [proiezioni reali invariate](../../../.verify/app220-exits-20261101/candidate-live-replay.json).
- [504 test](../../../.verify/app220-exits-20261101/full-tests-final-candidate.log), [cinque regressioni](../../../.verify/app220-exits-20261101/regression-final-candidate.log), [build](../../../.verify/app220-exits-20261101/build-final-candidate.log), [sei audit finali](../../../.verify/app220-exits-20261101/audit-final.log).
- [Archivio finale](../../../.verify/app220-exits-20261101/archive/archive.json), [coerenza conclusiva](../../../.verify/app220-exits-20261101/consistency.json).
