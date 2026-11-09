# APP-232 — Candidati dal registro e riparazione dei soli audit

**Esito successivo:** la [campagna reale v3](FINITE-CAMPAIGN-V3.md) è terminata con0/3 nuove valide e ha scoperto limiti nel routing, nella dimensione dei turni e una storia di recupero non coperta dalle prove qui descritte. Queste verifiche offline restano riferite ai rispettivi ingressi, non attestano la riuscita della campagna.

5 novembre 2026. **Correzione implementata e verificata offline; nessuna nuova chiamata reale.** Contabilità invariata: 268 v28, 344 storiche, 0/3 nuove guide valide. APP-232 resta In progress. Questa verifica non attiva il nuovo percorso nell’app e non riapre la campagna conclusa.

## Comportamento

Gli elenchi di carte prima della scelta, carte e attacchi del turno e candidati alla promozione provengono dallo stesso registro che controlla i movimenti. Non sono più elenchi da indovinare durante una riparazione dell’audit. Comprendono i candidati prima e dopo gli eventi, lo sviluppo e le promozioni del lato non di turno.

La raccolta dei candidati è una fase di costruzione: restituisce esclusivamente dati, senza ricevuta fisica, giudizi tattici o approvazioni. Quando un audit è incompleto, il modello riceve gli elenchi esatti e deve fornire confronti e motivazioni per le chiavi assegnate. Il codice compone soltanto gli identificativi predisposti e i giudizi effettivamente restituiti. Un elenco meccanico non certifica che le alternative siano eseguibili o migliori.

La riparazione può modificare solo `decisionProof` e `tactical`. Apertura, pescate, movimenti, Energie e destinatari, costi, ritirate, KO, Premi, sviluppo, annotazioni e descrizioni degli eventi devono rimanere identici. Il confronto dell’intero contenuto, esclusi i soli campi di audit, verifica questa proprietà prima di restituire il risultato. Le risposte originali rimangono conservate.

Il setup iniziale e quello ricostruito dopo una premessa respinta usano questo percorso. I turni della linea principale e delle repliche finite conservano la dichiarazione originale, completano gli audit e solo dopo invocano il lettore completo originale e salvano il checkpoint. Critica della premessa, critica dei casi e revisioni finali rimangono obbligatorie. Le transazioni che correggono un consiglio o una linea per rilievi semantici restano distinte e mantengono i loro controlli completi: questa modifica non autorizza a correggere un registro illegale cambiando una motivazione.

Sono mantenuti i controlli originali di disponibilità, inventari, legalità, fonti, pagamenti e risorse, promozioni, audit e coerenza. Durante la sola raccolta, i controlli dell’audit vengono rinviati al lettore completo; nessun risultato del raccoglitore può essere usato come guida o checkpoint approvato. I contratti storici mantengono i lettori precedenti.

## Persistenza, limiti e scaling

Le nuove richieste sono legate a job, progetto, dipendenze, hash del registro, candidati, turno e schema. Ricevute e risposte AI effettive vengono ricontrollate anche alla riapertura; una fonte mancante o alterata blocca il recupero. Il registro e gli audit originali respinti non vengono sovrascritti.

Nel caso reale viene ricostruita dalle fonti autentiche l’ultima dichiarazione respinta, conservando anche il rifiuto precedente. Può avanzare soltanto con nuovi giudizi AI di audit, modifiche limitate a quegli audit e nuova validazione completa. Non si trasforma un rifiuto noto in approvazione tramite una semplice riapertura o un trasferimento manuale della prosa.

Le richieste passano dal pianificatore esistente: compattazione reversibile, calibrazione misurata, limiti di input/output, riserva e riduzione dei batch restano attivi. Il peso di output degli audit cresce con il numero e i limiti delle motivazioni assegnate; la capienza appresa distingue audit e dichiarazioni native. Un errore nel finalizzatore non viene attribuito al batch che ha costruito il registro. Due risposte di audit non valide fermano quella riparazione, anche dopo una riapertura, senza far ripartire la costruzione del setup. Il budget insufficiente ferma l’invio prima della chiamata.

## Verifiche eseguite

