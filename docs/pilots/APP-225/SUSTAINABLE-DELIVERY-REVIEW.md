# APP-233 — Riesame completo e formato di generazione sostenibile

Data: 6 novembre 2026. Requisiti R-01, R-03, R-07, R-10, R-11 e R-13. Autorizzazione: riesame, definizione del formato e verifiche offline; nessuna nuova chiamata reale.

**Aggiornamento APP-234:** questo documento registra la specifica precedente all’integrazione. L’adapter è ora in verifica offline; il grafo eseguibile include anche la dichiarazione audit separata che qui era omessa dal conteggio. I massimi prudenziali diventano164 per due repliche e212 per quattro, invece di144/184. I risultati e i limiti attuali sono in [BOUNDED-DELIVERY-INTEGRATION.md](BOUNDED-DELIVERY-INTEGRATION.md); nessuna readiness o autorizzazione alla rete deriva dai soli risultati storici seguenti.

## Risultato e confine della verifica

La proposta è **un contratto eseguibile di consegna**, con un grafo finito di unità, dimensioni massime per le dichiarazioni native, audit partizionabili e una sola riserva di riparazione condivisa. Conserva lista esatta, singolo matchup, otto capitoli, due casi completi, 2–4 repliche per caso e due esercizi. Non sostituisce i controlli del protocollo fisico v28 o le revisioni indipendenti.

Il codice in `scripts/guide-delivery-spec.ts` e `scripts/guide-delivery-audits.ts` è una **specifica offline isolata**, importata dai test e non dall’app. Non è un nuovo generatore integrato, non cambia il default v27/guardv28 e non abilita il provider. Non viene proposta una campagna reale alla conclusione di questo incremento.

È essenziale distinguere tre proprietà:

1. **Terminazione:** ogni esecuzione termina con completamento oppure arresto motivato entro un limite non rinnovabile; una riapertura non ricrea il credito.
2. **Completamento funzionale:** con risposte conformi, l’orchestrazione arriva alle revisioni finali, ai controlli, al salvataggio e alla rilettura. Un sistema che si arresta sempre non soddisfa questo criterio.
3. **Qualità reale:** soltanto una prova reale può dire se il modello produce contenuti validi entro quei limiti. I verdetti sintetici non dimostrano conoscenza del matchup o generalità competitiva.

Il vecchio percorso aveva già limiti di chiamate e test sintetici di completamento. Il suo problema non era un ciclo matematicamente infinito: erano mancata convergenza reale, dimensioni non governate nell’insieme e assenza di una condizione sufficientemente forte per riaprire l’esperimento. Un nuovo test sintetico verde, da solo, non autorizzerà altre chiamate.

## Evidenza di partenza

La v9 è ferma: **355 invocazioni v28 /431 storiche /0 nuove guide valide**. Massimi precedenti500 per guida/1.500 pool/riserva24; saldi145/500/500 e1.145pool. Una sola nuova risposta costruttiva accettata, senza successivo riesame indipendente. Lo storico e i raw sono immutabili; nessun azzeramento per il nuovo formato.

Il blocco noto è un riesame di10 testi/57 span:6 unità,108.000 caratteri stimati contro100.000. L’arresto avviene prima del provider. Il messaggio live mostra inoltre il budget ready della costruzione precedente, perché la verifica anticipata dell’output precede l’aggiornamento di lastBudget. Il problema non si risolve alzando il numero di chiamate.

La ripresa funzionale v9 richiedeva16,028s a caldo contro l’obiettivo10s. Questa è una verifica prestazionale fallita, da conservare fra i blocchi di adozione: nel nuovo percorso non sarà separata dalla readiness per poi procedere comunque.

## Riesame dal piano alla pubblicazione

