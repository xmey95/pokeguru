# Alternative alla prima mossa e conservazione delle vittorie

L’epoca11 termina a **128 chiamate v28 e 0/3 nuove guide valide**: quattro invocazioni nuove,125 principali e tre diagnostiche complessive. Le76 precedenti restano separate, per204 storiche. Il processo20081 termina con exit1 prima della scelta126: otto chiamate disponibili contro undici previste. Gli altri due job non sono stati avviati. Archivio epoca11:506 file,479 input live invariati e94 checkpoint.

I metadata123/124 richiedono nuove costruzioni. Una richiesta cambia la nostra prima mossa; il costruttore disponibile, invece, iniziava sempre dalla risposta avversaria, dopo aver congelato quella mossa. Le intenzioni del piano non potevano quindi materializzarsi correttamente. La proposta125 è conservata senza essere adottata o riscritta manualmente. Non si tratta di un errore di trasporto Codex: le quattro risposte sono arrivate.

## Correzione generale

- Un ramo `other` può dichiarare esplicitamente `forkAtTurn:0`. Ruoli direct/access/defend continuano a confrontare risposte alla medesima nostra mossa. Nessun nome di carta o matchup decide il punto di diramazione.
- Il nuovo ramo mantiene setup e pescata ordinaria identici; deve eseguire una prima mossa diversa. Registro, inventari, costi, audit e tutti i controlli ordinari restano obbligatori.
- Il primo turno alternativo richiede una propria critica indipendente prima della replica. Un pass sulla linea principale non è riutilizzabile. Una critica negativa conserva i rilievi, invalida soltanto quel ramo e impedisce il seguito finché non corretto.
- I metadata ricevono tutti i turni effettivi. Una diversa nostra decisione non può essere usata come risposta minima/preferita o testimone di rimozione della mossa principale: sarebbe un confronto tra premesse diverse.
- Le proposte storiche già selezionate mantengono la loro scelta e i checkpoint compatibili. Le sole proposte ancora non adottate richiedono un aggiornamento AI versionato, con gli stessi rilievi e l’originale completo. Il nuovo piano e il nuovo contesto sono salvati separatamente; gli originali non vengono sovrascritti.
- Una vittoria nel primo turno alternativo può omettere i due turni successivi soltanto se la fine partita è derivata dal registro. Una vittoria al nostro turno successivo conserva quel turno: l’assemblaggio precedente poteva omettere proprio le azioni vincenti. Marker terminali falsi restano respinti. I contratti fino alla v27 non cambiano.

## Verifiche locali

Passano21 test mirati, inclusi sette nuovi casi sulle alternative iniziali e il recupero di una proposta storica sintetica. Coprono selezione esplicita, rifiuto di cambi a setup/pescata o di mosse identiche, critica mancante/negativa, ripresa senza ricomprare turni e riesami, conteggio delle riserve, vittoria iniziale e conservazione delle azioni vincenti finali. Questi casi sono sintetici e non provano qualità competitiva o convergenza del provider.

Due replay su copie dei dati reali preservano125 tentativi e94 checkpoint. Al tetto corrente136 la richiesta viene bloccata prima di qualsiasi provider: **otto residue, almeno dodici richieste**. Al tetto ipotetico152 raggiungono soltanto `branch-plan-upgrades`, con i due piani pendenti e senza ricomprare setup, vecchi rami, metadata o riesami. L’unico dispatch della copia si arresta prima del servizio; non è una chiamata reale né un’autorizzazione a152.

L’audit dei12 archivi (undici campagne più diagnostico), dei479 input congelati precedenti e dei483 input della verifica corrente passa. Binding e byte dei chunk correnti coincidono con l’archivio terminale; gli altri due job restano assenti. Nessuna modifica manuale dei contenuti reali, adozione del diagnostico o nuova chiamata AI dopo lo stop.

La suite completa passa **653 test/44 esclusi**,106 file passati e37 esclusi su143,in506.46s. Handle37487 terminale exit0,poi typecheck e build riusciti;log `initial-fork-full-suite.log` e `initial-fork-build.log`. Il freeze è `initial-fork-freeze/manifest.json`,483 file,hash `b79de4829ac8699dad0006fef07dce2f3f548675a149a7756db1c12bc5ca382a`,ricontrollato intatto dopo le verifiche. I654 test della policy isolata restano una prova separata,non della combinazione aggiornata. Typecheck del nuovo runner,prepare,seal,guard epreflight passano senza provider o nuovi job. Il runner congela481 input con seal `dfce2a26bc7986bcfe11effe5c6f426fb0b3ed386efd12deba741a541d60fb3a`;nessun grant o processo live. Evidenze finali in `verification-initial-fork.json` e `verification-epoch12-preparation.json`.

## Budget e condizioni ancora aperte

Tetti autorizzati invariati136 per guida e184 v28,24 riservate per ciascuna successiva:56 residue nel pool,otto sul primo e48 riservate. Lo stop concordato resta chiuso. Dodici è un minimo per accedere alla fase corrente, non il costo finale della guida: il nuovo piano e le successive critiche possono richiedere altro lavoro.

È preparato soltanto un runner proposto152/200/riserva24,senza grant né invocazioni reali. Consentirebbe fino a72 nuove chiamate,24 sul primo e48 riservate,massimo storico276;aumenta di16 entrambi i tetti. Suite/build,sigillo del runner,guardia dell’autorizzazione epreflight sono conclusi;per riaprire lo stop e aumentare i tetti serve nuovo consenso specifico. Non promette approvazione. Altri matchup solo dopo una valida,stop globale al primo non valido eheld-out esclusi restano obbligatori. Protocollo in [CAMPAIGN-EPOCH12.md](CAMPAIGN-EPOCH12.md).

Restano tre guide reali complete, verifica di persistenza/riapertura/UI delle valide, audit generale, integrazione della policy di budget e calibrazione ordinaria prima dell’attivazione. La copia policy654/UI è conservata ma va riallineata al nuovo codice prima dell’adozione. Defaultv27 e blocco del provider realev28 nell’app restano attivi; nessuna app finale pronta è dichiarata.

Evidenze locali in `.verify/app225-segments-20261102/`: `epoch11-archive.log`, `epoch11-needs-audit.json`, `initial-fork-targeted-11.log`, `initial-fork-typecheck-4.log`, `initial-fork-sizing-replay.log`, i due `initial-fork-sizing-replay-0-*.json`, `initial-fork-preservation.json` e `epoch12-typecheck.log`.
