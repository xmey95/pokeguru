# APP-219 — Verifica reale v25 fuori dal pilota

**1 novembre 2026: 0 guide valide su 3, 39 invocazioni effettive su 48 autorizzate.** Ogni caso usa 13 delle 16 disponibili. Le tre chiamate residue per caso non coprono un ciclo di almeno quattro: riparazione e verifiche riservate. Il motore interrompe prima di una nuova richiesta; nove chiamate restano inutilizzate, senza redistribuzioni.

L’esperimento è concluso con esito negativo. Nessun contenuto corretto manualmente, nessuna modifica al codice durante la campagna, nessun controllo disabilitato e nessuna bozza respinta pubblicata.

| Matchup | Chiamate | Esito |
| --- | ---: | --- |
| Crustle–N’s Zoroark | 13/16 | Non validata; riparazioni degli scenari non completate. |
| Alakazam/Dudunsparce–Basic Box | 13/16 | Non validata; riparazioni e difetto del contratto di uscita dalla Panchina. |
| Dhelmise–Lucario/Hariyama | 13/16 | Non validata; accessi, sviluppo e audit ancora da correggere. |

## Metodo e isolamento

Tre progetti/job nuovi, database separati, nessuna guida precedente o autorizzazione eccezionale di budget. Modello reale `gpt-6.1-sol`, profondità automatica, integrazione Codex esistente; nessun runner simulato nella generazione. Tutti i controlli, il planner e lo scaling v25 di APP-217 rimangono identici. Hash di 214 file verificati prima e dopo la prova; corrispondenza anche con il codice finale di APP-217.

Si escludono i quattro archetipi del pilota da entrambi i lati. Prima di qualsiasi output AI, gli eventi sono deduplicati conservando lo snapshot più recente; gli archetipi sono ordinati per liste complete Main, poi liste totali e nome. Per ciascuno si sceglie la lista più recente/meglio piazzata risolvibile e si abbinano i primi sei risolvibili a coppie consecutive. Le 48 risoluzioni preliminari fallite restano registrate, senza sostituire carte.

Le nostre liste sono liste pubbliche esatte di prova, non liste adottate nei progetti personali. Catalogo e dati sono congelati al 30 ottobre, finestra 1–30 ottobre: 128 eventi Play e quattro Main distinti. La prova è live rispetto al modello, senza nuova acquisizione del metagame corrente. I tre pacchetti iniziali hanno rispettivamente 4/5/8 liste avversarie, 60/75/67 fonti e zero lacune di risoluzione; ogni lista totalizza 60 carte. Il generatore seleziona una lista avversaria esatta senza fondere le varianti.

## Cosa è successo

Tutti i casi costruiscono due scenari che superano i controlli locali e arrivano alla critica preventiva. Nessuno supera l’intero ciclo fino alla prosa e al riesame finale. Le ricostruzioni e riparazioni sono automatiche e i rifiuti restano archiviati.

- **Crustle:** il critico richiede sviluppo anticipato della seconda N’s Zorua, scelta di un attacco difensivo che conserva risorse e coerenza della ritirata con Mist Energy. Le riparazioni incontrano attacchi/audit omessi, numero di eventi, confronto oltre 1600 caratteri, ricevuta di accesso e condizioni incomplete. L’ultimo rifiuto riguarda un’esclusione di attacco priva di candidato o motivo verificabile.
- **Alakazam:** il critico richiede lo sviluppo di Dudunsparce tramite Poké Pad e Run Away Draw. Le riparazioni incontrano limiti testuali e audit, poi un difetto del validatore descritto sotto. L’ultima risposta non è approvata o modificata manualmente.
- **Dhelmise:** il critico rileva un accesso non giustificato a Wally’s Compassion e lo sviluppo di Makuhita compatibile con cura e attacco. Seguono promozioni/audit omessi, un output-limit con cambio automatico al formato di ricostruzione, un nuovo segnaposto e l’attacco Corkscrew Punch non completamente confrontato.

