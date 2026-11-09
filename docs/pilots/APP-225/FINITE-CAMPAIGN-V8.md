# APP-232 — Esito reale v8

Campagna del 05-11-2026 autorizzata direttamente dall'utente dopo la [correzione generale di calcoli e negativi](AUDIT-CALCULATIONS-NEGATIVES.md). **Conclusa al primo matchup non valido: 15 nuove chiamate, 9 minuti e 41 secondi, 0/3 nuove guide valide.** Alakazam/Dudunsparce–Basic Box e Dhelmise–Lucario/Hariyama non sono stati avviati. Nessun intervento manuale sui contenuti, modifica al codice durante la prova o riavvio automatico.

## Esecuzione e avanzamento

Runner **31596**, processo **42344**, exit **1**, durata **580.815,9984 ms**. Codice congelato su **870 input**, seal `7fd75d980b837de31dcd10be5fc123e5233528c65ca63af8c2a6e597e01eb9fd`. Tre profili e tre database verificati prima del grant, con 148 file compilati condivisi identici. Nessuna chiamata del servizio usata per la preparazione.

Ripreso lo stesso job Crustle–N's Zoroark `ce9ad11a-09a5-45a6-bc4c-f2c6fd4fc57e`, da 45 a **60 tentativi su 206**. Le 15 nuove richieste sono tutte riuscite al servizio; i controlli locali ne accettano 13 e respingono le ultime due.

| Tentativi del job | Fase | Esito |
|---|---|---|
| 46 | Riparazione dei soli audit pendenti | Accettata |
| 47 | Nuovo critico quantitativo | Pass accettato |
| 48 | Quadro del turno successivo | Accettato |
| 49–57 | Nove dichiarazioni evento | Accettate |
| 58 | Audit del secondo turno | Dichiarazione accettata |
| 59–60 | Critico quantitativo e unico retry di formato | Entrambi `revise`, respinti dal lettore |

Il recupero del negativo storico ha quindi consentito una riparazione autonoma e un nuovo pass indipendente. Il primo turno principale è costruito e verificato localmente; il secondo ha quadro, eventi e dichiarazione audit, ma non un riesame quantitativo valido. Il numero dei pass quantitativi passa da quattro a cinque. Nessuna critica piena della premessa raggiunta, nessuna guida completa, prosa o report salvato, nessuna nuova verifica UI.

## Causa dello stop

Entrambi i riesami terminano con `Audit calcolo: operando senza citazione numerica originale.`. Dopo il secondo rifiuto il coordinatore ferma il job con `invalid-response`, mantenendo il limite dei due tentativi. La campagna si arresta e non passa al matchup successivo.

La diagnosi in sola lettura dimostra un **falso positivo nella verifica letterale della citazione**. In entrambi i raw, quattro operandi citano il medesimo testo originale di una carta per il valore 20. La citazione contiene due a capo reali ed è identica al campo `.gameplay.effect` ottenuto decodificando il JSON della fonte. Nel contenitore serializzato gli a capo sono invece rappresentati da `\n`. Il lettore cerca la stringa decodificata direttamente dentro il JSON serializzato e non la trova. Tutti gli otto riferimenti risultano esatti sia nel campo decodificato sia nella corrispondente rappresentazione JSON escapata; il riconoscimento numerico include già il valore 20.

La prova identifica la causa del rifiuto di questi operandi. Non approva i raw, non risolve automaticamente l'applicabilità degli effetti e non modifica i testi. Non è un errore di budget, capienza dei token, uscita Codex o indisponibilità del servizio.

**Resta anche un problema distinto:** i due critici danno `revise` perché chiedono una fonte consegnata che documenti i tre Premi attribuiti al Mega nel testo dell'audit. Il pacchetto di ammissione Standard non sostituisce una regola ordinaria di gioco. Questa prova non aggiunge fonti e non tratta quel rilievo come risolto: correggere soltanto la citazione JSON non basterebbe a ottenere un pass.

Un eventuale intervento successivo deve verificare citazioni esatte nei campi originali decodificati, conservando identità della fonte, tipo, valore e controlli contro citazioni inventate; deve inoltre risolvere in modo generale la disponibilità delle fonti di regole richieste. Servono verifiche offline e un nuovo budget prima di proporre altra esecuzione. Nessuna correzione implementata in questa campagna e nessun aumento o nuova ripresa autorizzati dal suo esito.

## Verifiche dopo lo stop

Archivio **892 file**, manifest `b377d3f91aa540e1226d230fbc2a4af3fdee8c174ffc903d005518a3aa7a8279`. Tutti gli **870 input congelati** restano intatti; archivio v7 di 886 file e tre seed v7 conservati. I tre database terminali sono equivalenti ai rispettivi backup per schema e **39 tabelle**.

Due riaperture della medesima copia del database ritrovano lo stesso `invalid-response`, senza attraversare il provider: 60 tentativi e **334 campioni reali** invariati, nessuna risposta sintetica. Il nucleo compilato dei replay corrisponde ai 148 file condivisi del runner reale. Un tentativo di rientro nel runner viene respinto dal marcatore di esecuzione già iniziata, prima di lock, job o nuove chiamate. Nessun processo reale ancora attivo.

La suite precedente di **513 test passati / 1 esclusione storica / 48 file**, typecheck e build riguarda lo stesso codice rimasto congelato durante la v8. Non è stata ripetuta una suite dopo lo stop e non viene presentata come prova di riuscita reale. Default v27, guard v28, isolamento interno Codex, scaling e policy applicativa isolata restano invariati; held-out esclusi.

Evidenze in `.verify/app225-segments-20261102/`: `verification-app232-finite-v8.json`, `app232-finite-v8-diagnosis.json`, `app232-v8-citation-diagnosis.json`, `app232-v8-terminal-recovery.json`, `app232-v8-terminal-budget.json` e `campaign-finite-v8-archive/manifest.json`. L'autorizzazione consumata, ricevuta del processo e contabilità sono in `campaign-finite-v8/`.

## Contabilità e consegna

Tetti mantenuti: **500 chiamate cumulative per guida / 1.500 v28 / riserva 24 per ogni successiva**. Totale **354 v28 / 430 storiche**: 351 principali e tre diagnostiche nel ciclo, più le 76 precedenti. Residui **146 / 500 / 500**, pool **1.146**. Il massimo del job Crustle resta 206: 60 usate più 146 residue; le altre 294 chiamate precedenti della guida restano conteggiate.

Uso delle 15 nuove richieste: **777.142 token input, 22.140 output, 0 cached**, nessuna misurazione ignota. I campioni reali passano da 319 a 334, senza esclusioni o dati sintetici. Il blocco terminale non deriva dall'esaurimento del budget.

APP-232 resta **In progress** per la consegna ancora incompleta, APP-225 **Blocked**. L'obiettivo complessivo resta aperto: tre guide reali valide, persistenza/UI e generalità, poi calibrazione/adozione della policy e build finale da provare. La singola campagna v8 è conclusa: nessuna ripresa automatica o nuova chiamata dopo il primo esito non valido.
