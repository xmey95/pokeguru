# APP-225 — Politica applicativa e requisiti di attivazione

**Aggiornamento04-11-2026 Europe/Rome:** [policy v4](POLICY-APP-V4.md) riallineata al fallback lossless corrente:30 mirati/typecheck/build e prova UI sintetica reale16→32 con riapertura,nessuna ripresa automatica,provider disabilitato e screenshot1440/640 ispezionati. Copia non adottata;663/44 è la suite canonica corrente,non una full della copia.167 chiamate v28,0/3 reali valide;consenso epoca17 già pendente,nessuna nuova domanda o AI. Le note successive sono cronologia.

**Aggiornamento04-11-2026 Europe/Rome:** [policy v3](POLICY-APP-V3.md) allineata agli input app659/epoca16:669 test passati/44 esclusi,typecheck/build e audit dei tre contratti v28 effettivi. Copia isolata non adottata;defaultv27/guardv28 invariati. Il controllo UI delle guide reali è preparato e tipizzato,non eseguito. La campagna corrente è in CAMPAIGN-EPOCH16.md;le note successive descrivono checkpoint storici e non lo stato attuale di APP-225.

Audit corrente 03-11-2026:124 chiamate v28,200 includendo le76 precedenti,0/3 nuove valide. Epoca10 terminale e archiviata;linee native completate,94 checkpoint. Metadata richiedono due richieste per veri limiti hard dei token e cinque chiamate complessive controquattro residue sul primo. Proposta epoca11 pronta ma non autorizzata136/184/riserva24;reali128/176/riserva24 restano invariati. Codice app identico ai644 test/build,policy isolata654/UI non adottata,defaultv27/guardv28. Nuova ripresa richiede consenso specifico.

**Checkpoint precedente, superato:** Audit aggiornato il 03/11/2026: 88 chiamate v28, 164 con le 76 precedenti, 0/3 nuove guide valide. La ripresa epoca9 è pronta offline ma il consenso128/176/riserva24 è pendente; i tetti reali restano96/144/riserva24. Nessuna modifica al codice congelato. Un [componente isolato](APP-BUDGET-CANDIDATE.md) per scelta ed estensione è verificato con quattro test SQLite e typecheck, ma non è adottato né collegato a IPC/UI. Le sezioni distinguono comportamento applicativo presente e lavoro residuo.

## Risposta che l’app deve rendere vera

Quando l’utente chiede una guida, il ciclo costruisce, verifica e corregge automaticamente quanto necessario **entro il budget dell’analisi**. Si arresta appena ottiene una guida valida oppure incontra un limite o un errore che non consente di continuare. Non garantisce che un numero finito di invocazioni basti. Un rifiuto del critico non viene trasformato in approvazione per completare il lavoro; una bozza respinta non sostituisce una guida valida precedente.

Il consenso dato nella chat alla campagna96/144/riserva24 riguarda quei job isolati. Non è il limite ordinario dell’app né l’autorizzazione a impostarlo silenziosamente per tutte le guide.

## Stato verificato nel codice

| Punto | Evidenza | Stato |
| --- | --- | --- |
| Limite ordinario | `src/main/guide-call-budget.ts`: `GUIDE_MAX_ATTEMPTS=16`; versioni storiche precedenti alla v24 usano otto | Presente; non aumentato |
| Eccezioni persistenti | `guideAttemptLimit` valida job/progetto/impronta e conserva il grant nel relativo archivio | Presente, esercitato da `tests/guide-call-budget.test.ts` |
| Collegamento ordinario | `prepareDeepGuide` in `src/main/backend.ts` chiama `generateDeepGuide` senza `attemptLimit` o autorizzazione eccezionale | Nessun trasferimento implicito del pool della campagna |
| Versione e attivazione | `src/shared/matchup-guide.ts`: default v27; `src/main/matchup-guide-generation.ts`: v28 senza runner esplicito respinta | Guardie conservate; nuova generazione non attiva nell’app |
| Retry di trasporto | `src/main/ai-call-retry.ts` conserva conteggio e scadenza nel journal; normalmente tre fallimenti per network/timeout/quota, non tre per tutta la guida | Presente, dentro il tetto complessivo |
| Riprova esplicito | `AiJobStore.retryAfterIntervention` rinnova solo alcuni blocchi di trasporto/autenticazione/storage/unknown | Presente; non rinnova budget di guida, schema, contesto o contenuto |
| Scaling | `runGuideSegmentPhase` divide i batch sovradimensionati, conta tutti i gruppi non in cache e conserva le riserve future | Presente; un output-limit di una singola unità non viene risolto continuando a dimezzarla |
| Arresto senza progresso | Lo scheduler rifiuta un retry con identità invariata dopo il rifiuto; la nuova richiesta deve includere lo stato/feedback versionato | Presente; non equivale a una prova generale di convergenza semantica |
| Pubblicazione | `assertGuideSegmentApproval` lega guida, fonti, scope e critica finale corrente; il backend prepara il risultato solo dopo `generateDeepGuide` | Gate presente; tre guide reali correnti ancora mancanti |
| Limiti nella UI | `src/renderer/src/AiLimits.tsx` mostra chiamate, residuo, stime, consumi parziali, motivo dello stop e disponibilità Codex con data/reset | Presente; quota percentuale e token stimati restano distinti |