| Fase attuale e codice | Problema dell’insieme | Decisione proposta |
| --- | --- | --- |
| `matchup-guide-generation.ts`: packet, risoluzione liste, piano e retrieval | Il budget del prossimo invio non rappresenta il costo del percorso ancora necessario; più ampliamenti possono cambiare contesto e identità. | Congelare manifest e limiti prima della costruzione; integrare le query locali di sola lettura entro la fase di evidenze, con estensioni append-only autenticate e senza espansione automatica del contratto. |
| `guide-finite-setup.ts`: quadro e turni storici | Il setup può essere valido localmente ma produrre molti audit e richieste prima del primo caso utile. | Al massimo due round più eventuale turno avversario iniziale:5 turni storici per caso. Setup raggiungibile dal registro completo; nessun salto a uno stato non dimostrato. |
| `guide-finite-turn.ts`: quadro, piano eventi, un invio per evento | Ogni azione aggiunge una richiesta e ripete contesto; il frammento risolve la dimensione del turno senza fissare un costo complessivo. | Un turno completo e dimensionalmente limitato come atomo di costruzione. Al massimo6 eventi totali, compreso l’attacco se presente; reader completo invariato. Nessun frazionamento ricorsivo. |
| `guide-audit-repair.ts` e `guide-audit-language-driver.ts` | Limiti locali di formato/contenuto si moltiplicano lungo turni, setup, repliche e riparazioni. | Una sola riserva globale di16 invocazioni aggiuntive; limiti locali restano ulteriori restrizioni. Anche una nuova identità di input consuma la stessa riserva. |
| `guide-audit-language-review.ts` | Tutti i target di una motivazione vengono trattati come un’unica unità irriducibile, pur avendo già schema e finestre indipendenti. | Partizionare per **target originale intero**, preservando parti, finestre, fonti, contesto, anchor e tutte le annotazioni. Copertura esatta e aggregazione obbligatorie. Mai spezzare una frase o ignorare uno span. |
| `guide-mainline-phase.ts`, `guide-finite-plan.ts` | La lettura del piano finito richiede una main già di3 turni; vengono costruiti seguiti prima di selezionare le risposte da confrontare. | Dopo setup e nostra prima mossa: critica della premessa, piano delle risposte e suo riesame; costruire direttamente quelle risposte e i loro seguiti. Questo richiede un adapter nuovo del piano, non riuso improprio del reader che oggi esige3 segmenti. |
| `guide-reply-phase.ts`, `guide-finite-cases.ts` | Una replica può introdurre costi, promozioni e sviluppo che alimentano ulteriori riparazioni o metadata estesi. | Da2 a4 slot congelati per caso, ciascuno con turno avversario e nostro seguito oppure terminalità provata. Sostituire uno slot entro la riserva; non aggiungere un nuovo albero. |
| `guide-metadata-partition.ts`, `guide-finite-cases.ts` | Anche un registro corretto può essere rimesso in discussione da metadata narrativi molto ampi. | Due unità massime per caso: valutazioni/condizioni e confronto/risorse. Tabelle numeriche dal registro, motivazioni e consigli dall’AI. Gate completi prima della prosa. |
| `guide-finite-review.ts`, `guide-review-witness.ts` | Il critico può produrre controlinee molto ampie; un rilievo tardivo può invalidare gran parte del lavoro già pagato. | Controlinee entro la stessa finestra e lo stesso profilo dimensionale, tutte validate. Un difetto che richiede una nuova preparazione oltre la riserva arresta la guida; non è cancellato né chiamato limite strategico. |
| `guide-finite-prose.ts` | Fino a20.000 caratteri per capitolo amplificano schema, affermazioni nuove e revisione finale. | Otto capitoli di massimo3.000 caratteri ciascuno; scrittura da fatti verificati, dipendenze esplicite, risorse quantitative rese dal codice. Due esercizi collegati ai casi. |
| `guide-finite-generation.ts`: riparazioni e candidati | Esistono già due riparazioni complessive, oltre ai retry annidati che le precedono o seguono; il conto non è unico. | Tutti gli interventi usano la stessa riserva globale; invalidare esattamente i discendenti del target modificato. Un secondo negativo dello stesso critico logico è terminale. |
| `ai-call-retry.ts`, `codex-failure.ts`, `AiAnalysisWork` | Un errore del servizio, una risposta troncata e un rifiuto dei contenuti hanno cause diverse; un exit sconosciuto non dimostra esaurimento token. | Conservare classificazione, raw e usage. Timeout/errore non classificato arrestano il lavoro; cancellazione e pausa usano gli adapter esistenti, senza rinnovo dei contatori o riavvio automatico. |
| `guide-finite-approval.ts`, `guide-finite-originals.ts`, `guide-segment-approval.ts` | Un pass parziale o una prosa nuova non costituiscono approvazione della guida persistita. | Conservare entrambi i pass finali, check completo e originali portabili. Salvataggio/rilettura obbligatori prima di pubblicare; una revisione fallita conserva l’ultima valida. |

