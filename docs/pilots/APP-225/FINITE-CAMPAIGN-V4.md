# APP-232 — Esito della ripresa reale finita v4

**Aggiornamento offline successivo:** introdotte quantità strutturate derivate dal registro e verifica delle motivazioni,senza nuove chiamate. Il vecchio job conserva il limite raggiunto; i nuovi ingressi sono verificati soltanto su copie. Stato corrente in [AUDIT-COUNT-COHERENCE.md](AUDIT-COUNT-COHERENCE.md).

05-11-2026. Campagna autorizzata dall’istruzione diretta dell’utente: ripresa sui tre matchup, nessun intervento manuale, tutti i controlli e lo scaling mantenuti, tetti 500/1500 con riserva 24, stop globale al primo esito non valido.

**Esito: 0/3 nuove guide valide. Tre nuove chiamate, tutte riuscite al provider; campagna fermata dopo circa 1 minuto e 5 secondi sul secondo rifiuto indipendente della premessa di Crustle.** Gli altri due matchup non sono stati avviati. Nessun riavvio o ulteriore tentativo dopo lo stop.

## Esecuzione e contabilità

Runner 79231 terminale exit 1, durata del job 64.674 ms. Freeze di 697 input, seal `f0097f84cf9da7f26b10d543ccac5c5d82b1f796c7d80b691eb609e8464f2b35`; guardia di contabilità e preflight passati prima della rete. Nessun cambiamento a sorgenti, test, runner congelato o contenuti AI durante l’esecuzione.

| Matchup | Nuove chiamate | Cumulative v28 | Esito |
| --- | ---: | ---: | --- |
| Crustle–N’s Zoroark | 3 | 294 | Premessa respinta; limite locale di due riesami negativi |
| Alakazam/Dudunsparce–Basic Box | 0 | 0 | Non avviato, per lo stop globale |
| Dhelmise–Lucario/Hariyama | 0 | 0 | Non avviato, per lo stop globale |

Totale **294 v28 / 370 storiche**, incluse le tre diagnostiche precedenti e le 76 chiamate della campagna storica separata. Residui **206 per Crustle e 1.206 nel pool**, entro **500 cumulativi per guida / 1.500 v28 / riserva 24 per ciascuna guida successiva**. Il job corrente arriva a 39 chiamate sul massimo persistito 245; le 255 precedenti del primo matchup restano contabilizzate.

Le tre chiamate hanno uso misurato: **137.079 token di input e 1.887 di output**. I campioni di calibrazione passano da 271 a 274, senza campioni sintetici. Nessun timeout, errore di servizio, limite di token o esaurimento del tetto delle chiamate ha causato questo stop.

## Cosa è stato verificato dal vivo

1. Il recupero supera la vecchia proposta negativa del secondo setup e riusa il successore positivo già pagato. Non compra nuovi quadri o turni storici.
2. La classificazione tipizzata instrada il rilievo originale ai soli audit, non alla ricostruzione fisica. Prima chiamata nuova, sequenza 37: `review-premise-audit-routing`.
3. La seconda chiamata, `segments-finite-audits`, corregge l’audit. Le dichiarazioni fisiche prima e dopo sono identiche, verificato anche nel controllo finale degli originali.
4. La terza chiamata, `review-premise-main`, esegue un nuovo riesame indipendente con il rifiuto precedente visibile. Il critico conferma che il conteggio di Crustle è risolto: entrambe le copie sono ancora nel mazzo durante la promozione storica.

Il critico trova però un altro errore nello stesso audit storico: il confronto descrive Poké Pad come accesso a **due N’s Zorua nel mazzo**, mentre ne resta **uno**. La lista contiene quattro copie: una nella pila dell’Attivo, una in Panchina e una nei Premi. Il replay del registro conferma una copia nel mazzo alla fine del turno storico interessato. L’affermazione delle due copie era già presente nella motivazione precedente e resta nella riscrittura; non è un cambiamento dei movimenti o dell’inventario.

La riparazione del rilievo originale ha quindi funzionato, ma il nuovo audit non supera la verifica completa. Il limite conservato di **due premesse respinte** conta il rifiuto precedente e questo nuovo rifiuto: il coordinatore si ferma con `draft-limit`, senza comprare un’altra classificazione o riparazione. Avere chiamate residue non disabilita questo controllo.

La costruzione del turno per singoli eventi non viene raggiunta in questa campagna: resta verificata offline, non dimostrata dal vivo. Non sono stati costruiti nuovi rami, capitoli o esercizi, né eseguite critiche finali o prove UI di guide approvate.

## Conservazione e ripresa

- Archivio immutabile `campaign-finite-v4-archive/manifest.json`: **720 file**, inclusi i **697 input congelati**. Tutti verificati invariati dopo la terminalità.
- Tre database equivalenti ai backup su schema e **39 tabelle** ciascuno. Le basi della campagna v3 restano intatte.
- Due riaperture del generatore reale su copie ritrovano lo stesso `draft-limit`, **zero chiamate al provider e zero risposte sintetiche**, 39 tentativi e 274 campioni invariati. Tempi di ripresa: 1,582 s e 1,517 s. Questo prova la conservazione del rifiuto, non una guida valida.
- Fonte, job, progetto, lista e singolo matchup rimangono vincolati. Nessun pass trasferito, contenuto AI corretto manualmente o controllo escluso. Held-out non utilizzati.

Evidenze in `.verify/app225-segments-20261102/`: `campaign-finite-v4/terminal.json`, `campaign-finite-v4-archive/manifest.json`, `app232-finite-v4-diagnosis.json`, `verification-app232-finite-v4.json`, `app232-v4-terminal-recovery.json` e `app232-finite-campaign-v4-live.log`. I verificatori ripetibili sono `verify-app232-finite-v4-terminal.mjs` e il harness `app232-v4-terminal-recovery.ts`.

APP-232 resta **In progress**, APP-225 **Blocked**, obiettivo completo non raggiunto. Il consenso corrente è stato consumato da questa sola campagna; nessuna nuova campagna o modifica del codice avviata dopo lo stop. Il problema residuo osservato è la coerenza quantitativa delle motivazioni degli audit: aumentare il tetto delle chiamate da solo non supera il limite locale né rende corretta una motivazione.

Restano tre guide reali valide, verifica di salvataggio/riapertura/UI, audit di generalità, policy applicativa e build locale utilizzabile dall’utente. Default v27, guard v28 e policy v5 isolata invariati. Le [correzioni offline precedenti](ROUTING-RECOVERY-TURN-PARTITION.md) restano documentate separatamente; i loro test non attestano il successo di questa campagna reale.
