# APP-232 — Routing degli audit, successori validi e turni frammentati

05-11-2026. Correzione richiesta dall’utente dopo l’esito negativo della campagna finita v3. **Verificata offline; zero nuove chiamate reali, zero nuove guide approvate.** APP-232 resta In progress e APP-225 Blocked. Non è una nuova campagna né un’attivazione nell’app.

## Risultato implementato

Il rifiuto indipendente di una premessa finita passa ora attraverso una classificazione AI tipizzata, distinta dalla riparazione. La classificazione può assegnare tutti i rilievi ai soli campi di audit esistenti, oppure conservare il percorso fisico originario. Non viene interpretato il nome di una carta o una frase del critico. Ogni rilievo deve avere destinatari validi; alternative fisiche proposte dal critico impediscono la scelta audit. La classificazione non dà un pass.

Nel percorso audit, le motivazioni sono riscritte dall’AI con tutti i rilievi originali visibili. Il programma confronta il registro prima e dopo, autentica classificazione e originali dei giudizi, ricostruisce il prefisso con i lettori completi e conserva il contesto del rifiuto per **un nuovo riesame indipendente obbligatorio**. Il limite di due premesse respinte rimane; una riparazione di audit non lo azzera. Il vecchio `repairScope: setup` non impone più da solo la ricostruzione fisica.

Il recupero del setup riconosce un successore positivo già pagato dopo una proposta negativa nello stesso contesto. Ne controlla ricevuta, ordinale, scope, packet, descrittori, originali accettati e concatenazione quadro/turni, poi ricostruisce e convalida di nuovo l’intero setup. Originali mancanti, contesti diversi o positivi ambigui fermano la ripresa. Nessuna approvazione del critico viene trasferita.

I turni nativi della linea principale e delle repliche finite vengono costruiti con un quadro AI contenente lo sviluppo e un piano degli eventi, seguito da **una richiesta per ciascun evento**. L’attacco finale ha la propria richiesta; poi vengono completati gli audit e applicato il lettore originale dell’intero turno. Apertura, fonti, prefisso, piano e hash degli eventi precedenti vincolano ogni frammento. Nessun quadro o evento parziale diventa uno stato approvato. I turni storici del setup conservano la partizione già esistente per turno.

Lo scheduler acquisisce i descrittori pendenti prima di accettare risposte: il calcolo delle riserve non richiama più una factory dopo averne completato il turno. Le dichiarazioni intere già pagate restano riutilizzabili con le identità originarie. Le riserve includono i frammenti successivi e gli audit; la riserva iniziale fredda passa da 13 a 44 richieste future, senza cambiare i tetti dell’utente. La stima di output assegna peso specifico a quadro ed eventi. Si tratta di riserve locali, non di misure del limite numerico del provider.

Due costruzioni fisiche non valide fermano il turno. Errori di trasporto, integrità o budget durante gli audit non comprano una nuova costruzione fisica. Un singolo evento può ancora superare un limite irriducibile: in tal caso il processo si ferma senza applicare output parziali.

## Controlli e verifiche

Restano i vincoli di disponibilità delle carte, Energia, costi, ritirate, promozioni, Premi, sviluppo, terminalità, provenienza, personalizzazione su lista e matchup e le critiche prima della prosa e finali. Il contratto finito conserva le proprie delimitazioni già approvate. Nessun controllo fisico o di qualità è sostituito da una ricevuta host.

- Regressione pertinente: **432 test passati, 1 escluso storico, 43 file**. Dopo l’ultimo controllo sulla provenienza dei giudizi, rieseguiti i 34 test dei quattro file interessati: tutti passati, senza sommarli ai 432.
- Typecheck dell’app e build passati; compilazione dei due harness offline passata.
- Nuove regressioni: negativo seguito da positivo e riapertura senza chiamate; classificazione audit/originale; bersagli protetti; originali mancanti; riesame obbligatorio con il rifiuto precedente; frammenti invalidi, riserve insufficienti e ripresa di un turno composto.
- **14 input precedenti modificati intenzionalmente, 4 sorgenti nuovi, 674 altri input congelati invariati; 523 file correnti improntati.** Archivio v3 di 706 file intatto. Tre database reali invariati e uguali ai backup su schema e 39 tabelle ciascuno; basi v2 preservate.

Cinque avvii in processi dedicati, sulle copie dei database reali. Soglie invariate: 60 s a freddo, 10 s alla riapertura e 768 MiB. Il tempo freddo comprende importazione e lettura degli originali, escludendo solo la copia SQLite.

| Percorso | Prossima richiesta | Freddo | Riapertura | Picco RSS |
| --- | --- | ---: | ---: | ---: |
| Crustle reale, senza risposte inventate | classificazione audit | 2,991 s | 1,848 s | 470,1 MiB |
| Alakazam/Dudunsparce, ingresso freddo | piano | 0,669 s | 0,052 s | 317,6 MiB |
| Dhelmise, ingresso freddo | piano | 1,289 s | 0,212 s | 344,3 MiB |
| Diagnostico audit su copia | nuovo critico della premessa | 5,947 s | 2,259 s | 500,6 MiB |
| Diagnostico percorso fisico su copia | quadro del turno frammentato | 5,146 s | 2,560 s | 526,0 MiB |

