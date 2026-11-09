# Campagna v6: esito reale e riferimenti quantitativi del critico

5 novembre 2026. Prova riaperta con il consenso `call_0c5f0639689e42e8b80e6c5e7fb9b2e5/0`, sul [runner v6 congelato](CAMPAIGN-V6-PREPARED.md), senza modifiche manuali ai contenuti AI.

**Esito: 0/3 guide valide, 7 nuove invocazioni, 4m10s.** Runner `75394` concluso con exit 1; arresto globale rispettato. Gli altri due matchup non sono partiti. Le chiamate sono tutte riuscite al servizio; il blocco è nel trasporto/validazione della risposta del critico, non in un errore Codex di avvio.

Contabilità: **327 v28 / 403 storiche**, residui **173 sul primo matchup / 1.173 nel pool**, entro **500 cumulativi per guida / 1.500 nel ciclo / riserva24**. Il job Crustle conserva **33 tentativi di206**, senza azzerare i294 precedenti. Uso misurato delle sette invocazioni: **301.717 token input, 8.221 output**, nessun uso ignoto. Campioni di calibrazione:307.

## Cosa è avvenuto

1. Quattro riesami indipendenti dei testi audit già pagati: tre passano. Nessuna rigenerazione di piano, setup o turni.
2. Il quarto critico rileva due affermazioni implicite sui KO e richiede correzione. I rilievi confrontano Scratch con i PS/debolezza di Joltik e Shred con i PS di Electrike nella finestra considerata. Sono giudizi AI conservati con le loro fonti; non una certificazione competitiva.
3. Il costruttore riscrive soltanto l’audit, senza cambiare il registro fisico.
4. Il primo riesame della correzione dichiara pass, ma lascia `declaredCount:null` per tre occorrenze esplicite di “due” nel costo di Ultra Ball. Il validatore lo respinge correttamente: il numero scritto non può restare privo di valore dichiarato.
5. Il retry dichiara i valori richiesti, ma collega il costo di uno scarto a `You must discard a card from your hand in order to use this Ability.` e il limite una volta a `Once during your turn, you may draw 2 cards.`. Il validatore riconosce le cifre e numerali letterali, ma non `a card` o `Once` come riferimenti alla quantità1. La prima citazione non produce alcun indizio numerico; nella seconda produce2 e `Once` senza valore.
6. Esaurite le due risposte non valide della stessa unità, il codice si ferma con `invalid-response`. Nessun pass viene forzato o salvato come guida completa.

Il primo errore è una risposta incompleta rispetto al contratto; il secondo mostra una limitazione generale del contratto di ancoraggio alle fonti per espressioni quantitative inglesi. Non è una differenza di inventario dimostrata. Un eventuale intervento dovrà restare generale, vincolare la struttura delle risposte e riconoscere solo prove quantitative effettive delle fonti, conservando originali, contatori e rifiuti. Non basta accettare qualunque parola o cancellare il confronto numerico.

## Verifiche di chiusura

- Archivio immutabile di **881 file**, inclusi gli **859 input congelati**, tutto verificato.
- Tre database equivalenti ai backup su schema e **39 tabelle ciascuno**. I seed v5 restano intatti; nessun nuovo job dei casi successivi.
- Due riaperture su copie ritrovano lo stesso stop locale, senza invii:33 tentativi e307 campioni conservati. Tempi3,152s e4,121s.
- Un tentativo del vero runner `live` dopo lo stop viene respinto dal marker di campagna già avviata, prima di qualunque nuovo tentativo. Nessun riavvio o nuovo consenso creato.
- Nessuna linea principale o critica completa della premessa raggiunta, nessun capitolo scritto, nessuna guida reale disponibile per la verifica UI.

Evidenze: `.verify/app225-segments-20261102/verification-app232-finite-v6.json`, `app232-finite-v6-diagnosis.json`, `app232-v6-terminal-recovery.json` e `campaign-finite-v6-archive/manifest.json`. La diagnosi conserva entrambi gli output originali, i riferimenti e gli indizi che hanno prodotto il rifiuto; non contiene correzioni manuali adottate.

APP-232 resta In progress, APP-225 Blocked, obiettivo completo aperto. La campagna autorizzata è conclusa: nessuna ulteriore chiamata reale, riapertura o aumento dei tetti è autorizzato da questo esito. L’eventuale lavoro sul contratto delle fonti e sulle risposte non valide del critico prosegue soltanto offline, preservando l’archivio v6 e tutti i controlli. L’app mantiene default v27, guard v28 e policy v5 isolata; held-out esclusi.