Le scelte sul formato sono generali: nessun ramo per nomi di mazzi, carte o per i tre matchup. Non si sostituisce il gioco con regole speciali per gli esempi.

### Policy applicativa già disponibile su copia

È stata riletta anche la copia isolata `policy-current-finite`: `guide-application-budget.ts`, `guide-budget-service.ts` e il tipo `guide-budget.ts`. Conserva già massimo scelto, tentativi, residui, estensioni esplicite e divieto di ripresa automatica. Non è adottata nel runtime canonico e la sua suite storica non viene presentata come rieseguita oggi. Va composta con il manifest, non duplicata: il massimo scelto dall’utente è un’ulteriore autorità esterna e non un permesso di ricreare i16 crediti di riparazione. La UI deve mostrare separatamente residuo di invocazioni verificato e quota del servizio soltanto quando effettivamente nota. Questo componente non risolve da solo atomi troppo grandi o moltiplicazione dei retry.

## Formato per il giocatore

| Parte | Contenuto obbligatorio personalizzato |
| --- | --- |
| Sintesi | Come la nostra lista esatta affronta quel matchup; condizioni favorevoli, rischi e ciò che può ribaltare il piano. Nessun winrate senza risultati pertinenti. |
| Preparazione | Ruoli delle carte realmente presenti, priorità di conservazione, rischio delle carte nei Premi e condizioni delle mani esemplificate. |
| Apertura | Primo/secondo, sviluppo iniziale e sequenze della nostra lista, spiegate con condizioni esplicite. |
| Sviluppo | Motore, ordine delle azioni, accessi e risorse per i turni successivi; alternative legate alle prove dei casi. |
| Chiusura | Percorsi Premi condizionati e gestione dei bersagli, senza trasformare il caso didattico in vittoria forzata. |
| Decisioni | Scelte se/allora/perché, confronti concreti, costo e rischio della scelta, dipendenze dirette dai casi. |
| Risorse | Quantità della lista distinte dai saldi nelle zone e nei momenti del registro; consumi e risorse residue calcolati, non inventati nella prosa. |
| Varianti e limiti | Altre liste pubbliche come contesto; quali varianti cambiano il consiglio e quali risposte non sono confrontate. La lista usata nel caso resta identificata. |
| Due casi | Uno favorevole condizionato e uno di interruzione del piano. Preparazione raggiungibile, stessa nostra prima mossa, risposte competenti, nostro seguito o fine partita dimostrata. |
| Due esercizi | Domanda e soluzione motivate con i medesimi inventari, fonti e casi, senza risorse aggiunte per risolvere il problema. |

Le fonti, la data, la lista60 e il matchup fanno parte della base persistita. Nella UI i dettagli del registro possono essere espandibili; le condizioni decisive e i limiti rimangono accanto al consiglio. L’approfondimento è nelle decisioni e nelle ragioni, non nell’esposizione della pipeline tecnica al giocatore.

## Profilo dimensionale proposto

Questi sono limiti di ammissione, non nuovi permessi di ignorare azioni o fatti. Il codice eseguibile li espone in DELIVERY_DIMENSIONS.

| Unità | Limite |
| --- | --- |
| Casi / risposte per caso | 2 /2–4, pianificati e riesaminati |
| Setup storico | 5 turni per caso, massimo2 round più turno iniziale avversario |
| Turno completo | 6 eventi complessivi;12 movimenti non Energia e8 percorsi Energia per evento |
| Audit per turno | Al massimo17 target:6 decisioni, confronto e fino a10 promozioni; elenchi dei candidati dal codice sempre completi |
| Target narrativo | 600 caratteri e8 span lessicali da esaminare; nessun troncamento di un target preesistente |
| Partizioni quantitative | Al massimo4; ciascuna supera planner, schema, input, output, byte e riserve invariati |
| Capitolo | 3.000 caratteri,8 capitoli |
| Esercizio | 1.200 caratteri domanda e2.400 soluzione,2 esercizi |
| Riparazioni | 16 invocazioni aggiuntive condivise fra formato, contenuto e discendenti invalidati |

