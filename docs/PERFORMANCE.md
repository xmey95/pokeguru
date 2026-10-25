# Misure del renderer

## APP-113 — Baseline con archivi crescenti (25 ottobre 2026)

`npm run test:performance:growth` compila l'app e avvia Electron con un profilo temporaneo. La fixture crea 10.000 stampe sintetiche, 160 Thread, 800 messaggi con pacchetti di evidenze di circa 32 KiB, 160 candidate, 120 eventi Play con 120 partecipanti, 60 Regional con 300 partecipanti, 60 avversari Matchup e 300 revisioni. La lista di base è l'esempio del repository; le guide e le carte sono sintetiche. Nessuna chiamata Codex o fonte esterna è inclusa. Il profilo viene eliminato alla fine e la prova non legge i dati personali.

Prima misura Windows su `0ddc49d`, Electron 45/Node 24, cache OS calda. Sono state eseguite più prove; i valori sotto sono intervalli delle mediane di cinque chiamate IPC in due prove valide con la fixture completa, salvo le evidenze Matchup misurate in tre chiamate. Il benchmark stampa tutti i campioni JSON, così il confronto dopo l'integrazione può usare gli stessi dati.

| Percorso | Baseline | Dimensione della risposta / osservazione |
| --- | ---: | --- |
| Avvio fino al progetto visibile | 764–778 ms | Un solo avvio per prova; indicativo |
| Catalogo completo via IPC | 89–128 ms | 6,37 milioni di caratteri JSON |
| Riepilogo Catalogo dopo la prima costruzione cache | 0,3–0,6 ms | 9.449 caratteri |
| Ricerca Catalogo, prima pagina | 1–1,1 ms | 13.223 caratteri |
| Riepilogo 160 Thread | 1,2–1,9 ms | 55.911 caratteri |
| Dettaglio Thread con 5 messaggi | 1,2–1,7 ms | 163.243 caratteri |
| Riepilogo 120 Play | 37–60 ms | 29.921 caratteri |
| Riepilogo 60 Regional | 75–76 ms | 12.601 caratteri |
| 60 guide Matchup salvate | 1,1 ms | 40.091 caratteri |
| Una discussione Matchup, 5 revisioni | 0,9–1,2 ms | 4.369 caratteri |
| Evidenze Matchup ricalcolate | 269 ms | 430 caratteri nella fixture, senza liste corrispondenti |

Il benchmark `tests/catalog-performance.test.ts` sullo stesso commit misura `CatalogStore.view()` a 10.000 stampe in 76,78 ms e la copia strutturata in 44,22 ms; la vista restituisce 8,42 MB prima di IPC. `tests/summary-performance.test.ts` misura letture integrali Play/Regional in 96,92/102,18 ms e i riepiloghi in 33,58/41,45 ms. Queste misure, insieme al codice di `currentMatchupEvidence`, attribuiscono gran parte del costo dell'anteprima Matchup alle letture di tutti gli eventi e del Catalogo prima della selezione. Il costo del solo calcolo della corrispondenza non è ancora isolato. Il trasferimento completo del Catalogo è ripetuto all'accesso a Lista, Thread e Matchup; il riepilogo della vista Catalogo evita quel trasferimento.

Il click di navigazione, misurato fino a due frame dopo l'attivazione della sezione, ha mediane calde di 42–62 ms. Il primo accesso a Lista e Matchup arriva a diversi secondi nella fixture, con long task fino a 2,3 s: la misura include lavoro innescato dalla sezione precedente e non è ancora un tempo di contenuto pronto attribuibile a una singola causa. La prova di 120 frame di scroll nel Catalogo e Thread ha avuto p95 intorno a 17 ms con 0–1 frame oltre 32 ms. L'heap JS renderer è passato da circa 55 MB a 127–134 MB nel giro completo; sono snapshot senza garbage collection forzata e non dimostrano una perdita di memoria. La prova Matchup dello scroll inizialmente ha selezionato un elemento `PRE` interno e va ripetuta sul contenitore corretto.

**Prossima misura:** dopo l'integrazione UI, profilare il primo accesso con sezioni isolate e contenuto pronto, includendo long task e main thread. Separare nel calcolo Matchup query/parse eventi, Catalogo, selezione e IPC; confrontare memoria dopo GC o cicli ripetuti. Applicare correzioni solo dove la riduzione è ripetibile, mantenendo fonti e snapshot; ripetere su Windows/Linux e con un pacchetto installabile se il percorso di avvio risulta critico.

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
