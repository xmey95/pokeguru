# APP-229 — Audit della convergenza

4 novembre 2026. Audit offline del codice e delle evidenze della campagna21. Nessuna nuova chiamata reale, modifica al generatore o correzione di contenuti AI. L'obiettivo APP-225 resta interamente aperto: tre guide reali valide, verifica di generalità, persistenza/UI, politica applicativa e build utilizzabile.

## Risultato

Il sistema preserva numerosi controlli importanti, ma non dispone di un passaggio indipendente che decida se una nuova richiesta di costruzione sia già soddisfatta prima di obbligare il pianificatore a proporre varianti. Inoltre, i ruoli ricevono più prove native di quelle necessarie alla loro decisione preliminare. Questi due problemi vanno affrontati insieme: ridurre un singolo input non dimostra che il ciclo produca una guida valida.

Non è dimostrato che tutti i rilievi siano falsi o duplicati. Nell'ultima campagna le 13 richieste hanno testi tutti diversi. L'audit identifica una lacuna nel modo in cui vengono ammesse e risolte, non autorizza a eliminarle.

## Evidenze reali

| Misura | Risultato verificato |
| --- | --- |
| Contabilità | 252 chiamate principali + 3 diagnostiche = 255 v28; 331 includendo le 76 precedenti |
| Ultima campagna | 20 nuove chiamate, tutte concluse con lettura valida; 0/3 nuove guide valide |
| Fine turno | Chiamata233: `end-turn`, attacco e pagamento null, una unità accettata localmente |
| Metadata | 18 chiamate, 55 unità: 10 opzioni e 45 confronti |
| Richieste di altre prove | 12 unità restituiscono `needs-branches`, per 13 requisiti distinti |
| Prima della scelta | 10 rami precedenti, 15 rami nella proposta; 12 requisiti ereditati e 13 nuovi |
| Blocco | `branch-plan-choices`: 145.786 input stimati contro128.000, con245 chiamate ancora disponibili sul caso |
| Input effettivo della selezione | 1.155.603 byte di dati espansi; 905.404 byte nel campo dei rami dell'unità |
| Schema effettivo | 33.438 byte, 9.498 token locali |
| Prova di riduzione del solo schema | Schema generico sperimentale5.077 token: stima sullo stesso dato codificato138.742, ancora oltre soglia |
| Limite teorico di questa modifica isolata | Anche ipotizzando uno schema senza alcun token, circa130.652 input: non basta con i dati e le codifiche attuali |
| Preservazione | Archivio21 terminale540 file;513 input invariati durante la prova, binding/chunk verificati; altri due job assenti |

I byte riportati sono quelli dei dati espansi, non una ripartizione additiva dei token dopo la codifica condivisa. Il contesto host originale misura3.098.530 byte, dei quali3.063.015 nei journal: è distinto dal payload AI derivato. Le stime sullo schema sono esperimenti di dimensionamento, non un protocollo implementato o una prova di convergenza.

Il replay completo su copia ha ricostruito il medesimo blocco145.786, conservando252 tentativi, unità e checkpoint e senza invocare provider. Ha però superato il limite del test:285,741 secondi contro240. Il framework lo dichiara fallito. Il report distingue le asserzioni completate dall'esito negativo del test; non si dichiara un replay verde e non si amplia il timeout per chiudere questo audit.

## Problemi dimostrati nel codice

### 1. Una richiesta preliminare obbliga a una proposta nuova

`guide-reply-plan-choice.ts` aggiunge alla copertura dei nuovi requisiti soltanto le scelte con `source=proposal`; il lettore respinge la decisione se uno dei nuovi requisiti non è così coperto. Un'assegnazione a `previous` può conservare requisiti ereditati, ma non soddisfa questa regola sui nuovi.

`guide-scenario-evaluation.ts` trasforma le richieste dei metadata in selezioni e proposte e ripete il ciclo. Il controllo dei piani già visitati rileva un piano identico, non l'assenza di avanzamento semantico dietro nuovi testi o nuove identità.

Questo non dimostra che i vecchi rami soddisfino i13 nuovi requisiti. Dimostra che la selezione corrente non ha una risoluzione indipendente preventiva che possa riconoscerlo prima di richiedere altre varianti.

### 2. La risoluzione semantica indipendente arriva più tardi

`guide-requirement-review.ts` distingue già `resolved`, `superseded` e `still-open`. La risoluzione richiede testimoni correnti e fonti; un requisito infondato o non pertinente può essere superato con motivazione, mentre uno aperto impedisce il pass.

Questa verifica entra in `guideSegmentReviewRequest` dopo che `constructGuideScenarioEvaluations` ha prodotto i casi con metadata. Il ciclo che costruisce le prove mancanti non usa prima tale autorità per distinguere prova assente, prova presente altrove e contesto della singola unità insufficiente. È una dipendenza circolare potenziale, non una prova che ogni esecuzione sia impossibile.

### 3. Identità e stato degli obblighi sono confusi

Il ledger conserva gli originali usando l'hash dell'intero oggetto `goal/reason/sourceIds`. È una buona garanzia di provenienza; non è un'identità semantica stabile né una registrazione della risoluzione corrente. Due richieste simili non possono essere fuse automaticamente: la ragione può contenere condizioni essenziali.

In questa campagna tutti i13 oggetti e tutti i13 testi dei goal sono distinti, anche dopo ordinamento delle proprietà JSON. L'eventuale equivalenza va verificata, non dedotta per somiglianza. Un obiettivo composto può richiedere più testimoni: non va imposto integralmente a ogni frammento che ne vede uno solo.

### 4. Selezione preliminare e verifica completa condividono troppi dati

