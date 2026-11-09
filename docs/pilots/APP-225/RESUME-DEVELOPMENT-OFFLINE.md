# APP-250 — Ripresa della richiesta interrotta e sviluppo storico

Verifica del 7 novembre 2026, esclusivamente offline. Correzioni implementate; **qualificazione complessiva ancora incompleta per il gate di prestazione a freddo**. Nessuna chiamata reale, nessuna campagna riaperta, nessun contenuto AI corretto manualmente. Le nuove guide reali valide restano 0/3.

## Correzioni

La terminazione Windows del processo viene distinta dagli errori generici quando il codice osservato lo permette. `0x40010004` e `0xc000013a`, anche nella rappresentazione signed, diventano `process-interrupted` / `process-terminated`. Errori espliciti di quota, autenticazione, HTTP o schema mantengono la precedenza. Un generico exit 1 resta non classificato. Il codice di uscita non identifica chi abbia terminato il processo né la causa precisa dell’interruzione v17.

La guardia del journal è ora estesa al job: cambiare il prompt non può aggirare una richiesta bloccata per trasporto. Le risposte pagate possono essere rilette, ma prima di un nuovo invio serve il percorso esistente `retryAfterIntervention` e la ripresa esplicita. Non vengono cancellati i limiti di contenuto, schema, budget o mancato progresso; gli altri job restano isolati. Nei replay questo intervento è simulato **soltanto sulle copie**. Il job originale resta interrotto, con il vecchio errore `unknown` intatto.

Lo sviluppo fisico del turno ha istruzioni distinte dalla successiva costruzione degli audit. Assegnazioni, ingressi, evoluzioni, attacchi, KO, Premi e promozioni necessari alla premessa devono essere rappresentati dai movimenti effettivi. `tactical` e `decisionProof` inizialmente null sono campi differiti, non un divieto di compiere azioni. Una sequenza di sole pescate deve davvero raggiungere la premessa; una linea impossibile richiede un impedimento reale di carte, risorse o timing. Restano obbligatori il lettore completo e il critico indipendente.

Per conservare il lavoro pagato, una dichiarazione con identici dati fisici, schema, ruolo e fase recupera il proprio prompt originale autenticato. Non viene reinterpretata come se fosse stata prodotta con le nuove istruzioni. Attraverso il lavoro asincrono si conservano soltanto identificativi di ricerca; descrittori e risposte vengono riletti e autenticati a ogni uso. Originali mancanti o alterati sono respinti. Due risposte di formato non valide restano esaurite, così come i limiti dei riesami negativi. Le unità ancora senza risposta ricevono le nuove istruzioni.

Non sono introdotte eccezioni per carte, liste, matchup o risultati. Schemi fisici, proiezioni, validatori quantitativi, lettori completi, critici, riserve, calibrazione, partizione e scaling conservano i vincoli precedenti. Il percorso non finito conserva le istruzioni precedenti. `GUIDE_DELIVERY_NETWORK_READY` resta disabilitato.

## Ripresa del job reale, verificata su copie

Il job originale è `07ce0fe7-9e97-475e-b7c9-95aa653df369`, nella campagna v17 conclusa. Due riaperture senza intervento esplicito mantengono lo stop: **31 tentativi, 30 raw, 422 campioni, 6 crediti di riparazione usati**, nessun provider raggiunto.

Su un’altra copia, dopo intervento esplicito simulato, due riaperture arrivano esclusivamente a `segment-finite-setup-scenario-1-round-1-opponent`, intercettato prima del servizio. Restano **30 raw e tutti i 9.542 riferimenti originali**. Il tentativo simulato è contabilizzato e usa un credito di riparazione esistente; non viene resettato il limite né ricomprato il piano.

Il descrittore pendente conserva esattamente dati fisici, schema, quadro, turni precedenti e slot. Cambiano soltanto le istruzioni e il compito. Il confronto è registrato in `declaration-contract.json`. Questo dimostra che la ripresa richiede il lavoro mancante con il protocollo corretto; **non dimostra che il modello abbia già costruito uno sviluppo valido**. La premessa negativa e tutti i controlli successivi restano vincolanti.

I replay di avvio degli altri due matchup usano lo stesso ingresso del runner e vengono fermati prima del provider. Una guida storica sintetica già approvata si riapre senza chiamate e senza cambiare i suoi 36 tentativi.

## Verifiche ed esito dei gate

