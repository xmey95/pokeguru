# APP-239 — Campagna bounded v12: stop al secondo setup

La prova reale autorizzata è conclusa. Processo26056/sessione66264, exit1 dopo555,292 secondi (9m15s), 17 nuove invocazioni. **0/3 nuove guide valide.** Crustle–N’s Zoroark termina con esito non valido; Alakazam/Dudunsparce–Basic Box e Dhelmise–Lucario/Hariyama non sono avviati. Stop globale rispettato, nessun riavvio o nuovo invio dopo il terminale.

## Risultato osservato

L’isolamento del nuovo job funziona con il vecchio job in pausa conservato. Il nuovo job è47e8ade7-0797-4d80-a150-b3fe250c1a30, nella campagna4ccd4890-e5fd-4cc0-85a1-04ffe8cf8f95. Codice e766 input restano quelli qualificati APP-238; sigillo b4c9850fc2883723a4f9f6cfeecdf830c8d75e42808b5ceaa7e9513b2c1bdfcf.

Il critico iniziale approva con verdict=pass e findings=[]; il suo protocollo corretto è quindi verificato dal vivo su questa risposta. Tutte le17 invocazioni risultano riuscite al servizio e i17 raw sono conservati. Non si tratta di17 errori di trasporto.

Il primo setup scenario-1 ha una costruzione accettata dal controllo locale completo, che non equivale all’approvazione della guida. Un audit è respinto per1225 caratteri contro il limite600 e viene gestito automaticamente; il limite non cambia.

Il secondo setup scenario-2 viene costruito due volte. Entrambi i tentativi sono respinti con lo stesso controllo della posizione:

> scenario-2: danni/posizione non riferiti a un Pokémon vivo e presente.

Il runner termina con draft-limit dopo la seconda costruzione, senza rimuovere il controllo. Header e turni appartengono effettivamente a scenario-2; il problema non deriva da un’identità di caso scambiata nel trasporto. Sono conservate le annotazioni AI, i due registri e i relativi riferimenti autentici. L’errore indica incoerenza delle annotazioni rispetto alla posizione verificata; questa prova non stabilisce da sola se il difetto primario sia nelle dichiarazioni AI o nella proiezione/validazione. Non è stata modificata alcuna annotazione a mano.

Nessun caso completo con le repliche, capitolo, esercizio, revisione finale o report è stato consegnato. Non ci sono guide reali da provare in UI per questa campagna.

## Contabilità e integrità

| Voce | Esito |
| --- | ---: |
| Nuove invocazioni |17|
| Totale v28 / storico |375 /451|
| Tetti cumulativi per guida |522 /500 /500|
| Residui per guida |147 /500 /500|
| Pool autorizzato /residuo |1500 /1125|
| Riserve successive |24 +24|
| Usage nuove chiamate, input /output /cached |730392 /18327 /0|
| Nuove guide valide |0/3|

Contatori, diagnostiche pregresse e tentativi pendenti rimangono inclusi. Lo scaling conserva ora355 campioni (338 ereditati più17 nuovi); massimo fattore osservato1,611489961838394, senza reset. Tetti, riserve, limiti dimensionali e tutti i controlli invariati; nessun contenuto manuale e held-out esclusi.

Archivio terminale immutabile:798 file, tre backup SQLite confrontati su39 tabelle ciascuno. Vecchi archivi784/783/903/892 file, sorgenti v10, codice e input congelati verificati intatti. La verifica dell’esito negativo è riuscita; non è un’approvazione della campagna o dei contenuti.

## Riapertura su copia e limiti

Due aperture dello stesso job su copia si fermano sul controllo originale prima del provider, senza ricomprare chiamate o perdere raw/rifiuti:17 avvii,17 raw e due rifiuti del setup restano identici. Prima apertura1,106s, successiva0,629s, picco454MiB, sotto60s/10s/768MiB.

**La classificazione non è equivalente:** la prova reale termina con draft-limit; in cache viene rilanciato l’errore generico originale e la classificazione è unknown. La prova su copia dimostra la conservazione dello stop e dei contatori, non la corretta classificazione diagnostica. Questo limite rimane aperto insieme alla coerenza delle annotazioni del setup.

La campagna è terminale e non va rilanciata. Il budget residuo non è una nuova autorizzazione. Nessuna proposta di aumento o nuova campagna implicita: prima di ulteriori prove occorre una diagnosi generale offline della posizione verificata e della ripresa dei rifiuti noti, mantenendo tutti i controlli.

Evidenze: [terminale](../../../.verify/app238-job-isolation-20261106/terminal.json), [verifica terminale](../../../.verify/app238-job-isolation-20261106/verification-terminal-v12.json), [archivio798 file](../../../.verify/app239-bounded-v12-20261106-archive/manifest.json), [ispezione dei rifiuti](../../../.verify/app238-job-isolation-20261106/setup-stop-inspection-v12.json), [riapertura senza invii e limite diagnostico](../../../.verify/app238-job-isolation-20261106/stopped-replay-v12.json).

APP-239 Done limitatamente all’esecuzione e verifica dell’esito negativo. APP-240 Backlog per la diagnosi generale offline; APP-232/APP-225 e l’obiettivo completo restano incompleti.