Questa lettura del codice non è una nuova prova end-to-end. La copertura applicativa corrente è in `verification-plan-choice.json`:641 test passati/43 esclusi, typecheck/build e quattro replay su copie. I quattro test del candidato isolato sono separati e non aumentano il totale della suite applicativa. Le prove di UI/persistenza sintetiche precedenti non dimostrano le tre guide reali richieste.

## Politica da collegare prima dell’attivazione

1. **Budget iniziale esplicito.** La schermata di avvio mostra il tetto complessivo dell’analisi e la stima disponibile, con l’avvertenza che può aumentare dopo il piano o una critica. Il main process valida e persiste la scelta, legata a job, progetto e impronta iniziale della richiesta. Nessun tetto arbitrario ricevuto dal modello o trasferimento da un altro job. Le estensioni delle fonti seguono la catena verificata già presente.
2. **Previsione progressiva.** Prima del primo invio si può mostrare soltanto il costo stimabile dai dati locali. Il piano AI e i successivi rilievi possono rivelare altri rami: ricalcolare prima di ogni richiesta non in cache. Non presentare il minimo corrente come prezzo finale o garanzia di completamento.
3. **Autonomia entro il tetto.** Critiche negative, riparazioni dei soli testi o del registro, suddivisioni e retry ammessi procedono automaticamente senza chiedere conferma a ogni iterazione. Ogni tentativo effettivo, anche fallito, consuma il tetto durevole. Le chiamate già pagate sono riusate soltanto con identità e validazione compatibili.
4. **Riesami riservati.** Non spendere il residuo in una costruzione che non lascia chiamate sufficienti alle verifiche obbligatorie note. Nessuna riduzione delle fonti, dei rami necessari, degli audit o della critica per rientrare nel budget.
5. **Estensione separata dalla ripresa.** Se il limite locale non basta, mostrare consumato/residuo/minimo corrente e conservare il lavoro. Il normale Riprova non aumenta il tetto. Un’eventuale azione di aumento mostra il nuovo massimo cumulativo e le invocazioni aggiuntive, poi persiste il nuovo grant; non azzera i contatori e non promette successo.
6. **Arresti distinti.** Quota dell’account, budget locale, contesto, output, schema/parametro rifiutato, autenticazione e guasto sconosciuto richiedono messaggi coerenti con le evidenze. Il reset della quota non modifica i limiti locali. Gli unknown non ricevono retry automatici illimitati. Per errori non identificati non attribuire la causa ai token senza prova.
7. **Dati durevoli e guida precedente.** Pausa, shutdown e ripresa mantengono liste, feedback, registri e risultati compatibili; nessuna ripartenza da zero obbligatoria o pubblicazione di bozze. Dopo una modifica alla lista o al matchup non riutilizzare silenziosamente grant o approvazioni appartenenti a un’altra richiesta.
8. **Disponibilità onesta.** Mostrare il residuo Codex soltanto se il servizio lo comunica, con timestamp e prossimo reset. Il consumo di un errore senza usage resta sconosciuto/parziale: non imputare zero token come consumo certo e non convertire percentuali della quota in token.

Il numero ordinario definitivo e la riserva iniziale non sono scelti in questo audit. Le stime fredde storiche 18/18/20 erano già superiori a 16, ma non sono una nuova calibrazione della versione corrente. Prima di attivare v28 servono una policy numerica sostenuta dalle prove reali, la selezione/estensione del budget nel flusso applicativo e i relativi controlli di main process, persistenza e isolamento. Cambiare soltanto `GUIDE_PROMPT_VERSION` lascerebbe questo requisito incompleto.

## Audit dei cinque criteri dell’obiettivo

