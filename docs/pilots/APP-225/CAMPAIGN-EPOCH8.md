# APP-225 — Ripresa con capienza persistente

**Aggiornamento15:01 Europe/Rome:** consenso96/144/riserva24 ricevuto e registrato,preflight approvato ripetuto verde;live avviato in una sola copia,handle79617. Primo invio72 singolo access,nessuna ricompra dei prefissi. Monitor epoch8-status.mjs,log epoch8-live.log;codice congelato durante la prova. Le condizioni di attesa sotto sono cronologia.

**Preparazione offline completata, non autorizzata**, 03/11/2026 alle 14:56 Europe/Rome. Nessun nuovo grant, invio o job. La prova precedente è terminale, non un processo da rilanciare con il vecchio consenso.

Stesso job Crustle–N’s Zoroark, poi Alakazam/Dudunsparce–Basic Box e Dhelmise–Lucario/Hariyama soltanto dopo la guida valida del caso precedente. Stop globale al primo matchup terminato senza una guida valida, nessuna modifica manuale, tutti i controlli/riesami/scaling mantenuti e codice congelato durante il live. Held-out esclusi.

| Voce | Stato o proposta |
| --- | ---: |
| Chiamate principali già usate | 71 |
| Diagnostiche già usate | 3 |
| Totale v28 già usato | 74 |
| Tetto reale attuale per guida / nel ciclo | 80 / 128 |
| Residuo attuale per Crustle | 6 |
| Minimo corrente corretto per ripartire | 13 |
| Nuovo massimo per guida proposto | 96 |
| Nuovo massimo v28 proposto | 144 |
| Riserva invariata per ciascuna guida successiva | 24 |
| Nuove massime nel ciclo proposto | 70 |
| Nuove massime per Crustle | 22 |
| Limite del job principale, tolte tre diagnostiche | 93 |
| Margine rispetto al minimo corrente | 9 |
| Massimo storico, incluse 76 precedenti | 220 |

La proposta aumenta il pool di **16**, include tutte le 74 invocazioni precedenti e non azzera contatori o rifiuti. Il minimo 13 comprende riserve prudenziali note e non garantisce la conclusione: nuovi rilievi o suddivisioni possono richiedere altro. I 55 tentativi importati nel database diagnostico non sono nuove invocazioni da ricontare.

## Codice e prove

Capienza empirica persistita e riusata tra fasi/riprese, con configurazione/fonti/job vincolati e importazione verificata dei fallimenti nativi storici. Riserve future aggiornate alla capienza appresa, senza eliminare turni o controlli. Regola esplicita della ricevuta per il solo ramo access; schema e lettori invariati, rifiuto precedente trasferito come evidenza e checkpoint accettati conservati. Dettagli e limiti in [OUTPUT-CAPACITY-VERIFICATION.md](OUTPUT-CAPACITY-VERIFICATION.md).

**637 test passati, 44 esclusi**, 104 file passati/37 esclusi, 409,48 secondi con un worker, exit 0. Passano anche 38 mirati, cinque replay su copie, typecheck e build. Tutti i 71 tentativi e 47 checkpoint originali restano integri. Con 80 la copia blocca prima di inviare; con 96 raggiunge una singola richiesta del ramo access pendente, con feedback storico e capienza unitaria. Il ramo difensivo mantiene il proprio retry. Gli altri due casi arrivano soltanto al piano in copie, senza job reali.

Otto archivi v28/diagnostico, binding e byte dei chunk storici preservati; 76 originali, 254 sorgenti e undici archivi verificati separatamente. Nessun contenuto AI corretto manualmente e nessuna nuova guida valida prodotta dalle verifiche offline.

Freeze della ripresa: **477 file**, seal `cb2cdf9f6bb50f2900464cc5449f53d0f5b3984f7646a793294b7782c4b94444`. Baseline, prepare/seal/guard/preflight e typecheck verdi. Il freeze di verifica della suite è distinto: 482 file, hash JSON compatto `f3eeed459dfb15d56869cb951884f8900f2c207775c172639f49a918c7f25f6a`, immutato durante le prove.

## Avvio solo dopo consenso

- Runner `.verify/app225-segments-20261102/campaign-epoch8-live.test.ts`, variabile `POKEGURU_V28_EPOCH8`, controllo `campaign-v28-epoch8/`.
- Report `verification-output-capacity.json` e `verification-epoch8-preparation.json`.
- Il nuovo consenso deve autorizzare sia il passaggio da 80/128 a 96/144 sia la riapertura dopo lo stop, con riserva24 invariata. Nessun `authorization.json` prima della risposta effettiva.
- Dopo consenso, ricontrollare source/seal/baseline, registrare il grant con riferimento alla risposta, ripetere il preflight e avviare una sola copia. Selezionare solo il runner corrente escludendo `**/frozen/**`.
- Alla terminalità confermata dall’handle, archiviare dati e controlli prima di cambiare il codice; confrontare SQLite/binding/chunk e contare tutti i tentativi effettivi, compresi gli errori.

Default v27 e guardia reale v28 conservati. Obiettivo ancora incompleto: 0/3 nuove guide valide, UI/persistenza reali, generalità, policy applicativa e build utilizzabile restano richiesti.