La selezione riceve piani, tutti i requisiti, linea principale, dichiarazioni native e ricevute di tutti i rami. Emette invece una scelta di intenzioni, che il codice correttamente non considera un'approvazione tattica. La conservazione degli originali nel database non richiede che ogni ruolo rilegga tutti i journal.

Le proiezioni devono essere esplicite e vincolate agli originali. Un indice di prove non può sostituire le prove complete nel ruolo che le certifica. APP-227 già applica questo principio ad alcune fasi; manca un contratto uniforme lungo l'intera pipeline.

### 5. Gli arresti esistenti non misurano il progresso verso la guida

Sono presenti limiti di chiamate/token, retry persistenti, identità diverse per nuovi tentativi, controlli sui piani visitati e stop globali della campagna. Impediscono diversi errori e cicli identici. Non misurano quanti obblighi siano stati realmente verificati, quali prove nuove li sostengano o se gli stessi problemi siano semplicemente riformulati.

La terminazione entro un tetto è già possibile; non equivale a ottenere una guida valida. Nessuna architettura può garantire una risposta corretta da un modello che continui a sbagliare. Si possono invece verificare l'avanzamento, la correttezza degli arresti e il successo sui casi reali.

## Cosa conservare

- Liste esatte, singolo matchup, fonti e data; isolamento di progetto/job e catena delle estensioni delle evidenze.
- Registro unico e validatori di setup, turni, ingressi/uscite, risorse, Energie, attacchi, pescate, Premi, promozioni, ritirate e contesti dei rami.
- Originali immutabili e ripresa dei risultati compatibili; nessun pass trasferito tra scope o fonti diversi.
- Controlli tattici, obblighi originali, confronti delle risposte e audit dei testimoni; nessuna quota di rami scelta per rendere più facile il test.
- Critiche indipendenti, manifest della copertura completa e verifica della prosa sulle fonti correnti.
- Ultima guida valida conservata dopo un fallimento; budget cumulativi, quota account distinta e attivazione solo dopo i gate.

## Famiglie da verificare come un insieme

| Famiglia | Decisione o prova necessaria | Rischio e criterio della revisione |
| --- | --- | --- |
| Preparazione e raccolta fonti | Lista, avversario, catalogo, eventi e lacune | Provenienza congelata per job; nuove fonti invalidate e riesaminate correttamente |
| Piano e setup | Copertura della guida, ipotesi e stato iniziale | Intenzioni separate da fattibilità e risultati; tutte le allocazioni validate |
| Turno principale | Azioni e sviluppo della linea | Stato derivato dal registro; nessun effetto o risorsa inventati |
| Premessa alternativa | Prima mossa diversa, se dichiarata | Stesso setup/pescata; critica prima della replica; frame distinto da quello condiviso |
| Piano delle repliche | Intenzioni da costruire | Solo obblighi aperti già ammessi, con rimandi agli originali e alla copertura ancora dovuta |
| Selezione delle varianti | Conservare, costruire o recuperare prove pertinenti | Non certifica il gioco; indici e retrieval espliciti, copertura globale del piano verificata |
| Turni delle repliche | Registri completi sotto le condizioni assegnate | Riferimenti storici non diventano risorse attuali; identità/frame preservati |
| Valutazioni per linea e coppia | Formule, risorse e conseguenze | Distinguere contesto esterno mancante da nuovo testimone da costruire |
| Ammissione dei rilievi | Prova già presente, da valutare, da costruire o richiesta infondata | Autorità indipendente; nessun nuovo ramo obbligatorio dal solo bisogno espresso da un costruttore |
| Composizione dei metadata | Confronto coerente dell'intero caso | Stesso lettore completo; non è un pass dei frammenti |
| Critica degli scenari | Tutti i confronti e i testimoni richiesti | Unità complete per il claim assegnato, copertura globale obbligatoria e nessuna directory come prova |
| Riparazione nativa | Correzione della prima dipendenza errata | Invalidazioni precise, rami compatibili conservati, nuovi goal ammessi e tracciati |
| Riparazione dei soli testi | Testi autorizzati con journal congelato | Nessun cambiamento a eventi o risorse; tutti i controlli originali applicati |
| Prosa e fonti tardive | Capitoli, esercizi e spiegazioni | Scrivere dai fatti verificati; ricalcolare riserva e invalidare le critiche sulle fonti precedenti |
| Riesame finale | Guida completa, fatti e testo correnti | Tutte le critiche obbligatorie e tutti gli obblighi chiusi; nessun pass parziale |
| Salvataggio, ripresa e revisione | Artefatti e dipendenze della richiesta | Ledger delle chiamate durevole; R-13 e ultima guida valida protetti |

L'inventario AST trova15 siti di costruzione di descrittori; non sono15 famiglie runtime, perché molti nomi di fase sono dinamici. La tabella include anche i confini del backend e della pubblicazione. Non tutte queste famiglie hanno ancora prove di capienza su futuri output: è un gate da soddisfare prima della prossima campagna.

## Evidenze riproducibili

Sotto `.verify/app225-segments-20261102/`: `audit-convergence.mjs`, `convergence-audit.json`, `convergence-pending-context.json`, `convergence-request-inventory.json`, `convergence-choice-budget-args.json`, `convergence-choice-replay.{test.ts,log,json}`, `convergence-schema-sizing.{mjs,json}`. Il replay conserva separatamente il report prima della riconciliazione con il timeout del framework. I dati originali restano invariati. Nessun held-out utilizzato.

La proposta conseguente è in [CONVERGENCE-CONTRACT.md](CONVERGENCE-CONTRACT.md). Questo audit non dichiara APP-225 concluso né autorizza nuove chiamate.