- **320 casi distinti / 32 file** della regressione pertinente, tutti passati sul codice finale; nessuna copia archiviata contata. La prima regressione ha registrato 316 pass e quattro fallimenti: tre asserzioni sulla precedenza del classificatore, poi corrette e rieseguite nei 37 test mirati; un timeout, poi passato isolato in 59,807 s con lo stesso limite di 60 s. Rapporti originali conservati, nessun doppio conteggio. Non è la suite completa dell’intero repository.
- Typecheck e build Electron passati sul codice finale.
- Percorso completo sintetico: due liste distinte, due setup con audit inizialmente null, lettori originali, approvazione indipendente finale, persistenza e riapertura senza provider passano. 38 risposte sintetiche, zero reali, nessun credito di riparazione usato.
- UI Electron offline su copia sintetica: otto capitoli, due scenari, esercizio, storico e lettura IPC verificati a 1440/1280/640 px, nessun errore renderer.
- Tre database originali, tutte le 39 tabelle per database e dieci archivi precedenti verificati immutati. Manifest di 577 file sorgente/test: 11 modifiche e un nuovo test rispetto alla baseline v17; gli altri 565 file invariati.

**Gate prestazioni non superato.** La misura completa isolata, senza profiler, è **60.444,860 ms a freddo / 1.557,797 ms in riapertura / 669,469 MiB**, contro limiti invariati di 60.000 / 10.000 ms / 768 MiB. Il percorso funziona ma il freddo supera la soglia di 444,860 ms. Conservate anche la precedente misura concorrente negativa e la misura diagnostica con profiler (66.345,486 ms a freddo). Il profilo concentra il costo nel dimensionamento dei gruppi, nelle codifiche e nella tokenizzazione; non giustifica allentare il gate o cambiare la calibrazione. Nessuna ripetizione scelta come sostituto di questo esito negativo.

La ripresa effettiva su copia passa invece le soglie: 17,604 s / 9,248 s per la generazione; includendo l’audit SQLite esterno 18,487 s / 9,909 s, 504,629 MiB. Le due misure descrivono prove diverse e non si sostituiscono fra loro.

APP-250 resta **In progress** per il gate completo a freddo. APP-232/APP-225 restano Blocked; obiettivo generale aperto. Il passo tecnico residuo è ridurre il lavoro ripetuto del pianificatore preservandone esattamente risultati, input, scaling e limiti, quindi rieseguire i gate offline. Questo report non autorizza né propone una ripresa reale.

## Contabilità e budget

| Voce | Valore invariato |
| --- | ---: |
| Chiamate v28 già consumate | 443 |
| Chiamate storiche, incluse le 76 precedenti | 519 |
| Tetti cumulativi per i tre matchup | 576 / 500 / 500 |
| Pool v28 | 1.500 |
| Residui per matchup | 133 / 500 / 500 |
| Residuo pool | 1.057 |
| Riserva per ciascun matchup successivo | 24 |
| Profilo corrente del job | 148 base + 16 riparazioni = 164 |
| Job corrente: usate / residue | 31 / 133 |
| Crediti di riparazione usati / residui | 6 / 10 |
| Campioni / fattore conservativo | 422 / 1,6560121558488685 |

Per la sola richiesta pendente, il preflight su copia stima **61.335 token input, 6.000 output riservati, 8.192 di margine**, 90.980 byte; riserva altre otto chiamate nella fase nota. Il minimo corrente di nove chiamate **non è una previsione del costo per completare o approvare la guida**. Le prove sui due avvii freddi stimano rispettivamente 88.850 e 61.218 token input, 6.000 output e 58 chiamate future riservate.

Le invocazioni sintetiche e gli arresti prima del provider nelle copie non consumano il budget reale. Nessun nuovo grant, reset, avvio o riapertura della campagna. Held-out esclusi. Gli originali, compresi lo sviluppo insufficiente e i riesami negativi, restano immutati.

Evidenze locali: `.verify/app250-resume-development-20261107/{verification.json,tests.json,integrity.json,budget.json,replay-blocked.json,replay-explicit.json,declaration-contract.json,replay-1.json,replay-2.json,completed-legacy.json,standalone-integration-isolated-failed.json,ui/result.json}`. Le misure negative precedenti e il profilo CPU sono conservati nella stessa cartella; log e rapporti Vitest sono in `.verify/app250-*`.
