# APP-242 — Contratto degli audit a 600 caratteri

06-11-2026. Correzione generale integrata e verificata **solo offline**. Nessuna nuova chiamata AI, nessuna nuova guida reale valida e nessuna campagna riaperta. APP-242 è Done per questo incremento; APP-232 e APP-225 restano Blocked e l’obiettivo generale è incompleto.

## Correzione

La v13 aveva respinto due audit dello stesso slot, l’ultimo di 1.214 caratteri, mentre le istruzioni generiche consentivano 1.000 per le decisioni e 1.600 per il confronto. Il nuovo descrittore bounded `guide-finite-audit-4` esplicita lo stesso limite finale di 600 per decisioni, confronti e promozioni, nello schema, nelle istruzioni e nel lettore. Il protocollo semantico resta 3.

Ogni motivazione contiene `text` completo e `parts` originali tipizzati. Il lettore espande nomi, quantità e misure attraverso il renderer esistente, applica il limite di 600 al risultato e richiede uguaglianza esatta con `text`. Non tronca, completa o riscrive risposte. La misura finale conserva le unità UTF-16 già usate dal validatore: un carattere supplementare ne occupa due. Il limite di 24 frammenti di trasporto resta distinto dagli 8 span del controllo semantico.

Restano i controlli di disponibilità e conteggio, finestre temporali, destinatari, fonti, candidati, registro fisico, motivazioni, riesame indipendente e guida completa. Il riesame riceve i `parts` autentici e il testo espanso. Nessuna condizione quantitativa viene resa facoltativa dal nuovo campo testuale.

La riserva di output comprende entrambe le rappresentazioni e le dimensioni effettive dei riferimenti. Le unità passano nel pianificatore e nello scaling esistenti; limiti hard, calibrazione, credito condiviso e riserve successive restano invariati. Nessuna chiamata obbligatoria aggiunta al profilo: base 148, 16 riparazioni condivise, massimo prudenziale 164.

## Compatibilità e ripresa

I descrittori già pagati vengono ricostruiti esattamente, con schema, istruzioni e dati originari, entro gli stessi binding di job, fonte, linea, turno e feedback. I lettori dei protocolli storici restano disponibili; nessun raw respinto viene convertito in un pass. La versione 4 condivide la posizione contabile della versione 3, senza rinnovo dei due tentativi o dei crediti.

Due riaperture del job reale su copie mantengono `invalid-response` prima del provider. Restano 29 tentativi/raw, la ricevuta autentica della riparazione delle posizioni, 11 crediti usati e 5 residui. Il formato corretto **non rende ammissibile la ripresa di questa storia**. La nuova richiesta è verificata separatamente su un job ombra, con packet e scenario autentici: prova di capacità, non approvazione o continuazione del job reale.

## Verifiche eseguite

- 255 test distinti passati, zero fallimenti, 27 file pertinenti. Inclusi 600/601, espansioni, UTF-16, uguaglianza esatta, conteggi errati, finestre estranee, downgrade e stop condiviso tra versioni. Non è la suite dell’intero repository.
- Percorso applicativo sintetico completo: costruzione, controlli finali, persistenza, rilettura e recupero senza ricomprare risultati. Una guida sintetica storica completata è recuperata dal nuovo codice senza provider.
- Typecheck incluso nella build e build Electron passati. UI offline su copia sintetica a 1440, 1280 e 640 px, storico incluso, nessun errore renderer. Non dimostra la validità di una nuova guida reale.
- Quattro replay su copie dei tre database reali: storia esistente bloccata, nuovo primo job respinto per budget e avvii degli altri due intercettati prima del provider. Riaperture entro le soglie invariate di 60 s a freddo, 10 s a caldo e 768 MiB.
- Richiesta audit v4 su job ombra: 55.431 token input stimati, 12.000 riservati in output, margine 8.192; capacità e target rispettati. Calibrazione attuale: 367 campioni, fattore 1,611489961838394. Il piano storico dell’ultima chiamata conserva correttamente i 366 campioni disponibili prima di quella chiamata; non viene riscritto.
- Tre database originali e tutte le 39 tabelle per database identici agli archivi terminali; archivi v13/v12/v11/v10/v9/v8 verificati per 794/798/784/783/903/892 file. Solo 7 file source/test preesistenti cambiati rispetto alla qualifica APP-240, più il nuovo modulo e il suo test; gli altri file qualificati invariati.

Prove riproducibili in `.verify/app242-audit-600-20261106/verification.json`, `verify.mjs`, `budget.json`, `fresh-contract-budget.json`, `replay-*.json` e `ui/result.json`; suite in `.verify/app242-regression-tests.json`.

## Budget e limite corrente

| Voce | Stato |
| --- | --- |
| Consumo v28 / storico | 387 / 463 |
| Nuove chiamate APP-242 | 0 |
| Guide nuove valide | 0/3 |
| Tetti cumulativi per guida | 522 / 500 / 500 |
| Pool v28 / riserva per ciascuna successiva | 1.500 / 24 |
| Residui per guida / pool | 135 / 500 / 500 / 1.113 |
| Ripresa del job esistente | Non ammessa: due errori di formato conservati |
| Nuovo primo job completo | Non ammesso: richiede disponibilità di 164, ne restano 135 |

Il deficit del nuovo primo job è 29 chiamate di disponibilità, non una previsione di consumo o di successo. Non vengono aumentati i tetti, creati grant, preparati runner reali o avviati i matchup successivi. La capacità di una singola richiesta e i test sintetici non superano il blocco della storia né dimostrano il completamento delle tre guide. Held-out esclusi; nessun contenuto AI reale modificato manualmente.
