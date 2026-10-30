# APP-192 — Risposta diretta quando le prove bastano

Worktree `task/app-192-focused-ai` da dev `e98f68c` (v0.3.11). Ottimizzazione e confronto autorizzati il 30 ottobre 2026. Nessun merge, rilascio o modifica al profilo personale incluso.

## Contratto

I nuovi turni Strategie usano il workflow v5. La prima chiamata riceve lista, vincoli, cronologia e testi originali già acquisiti e restituisce una risposta oppure una richiesta strutturata di ricerche locali. Non esiste una classificazione lessicale che presuma che una domanda corta sia semplice. Se chiede ricerche, resta il percorso v4 con pagine esplicite e massimo sei passaggi; le guide continuano a usare v4. I job v1–v4 conservano algoritmo e checkpoint. Schema SQLite 16 invariato.

La risposta diretta è una bozza: gli stessi controlli di consegna delle nuove carte, fonti, schema, 60 carte, vincoli, stampe, formato e ACE SPEC la verificano prima del salvataggio. Le candidate non sono adottate automaticamente. Prompt esatto, fonti, risposta e registro dei testi consegnati nella prima chiamata sono persistiti per job. Alla ripresa il registro originale viene ripristinato: una carta recuperata dopo la bozza non può essere considerata già letta dal modello. La nuova scheda continua a richiedere una revisione.

