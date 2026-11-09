# APP-249 — Campagna reale v17 interrotta

**31 chiamate nuove, 30 risposte complete, 0/3 nuove guide valide.** Esecuzione il 6 novembre 2026, dalle 23:24 alle 23:43 (Europe/Rome), durata 19 minuti e 7 secondi. Chiusura e verifiche registrate il 7 novembre. Stop sul primo matchup rispettato: Alakazam/Dudunsparce–Basic Box e Dhelmise–Lucario/Hariyama non sono stati avviati. Nessuna chiamata dopo il terminale.

## Identità e controlli

Nuovo job isolato Crustle–N’s Zoroark 07ce0fe7-9e97-475e-b7c9-95aa653df369, campagna 537122ad-266c-4bf1-98fb-4ca7187f4306, sigillo 3d44a9b922bbc5f3c41395eea265b8b3aa7f9e8807f77521139b1c1a512316fb. Sessione 82154, processo 20272. La sessione del tool non è più disponibile: l’exit code del processo principale non è stato osservato e resta null; non viene dedotto dal terminale negativo.

I 576 file qualificati del codice e dei test APP-248 sono rimasti identici, come build e prove offline dei 283 casi. Nessun contenuto manuale, pass trasferito, modifica ai validatori o riduzione dei controlli. Scaling dinamico, calibrazione storica, contabilità cumulativa e riserva 24 conservati. Gli held-out restano esclusi.

## Avanzamento effettivo

Il piano e il primo riesame sono completati. Due setup superano il lettore completo e sono registrati come costruiti; questo non certifica da solo il raggiungimento della premessa tattica desiderata. Sono costruiti anche i nostri due turni principali.

Sette riesami semantici degli audit sono positivi, senza findings o unproven, e nessuna risposta è respinta per formato. In particolare un totale di sei Premi è accettato con cinque addizioni dei saldi autentici: il precedente falso rilievo sulla sua rappresentabilità non ricompare. Le fonti della procedura dei danni sono consegnate in tutti e sette i riesami. Nessun target di questi riesami contiene esplicitamente ×1: il relativo caso resta verificato offline da APP-248, non dichiarato esercitato dal vivo in questa campagna.

Il riesame più ampio delle premesse restituisce un pass e un revise. Il negativo riguarda lo sviluppo storico omesso: il registro mantiene soltanto pescate e non realizza la posizione richiesta tramite assegnazioni, evoluzione, KO, Premio e promozione. Il critico distingue correttamente l’ammissione della lacuna dalla prova della premessa e non accetta l’asserito impedimento del campo decisionProof come impossibilità della linea. Questo è un problema di contenuto distinto dal falso rilievo sui Premi.

Il coordinatore avvia automaticamente la riparazione del setup, senza interventi manuali: routing, nuovo quadro e due turni riescono. La richiesta 31, per il turno storico successivo, si interrompe senza risultato finale. La riparazione non arriva al riesame; non sono prodotti capitoli o un report completo della nuova guida. Nessuna nuova guida reale è quindi verificata in UI o pubblicata.

## Interruzione del processo

Il record originale della chiamata 31 contiene code=unknown ed exitCode=1073807364, ossia 0x40010004. La [documentazione Microsoft NTSTATUS](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-erref/596a1078-e883-4972-9bbc-49e60bebca55) identifica questo valore come DBG_TERMINATE_PROCESS, una terminazione del processo. Sono registrati 221 byte stdout, un item completato, nessun turno completato, nessun risultato finale e nessun evento strutturato di errore del provider. Lo stderr non viene esposto: restano lunghezza e hash.

L’interruzione della chat è stata osservata durante l’attesa della campagna; i dati non dimostrano però che sia stata la causa della terminazione. Non attribuiamo l’evento a quota, autenticazione, connessione, schema, modello o token senza evidenza. Il timeout era 600 secondi; l’interruzione avviene dopo circa 48 secondi, quindi non è classificata come timeout dal runtime.

Il preflight della richiesta era ammesso: 61.060 token input stimati, 6.000 output riservati, margine 8.192, 90.281 byte; nessun gate di budget fallito. Il messaggio generico suggerisce di controllare accesso/connessione/modello ma non prova quelle cause.

Il terminale della campagna è scritto, ma rimane un lock. Il 7 novembre è stato verificato in sola lettura che il processo 20272 non esiste; il lock originale è conservato in orphaned-live-lock.json e la sola copia attiva è rimossa con prova in orphan-lock-cleanup.json. Grant e run-started restano intatti, lo stop non è riaperto e nessun processo viene rilanciato.

## Verifiche conclusive

- Due riaperture su un backup conservano code=unknown, 31 tentativi, 30 raw e 422 campioni senza raggiungere il provider: 8775 ms / 6625 ms e 454.52 MiB, entro le soglie originali 60 s / 10 s / 768 MiB. Nessun reset del retry o della contabilità.
- Archivio nuovo immutabile con 814 file. Tre backup e tutte le 39 tabelle per database coincidono con gli originali terminali; tutti i job e riferimenti alle evidenze ereditati restano identici. I tre database sorgente della campagna precedente non sono modificati.
- Nove archivi precedenti verificati: 802 / 799 / 799 / 794 / 798 / 784 / 783 / 903 / 892 file. Codice, runner congelato e prove di qualificazione conservati. I 283 test e la UI sintetica sono le prove già qualificate di APP-248, non test rilanciati o una nuova verifica reale di una guida valida.
- Usage delle 30 risposte: 1.308.208 token input, 32.470 output, zero cached. Il totale è incompleto per la chiamata 31, priva di usage; quella invocazione è comunque conteggiata. La calibrazione cresce automaticamente da 392 a 422 campioni, fattore prudenziale 1.6560121558488685.

## Budget e ripresa

| Voce | Usate | Residue | Tetto |
|---|---:|---:|---:|
| Prima guida cumulativa |443|133|576|
| Seconda guida |0|500|500|
| Terza guida |0|500|500|
| Ciclo v28 |443|1057|1500|

Le 76 invocazioni storiche precedenti restano separate: totale 519. Riserva 24 per ciascuna successiva, 6 crediti di riparazione usati dei 16 e 10 residui. Il budget non è esaurito, ma non riapre una campagna terminata. Il journal della richiesta non classificata resta bloccante e non viene azzerato. Il minimo noto della fase interrotta era 9 invocazioni, non una stima del completamento. Un eventuale nuovo job completo richiederebbe disponibilità 164 contro 133; non è preparato né proposto come sostituto automatico. Nessun aumento dei tetti.

APP-249 Done per l’esecuzione e la verifica dell’esito negativo. APP-232/APP-225 e l’obiettivo generale restano incompleti. APP-250 Backlog per l’indagine offline sulla terminazione e sulla ripresa della sola fase pendente, distinguendo il problema di sviluppo storico dall’interruzione del processo. Nessuna ulteriore chiamata, correzione applicativa o riapertura autorizzata automaticamente.

Evidenze: .verify/app249-bounded-v17-20261106/{verification-terminal-v17.json,diagnosis-v17.json,stop-inspection-v17.json,audit-arithmetic-coverage.json,main-premise-reviews.json,failure-031-diagnostic.json,stopped-replay-v17.json,budget-terminal.json,closure-v17.json}; archivio .verify/app249-bounded-v17-20261106-archive/manifest.json.
