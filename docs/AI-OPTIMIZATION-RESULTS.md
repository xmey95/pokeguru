# Ottimizzazione delle analisi Codex

Verifica APP-179, APP-180 e APP-181 del 29 ottobre 2026. Baseline applicativa: `4642862` (dev, v0.3.8, schema 16). Implementazione nel ramo `task/app-179-181-ai-efficiency`, con subagent per contabilità AI, prestazioni e qualità. Il checkout precedente e il profilo personale sono conservati.

Il riuso incrementale riduce il lavoro ripetuto senza eliminare evidenze. Nella prova con Codex reale, aggiungere una stampa all'inizio dell'ordinamento passa da **5 a 2 chiamate**, da **64.172 a 25.720 token input** e da **69,583 a 32,046 secondi**. Le sei verifiche fattuali, le fonti e gli otto originali sono conservati nella revisione manuale. Queste misure riguardano una coppia di esecuzioni su un corpus circoscritto; non certificano qualità tattica generale o una distribuzione delle latenze.

## Configurazione conservata

Preferenze Pokéguru lette senza scriverle. Modello risolto con la stessa procedura dell'app: `gpt-6.1-sol`; `reasoningEffort: null` (Automatico), provider Codex, origine global. Lo stesso JSON e il medesimo hash `61fa2fef21853e700ca8a0f875f82b30fd62a6bdfcf7a563d913adb63f8930ba` sono usati in tutte le prove live. CLI inclusa nell'app: `codex-cli 0.164.0`; account ChatGPT già connesso. Nessun cambio di modello, effort, concorrenza, budget dei lotti o limiti della ricerca. L'effort effettivo deciso dal servizio non è esposto dagli eventi CLI e resta sconosciuto.

I byte misurano il prompt applicativo UTF-8; i token sono quelli dichiarati dal fornitore, che comprendono anche il contesto della CLI. Cached input token e cache locale sono distinti. Non si convertono i token in euro o percentuale della quota ChatGPT: questa integrazione non espone una fattura per analisi.

## Implementazione

**APP-179.** Ogni tentativo ha un record persistente e aggregati per fase/job. Le ultime 40 voci restano per compatibilità, ma non limitano più i totali. Usage acquisito prima delle validazioni di planner, lotti, sintesi, storico, Thread e Matchup, anche se la risposta viene respinta. Retry, attese, interruzioni e riuso sono separati. Dati mancanti sono null e sottototali osservati sono espliciti; riprendere un risultato non ne riaddebita il consumo storico. L'export mantiene campi consentiti e dimensione limitata. Nessuna migrazione SQLite.

**APP-180.** Un manifest persistente conserva membri, hash e frammenti dei lotti. La prima partizione è quella precedente; le aggiunte non spostano i confini dei lotti già completati. Le sintesi dipendono dai figli; la coda viene ricomposta per evitare una catena crescente di riassunti dei vecchi riassunti. Il checkpoint finale evita scansioni e chiamate quando l'input non cambia. Dati, query, statistiche, domanda, schema, istruzioni e configurazione partecipano all'invalidazione. I job legacy conservano il loro algoritmo e le cache, anche senza file temporanei. L'inventario resta proporzionale al numero di record e pagine: non è un algoritmo a memoria costante.

**APP-181.** Gli originali nominati nella richiesta, lista, discussione e sintesi sono preparati prima della bozza. Solo la serializzazione del prompt aggiorna il registro delle schede consegnate. Una nuova carta o una scheda diversa richiede ancora revisione. Duplicati esatti sono sostituiti da riferimenti reversibili; errata, stampa, fonti, motivazioni delle query, gameplayText e note Premi restano disponibili. Nessun rimando per una stampa con originali discordanti. I prompt Matchup sono costruiti prima del lookup della cache, così anche la ripresa ricostruisce correttamente il registro.

## Misure di orchestrazione

SQLite, archivio, partizionamento e cache reali; callback del modello sintetica, senza rete. Fixture con 300 schede da circa 7.500 caratteri di effetto, poi una chiave finale e una iniziale. Stesso harness su baseline congelata e candidato, Node 24.18.0, Windows. Una coppia strumentata: i tempi sono indicativi, i conteggi deterministici.