Sono respinti anche pescate di Energie esaurite nel mazzo e un Premio non appartenente alla distribuzione dichiarata. Il planner mantiene i limiti verificati di input, output, dimensione, margine e chiamate, usando le misure e i formati disponibili. Il mancato risultato non viene risolto riducendo i controlli.

## Difetto del validatore riprodotto

Il replay offline usa esattamente la risposta AI 13 di Alakazam, i suoi originali e il suo contesto, letti dal database in sola lettura. La patch viene applicata solo in memoria e non viene salvata nella campagna.

Il testo fornito di Run Away Draw prevede il rimescolamento del Pokémon nel mazzo dopo la pesca. La risposta rappresenta Dudunsparce e il Dunsparce sottostante che tornano nel mazzo: la Panchina passa da due a uno, senza Premi e senza nuovo ingresso. Il controllo degli step vieta però a `other` qualsiasi variazione della Panchina. Il contratto non offre una rappresentazione appropriata di questa uscita senza KO.

Il replay produce **quattro soli errori locali**, tutti per questa transizione: linea principale e tre rami. Le successive etichette di ingresso o KO non sarebbero una soluzione corretta. Il test diagnostico passa perché riproduce il difetto, non perché approva la guida; non certifica il valore tattico dell’intera risposta.

Questa evidenza distingue un limite dell’app dagli errori generati. L’assenza di nomi o printId del pilota nelle condizioni eseguibili non dimostra la copertura di tutte le meccaniche. **Serve correggere in modo generale le uscite dal campo senza KO**, conservando le prove degli effetti, la contabilità, i Premi e le eventuali sostituzioni dell’Attivo. Il lavoro è registrato come APP-220 Backlog; nessuna eccezione specifica per Dudunsparce è stata introdotta.

## Verifiche e conclusione

Sei audit postlive passano: immutabilità, contatori e autorizzazioni, token/riserve/deadline, protocollo degli output, accessi e contesto effettivamente consegnato ai critici, assenza di pubblicazioni non valide. Si aggiunge il test diagnostico offline. L’archivio immutabile conserva 46 file e database, oltre al codice/fonti sigillati nelle copie `tested-code`. Ogni caso conserva anche un database iniziale con zero invocazioni.

Il readback conferma zero report salvati. **Nessuna prova UI di nuove guide è stata eseguita**, perché non esiste una nuova guida valida da mostrare. La suite di 485 test di APP-217 non è stata rilanciata: il codice è identico e sono state eseguite le nuove verifiche della campagna. Il test live fallisce il criterio di tre guide valide, come risulta dagli esiti; gli audit verdi non trasformano il risultato in una validazione della generazione.

Usage nota: 2.836.957 token di input, 296.668 di output, 364.800 cached input; una chiamata non restituisce usage. Sono consumi parziali osservati, non token residui dell’account né una stima di costo.

**La v25 non è ancora dimostrata affidabile sui nuovi matchup entro il budget ordinario.** Prima di una nuova prova occorre affrontare il difetto del contratto e la capacità delle riparazioni di chiudere tutti i rami. I tre casi sono pochi e selezionati per disponibilità: non permettono una misura universale della qualità competitiva. Nessuna nuova chiamata, rilancio o correzione è autorizzata da questa chiusura; i risultati APP-217 restano integri. Nessuna release, installazione o modifica del profilo personale.

## Evidenze

- [Metriche complete](METRICS.json).
- [Report dei tentativi e rilievi originali](../../../.verify/app219-v25-20261101/report.html).
- [Audit finale](../../../.verify/app219-v25-20261101/final-audit.json).
- [Selezione e provenienza](../../../.verify/app219-v25-20261101/selection.json).
- [Sigillo del codice e dei pacchetti](../../../.verify/app219-v25-20261101/seal.json).
- [Archivio immutabile](../../../.verify/app219-v25-20261101/archive/archive.json).
- [Replay del difetto di uscita senza KO](../../../.verify/app219-v25-20261101/bench-return-diagnostic.json).
- [Esito dei sei audit](../../../.verify/app219-v25-20261101/audit.log).
