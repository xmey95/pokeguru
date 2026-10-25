# Misure del renderer

## APP-113 — Baseline con archivi crescenti (25 ottobre 2026)

`npm run test:performance:growth` compila l'app e avvia Electron con un profilo temporaneo. La fixture crea 10.000 stampe sintetiche, 160 Thread, 800 messaggi con pacchetti di evidenze di circa 32 KiB, 160 candidate, 120 eventi Play con 120 partecipanti, 60 Regional con 300 partecipanti, 60 avversari Matchup e 300 revisioni. La lista di base è l'esempio del repository; le guide e le carte sono sintetiche. Nessuna chiamata Codex o fonte esterna è inclusa. Il profilo viene eliminato alla fine e la prova non legge i dati personali.

Prima misura Windows su `0ddc49d`, Electron 45/Node 24, cache OS calda. I valori sotto sono intervalli delle mediane di cinque chiamate IPC in più prove valide con la fixture completa, salvo le evidenze Matchup misurate in tre chiamate. Il benchmark stampa tutti i campioni JSON, così il confronto dopo l'integrazione può usare gli stessi dati.

| Percorso | Baseline | Dimensione della risposta / osservazione |
| --- | ---: | --- |
| Avvio fino al progetto visibile | 764–1.281 ms | Un solo avvio per prova; indicativo |
| Catalogo completo via IPC | 89–188 ms | 6,37 milioni di caratteri JSON |
| Riepilogo Catalogo dopo la prima costruzione cache | 0,3–0,6 ms | 9.449 caratteri |
| Ricerca Catalogo, prima pagina | 1–1,1 ms | 13.223 caratteri |
| Riepilogo 160 Thread | 1,2–1,9 ms | 55.911 caratteri |
| Dettaglio Thread con 5 messaggi | 1,2–1,7 ms | 163.243 caratteri |
| Riepilogo 120 Play | 37–64 ms | 29.921 caratteri |
| Riepilogo 60 Regional | 75–76 ms | 12.601 caratteri |
| 60 guide Matchup salvate | 0,8–1,1 ms | 40.091 caratteri |
| Una discussione Matchup, 5 revisioni | 0,7–1,2 ms | 4.369 caratteri |
| Evidenze Matchup ricalcolate | 187–269 ms | 430 caratteri nella fixture, senza liste corrispondenti |

Il benchmark `tests/catalog-performance.test.ts` sullo stesso commit misura `CatalogStore.view()` a 10.000 stampe in 76,78 ms e la copia strutturata in 44,22 ms; la vista restituisce 8,42 MB prima di IPC. `tests/summary-performance.test.ts` misura letture integrali Play/Regional in 96,92/102,18 ms e i riepiloghi in 33,58/41,45 ms. Queste misure, insieme al codice di `currentMatchupEvidence`, attribuiscono gran parte del costo dell'anteprima Matchup alle letture di tutti gli eventi e del Catalogo prima della selezione. Il costo del solo calcolo della corrispondenza non è ancora isolato. Il trasferimento completo del Catalogo è ripetuto all'accesso a Lista, Thread e Matchup; il riepilogo della vista Catalogo evita quel trasferimento.

Il click di navigazione, misurato fino a due frame dopo l'attivazione della sezione, ha mediane calde di 36–62 ms. Il primo accesso a Lista e Matchup arriva a 2,3–2,7 s e 3,8–5,5 s nella fixture, con long task fino a 2,3 s: la misura include lavoro innescato dalla sezione precedente e non è ancora un tempo di contenuto pronto attribuibile a una singola causa. La prova di 120 frame di scroll ha avuto p95 di 17–19 ms nel Catalogo, Thread e Matchup, con 0–4 frame oltre 32 ms. L'heap JS renderer è passato da circa 55 MB a 125–134 MB nel giro completo; sono snapshot senza garbage collection forzata e non dimostrano una perdita di memoria.

**Prossima misura:** dopo l'integrazione UI, profilare il primo accesso con sezioni isolate e contenuto pronto, includendo long task e main thread. Separare nel calcolo Matchup query/parse eventi, Catalogo, selezione e IPC; confrontare memoria dopo GC o cicli ripetuti. Applicare correzioni solo dove la riduzione è ripetibile, mantenendo fonti e snapshot; ripetere su Windows/Linux e con un pacchetto installabile se il percorso di avvio risulta critico.

### Diagnosi intermedia e intervento circoscritto

La priorità osservata sulla fixture è: (1) primo accesso a Lista/Matchup con long task di circa 2 s, da attribuire con profiling del renderer dopo l'integrazione UI; (2) lettura completa di Catalogo per Lista, Thread e Matchup; (3) ricostruzione delle evidenze Matchup da tutti gli snapshot Eventi e dal Catalogo; (4) riepiloghi Eventi da 37–76 ms. Dettaglio Thread, ricerca Catalogo e guide Matchup già salvate non giustificano un intervento ora. Le misure del primo accesso non autorizzano ancora una modifica del renderer.

Un confronto sul database sintetico ha provato a estrarre i campi dei riepiloghi Eventi con una singola chiamata `json_extract` a più percorsi. Play è passato da 32 a 47 ms e Regional da 39 a 43 ms, con una differenza di forma nel risultato Play. L'alternativa è stata scartata.

