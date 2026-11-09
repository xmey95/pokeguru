# APP-232 — Conteggi verificabili nelle motivazioni degli audit

**Esito reale successivo:** la campagna v5 su nuovi job si è fermata con 0/3 guide valide dopo 26 chiamate, per falsi positivi linguistici del filtro degli audit. Le prove offline di questa pagina non ne attestano il successo. Stato corrente in [FINITE-CAMPAIGN-V5.md](FINITE-CAMPAIGN-V5.md).

05-11-2026. Correzione generale e verifica offline richieste dall’utente dopo la campagna v4. **Nessuna nuova chiamata reale; restano 294 v28 / 370 storiche e 0/3 nuove guide valide.** I tetti sono invariati: 500 cumulativi per guida, 1.500 v28 e 24 riservate per ciascuna guida successiva. APP-232 In progress, APP-225 Blocked.

## Correzione

Le quantità vengono ora raccolte **dal medesimo replay del registro** che controlla carte, movimenti, pagamenti e campo. Non esiste un secondo calcolo degli inventari nella preparazione dei prompt. Per entrambi i lati vengono conservati totale della lista e saldi delle zone prima e dopo ogni evento, comprese pescate automatiche, evoluzioni, assegnazioni, scarti e carte entrate dai Premi. La carta sotto un’evoluzione rimane nella pila, senza tornare ricercabile nel mazzo. Gli zeri derivano da finestre complete, non da omissioni.

Le finestre conservano anche destinatari e copie fisiche delle carte assegnate. Si possono citare quantità complessive di una zona oppure quantità presso uno specifico Pokémon/copia; un destinatario assente o ambiguo viene respinto. La normalizzazione già esistente di KO e Premi resta invariata: le finestre degli eventi Premio ripiegati sul KO lo dichiarano esplicitamente, senza simulare un inventario precedente alla risoluzione congiunta.

Il nuovo trasporto `guide-finite-audit-2` distingue quattro tipi di frammenti:

- motivazione qualitativa;
- quantità con finestra, lato, stampa, zona, destinatario opzionale e valore;
- nome di una carta presente nella lista;
- valore stampato con fonte, per esempio PS, ritirata, costo o danno base dell’attacco.

Il codice verifica il valore quantitativo e compone la sua citazione con l’ambito esplicito. Il confronto prima di una scelta può usare soltanto la sua finestra precedente; le promozioni usano la finestra precedente al movimento pertinente. Il totale della lista è distinto dalle copie rimaste nel mazzo. Costi e danni **stampati** sono etichettati come tali: non diventano pagamenti o danni effettivi dimostrati.

Il testo qualitativo non accetta cifre o i numerali e quantificatori italiani/inglesi controllati, compresi `un/una/one` e formulazioni come `due`, `single` o `both`. Le quantità non possono essere spostate in lettere per aggirare il controllo; i nomi con numeri hanno un frammento dedicato. Rimangono gli stessi limiti finali delle motivazioni: 1.000 caratteri per decisione, 1.600 per confronto, 600 per promozione. La riserva di output comprende la rappresentazione strutturata e resta soggetta allo scaling e ai limiti locali.

Non è un analizzatore semantico universale del linguaggio: verità delle affermazioni qualitative, scelta della finestra pertinente al consiglio, condizioni degli effetti, costi effettivi e qualità tattica restano compiti del lettore completo e del critico indipendente. Nessuno di questi controlli è stato rimosso o sostituito dal rendering dei numeri.

## Provenienza, cache e correzioni successive

I nuovi job richiedono il contratto quantitativo anche per audit che arrivano già completi dal costruttore. Le ricevute vincolano ogni campo composto a contesto, risposta AI originale e hash del testo. La riapertura ricostruisce i certificati dagli originali; un hash di testo modificato non è sufficiente a renderlo valido. I contesti delle finestre precedenti non cambiano quando viene aggiunto un turno successivo, quindi gli audit validi non vengono ricomprati.

Una politica durevole per job distingue la lettura delle fonti storiche dal nuovo contratto e impedisce un successivo downgrade. Le riparazioni storiche pagate vengono ricostruite dalle risposte originali nel loro formato: convertirle in nuove richieste prima di leggere un rifiuto successivo avrebbe comprato nuovamente il lavoro. Questa lettura non approva un vecchio conteggio né azzera i rifiuti.