Il formato precedente accettava singoli turni più lunghi: il secondo turno v9 ha9 eventi. Non diventa conforme eliminando3 eventi, abbreviando i raw o importando i pass. Un nuovo caso deve essere costruito interamente entro il profilo oppure la guida termina come **complessità non supportata**. Questo limita quali esempi possono essere consegnati automaticamente, non la correttezza degli esempi ammessi. Se la pertinenza strategica richiede un caso oltre il profilo e non esiste un’alternativa completa, non si pubblica una guida presentata come valida.

I limiti sono ipotesi ingegneristiche verificabili, non valori calibrati sulla qualità del modello. Il profilo può essere rivisto solo come contratto esplicito e versionato, con nuovo riesame dei costi: mai in risposta automatica a un fallimento.

## Macchina di consegna e budget unico

La specifica lega ogni manifest a progetto, linea cumulativa, hash di entrambe le liste esatte, evidenze e configurazione. Le unità hanno dipendenze acicliche. Per ciascun caso: quadro setup → turni storici → nostra prima mossa → critica premessa → piano repliche/riesame → risposte/seguiti → metadata/confronto → critica completa. Solo dopo entrambi i casi:8 capitoli/2 esercizi →2 critiche finali →check locale →salvataggio →rilettura.

Gli slot quantitativi del modello sono materializzati conservativamente fino al massimo del profilo. Nell’integrazione il numero effettivo di gruppi verrà deciso dal planner sui target completi; eventuali slot non necessari devono essere chiusi da ricevute deterministiche della partizione e della copertura, **mai da un pass AI su un gruppo vuoto**. Questa specializzazione non può aggiungere slot o credito e va verificata nell’adapter prima di adottare il percorso.

Il manifest ammette valori diversi per i due casi: non obbliga a inventare risposte di riempimento o preparazioni identiche. Per2 casi con gli stessi limiti, s turni storici per caso, r risposte per caso e a gruppi quantitativi per turno:

- turni T = 2 × (s +1 +2r);
- invocazioni di base B = 28 +(1+a)T;
- tetto del contratto = B +16;
- tre unità host finali non sono invocazioni AI.

Con profili diversi, B = 28 + Σ per ciascun caso c di [(1+a_c)(s_c+1+2r_c)]. La specifica e i test comprendono anche casi asimmetrici.

Il28 comprende piano/riesame iniziale,7 unità per caso (quadro, premessa, piano/riesame repliche,2 metadata, critica caso),10 testi e2 critiche finali. Sono limiti seriali conservativi; il batching può ridurre il costo ma non è necessario alla prova del limite.

Nel profilo massimo con2 risposte: s5,a4,T20,B128,tetto144. Con4 risposte: T28,B168,tetto184. Con il profilo minimo s0,r2,a1:B48,tetto64. **Non sono nuove quote autorizzate, prezzi, tempi attesi o previsioni di riuscita.** Prima della rete il manifest deve rientrare anche nel saldo cumulativo realmente disponibile e lasciare la riserva24 per ogni guida successiva. I145 residui del primo matchup non rendono ammissibile un manifest da184. I500/1.500 precedenti non vengono aumentati né azzerati.

Ogni invio scrive prima una ricevuta start persistente, con input esatto e catena degli eventi. Il numero di invii cresce sempre. Un input diverso non cambia il contatore del nodo logico. Un rifiuto di formato consente al massimo un retry; un secondo negativo del medesimo critico arresta il lavoro. Il ripristino di una parte invalida toglie i pass dei suoi discendenti, conservando tutti gli originali e i negativi. I nuovi invii di quei discendenti consumano la stessa riserva16; se non rimane spazio per le verifiche finali necessarie, stop prima di spendere ancora.

La funzione di rango è: tetto invii +3 unità host −avvii consumati. Ogni start la riduce strettamente; fra due start esiste al massimo un settlement. Il driver ha inoltre un massimo esplicito di iterazioni. Gli errori terminali non hanno transizioni di ripresa automatica.