La scelta di unificare passaggi consecutivi è coerente con [OpenAI Docs sulla latenza](https://developers.openai.com/api/docs/guides/latency-optimization), ma il beneficio deve essere misurato nell'app. Modello e livello di ragionamento non sono ridotti.

## Protocollo fissato prima del confronto

Stesso snapshot già autorizzato in APP-191: lista Toucannon, Catalogo congelato, data 29 ottobre 2026, 32 partecipazioni (16 Toucannon e 16 Dragapult). Otto coppie v4/v5, ordine alternato: Budew tre volte, protezioni due volte, domanda dipendente dallo storico una volta, ricerca dei conteggi una volta, sostituzione vincolata una volta. Nessuna scelta della migliore esecuzione. Il caso storico aggiunge una nota sintetica identica nei due bracci.

Modello `gpt-6.1-sol`, effort automatico in entrambi. A differenza di APP-191, decisione e risposta usano la CLI persistente di produzione; i planner v4 rimangono effimeri come nell'app. Ogni osservazione ha una nuova sessione. Cronometraggio dal setup del job locale al risultato verificato, comprendente preparazione e controlli; escluse sincronizzazione e acquisizione iniziale del campione. Il carico del servizio e le cache possono variare. Ledger dei tentativi persistente, massimo 40 chiamate e otto per osservazione. Payload e risposte integrali restano nella cartella locale ignorata.

Obiettivo: riduzione della mediana delle tre prove Budew, idealmente almeno 20%, con una sola chiamata quando gli originali bastano. Nessun calo sui seguenti criteri; ricerca obbligatoria nel caso dei conteggi e candidata valida nella sostituzione. Il piccolo campione non dimostra equivalenza qualitativa universale né latenza sull'intero archivio.

| Caso | Criteri di qualità prima di leggere gli esiti |
| --- | --- |
| Budew | Costo zero, 10 danni, soli Item dalla mano nel prossimo turno dell'avversario; Judge consentito come Supporter, Unfair Stamp bloccato come Item, condizioni d'uso distinte. Nessuna candidata non richiesta. |
| Protezioni | Battle Cage protegge la Panchina di entrambi dai segnalini per effetti di attacchi e Abilità dei Pokémon avversari; non protegge l'Attivo né dai danni. Mist Energy protegge il Pokémon a cui è assegnata dagli effetti degli attacchi avversari, non da Abilità/danni e non rimuove effetti esistenti. |
| Storico | Riconoscimento del riferimento a Battle Cage nella nota, correzione della premessa sull'Attivo e sui danni, distinzione delle Abilità senza richiedere di ripetere la domanda. |
| Ricerca | Query Evento effettiva, conteggi 16/16 nel campione e nessun winrate dedotto dai conteggi. |
| Candidata | Una Hassel TWM 205 sostituita da Judge POR 76, resto preservato, 60 carte, esattamente quattro Toucannon PBL 94 e una sola ACE SPEC (Legacy Energy). Condizione di Hassel: un proprio Pokémon KO nel precedente turno avversario. |

## Verifiche

Completate le otto coppie principali, aggiunta una coppia di regressione sul miglioramento generale prima di dichiarare concluso il task: anche le richieste ampie attraversano il nuovo primo passaggio. Deve recuperare evidenze Evento e produrre una candidata verificata, senza inventare winrate. La coppia aggiuntiva resta distinta dalle misure primarie sulle domande puntuali e dentro il limite complessivo di 40 chiamate. Nessun prompt di produzione modificato sulla base delle risposte del confronto.

**Esito:** 18 osservazioni in nove coppie, 32 chiamate effettive su 40 massime; tutte concluse, nessun retry o esclusione di esiti. Le otto coppie primarie sono separate dalla regressione aggiuntiva. [Metriche complete](AI-FOCUSED-METRICS.json).

| Caso | Osservazioni per versione | v4 | v5 | Riduzione |
| --- | ---: | ---: | ---: | ---: |
| Budew | 3, mediana | 19,55 s | 14,62 s | 25,22% |
| Protezioni | 2, mediana | 15,97 s | 12,63 s | 20,86% |
| Domanda sullo storico | 1 | 15,15 s | 11,54 s | 23,83% |
| Conteggi con ricerca | 1 | 36,60 s | 18,79 s | 48,65% |
| Sostituzione vincolata | 1 | 21,47 s | 16,27 s | 24,21% |
| Miglioramento generale, regressione aggiuntiva | 1 | 86,13 s | 44,61 s | 48,21% |

Le sei coppie su domande puntuali passano da **12 a 6 chiamate**, con tempo cumulativo **104,41 → 80,37 s (−23,02%)**. La ricerca dei conteggi resta a due chiamate nel nuovo flusso; la richiesta ampia cerca prove prima di rispondere. I confronti singoli non sono misure stabili della latenza.

Le 18 risposte sono state lette e confrontate con gli originali forniti. Nei casi puntuali sono preservati costo, tipo di carta, giocatore/turno del blocco, condizioni, posizione e distinzione danni/segnalini/Abilità. Il caso storico corregge la premessa senza perdere la nota precedente. Le due ricerche riportano 16/16 partecipazioni e distinguono presenza, risultati contro il campo e matchup. Entrambe le candidate vincolate coincidono, per righe di carte, con la sola sostituzione richiesta; le intestazioni di export non sono carte.

Le due candidate del caso ampio passano i validatori. Le frequenze citate da v5 per Dawn (12) e Brave Bangle (8) sono state riconciliate direttamente sulle righe congelate; il calcolo 60 + 20×10 + 30 = 290 è corretto prima di Debolezza/Resistenza e altri modificatori. Non è una prova competitiva della proposta.

**Limite testuale comune:** entrambe le risposte ampie chiamano genericamente Air Balloon uno «Strumento», anziché il tipo tecnico «Oggetto Pokémon/Tool». Nei casi puntuali la distinzione Item/Supporter resta corretta. Il rilievo preesistente è registrato in APP-194 e non viene nascosto da un giudizio di equivalenza universale. Nessun prompt è stato ritoccato per selezionare risultati migliori.

**Controlli locali:** 393 test ordinari passati, 51 opzionali esclusi; typecheck/build passati. Cinque nuovi test di instradamento, checkpoint, isolamento e rifiuto delle risposte incoerenti; regressione sulla consegna delle carte dopo ripresa. Preflight dello snapshot e cinque probe negativi (61 carte, vincolo esatto violato, due ACE SPEC, stampa sconosciuta, fonte sconosciuta) passati. La prova Electron reale di lifecycle passa con risposta v5 conservata, workflow v4, legacy, pause, attese quota, assenza di duplicati e isolamento: profilo temporaneo, nessuna inferenza in questa prova.

**Conclusione circoscritta:** obiettivo di latenza raggiunto nel campione ripetuto, senza regressioni osservate nei criteri definiti e senza indebolire i validatori. Restano variabilità remota, campione ridotto e assenza di verifica end-to-end sull'archivio completo. Il cambiamento è locale al ramo APP-192, non ancora nella release v0.3.11.
