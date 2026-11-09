# APP-241 — Ripresa reale v13 conclusa al primo audit non valido

La prova autorizzata è conclusa: sessione79627/processo39112,exit1 dopo249,502s (4m09s),12 nuove invocazioni,**0/3 nuove guide valide**. Stop al primo esito non valido rispettato. Alakazam/Dudunsparce–Basic Box e Dhelmise–Lucario/Hariyama non sono avviati; nessun invio successivo al terminale e nessun riavvio.

## Risultato

È ripreso il medesimo job Crustle–N’s Zoroark47e8ade7-0797-4d80-a150-b3fe250c1a30,con i17 invii già pagati e il massimale originario164 conservati. I69 record originali protetti (avvii,esiti,raw,rifiuti del setup e risposte dei figli) coincidono con la sorgente v12. Nessun piano o costruzione precedente è stato ricomprato. Ora il job contiene29 invocazioni e29 raw.

La nuova richiesta AI ripara le annotazioni di posizione e supera il relativo controllo locale. La ricevuta della risposta è autentica; la ricostruzione del risultato coincide con il suo hash. Eliminando soltanto positionAnnotations,il registro originale e quello risultante hanno lo stesso immutableHash. La correzione non ha modificato movimenti,carte o turni e non è stata applicata manualmente.

Il setup non è però approvato: negli audit successivi un’unità produce due risposte non conformi. L’ultimo errore è:

> Audit quantitativo: motivazione di1214 caratteri,limite600.

Il runtime termina con invalid-response,dopo due risposte invalide della stessa unità; nessun terzo tentativo o controllo rimosso. Tutte le12 nuove invocazioni sono riuscite al servizio: il rifiuto avviene nel validatore locale,non nel trasporto. Nessun secondo setup completo,casi con repliche,capitoli o report sono stati consegnati. Non ci sono nuove guide da verificare in UI.

## Disallineamento osservato

Il costruttore degli audit in guide-audit-repair.ts mantiene istruzioni generiche dN1000/comparison1600/pN600; lo schema dei frammenti in auditNarrativeSchema permette text fino a1600 caratteri. Il profilo bounded applicato dal validatore richiede600 caratteri al testo finale renderizzato. Il controllo600 ha correttamente respinto i testi; schema,istruzioni e budget del testo non esprimono però un unico contratto bounded. Questa discrepanza richiede una correzione generale offline,senza alzare o aggirare il limite,tagliare testo o perdere candidati/fonti. La prova non dimostra che sia l’unico ostacolo rimasto alla generazione.

## Contabilità e controlli

| Voce | Stato |
| --- | ---: |
| Nuove chiamate /precedenti dello stesso job |12 /17|
| Totale job /massimo originario |29 /164|
| Totale v28 /storico |387 /463|
| Tetti cumulativi per guida |522 /500 /500|
| Residui per guida |135 /500 /500|
| Pool autorizzato /residuo |1500 /1113|
| Riserve successive |24 +24|
| Crediti di riparazione usati /residui |11 /5|
| Usage delle sole12 nuove,input /output /cached |524625 /8505 /0|

Tutti i controlli,scaling e contabilità conservati. Ora367 campioni nel job,con massimo fattore1,611489961838394,senza reset. Nessun contenuto manuale,nessun pass trasferito ad altri job,held-out esclusi. I crediti o le chiamate residue non rinnovano il limite di due risposte non valide.

Il codice applicativo rimane quello dei169 test APP-240. Il runner di ripresa è compilato e verificato sul medesimo avvio/generazione reale,su tre copie,prima del provider; quindi congelato prima del consenso applicato e degli invii. Sono verificati sigillo,originali e sorgenti immutati,tre backup su39tabelle ciascuno e cinque archivi precedenti798/784/783/903/892. Nuovo archivio terminale immutabile:794file.

## Riapertura e stato

Due riaperture su copia conservano29 invii,29 raw,una ricevuta di riparazione e367 campioni. Entrambe si fermano prima del provider con lo stesso invalid-response e il motivo1214/600. Prima apertura1,208s,successiva1,115s,picco390MiB entro60s/10s/768MiB. La diagnostica non torna a unknown. Questo verifica lo stop e la persistenza,non approva la guida.

Campagna terminale: non rilanciare. Prima di altre richieste occorre allineare offline il protocollo bounded degli audit e verificare come conservare i rifiuti della stessa posizione logica;nessun reset o aumento implicito. Il job esistente conserva il limite di formato raggiunto,un nuovo primo job richiede164 contro135 residue. Nessun nuovo consenso o runner predisposto dopo questo stop.

Evidenze: [terminale](../../../.verify/app241-resume-v13-20261106/terminal.json),[verifica e contatori](../../../.verify/app241-resume-v13-20261106/verification-terminal-v13.json),[ricevuta e originali conservati](../../../.verify/app241-resume-v13-20261106/stop-inspection-v13.json),[riapertura senza invii](../../../.verify/app241-resume-v13-20261106/stopped-replay-v13.json),[archivio](../../../.verify/app241-bounded-v13-20261106-archive/manifest.json).

APP-241 Done per esecuzione e verifica dell’esito negativo;APP-242 Backlog per il contratto degli audit. APP-232/APP-225 e l’obiettivo delle tre guide reali valide rimangono incompleti.