Gli ultimi due percorsi usano rispettivamente due e un involucri sintetici espliciti. Il primo seleziona un bersaglio di audit e copia stringhe AI storiche invariate, senza dimostrare che correggano il conteggio; si arresta prima del nuovo critico. Il secondo seleziona il percorso originario e si arresta prima del quadro del turno, senza inventare nuovi eventi. Non sono correzioni manuali del job reale, pass AI o prove della qualità delle guide. La prima riga dimostra il recupero della storia reale senza questi involucri.

Le prove negative intermedie restano conservate: factory riletta dopo completamento, evidenze del routing assegnate inizialmente allo scope errato e audit sintetico identico al precedente. Sono state corrette le cause, mantenendo i rifiuti e le asserzioni di integrità.

## Budget prima di nuove chiamate

Contabilità invariata: **291 chiamate v28, 367 storiche, 0/3 nuove guide valide**. Nel job corrente 36 chiamate su massimo persistito 245; le 255 precedenti del primo matchup comprendono le diagnostiche. Restano **209 per Crustle e 1.209 nel pool**, con tetti **500 cumulativi per guida / 1.500 v28 / riserva 24 per ciascuna guida successiva**. Le 24 sono una riserva minima protetta, non il costo previsto di una guida fredda.

Calibrazione invariata: 271 campioni reali, fattore 1,5933849345675073. Target input 96.000, massimo input 128.000, totale 176.000, margine 8.192, massimo 500.000 byte e 100.000 caratteri di risposta. Nessun campione sintetico aggiunto. Il limite numerico di output del servizio che ha fermato v3 rimane sconosciuto.

| Richiesta osservata offline | Input stimato | Output riservato | Chiamate future riservate | Soglia d’ingresso corrente |
| --- | ---: | ---: | ---: | ---: |
| Classificazione audit di Crustle | 55.637 | 10.000 | 10 | 11 |
| Critica obbligatoria dopo il diagnostico audit | 66.910 | 10.000 | 18 | 19 |
| Quadro del turno dopo il diagnostico fisico | 52.941 | 12.000 | 21 | 22 |
| Piano freddo Alakazam/Dudunsparce | 84.180 | 6.000 | 44 | 45 |
| Piano freddo Dhelmise | 57.919 | 6.000 | 44 | 45 |

Le soglie sono prenotazioni della fase nota, **non minimi certificati per finire la guida**. Il modello deve ancora scegliere il numero degli eventi e delle risposte. Il pianificatore ricalcola tutto prima di ogni invio, può dividere batch e può fermarsi prima della rete.

Per rendere visibile il costo della frammentazione, il conteggio seriale condizionale seguente assume: due scenari, R risposte complete e non terminali per scenario, un quadro e una richiesta di audit per turno nativo, una richiesta per evento, al massimo sette turni storici per setup freddo e una richiesta di audit per ciascuno. Include piani e riesami dei rami, metadata, critiche dei casi, otto capitoli, due esercizi e due critiche finali. Per Crustle assume classificazione audit, una riparazione e un nuovo riesame riusciti (tre chiamate).

| R per scenario | Altri eventi per turno oltre all’attacco finale | Crustle residua | Ciascuna guida fredda | Pool nuovo |
| ---: | ---: | ---: | ---: | ---: |
| 2 | 3 | 89 | 129 | 347 |
| 4 | 3 | 133 | 173 | 479 |
| 2 | 5 | 113 | 157 | 427 |
| 4 | 5 | 173 | 217 | 607 |

Formula della prima guida: `23 + 2M + N + A`, con `M=4+4R` turni residui, `N=2+2R` attacchi finali e `A` altri eventi. Formula fredda: `25 + 4H + 2M + N + A`, con `M=6+4R`, `H=7` turni storici per scenario. Sono riferimenti di capacità, non una previsione né una garanzia: escludono retry, risposte non conformi, rifiuti semantici, ulteriori partizioni degli audit/metadata, nuove premesse, riparazioni dei casi e riscritture. Il batching può ridurre il costo, altre riparazioni possono aumentarlo o fermare la guida. Gli esempi rientrano nei residui attuali, ma ciò non prova la riuscita reale.

## Ripresa

Questa istruzione autorizza correzione e prove offline prima di altre chiamate: **nessun nuovo runner, grant di rete o campagna avviato**. Il vecchio seal resta storia della campagna consumata; il manifesto corrente è una prova offline, non un nuovo freeze per il live. Su una successiva istruzione diretta di ripresa reale, preparare freeze e guardia aggiornati, verificare contabilità e riserve e avviare una sola campagna sequenziale, senza richiedere nuovamente un consenso già espresso per quell’azione. Restano stop globale al primo esito non valido, held-out esclusi, nessun contenuto AI corretto manualmente e nessun aumento automatico.

Dopo tre guide reali valide restano verifica di salvataggio/riapertura/UI, audit della generalità, policy applicativa e build locale provabile dall’utente. Default v27, guard v28 e policy v5 isolata invariati.

Evidenze locali in `.verify/app225-segments-20261102/`: `verification-app232-routing-recovery-turns.json`, `app232-v4-budget.json`, i cinque `app232-v4-*-preflight-*.json`, `app232-v4-final-regression-tests.json`, `app232-v4-final-targeted-tests.json` e `app232-v4-build-confirmed.json`. Il verificatore ripetibile è `verify-app232-v4-offline.mjs`; le evidenze v3 negative restano distinte in [FINITE-CAMPAIGN-V3.md](FINITE-CAMPAIGN-V3.md).