| Criterio | Evidenza attuale | Esito e lavoro residuo |
| --- | --- | --- |
| Tre guide complete autonome | Archivio epoca10, ledger reale e assenza dei report; Crustle ha121 principali più tre diagnostiche, altri job zero | Non raggiunto:0/3; ripresa epoca11 congelata e verificata offline, non ancora autorizzata |
| Integrità, persistenza, isolamento, ripresa e UI delle guide reali | 644 test, quattro replay con121 tentativi/94 checkpoint conservati e audit degli archivi; test Electron della policy positivo su profilo sintetico | Incompleto: verificare salvataggio, riapertura, attestazioni e UI su ciascuna guida reale valida; la UI sintetica non dimostra questo criterio |
| Generalità | Moduli generici senza condizioni per i tre matchup; regressioni indipendenti e selezione held-out precedente ai risultati | Incompleto: nessuna prova reale held-out autorizzata. Slowking–Sharpedo/Toxtricity e Rocket’s Honchkrow–Alakazam/Dusknoir restano esclusi; il secondo condivide una famiglia Alakazam e ha indipendenza parziale già dichiarata |
| Policy di budget/retry/arresto | Copia policy-app-v2 collegata a backend/preload/UI e allineata al checkout;654 test/44 esclusi,35 mirati,typecheck/build e test Electron positivo;nessuna adozione | Incompleto: calibrare il limite ordinario dai risultati e adottare/verificare sul codice definitivo;nessun aumento implicito |
| Nuovo percorso e app utilizzabile | Build di sviluppo passa, default v27 e guardia v28 preservati | Non raggiunto: attivare soltanto dopo i criteri precedenti e verificare il flusso completo nella build locale destinata all’utente |

Ordine operativo: riapertura autorizzata della campagna congelata, tre guide valide entro i tetti, audit reali/UI, valutazione indipendente autorizzata, policy applicativa e relativi test/integrazione, attivazione e verifica della build utilizzabile. Correzioni generali eventualmente richieste dai risultati si archiviano e verificano prima di una nuova epoca; nessun aumento automatico del budget o aggiramento dello stop.

Aggiornamento17:55 Europe/Rome:utente autorizza128/176/riserva24 e si avvia epoca9,handle36444. Il [collegamento nella copia dell’app](POLICY-APP-CANDIDATE.md) passa22 mirati/typecheck/build eRPCworker con riapertura,ma il nuovo controllo non è verificato interattivamente perchéElectron non raggiunge la finestra. Nessuna adozione nel codice congelato o attivazionev28;policy finale ancora incompleta.

## Esito della suite ampia e riesame del pacchetto

La suite della copia è terminata:650 pass,un fallimento e44 esclusi. L’unico fallimento è nel controllo del pacchetto Codex incluso:la copia isolata risolveva il CLI esterno e non conteneva il pacchetto nativo ufficiale installato nel checkout. Copiato soltanto quel pacchetto dalla dipendenza già installata,con impronte binarie identiche,il riesame dei sei test Codex passa. Sono651 test unici verificati cumulativamente sui medesimi sorgenti;non è una singola esecuzione completa verde. I462 input congelati restano invariati. Il candidato non è adottato e precede la nuova correzione delle riserve di pianificazione:richiede riallineamento e verifica prima dell’adozione. La campagna epoca9 è ora terminata a115 chiamate v28/191 storiche e0/3 nuove valide. Nessuna AI invocata da questi controlli.

## Follow-up del selettore iniziale

Il controllo interattivo standalone passa anche sul selettore iniziale a1440/640:valore15,frazione32,5 e9007199254740992 disabilitano l’invio;32 lo abilita. L’invio tramite preload ebackend reali viene respinto dal guard della versione non attiva prima di creare un job. Solo le risposte readonly di disponibilità eMeta sono simulate per mostrare il controllo altrimenti nascosto;il Meta sintetico usa un ID numerico valido. Job,tentativi,report e database sorgente restano invariati,zeroAI e nessun errore renderer/overflow. Screenshot ispezionati. Questo verifica UI/validazione e guardia,non un’accettazione del nuovo percorso o la calibrazione iniziale.

I primi tentativi non sono verdi:query di audit su una colonna inesistente e ID non numerico della vecchia fixture;corretti soltanto nello script. Log policy-initial-ui{,-2,-3}.log e failure.json conservati;pass in policy-initial-ui-4.log e policy-initial-ui/result.json. Tutti i462 input della copia e478 della campagna restano identici,quindi la suite654 non è stata ripetuta.

Il consenso epoca10 resta pendente da tre turni consecutivi;il lavoro offline necessario è completato e la prossima attività dipende dalla riapertura esplicita. TaskAPP-225 Blocked,obiettivo non completato. initial-ui-block-audit.json conserva controllo del blocco e limiti delle prove.