Il gate dei conteggi si applica anche ai casi completi, a tutte le linee e ai rami terminali, prima della prosa e dopo una transazione di correzione. Una patch nativa non può introdurre numeri liberi negli audit aggirando il trasporto iniziale. Può conservare citazioni quantitative ancora vere nel contesto o esprimere qualitativamente le nuove condizioni; i campi fisici numerici e le prove restano obbligatori. Il critico controlla comunque completezza e approfondimento della motivazione.

Due risposte quantitative invalide fermano la relativa unità, anche alla riapertura. Restano anche due costruzioni complete locali, due rifiuti indipendenti della premessa e i limiti delle correzioni dei casi. Il setup registra ora anche l’hash della versione con audit che è stata respinta: ripetere gli stessi audit pagati non riapre il callback negativo e non compra un nuovo tentativo. I record storici senza questo campo restano autenticati e leggibili. Se l’interruzione segue soltanto il primo rifiuto completo, la riapertura salta il risultato già respinto e usa la seconda proposta ancora disponibile; dopo il secondo rifiuto si ferma. La regressione aggiuntiva prova entrambi i passaggi, senza terzo tentativo.

Non sono introdotte regole per Crustle, N’s Zorua, un mazzo o un matchup nei moduli di produzione. La regressione su quelle carte è un controllo locale aggiuntivo del difetto osservato.

## Verifiche eseguite

**449 test distinti passati, 1 esclusione storica, 44 file. Typecheck e build passati.** Regressione larga di 448 casi, poi rieseguiti tutti gli otto test del setup dopo l’ultima correzione di ripresa: sostituiscono i sette dello stesso file già conteggiati, senza doppio conteggio. La regressione include inventari prima/dopo pesca e pagamento, totale lista contro disponibilità, zeri espliciti, lati diversi, finestre future non ammesse, pile evolutive, Premi, destinatari delle Energie, nomi con numeri, quantità scritte in lettere, originali mancanti, certificati alterati e due rifiuti locali persistenti. Un test del ciclo completo introduce un conteggio libero in una patch tardiva: viene respinto localmente, corretto nel retry previsto e riesaminato prima della prosa; la riapertura non aggiunge chiamate sintetiche.

Cinque processi dedicati su copie dei tre database reali, senza provider e senza risposte AI simulate. Le soglie restano 60 s a freddo, 10 s alla riapertura, 768 MiB. Il tempo freddo comprende importazione e lettura degli originali, escludendo solo la copia SQLite.

| Prova | Risultato | Freddo | Riapertura | Picco RSS |
| --- | --- | ---: | ---: | ---: |
| Vecchio job Crustle | stesso `draft-limit`, zero invii | 1,514 s | 1,154 s | 315,9 MiB |
| Nuovo job Crustle su copia | si ferma prima del piano | 0,669 s | 0,041 s | 310,0 MiB |
| Nuovo job Alakazam/Dudunsparce su copia | si ferma prima del piano | 0,688 s | 0,038 s | 318,4 MiB |
| Nuovo job Dhelmise su copia | si ferma prima del piano | 1,274 s | 0,228 s | 346,9 MiB |
| Profilo isolato del nuovo audit sul registro reale | si ferma prima della chiamata | 2,037 s | 0,731 s | 465,1 MiB |

L’ultima riga misura il solo preparatore dell’audit con la normalizzazione applicativa e i medesimi planner/codec, **non una ripresa del coordinatore del vecchio job**. Una regressione locale usa due dichiarazioni sintetiche sul registro reale: il valore errato di due N’s Zorua nel mazzo è respinto; quello corretto di uno viene composto con la finestra. Non è una motivazione AI approvata né un risultato competitivo.

Dieci input precedenti modificati intenzionalmente, quattro sorgenti nuovi, **687 altri input congelati invariati**; 527 file correnti improntati. Archivio v4 di **720 file intatto**; tre database reali invariati ed equivalenti ai backup su schema e 39 tabelle ciascuno, basi v3 preservate. I fallimenti intermedi dei test e dei replay rimangono conservati; sono stati corretti adattatori dei fixture, recupero dei formati storici e corrispondenza della validazione delle patch, senza eliminare le asserzioni di integrità.

## Ripresa e budget ricalcolato

