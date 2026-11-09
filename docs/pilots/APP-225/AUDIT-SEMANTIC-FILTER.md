# Audit: filtro semantico e conteggi verificabili

Incremento APP-232 del 5 novembre 2026, successivo alla [campagna v5](FINITE-CAMPAIGN-V5.md). L’istruzione copre correzione generale, verifica offline e budget prima di altri invii. Nessuna nuova chiamata reale, nessun contenuto AI modificato manualmente. Restano **320 chiamate v28 / 396 storiche / 0 nuove guide valide**.

## Correzione generale

Il formato nuovo non considera una parola una prova di errore. «Nessuna promozione serve» può essere una motivazione qualitativa; «nessuna copia nel mazzo» afferma invece un saldo verificabile. La distinzione si applica a tutti i mazzi e a tutte le motivazioni, senza eccezioni per le carte del pilota o della campagna.

Il protocollo 3 compone provvisoriamente i testi naturali e conserva i controlli esatti sui frammenti strutturati: quantità, totale lista, zona, lato, stampa, finestra prima/dopo, destinatario fisico delle Energie, valori stampati, citazioni e limiti di lunghezza. La composizione non costituisce approvazione.

Prima della ricevuta dell’audit è obbligatorio un riesame AI indipendente della semantica quantitativa. Il codice prepara gli indizi da classificare, impone la copertura completa di quei riferimenti e richiede l’attestazione di lettura dell’intero campo, comprese affermazioni implicite fuori dagli indizi. Articoli e assenze logiche possono essere qualitativi. Cifre e numerali espliciti richiedono un riferimento verificabile; un numerale nel nome di una carta deve appartenere davvero a quel nome congelato.

Per un conteggio di inventario il revisore dichiara separatamente il numero affermato dal testo e il saldo effettivo della finestra. Il codice ricalcola il saldo, controlla il numero dichiarato rispetto al numerale e vieta un pass se i due valori differiscono. Misure stampate, fatti del turno calcolati dal codice e citazioni esatte hanno riferimenti distinti. Rilievi o copertura incompleta impediscono il pass.

Non è una prova formale della semantica del linguaggio: l’interpretazione di un’affermazione implicita resta un giudizio AI refutabile. Il lettore fisico completo e il critico tattico indipendente restano obbligatori; questo riesame aggiuntivo non li sostituisce e non approva la strategia.

## Rifiuti, originali e patch successive

Il protocollo 2 storico conserva esattamente il proprio validatore, compreso il vecchio rifiuto lessicale. Una risposta originale respinta può essere riutilizzata solo come dichiarazione provvisoria se schema e quantità strutturate superano il protocollo nuovo. Il suo record originale rimane `accepted:false`: occorre una nuova risposta indipendente per approvarne il significato. Nessun rifiuto viene cancellato, convertito in pass o riacquistato oltre il limite originale.

Le ricevute nuove legano risposta originale, contesto quantitativo, testo e corpo fisico del turno. Si ricostruiscono dalle fonti alla riapertura. Un riepilogo salvato o un hash di testo da solo non basta. I risultati locali storici completi vengono rigiocati con il loro contratto originale; non diventano approvazioni del nuovo critico. Restano due risposte invalide per unità, due rifiuti semantici locali, limiti delle premesse, delle costruzioni complete e delle riparazioni dei casi.

Il cambio di formato non riapre due risposte storiche che restano invalide anche nel protocollo nuovo: la regressione dedicata conserva entrambi gli originali e prova lo stop prima di un nuovo costruttore.

Un rifiuto semantico instrada una correzione ai soli audit e richiede un nuovo riesame. Una patch tardiva dei casi resta provvisoria finché ogni motivazione modificata non ha un riesame quantitativo autentico; poi si riesegue il gate completo. Se questo riesame fallisce, il candidato non viene approvato: non si sintetizza un testo sostitutivo né si modifica il registro manualmente.

## Verifiche e ripresa

**466 test distinti passati, 1 esclusione storica, 45 file; typecheck e build passati.** La regressione ampia è integrata dalle 42 riesecuzioni dopo l’ultima autenticazione degli originali e dai 7 casi rieseguiti senza concorrenza dopo cinque timeout, senza doppio conteggio. Il test funzionale che genera e revisiona due guide ha un timeout aumentato a180s per i nuovi riesami obbligatori; la sola riesecuzione CLI del test che costruisce tre archivi usa15s al posto del default5s. Nessun limite applicativo o gate di prestazione è cambiato. Coperti falsi positivi qualitativi, quantità implicite contraddette, numerali espliciti non fondati, finestre estranee, misure/citazioni inventate, copertura mancante, rifiuti persistenti, fonti eliminate, patch tardive e ciclo applicativo completo sintetico. I timeout precedenti restano nei rapporti originali.

| Profilo su copia, senza provider | Freddo | Riapertura | Picco RSS |
| --- | ---: | ---: | ---: |
| crustle--n-s-zoroark | 5.439 s | 3.662 s | 511.7 MiB |
| alakazam-dudunsparce--basic-box | 1.445 s | 0.072 s | 340.7 MiB |
| dhelmise--lucario-hariyama | 2.156 s | 0.359 s | 351.3 MiB |
| Crustle con quattro riesami sintetici, solo prova di protocollo | 17.455 s | 5.305 s | 564.3 MiB |

