# APP-225 — Ripresa dopo lo stop dell’epoca 6

**Esito terminale14:14 Europe/Rome:**handle5346 exit1 dopo14 nuove invocazioni58–71,74 v28=71 principali+3 diagnostiche,150 incluse76 precedenti,0/3 valide. Stop6 residue/7 richieste prima di altra costruzione;altri due job assenti. Archivio499 file e473 impronte live invariati. Prova narrativa58/59 positiva e testo esatto senza alterazioni native;rami ancora incompleti per limiti output e dichiarazioni non valide di accesso/Premi. Nessuna prosa/report o nuova guida. Nessun rilancio implicito del saldo54 dopo lo stop;6 ancora assegnabili al primo caso entro80. Gli stati dal vivo sotto sono cronologia.

**Aggiornamento13:47 Europe/Rome:** consenso esplicito80/128/riserva24 ricevuto,grant registrato e preflight ripetuto verde;live avviato in una sola copia,handle5346. Monitor epoch7-status.mjs,log epoch7-live.log. Codice immutabile durante il live;attendere terminalità e archiviare prima di correggere. Gli stati di attesa sotto sono cronologia.

Stato: preparazione offline completata; obiettivo e task Blocked dal03/11/2026 alle13:40 Europe/Rome per il solo consenso alla riapertura pendente. Nessuna chiamata reale in questa epoca. Il consenso 80/128/24 dell’epoca 6 non è riutilizzato per aggirare lo stop globale concordato.

Preparazione completata il 03/11/2026 alle 13:32 Europe/Rome: baseline, seal, guardia senza consenso, preflight e typecheck passati. Freeze di 473 file, seal `26c9dbf8e0ecbd75a2ca93f0d9850a0a0c894efa71e6b7d3e68a2f66146deb3a`; sorgenti, copie congelate e database invariati. Un solo file e un test selezionati in ciascun gate, con esclusione esplicita delle copie `frozen`. Report `verification-epoch7-preparation.json`. Nessun `authorization.json`, lock, invio o nuovo job. Le istruzioni sotto restano il protocollo di un eventuale avvio dopo consenso.

## Scopo e budget invariati

Stesso job Crustle–N’s Zoroark; Alakazam/Dudunsparce–Basic Box e Dhelmise–Lucario/Hariyama soltanto dopo una guida valida per il caso precedente. Stop dell’intera campagna al primo matchup terminato senza guida valida. Nessuna modifica manuale dei contenuti, nessun cambio di codice durante il live, tutti i controlli, riesami e scaling mantenuti. Held-out esclusi.

| Voce | Valore |
| --- | ---: |
| Principali già usate | 57 |
| Diagnostiche già usate | 3 |
| Totale v28 iniziale | 60 |
| Massimo cumulativo per guida | 80 |
| Massimo v28 | 128 |
| Residuo massimo complessivo | 68 |
| Riserva per ogni guida successiva | 24 |
| Nuove massime per Crustle | 20 |
| Limite job principale Crustle, tolte le diagnostiche | 77 |
| Precedenti conservate separatamente | 76 |
| Massimo storico invariato | 204 |

Nessun aumento rispetto al consenso precedente. Non contare nuovamente le 55 invocazioni importate nel database diagnostico. Errori e tentativi falliti consumano il tetto; il runner controlla i contatori durevoli prima di ogni dispatch. Eventuali risparmi reali si possono ridistribuire solo all’interno del pool, conservando la riserva di ogni guida futura.

## Ripresa verificata

La classificazione reale 56 rimane valida e in cache. Il replay senza rete sul codice corretto raggiunge direttamente `segments-main-ours` con una unità `pg-premise-text-repair-2`, autorizzata soltanto a `comparison`. Nessun routing sintetico o testo diagnostico adottato. Cinquantasette attempt e trenta checkpoint rimangono integri, database originali invariati. Gli altri due replay raggiungono soltanto il piano.

Il minimo corrente di accesso è 11: una costruzione pendente e dieci chiamate riservate alle fasi successive. Restano 20 per il primo caso. Il minimo non garantisce di risolvere i rilievi o completare la guida: critiche negative e richieste ulteriormente suddivise possono aumentare il costo.

## File e gate

- Runner: `.verify/app225-segments-20261102/campaign-epoch7-live.test.ts`, variabile `POKEGURU_V28_EPOCH7`.
- Controllo: `.verify/app225-segments-20261102/campaign-v28-epoch7/`.
- Evidenze correttive: [SELECTED-TEXT-VERIFICATION.md](SELECTED-TEXT-VERIFICATION.md).
- Prima del consenso completare verifiche, `verification-selected-text.json`, baseline, seal, guardia senza autorizzazione, preflight e typecheck del runner.
- Solo dopo una risposta esplicita di riapertura sul nuovo seal registrare un nuovo `authorization.json`, ripetere il preflight e avviare una sola copia. Nessun grant predisposto in anticipo.
- Alla terminalità verificare il processo, archiviare SQLite e binding/chunk, confrontare le impronte, contare i tentativi effettivi e registrare l’esito. Un lock o un log da solo non dimostra che il processo sia ancora vivo.

Questa preparazione e i test offline non soddisfano l’obiettivo: restano 0/3 nuove guide valide, verifica UI/persistenza delle guide reali, generalità, politica applicativa e consegna della build utilizzabile. Default v27 e guardia sul percorso reale v28 conservati.