**Il vecchio job non ha una ripresa automatica valida:** ha già due rifiuti indipendenti. Il nuovo codice conserva lo stop, prima di qualsiasi nuova richiesta. Non viene presentata la rigenerazione del solo audit come un modo di ottenere un terzo riesame su quel job.

Per una successiva prova reale con questo contratto servono **nuovi job isolati**, mantenendo nel conteggio tutte le chiamate dei job precedenti e senza importarne approvazioni. Gli ingressi sono verificati offline sulle copie: massimo residuo **206** per il nuovo job Crustle, massimo **500** per ciascuno degli altri, pool residuo **1.206**, con riserva 24 invariata. Nessun nuovo job reale è stato creato.

Calibrazione invariata: **274 campioni reali**, fattore conservativo **1,5933849345675073**. Target input 96.000, massimo input 128.000, totale 176.000, margine 8.192, massimo 500.000 byte e 100.000 caratteri di risposta. Nessun campione sintetico aggiunto.

| Ingresso osservato offline | Input stimato | Output riservato | Riserva di chiamate future | Soglia d’ingresso |
| --- | ---: | ---: | ---: | ---: |
| Piano freddo Crustle | 67.447 | 6.000 | 44 | 45 |
| Piano freddo Alakazam/Dudunsparce | 84.223 | 6.000 | 44 | 45 |
| Piano freddo Dhelmise | 57.959 | 6.000 | 44 | 45 |
| Audit quantitativo isolato, solo diagnostico | 62.946 | 12.000 | 18 | 19 |

Le soglie sono prenotazioni della fase nota, non minimi certificati per completare una guida. Il budget dell’audit isolato non riapre il vecchio job. Il formato nuovo non è ancora provato dal vivo; un’unità irriducibile può ancora fermarsi ai limiti di capienza.

Riferimenti seriali condizionali per **tre guide fredde**: due scenari, R risposte complete non terminali per scenario, fino a sette turni storici per setup, un quadro e un audit per turno nativo, una richiesta per evento. Inclusi piani, metadata, otto capitoli, due esercizi e tutti i riesami indipendenti.

| R per scenario | Altri eventi per turno oltre all’attacco finale | Chiamate per guida fredda | Pool nuovo | Entro le 206 residue di Crustle? |
| ---: | ---: | ---: | ---: | --- |
| 2 | 3 | 129 | 387 | Sì, nel riferimento |
| 2 | 5 | 157 | 471 | Sì, nel riferimento |
| 4 | 3 | 173 | 519 | Sì, nel riferimento |
| 4 | 5 | 217 | 651 | **No**, anche se il pool basta |

Formula: `25 + 4H + 2M + N + A`, con `H=7`, `M=6+4R`, `N=2+2R` e `A` altri eventi. Esclusi retry, rifiuti semantici, nuove partizioni degli audit/metadata, ricostruzioni, patch e riscritture. Il batching può ridurre il costo; altre riparazioni possono aumentarlo o interrompere la guida. **Non sono previsioni di completamento o garanzie.** Le 24 riservate sono una protezione minima per i matchup successivi, non una stima del loro costo.

Questa istruzione copre correzione e verifica offline prima di altre chiamate: nessun nuovo freeze di campagna, runner reale, grant o invio avviato. A una successiva istruzione diretta di prova reale occorrerà predisporre la campagna sui nuovi job e verificarne contabilità, freeze e guardie, senza conferme ridondanti o aumenti automatici. Restano stop globale al primo non valido, held-out esclusi, default v27, guard v28 e policy v5 isolata.

Restano tre guide reali valide, verifica di salvataggio/riapertura/UI, audit della generalità e politica applicativa, quindi build locale utilizzabile dall’utente. La build di sviluppo riuscita non chiude questo obiettivo.

Evidenze in `.verify/app225-segments-20261102/`: `verification-app232-audit-counts.json`, `app232-audit-counts-budget.json`, i cinque `app232-counts-{mode}-{index}.json`, `app232-counts-final-regression-tests.json`, `app232-counts-final-setup-tests.json`, `app232-counts-final-build.json`. Verificatore ripetibile: `verify-app232-audit-counts.mjs`; harness: `app232-counts-preflight.ts`. Esito reale precedente conservato in [FINITE-CAMPAIGN-V4.md](FINITE-CAMPAIGN-V4.md).