Soglie immutate60s/10s/768MiB. Il tempo freddo include import e lettura, esclusa solo la copia SQLite. Un profilo intermedio con carico concorrente ha misurato10,949s alla riapertura sintetica: è conservato, non usato come pass del gate. I profili finali sono stati rieseguiti senza concorrenza dei test. Archivio v5 di722 file verificato integralmente; tre DB immutati ed equivalenti ai backup su schema e39 tabelle ciascuno, basi v4 preservate. Sedici cambi intenzionali rispetto ai703 input congelati,687 altri input invariati; due moduli nuovi e un test nuovo,530 file correnti improntati.

Evidenze ripetibili in `.verify/app225-segments-20261102/`: `app232-language-preflight.ts`, `tsconfig-app232-language.json`, `verify-app232-language-integrity.mjs`. Il rapporto finale `verification-app232-audit-language.json` riporta gli esiti e gli hash correnti; i fallimenti intermedi restano conservati.

Il coordinatore sul database copiato di Crustle arriva a `review-premise-audit-language`: nessun nuovo costruttore di audit e nessuna rigenerazione di piano o turni. Il primo setup conserva la ricevuta locale storica. Per il secondo sono disponibili quattro dichiarazioni originali da riesaminare. Una prova di protocollo separata, con quattro verdetti sintetici esplicitamente marcati, raggiunge il quadro della linea principale e riapre senza ricomprare quei verdetti. Dimostra la meccanica della ripresa, **non la correttezza AI dei testi**; nessun risultato viene trasferito ai database reali.

Gli altri due ingressi freddi, Alakazam/Dudunsparce–Basic Box e Dhelmise–Lucario/Hariyama, si fermano prima del piano sulle copie. Non sono stati creati nuovi job reali. I campioni reali restano 300; nessun campione sintetico calibra il percorso reale.

## Budget prima di nuove chiamate

Tetti immutati: **500 cumulativi per guida, 1.500 nel ciclo v28, 24 riservate a ciascuna guida successiva**. Il primo matchup ha consumato 320, inclusi precedenti e diagnostiche: rimangono **180**. Sul job corrente sono 26 di un massimo logico 206, senza azzerare i 294 precedenti. Gli altri matchup hanno 500 ciascuno; pool residuo **1.180**. Le 76 chiamate storiche precedenti al ciclo restano registrate separatamente.

Calibrazione invariata: 300 campioni, fattore conservativo 1,5933849345675073. Restano target input 96.000, massimo input 128.000, totale 176.000, margine 8.192, limite byte 500.000 e risposta 100.000 caratteri. Il pianificatore conserva le partizioni e lo scaling esistenti.

| Prossimo ingresso osservato offline | Input stimato | Output riservato | Chiamate future riservate | Soglia d’ingresso |
| --- | ---: | ---: | ---: | ---: |
| Riesame del primo audit pendente Crustle | 48.022 | 10.000 | 17 | 18 |
| Piano freddo Alakazam/Dudunsparce | 84.223 | 6.000 | 58 | 59 |
| Piano freddo Dhelmise | 57.959 | 6.000 | 58 | 59 |

Le quattro dichiarazioni pendenti richiedono quattro riesami se tutte passano al primo tentativo; non sono quattro chiamate per completare la guida. Un nuovo turno prenota almeno quadro, audit e riesame quantitativo, più attacco finale ed eventi quando previsti. La soglia fredda passa da 45 a 59; è una protezione d’ingresso della fase nota, non un prezzo massimo.

Riferimenti seriali condizionali con due scenari, R risposte non terminali per scenario, fino a H=7 turni storici per setup, M=6+4R turni nativi ancora da costruire e N=2+2R attacchi finali. A è il numero degli altri eventi: nel prospetto A=e×M.

| R | e | Ripresa Crustle | Ciascuna guida fredda | Ripresa + due fredde | Crustle entro le 180 residue? |
| ---: | ---: | ---: | ---: | ---: | --- |
| 2 | 3 | 116 | 157 | 430 | Sì nel riferimento |
| 2 | 5 | 144 | 185 | 514 | Sì nel riferimento |
| 4 | 3 | 168 | 209 | 586 | Sì nel riferimento |
| 4 | 5 | 212 | 253 | 718 | **No** |

Formule: ripresa `26 + 3M + N + A`; freddo `25 + 6H + 3M + N + A`. Il termine 26 include i quattro riesami pendenti, premesse, piani e relativi riesami, metadata, critiche dei casi, capitoli/esercizi e critiche finali. Sono esclusi retry, rifiuti semantici, ulteriori partizioni, nuove costruzioni, patch e riscritture. Il batching può ridurre il numero; riparazioni e limiti di token possono aumentarlo o fermare la guida. **Non sono stime di completamento né garanzie.** La riserva24 protegge solo un minimo per i matchup successivi.

Nessuna nuova campagna, grant, freeze di esecuzione o invio reale viene avviato da questa istruzione. A una successiva istruzione diretta di ripresa occorreranno freeze e guardie aggiornati, sugli stessi job e con la contabilità conservata; nessuna conferma ridondante o aumento automatico. Restano sequenza dei matchup, stop globale al primo esito non valido e held-out esclusi. Default v27, guard v28 e policy v5 isolata non cambiano. APP-232 resta In progress e APP-225 Blocked: servono ancora tre guide reali valide, verifiche applicative e audit di generalità prima della consegna utilizzabile dall’utente.