| Passaggio | Chiamate prima → dopo | Byte inviati prima → dopo | Oggetti decompressi prima → dopo | Tempo locale prima → dopo |
| --- | ---: | ---: | ---: | ---: |
| Prima analisi, 300 carte | 44 → 44 | 2.406.272 → 2.406.067 | 935 → 634 | 673,24 → 821,26 ms |
| Replay identico | 0 → 0 | 0 → 0 | 935 → 3 | 337,62 → 18,60 ms |
| Aggiunta chiave finale | 2 → 2 | 82.705 → 32.479 | 941 → 82 | 423,26 → 313,99 ms |
| Aggiunta chiave iniziale | 45 → 2 | 2.424.206 → 32.777 | 947 → 83 | 662,45 → 306,25 ms |

L'ultima aggiunta riduce le chiamate del 95,6% e i byte del 98,6%; la copertura resta di 302 carte. Il replay legge tre checkpoint invece di decomprimere l'intero archivio. Il primo passaggio locale è più lento di circa 148 ms, per registrazione e manifest: questo costo non è nascosto dal beneficio sulla ripresa. Le letture della sola API `records()` non sono confrontabili fra implementazioni; la tabella usa il contatore di decompressione `get()` comune alle due versioni, inclusi i checkpoint.

Fonti riproducibili: [baseline strumentata](AI-OPTIMIZATION-BASELINE-INSTRUMENTED.json), [candidato](AI-OPTIMIZATION-AFTER.json), [baseline acquisita prima delle modifiche](AI-OPTIMIZATION-BASELINE.json), [harness](../scripts/ai-analysis-audit.test.ts).

## Confronto con Codex reale

Il corpus comprende Budew dalla trascrizione curata locale e casi sintetici dichiarati: stampa omonima con regole diverse, record 6/3/1 con denominatore 10 contro il field, costo sconosciuto, fonti in conflitto, query sovrapposte. Sei categorie fattuali più il controllo delle fonti. I sette originali, poi otto dopo l'aggiunta, sono confrontati esattamente al momento della consegna al prompt.

| Scenario | Chiamate prima → dopo | Token input prima → dopo | Token output prima → dopo | Durata prima → dopo |
| --- | ---: | ---: | ---: | ---: |
| Aggiunta di una stampa a un'analisi completata | 5 → 2 | 64.172 → 25.720 | 1.822 → 926 | 69,583 → 32,046 s |
| Prompt finale con tre query sovrapposte | 1 → 1 | 18.498 → 17.164 | 566 → 462 | 12,136 → 15,434 s |

L'aggiunta riduce le chiamate del **60%**, i token input del **59,9%**, gli output del **49,2%** e la durata osservata del **53,9%**. Cached input: 26.880 → 17.920, quindi input non cached 37.292 → 7.800. Il vantaggio osservato dipende anche dalla cache del servizio e non misura un prezzo.

Il prompt finale passa da 27.133 a 19.299 byte (**−28,9%**) e riduce gli input token del **7,2%**. La durata di questa coppia aumenta di 3,298 secondi: non è dimostrata un'accelerazione del singolo prompt. Entrambi gli output superano 7/7 controlli automatici; la revisione manuale controlla anche il significato dei riferimenti.

Nell'analisi iniziale entrambe le versioni richiedono cinque chiamate; il replay zero; l'aggiunta di sole appartenenze a query due. Token complessivi dei tre passaggi: 89.781 → 88.548 input, 2.754 → 2.375 output. Il risparmio principale appare quando la modifica avrebbe spostato i vecchi lotti, non in ogni richiesta.

Artefatti: [append baseline](AI-APPEND-BASELINE-LIVE.json), [append candidato](AI-APPEND-AFTER-LIVE.json), [prompt baseline](AI-PROMPT-BASELINE-LIVE.json), [prompt candidato](AI-PROMPT-AFTER-LIVE.json), [analisi baseline](AI-QUALITY-BASELINE-LIVE.json), [analisi candidato recuperata](AI-QUALITY-AFTER-LIVE-RECOVERED.json).

## Qualità e limiti del controllo

