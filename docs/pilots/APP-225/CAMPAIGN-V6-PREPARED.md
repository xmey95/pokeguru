# Campagna v6 preparata offline, non autorizzata all’invio

5 novembre 2026. Incremento di APP-232 verso APP-225: preparazione concreta della ripresa dopo la [correzione del filtro](AUDIT-SEMANTIC-FILTER.md). Il turno precedente ha prodotto progresso verificato; questo turno completa runner, copie, controlli di avvio e profili della campagna successiva. Nessuna chiamata reale e nessuna modifica ai contenuti AI o ai 530 sorgenti/test verificati.

## Preparazione e contabilità

Workspace isolato `.verify/app225-segments-20261102/campaign-finite-v6`. Il primo database conserva il job `ce9ad11a-09a5-45a6-bc4c-f2c6fd4fc57e` e i suoi 26 tentativi, oltre ai 294 precedenti già conteggiati. Il massimo logico del job rimane 206: al massimo 180 invocazioni nuove. Gli altri due job nasceranno soltanto durante una prova autorizzata, dopo una guida valida del matchup precedente.

Sono conservate **320 chiamate v28 / 396 storiche / 0 nuove guide valide**. Tetti immutati: **500 cumulativi per guida / 1.500 nel ciclo / 24 riservate a ciascuna guida successiva**. Residui: **180 / 500 / 500**, pool **1.180**. Sono massimi disponibili, non obiettivi di consumo. La guida termina appena valida; la campagna termina al primo esito non valido e non si riavvia automaticamente. I casi held-out restano esclusi.

Il preventivo condizionale resta quello della correzione: la ripresa Crustle può richiedere 116–212 invocazioni nei riferimenti descritti, esclusi retry e riparazioni. Il caso da 212 non rientra nelle 180 residue: il runner non aumenta i tetti e non garantisce la riuscita.

## Freeze e verifiche

Seal `14ab12f1436984174af4d6442be3c46fa1891d3c105b6ffd39fa513df0d43097`, **859 input** congelati e binary Codex improntato. Sono compresi sorgenti, test, runner compilato, preparatore, evidenze di budget, catalogo/eventi e metadati. Nessuna ulteriore modifica produttiva è stata inserita in questa preparazione.

Verificati:

- Tre copie equivalenti ai database v5 su schema e **39 tabelle ciascuna**; sorgenti e copie invariati dopo i controlli.
- Stesso nucleo compilato del generatore fra runner e prove offline: **146 file condivisi identici**.
- Lettura del registro completo, contabilità cumulativa e controllo della riserva anche al confine effettivo di invio, dopo la registrazione durevole del tentativo.
- Avvio `live` senza consenso respinto dal vero runner con exit 1, **prima di creare lock, marker di avvio o job**. Nessuna autorizzazione creata.
- Recupero di Crustle al solo riesame quantitativo indipendente pendente, senza rigenerare piano, turni o audit pagati.
- Ingressi freddi degli altri due matchup con istruzioni e liste corrispondenti al rispettivo caso, prima della richiesta di piano.

| Profilo corretto, nessun provider | Freddo | Riapertura | Input stimato | Output riservato | Riserva chiamate |
| --- | ---: | ---: | ---: | ---: | ---: |
| Crustle–N’s Zoroark | 7,133 s | 6,244 s | 48.022 | 10.000 | 17 |
| Alakazam/Dudunsparce–Basic Box | 1,202 s | 0,073 s | 84.224 | 6.000 | 58 |
| Dhelmise–Lucario/Hariyama | 2,423 s | 0,399 s | 57.965 | 6.000 | 58 |

Tutti i profili rispettano 60 s / 10 s / 768 MiB. Le soglie d’ingresso sono 18 / 59 / 59, non prezzi finali. I primi profili freddi usavano la richiesta del primo matchup come testo comune: sono conservati ma sostituiti, per i casi secondo e terzo, dalle due prove con le istruzioni esatte che userà il runner. Nessun fatto, istruzione del job reale o contenuto AI è stato cambiato per ottenere il risultato. I nuovi input stimati differiscono di 1 e 6 token dai precedenti profili, mantenendo tutti i controlli e la calibrazione di 300 campioni reali.

## Condizione per la ripresa reale

La campagna v5 era terminata e l’ultima istruzione specifica autorizzava soltanto correzioni e verifica offline prima di nuove chiamate. **Occorre un’esplicita autorizzazione a riaprire la prova**, senza aumento dei limiti. Questa condizione viene dall’istruzione dell’utente e dallo stop concordato, non da una skill o da un nuovo requisito di approvazione.

L’eventuale autorizzazione dovrà riferirsi a questo seal, agli stessi tre matchup e dati pubblici, al servizio OpenAI tramite Codex, agli stessi tetti, alla ripresa del job Crustle conservato e allo stop globale al primo non valido. Solo allora si potrà creare `authorization.json` ed eseguire una singola campagna. Nessun vecchio consenso concluso è stato riutilizzato.

Il risultato prova la preparazione, non tre guide valide né una build pronta all’utente. Restano reali generazione e riesami, salvataggio/riapertura/UI, audit di generalità e decisione sulla politica applicativa. Default v27, guard v28 e policy v5 isolata restano invariati. APP-232 In progress, APP-225 Blocked, obiettivo completo aperto.

Evidenze: `campaign-finite-v6/readiness.json`, `offline-verification.json`, `guard.json`, `preparation.json`, `seal.json`; harness `app232-v6-matched-request-preflight.ts`; verificatori `verify-app232-v6-preparation.mjs` e `finalize-app232-v6-readiness.mjs`. Le verifiche produttive precedenti rimangono in `verification-app232-audit-language.json`: **466 test passati, 1 esclusione storica**, typecheck/build. Non sono state ripetute senza motivo dopo una preparazione che non cambia il codice produttivo.
