# Verifica della riserva dopo la scelta delle alternative

04 novembre 2026, Europe/Rome. APP-225 resta In progress: **0/3 nuove guide valide**.

L’epoca14, autorizzata entro 168/216 con riserva24, termina con una sola nuova chiamata riuscita (148 principale). Totale151 v28 =148 principali +3 diagnostiche;227 includendo le76 precedenti. La prima scelta è salvata. Nessun errore Codex, nessuna seconda scelta o avvio degli altri matchup. Il processo33992 è terminale con exit1 perché la riserva dinamica supera il residuo. Archivio509 file,482 input live e112 checkpoint conservati.

## Riserva misurata su copia

| Lavoro pendente | Chiamate |
| --- | ---: |
| Rami effettivamente scelti nel caso1 | 10 |
| Ipotesi minima per i rami del caso2 | 2 |
| Scelta ancora pendente nel caso2 | 1 |
| Metadata | 2 |
| Fasi esterne riservate | 3 |
| Minimo corrente | **18** |

Il residuo sul primo matchup è17: lo stop è corretto. La scelta effettiva ha ampliato il lavoro rispetto all’ipotesi usata prima della chiamata148. Non risultano doppi conteggi. L’intera proposta nota per il caso2 richiederebbe10 chiamate native invece delle2 dell’ipotesi minima, portando la riserva a26. La proposta non è stata adottata né corretta manualmente.

169/217 consentirebbe soltanto l’accesso alla scelta;177/225 coprirebbe la riserva dell’intera proposta nota senza margine di riparazione. Questi valori non prevedono il completamento o l’approvazione.

## Verifiche concluse senza AI

Tre replay su copie:168 si blocca prima del provider (17 contro18),169 e184 raggiungono soltanto la seconda scelta pendente. Piano147 e scelta148 non vengono ricomprati. Un test di audit riconcilia le componenti18/26. La prima ipotesi del test dimenticava il gruppo di scelta fratello ed è stata corretta dopo il confronto con il piano salvato; non era una modifica necessaria all’app.

Tutti i482 input live dell’epoca14 e i485 input della precedente verifica completa sono identici. Restano applicabili i **659 test passati /44 esclusi, typecheck e build** già eseguiti; non si dichiara una nuova esecuzione della suite completa. I15 archivi sono conservati, così come binding e byte dei chunk. Nessuna chiamata reale dopo151.

La preparazione dell’epoca15 ha superato prepare, seal, guard, preflight e typecheck. Un riferimento a un file di replay inesistente ha fatto fallire il primo seal; è stato corretto prima del congelamento.484 input congelati, impronta `a3e056bc382439f8eabb6050830a4d11a3210f3c5ab90efbbda4dcdb3b8395e4`. Nessun grant o processo live.

## Proposta ancora da autorizzare

184 chiamate cumulative per guida,232 v28,24 riservate per ciascuna successiva: aumento16 sui tetti168/216. Dalla baseline151: massimo81 nuove,33 su Crustle,48 riservate; massimo308 storico incluse76. Le33 coprono la riserva nota26 più sette di margine, senza garanzia di approvazione.

Stesso job, dati pubblici e servizio OpenAI tramite Codex. Altri matchup soltanto dopo una guida valida; stop globale al primo matchup terminato senza valida. Nessuna modifica manuale, reset o held-out; tutti i controlli e lo scaling mantenuti. Defaultv27, guardv28 e policy isolata restano invariati. La verifica semantica dal vivo del nuovo controllo dell’obiettivo resta da completare.

Evidenze locali: `.verify/app225-segments-20261102/verification-native-reserve.json`, `verification-epoch15-preparation.json`, `epoch14-budget-audit.json`, `native-reserve-replay-0-{168,169,184}.json`, `campaign-v28-epoch14-archive/manifest.json` e `campaign-v28-epoch15/`.