Nessun peggioramento fattuale critico osservato nel confronto. I due output incrementali conservano eccezione di Budew, identità delle stampe, denominatore e ambito del risultato torneo, costo nullo distinto da costo zero, conflitto irrisolto e deduplicazione. Tutte le nove fonti e gli otto originali risultano presenti.

Il grader automatico usa controlli testuali, non un giudice semantico completo. La baseline append ha **6/7 automatici**, il candidato **7/7**. La revisione indipendente, non cieca, giudica Q6 corretto in entrambe: «Repeated memberships add no independent evidence; these are separate print records» esprime il fatto atteso, ma non coincide con le forme cercate dalla regex. Il fallimento originale resta nell'artefatto. Il prompt finale e le tre fasi del primo confronto hanno 7/7 per entrambe le versioni. Gli originali passano tutti i confronti esatti.

La prosa non è identica. Nel prompt finale il candidato non ripete data/provenienza locale di Budew, piazzamento del torneo e citazioni inline presenti nella baseline, pur conservando gli ID di tutte le fonti; nell'append omette il nome dell'evento nel testo. Il revisore non considera queste omissioni decisive per i sei quesiti del corpus. Non si dichiara equivalenza integrale degli output. Il test richiede inglese: non verifica la qualità linguistica italiana dell'app.

Un errore di selezione del runner ha incluso una seconda esecuzione della baseline nel comando del candidato e sovrascritto il JSON di quest'ultimo. La [ripetizione baseline](AI-QUALITY-BASELINE-REPEAT-LIVE.json) è conservata; le risposte e i token del candidato sono stati recuperati in sola lettura dai checkpoint e dal journal, verificando hash e sette tentativi riusciti, senza altre invocazioni. La sua durata end-to-end iniziale non è recuperabile e rimane null; la somma dei tempi delle chiamate non viene confrontata con il tempo totale baseline. La ripetizione aggiuntiva ha anche mostrato un falso negativo Q3 («no winrate against the user deck»), corretto nel grader v2 con casi positivi e negativi, senza rigenerare risposte. Le coppie append e prompt usano file distinti e non sono coinvolte nella sovrascrittura. Totale della sessione: 30 chiamate live, incluse le sette ridondanti; 393.835 token input, di cui 232.960 cached, e 11.833 output. Nessuna campagna automatica aggiuntiva.

Il corpus ridotto e prevalentemente sintetico verifica fedeltà, conservazione e riferimenti. Non copre una valutazione cieca su 30–50 partite reali, la qualità tattica generale, p50/p95 di latenza o una prova statistica di non inferiorità. Non si dichiara un miglioramento competitivo. APP-182/183 restano separati.

## Verifiche applicative e riproduzione

Build e typecheck passati. Suite finale: **365 test passati, 46 opzionali esclusi**. Regressioni su oltre 40 tentativi, usage prima di un errore di validazione, retry, interruzione, cache legacy, isolamento, invalidazione, frammenti, originali e cache Matchup. Smoke Electron Windows offline generale e Thread passati su profili temporanei. Le prove di orchestrazione sintetiche e gli smoke offline non sono presentati come integrazioni AI reali; queste ultime sono documentate separatamente sopra.

Node 24; usare TEMP/TMP dentro il workspace. I processi Electron e Codex hanno richiesto esecuzione fuori dal sandbox per avviarsi, sempre con fixture isolate. Nessuna modifica del profilo personale, installazione di una release o chiamata a servizi da dati privati del progetto.

I runner live sono opt-in. Configurazione JSON esplicita tramite `POKEGURU_AI_QUALITY_CONFIG`, stessa CLI tramite `POKEGURU_CODEX_BIN`, destinazioni distinte. Eseguire dalla radice la selezione con `--exclude '**/.verify/**'` per non includere la baseline congelata. Per la baseline usare un checkout separato di `4642862`, copiare harness e fixture, mantenendo il suo `src` invariato. I runner di confronto, append e prompt documentano i rispettivi flag nelle intestazioni. Append riusa il job già completato e impone cinque nuovi tentativi al massimo; recovery è solo in lettura. I JSON del rapporto conservano le risposte necessarie alla revisione, esclusivamente relative al corpus di prova.

Il codice è pronto per revisione nel ramo di lavoro. Merge, CI remota e release non eseguiti in questo incremento; versione e schema applicativo restano 0.3.8 e 16.