Un’invocazione con start ma senza risultato è **quarantinata** alla riapertura. Non si presume che non sia stata eseguita e non si ripete. Un timeout ferma il coordinatore; l’adapter reale dovrà annullare e accertare la chiusura del processo figlio. Nessun altro job parte mentre l’esito del processo precedente è incerto. Gli I/O locali e i validatori restano soggetti ai profili CPU/memoria e alle deadline dell’app: la prova astratta non dimostra prestazioni del futuro adapter.

## Tutti i controlli: corrispondenza obbligatoria

| Controllo conservato | Reader o gate esistente da riusare |
| --- | --- |
| Lista esatta, circuito/data, singolo avversario e stock60 | Packet/basis, bound schema, `checkGuideSetupLedger`, `assertGuideRuntimeEvidence` |
| Conservazione delle carte, zone, pescate e osservazioni del mazzo | `projectGuideLedger`, `guide-physical-resources`, setup ledger |
| Ingressi in Panchina, evoluzioni, timing e primo turno | `checkGuideSetupLedger`, `checkGuideTactics`, `guide-native-decisions` |
| Ritirata, pagamenti, Energie disponibili e destinatari | `guide-tactical-checks`, `guide-attack-payment`, `guide-reply-costs`, percorsi Energia |
| Attacchi coerenti con l’Attivo, costi e rimozioni | Reader nativo, `compileGuideTactics`, confronto sulle stesse finestre |
| KO, uscite senza KO, promozioni e Premi | `guide-board-exits`, registro, fonti ufficiali versionate dei Premi e critica semantica |
| Sviluppo, seguito e fine partita effettiva | `guide-native-decisions`, `guide-turn-ending`, controlli di terminalità e seguiti |
| Alternative disponibili, difese e repliche pertinenti | Candidati prodotti dal codice, `checkTacticalAudit`, `checkGuideAnalysisScope`, critica indipendente |
| Conteggi espliciti/impliciti, finestre e host | `renderAuditNarrative`, `readAuditLanguageReview` protocollo4 e copertura aggregata esatta |
| Calcoli e citazioni JSON | `readAuditCalculation`, `hasGuideSourceQuote`; nessuna normalizzazione, nessuna costante libera |
| Controesempi dei critici | `verifyGuideAlternativeWitness`, stessi stati e pescate, nessuna controlinea inventata per contestare |
| Prosa, dipendenze, esercizi e limiti del confronto | `checkGuide`, critica completa prima della prosa e due critiche finali con tutta la guida visibile |
| Approvazione legata ai raw e alle fonti correnti | `readGuideFiniteOriginals`, `assertFiniteGuideApproval`, `assertGuideSegmentApproval` |
| Isolamento, ripresa e mancata pubblicazione di bozze | Archivio per job/progetto, lineage immutabile, controllo dell’ancora, lettura dopo salvataggio; ultima guida valida conservata |
| Token, dimensioni, quote e riserve future | `planGuideRequest`, `guideSegmentCapacity`, `guideRequestOutputFits`, `assertGuideCampaignDispatch` |

Una riduzione del perimetro delle affermazioni non può sanare un’azione illegale già presente nella linea. Una tabella derivata dal codice non certifica l’applicabilità di un effetto: quella resta sottoposta alla critica indipendente. La partizione non emette un nuovo giudizio; aggrega soltanto tutti i giudizi autentici richiesti, con qualsiasi negativo ancora negativo.

## Diagnostica proposta

Ogni stop deve conservare nodo, inputHash, limite effettivamente superato, misura o stima, campioni di calibrazione e chiamate residue. `atomic-size` deve indicare il target completo che non entra e il budget di quel critico. `group-limit` indica che la copertura richiede più slot del contratto; `budget` che non resta capienza per il lavoro e i controlli finali. Non si riutilizza lastBudget di una fase precedente e non si presenta un limite locale come esaurimento dell’abbonamento Codex.

La UI proposta mostra «completata» soltanto dopo il read-back valido. Negli altri casi mostra il motivo di arresto e il lavoro conservato, distinguendo token locali, quota del servizio quando effettivamente misurata, timeout, dati mancanti e contenuto respinto. Nessuna percentuale di avanzamento ricavata dalle sole chiamate consumate.

## Gate prima di proporre altra rete

