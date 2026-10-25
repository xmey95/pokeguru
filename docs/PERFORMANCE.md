# Misure del renderer

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