La modifica nel solo `CatalogStore` conserva una vista completa per istanza e giorno, invalidata da `save`, `savePrints` e dai lotti di aggiornamento. Il riepilogo di navigazione si rigenera anche quando cambia la data locale, perché la copertura dei set ufficiali dipende dal giorno. Il benchmark isolato a 10.000 stampe ha misurato 80,82 ms per costruire la vista e 0,18 ms per la seconda lettura invariata. In tre prove Electron successive sulla medesima fixture, la mediana IPC del Catalogo completo è stata 66,8, 80,6 e 65,4 ms; le evidenze Matchup 126,8, 146,1 e 194,7 ms. Sono misure sullo stesso computer ma non appaiate con un controllo senza cache nella stessa esecuzione: traffico IPC, scheduling e garbage collection variano. Il miglioramento del percorso caldo è coerente con la riduzione delle letture nel main process; la risposta resta di circa 6,37 milioni di caratteri e il primo caricamento continua a costruire la vista.

Typecheck/build, 145 test locali passati/18 esclusi, test Catalogo e Standard mirati ed E2E Catalogo con profilo temporaneo sono passati su Windows. Il benchmark Electron popolato è passato tre volte dopo la modifica. Una sincronizzazione Standard *live* è stata interrotta prima del completamento: non è una verifica della fonte o della cache durante un download reale. Il benchmark e l'E2E usano dati sintetici o fixture; non certificano qualità delle fonti o generazioni Codex.

### Criteri per il completamento dopo l'integrazione UI

1. Aggiornare il ramo da `dev` dopo le PR UI, conservando gli esiti e misurando sullo stesso commit sia baseline integrata sia variante candidata; almeno tre cicli per avvio/primo accesso, cinque campioni per IPC e 120 frame per scroll. Misurare contenuto pronto, non solo il pulsante attivo.
2. Usare un profilo CPU del renderer per assegnare i long task iniziali a funzioni concrete. Per l'anteprima Matchup separare tempo delle letture degli snapshot Play/Regional, lettura Catalogo, selezione delle liste e copia IPC. Una modifica ulteriore richiede un guadagno ripetibile sul percorso completo e nessuna perdita di provenienza.
3. Controllare che la cache non mostri dati precedenti dopo salvataggi, sincronizzazione ripresa e cambio data; misurare heap e memoria del main dopo cicli ripetuti o GC, perché uno snapshot singolo non prova una perdita né il suo contrario.
4. Eseguire typecheck/build, suite mirata e percorsi Electron su Lista, Thread, Catalogo, Eventi e Matchup; verificare i job CI Ubuntu e Windows della PR prima della consegna al coordinamento. Nessun merge autonomo.

## Metodo

`node tests/renderer-performance-live.mjs` legge gli asset di `out/renderer/assets` dopo `npm run build`, apre cinque processi Electron con profili temporanei distinti, registra il tempo dal lancio alla vista Benvenuto e i tempi `DOMContentLoaded` del renderer. Nel primo processo crea un progetto vuoto e ripete cinque volte la navigazione fra Catalogo, Lista, Thread, Eventi, Matchup e Impostazioni AI. Il cronometro della navigazione gira nel renderer: parte dal click e termina dopo che la sezione è attiva, non mostra un caricamento di navigazione e ha completato un ulteriore frame. Il benchmark usa un errore offline immediato per `matchups:get-meta` e una CLI Codex assente; misura la navigazione, non una sincronizzazione reale né l'inferenza AI.

Le prove del 25-10-2026 sono state eseguite sullo stesso codice: Windows con Electron di sviluppo e Ubuntu 24.04 in WSL2/Xvfb, compilato in una copia temporanea. Cinque avvii consecutivi condividono cache del sistema operativo; ciascuno usa un profilo applicativo nuovo. I tempi sono arrotondati al millisecondo. Il primo campione Linux include il download iniziale del binario Electron da parte del pacchetto npm; non rappresenta un avvio installato.

| Misura | Windows | Linux WSL2/Xvfb |
| --- | ---: | ---: |
| JavaScript renderer | 980.102 byte, 189.132 gzip | uguale |
| CSS renderer | 68.193 byte, 11.784 gzip | uguale |
| Avvio alla vista Benvenuto, mediana di 5 | 562 ms | 369 ms |
| Avvii singoli | 562, 588, 542, 565, 556 ms | 1.313, 369, 368, 362, 372 ms |
| `DOMContentLoaded`, mediana di 5 | 92 ms | 40 ms |
| Navigazione sezioni, mediana di 5 ciascuna | 31 ms in tutte | 31 ms, Catalogo 32 ms |

La dimensione gzip è un'indicazione di comprimibilità del file: l'app locale non scarica il renderer con HTTP a ogni apertura. La prova non quantifica separatamente parsing del bundle, avvio di SQLite, CPU, memoria o tempi con un catalogo grande. Per il catalogo da 5.000/10.000 carte e i riepiloghi Eventi/Thread si vedano APP-093/094 in `docs/BACKLOG.md`.

## Decisione

Il bundle JS è grande in byte, ma in questi percorsi non emerge una pausa di navigazione attribuibile al suo caricamento: il cambio sezione è vicino a due frame a 60 Hz su entrambi gli ambienti. Una divisione ora introdurrebbe richieste dinamiche e nuovi stati di attesa senza un guadagno misurato. Si mantiene il bundle attuale e il benchmark come baseline ripetibile. Se un modulo futuro aumenta il tempo di avvio o rende lenta una sezione, misurare separatamente parsing/valutazione JS e primo accesso alla sezione prima di introdurre chunk asincroni; la verifica deve includere il pacchetto installabile.