**422 casi passati, 1 escluso storico, 42 file**; typecheck e build passati. I conteggi sono della suite finale, senza sommare le riesecuzioni. Sono verificati registro immutabile, rifiuto delle modifiche esterne agli audit, due risposte invalide e stop durevole, riserva, fonti cancellate, risorse fisiche indisponibili, promozioni difensive con stampe sintetiche indipendenti e finalizzazione prima del checkpoint. Il percorso applicativo completo con una correzione sintetica dell’audit supera i gate e le revisioni sintetiche previste e si riapre senza chiamate. Non attesta qualità competitiva o riuscita del servizio reale.

Tre prove sul generatore reale, con database copiati e arresto prima del provider:

| Matchup | Ripresa successiva | Freddo | Caldo | RSS massimo |
| --- | --- | ---: | ---: | ---: |
| Crustle–N’s Zoroark | Solo audit della promozione | 1,99 s | 0,64 s | 402,5 MiB |
| Alakazam/Dudunsparce–Basic Box | Piano iniziale | 0,82 s | 0,05 s | 320,2 MiB |
| Dhelmise–Lucario/Hariyama | Piano iniziale | 1,54 s | 0,24 s | 349,8 MiB |

Tempi freddi dall’avvio del processo dedicato, comprese importazioni e letture, esclusa soltanto la copia SQLite; soglie invariate di 60 s / 10 s / 768 MiB. Zero risposte inventate in queste tre prove, zero invii reali, 249 campioni di calibrazione invariati. Crustle riutilizza piano, quadro e quattro turni storici già pagati: raggiunge un solo audit, non un nuovo setup.

Un quarto controllo diagnostico su copia fornisce un unico involucro sintetico di audit, copiando senza modifiche i testi già presenti nell’originale AI respinto. Il primo setup supera allora il lettore completo e la ripresa raggiunge il quadro del secondo caso: 2,91 s freddo / 0,74 s caldo / 412,8 MiB. Questo controllo non è una riparazione AI reale o un’approvazione indipendente; nessuna variante viene adottata nel database sorgente.

Integrità: 8 input precedentemente congelati modificati intenzionalmente, 4 nuovi file, 673 altri input invariati. Manifesto delle 519 sorgenti correnti; 699 file dell’archivio reale intatti e tutti e tre i database reali invariati. Le prove negative di sviluppo sono conservate e non conteggiate come successi.

Evidenze in `.verify/app225-segments-20261102/`: `verification-app232-audits.json`, `app232-audit-source-integrity.json`, `app232-audit-final-regression-tests.json`, tre `app232-audit-current-preflight-*.json`, `app232-audit-fixture-preflight-0.json` e `app232-audit-budget.json`.

## Budget ricalcolato

Tetti invariati: **500 cumulativi per guida / 1.500 v28 / riserva 24 per ciascuna guida successiva**. Residui: **232 sul primo matchup e 1.232 nel pool**. Lo stesso job ha 13 chiamate usate su un massimo persistito di 245; le chiamate dei job precedenti e le tre diagnostiche restano conteggiate.

La prossima operazione di Crustle è **una chiamata di audit**, con 46.419 token di input stimati, 6.000 riservati all’output e 15 chiamate preservate per le altre fasi note. Il gate corrente richiede quindi disponibilità per 16 chiamate; non è il minimo necessario per finire la guida. Calibrazione 1,5933849345675073 su 249 campioni. Target input 96.000, massimo 128.000, inviluppo 176.000 e margine 8.192 invariati. I due matchup freddi raggiungono soltanto il piano: i loro setup non sono ancora noti.

Un conteggio **seriale di riferimento**, con sette turni storici per ogni setup ancora da costruire, quattro repliche per caso, un possibile audit per turno e una richiesta per unità di prosa, dà **82 / 97 / 97 invocazioni future, 276 complessive**. Rientra nei residui; non è un nuovo tetto né una previsione di completamento. Esclude retry di formato, ricostruzioni semantiche, critiche respinte e riparazioni dei contenuti. I batch possono ridurre le chiamate; nuovi rilievi possono aumentarle e i limiti di token possono fermare l’esecuzione. La riserva 24 è una protezione minima, non una stima dei costi delle guide successive.

L’istruzione corrente autorizza questa correzione e la verifica offline prima di nuove chiamate. **Nessuna campagna reale riaperta o nuova autorizzazione registrata.** Prima di un eventuale live occorrono codice congelato, runner collegato alla contabilità aggiornata e riapertura esplicita dello stop; nessun aumento automatico. Restano 0/3 nuove guide valide, verifica UI reale, generalità competitiva, policy applicativa e build consegnabile all’utente. Default v27, guard v28 e policy isolata invariati.