1. Adapter del nuovo contratto integrato su copia e manifest completo, con chiusura verificata degli slot inutilizzati, binding del piano dopo la sola prima mossa e contabilità unica per le invalidazioni. Nessun salto dei reader nella matrice.
2. Percorso completo applicativo sotto nuovo contratto, con risposte sintetiche esplicitamente tali: costruzione, negativi, correzioni, prosa, approvazione, salvataggio, riapertura; mutazioni ostili devono impedire la pubblicazione.
3. Dimensionamento di **ogni famiglia e di ogni atomo** al massimo del profilo, con intero packet/schema/contesto e campioni reali conservati. Il test del solo prossimo invio è insufficiente. Copertura esatta dei target e originali intatti.
4. Casi sintetici diversi dai matchup, rinomina di identità e cambi delle liste, unità indivisibili oltre limite, molte invalidazioni e provider non rispondente. Prova del limite globale e nessun retry gratuito dopo riapertura.
5. Ripresa su copie dei dati reali e profili60s freddo/10s caldo/768MiB rispettati, controlli e build pertinenti verdi. Un fallimento prestazionale rimane bloccante.
6. Solo dopo: budget completo misurato, codice congelato, proposta esplicita di una singola prova reale. Stop al primo esito non valido, senza aumenti automatici. L’esito reale rimane incerto; nessuna promessa di approvazione.

APP-233 consegna riesame, specifica e prove offline del modello, non l’adapter applicativo descritto ai punti1–2. Finché quei gate mancano non c’è una base sufficiente per chiedere altre chiamate.

## Verifiche eseguite

Risultati eseguiti e riproducibili, senza provider:

- **25 test della specifica**,2 file:72 forme uniformi complete e36 asimmetriche,80 semi avversari, rigetto di target/contesti alterati, copertura esatta, crediti condivisi, formato e contenuto negativi, timeout, riapertura dopo ogni esito, quarantena, budget reale e riserve24, fallimenti dei3 gate host. L’archivio SQLite reale viene chiuso e riaperto nel caso di persistenza; l’artefatto salvato è marcato sintetico e non è una guida AI.
- **73 test del percorso applicativo esistente**,5 file: guide-finite-generation, guide-audit-language-migration, guide-audit-language, guide-audit-calculation e guide-request-budget. Il caller reale e i reader di approvazione sono eseguiti con provider sintetico. Questo verifica il percorso esistente, non un’integrazione del nuovo contratto.
- **98 casi di test eseguiti**,7 file distinti, zero fallimenti/esclusioni; nessuna somma con le suite storiche526/961. Le108 combinazioni interne e gli80 semi non sono conteggiati come188 test aggiuntivi.
- **Typecheck e build passati** sugli input finali. Nessuna integrazione UI nuova dichiarata.
- **Replay dimensionale in sola lettura della v9:** tutti10 target interi/57 span conservati; due gruppi7+3. Input stimati **86.222/69.261**, output riservati **50.000/10.000**, caratteri stimati **90.000/18.000**, margine8.192 per entrambi. Tutti entro i gate precedenti,335 campioni reali/fattore1,5933849345675073 invariati. Codifica condivisa verificata reversibile, fonti/contesto/finestre/parti originali immutati.
- Negativi sintetici passati al **reader protocollo4 reale** restano negativi anche nell’aggregato; il tentativo sintetico di classificare un numerale esplicito come qualitativo viene respinto. Le risposte sintetiche non sono adottate nel job. Gli articoli ambigui non sono automaticamente numeri espliciti: nessun nuovo falso positivo lessicale introdotto.
- Quel dimensionamento completo richiede **26.242s /667.24MiB**. È tempo del banco offline che prepara più richieste, non misura del nuovo percorso applicativo caldo o della durata AI. Non risolve la precedente ripresa16,028s oltre10s.
- **540 file source/test precedenti intatti**,903 file archivio v9 e892 archivio v8 verificati, tre DB reali immutati e nessun report nuovo. Totali355v28/431storiche/0 nuove valide; zero nuove chiamate e nessun held-out.

Prova autorevole: .verify/app233-review/verification.json, con hash di codice, report, script di misura, contatori e limiti. **APP-233 è completata come riesame/specifica offline; il nuovo percorso applicativo non è ancora integrato o pronto per una proposta di chiamate reali.**
