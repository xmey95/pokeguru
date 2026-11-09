# APP-232 — Setup frammentato, esito reale e ripresa verificata offline

**Stato successivo:** la ripresa autorizzata è terminata dopo 10 nuove chiamate, 268 v28 / 344 storiche / 0 nuove guide valide. [Campagna finita v2](FINITE-CAMPAIGN-V2.md) è il riferimento corrente. Le sezioni seguenti conservano la preparazione precedente.

05 novembre 2026. **In progress; ripresa reale v2 autorizzata, esito pendente.** La prima campagna finita è terminata dopo tre chiamate nuove: **258 v28 / 334 storiche / 0 nuove guide valide**. Gli altri due matchup non sono stati avviati. Lo stop al primo esito non valido è rispettato; non è esaurimento del budget delle chiamate.

## Esito reale conservato

Runner3973 terminale exit1,7m48s. Piano globale accettato; primo setup respinto per audit che usavano nomi al posto dei printId e una promozione omessa. La correzione dell'intero setup termina con `output-limit`, senza file finale né contenuto parziale applicato. Il setup conteneva quattro turni storici ancora richiesti in una sola risposta.

Archivio immutabile `campaign-finite-v1-archive/manifest.json`:694 file,677 input congelati verificati e tutti i database/originali conservati. Due chiamate hanno uso misurato; l'uso della terza è sconosciuto, non zero.

Il valore14.000 del planner era una riserva stimata, non un parametro che il wrapper impostasse come massimo del servizio. Il limite numerico effettivo non è osservato. [OpenAI Docs](https://developers.openai.com/api/docs/guides/reasoning) distingue l'output visibile dai token di ragionamento e descrive risposte incomplete prima del testo finale: non dimostra quale quota delle due componenti abbia consumato il nostro caso. La diagnosi locale è il codice `output-limit` e i relativi contatori, non una supposizione sul limite numerico del modello.

## Correzione generale presente

- Quadro iniziale con piano globale originale, apertura congelata e scelta dichiarata del numero di round; poi una richiesta per ciascun turno storico. Nessun riferimento ai tre mazzi nel codice di costruzione.
- I frammenti accettati hanno soltanto schema e provenienza verificati: **non sono stati approvati come setup**. L'assemblaggio combina esclusivamente dichiarazioni AI e apertura già fornita dall'AI. Il lettore completo originale controlla tutto il registro, risorse, timing, attacchi, Energie, ritirate, KO, Premi, promozioni e audit prima di costruire la linea.
- La ricostruzione di una premessa respinta usa lo stesso costruttore, permettendo nuove ipotesi iniziali soltanto tramite output AI e mantenendo il riesame indipendente successivo.
- Nel solo contratto finito, carte degli audit e candidati di promozione sono vincolati ai printId reali delle liste. Nessuna traduzione manuale di nomi o Abilità in carte.
- Limite persistente di due risposte non valide anche per il piano iniziale; due risposte invalide per frammento e due costruzioni complete del setup. Restano i limiti già verificati del piano delle repliche, della premessa e delle riparazioni dei contenuti. Rifiuti e originali restano salvati; una riapertura non ricompra automaticamente la stessa critica.

`src/main/guide-finite-setup.ts`, `guide-bound-schema.ts`, `guide-setup-repair.ts` e il collegamento in `matchup-guide-generation.ts`. I protocolli storici, il defaultv27 e il guardv28 sono conservati. Nessuna attivazione nell'app.

## Verifiche

**413 casi di test passati,41 file,un'esclusione storica intenzionale; typecheck e build Electron/Vite passati.** Non si sommano le riesecuzioni. Tre varianti del test sui budget hanno lo stesso titolo stampato ma parametri differenti; il rapporto distingue413 casi da411 nomi stampati passati. Due prove di ingresso/revisione sono ripetute dopo l'ultimo collegamento del piano originale. Non è la suite completa dell'app.

Sei test dedicati coprono quattro turni storici e il gate completo, errore corretto sul solo turno, arresto persistente dopo due errori, due proposte ancora respinte, originale cancellato e ricostruzione di una premessa con nuova ipotesi iniziale legale. Le risposte sono sintetiche, non qualità AI reale.

Tre replay su copie dei database reali, senza provider e senza inventare risposte:

| Ingresso | Freddo | Caldo | Picco RSS | Prossima fase | Input stimato |
| --- | ---: | ---: | ---: | --- | ---: |
| Crustle–N's Zoroark, stesso job fallito | 1.453 ms | 368 ms | 367 MiB | quadro del setup | 42.583 |
| Alakazam/Dudunsparce–Basic Box | 717 ms | 53 ms | 317 MiB | piano globale | 84.180 |
| Dhelmise–Lucario/Hariyama | 1.357 ms | 234 ms | 347 MiB | piano globale | 57.919 |

Il primo riusa il piano già pagato; gli altri due sono ingressi freddi, senza piani futuri fabbricati. Il tempo freddo include avvio del processo dedicato, import e lettura degli input; sono esclusi soltanto copia SQLite e compilazione preparatoria. Soglie invariate60s/10s/768MiB.

Una quarta prova usa **un involucro di trasporto sintetico con i campi invariati dell'originale respinto** e si ferma prima della risposta del primo turno storico:2.329ms/390ms/387MiB,input51.732,zero provider. Verifica il dimensionamento del singolo turno, non approva il vecchio setup. Nel dato storico la risposta era34.741 caratteri; il maggiore turno storico compatto è7.991. Questi conteggi non misurano i token di ragionamento o il limite del servizio.

Sono conservati tutti i239 campioni:237 precedenti più i due misurati nella prova reale, senza inventare uso per la terza chiamata. Nessuna calibrazione o soglia token rilassata. Le future risposte possono comunque non entrare nei limiti: il job si arresta, senza una garanzia di riuscita.

Integrità:24 modifiche intenzionali /453 input invariati sul freeze477;70 file improntati. Tre database originari equivalenti agli archivi su tutte le39 tabelle; anche dati della campagna finita, relativo archivio e copie preparate per la ripresa sono equivalenti su schema/tabelle/contenuti. Nessun contenuto AI reale modificato manualmente.

Rapporti in `.verify/app225-segments-20261102/`: `verification-app232-setup.json`, `app232-setup-current-regression-tests.json`, `app232-setup-context-entry-tests.json`, `app232-setup-integrity.json`, `app232-setup-current-preflight-{0,1,2}.json`, `app232-setup-turn-preflight-0.json`, `app232-setup-real-output-audit.json`. Rapporti precedenti e negativi di sviluppo conservati.

## Budget e prossimo passo

`campaign-finite-v2` prepara la ripresa dello stesso job8d09e700-7b4d-44c8-8cf8-96ded5568d2b e due successivi job freddi. Il piano accettato non viene ricomprato; nessuna approvazione precedente trasferita. Il job corrente ha già usato3 chiamate e conserva massimo cumulativo245, ossia242 residue; con le255 precedenti alla sua creazione resta il tetto500 per quella guida. Pool v28:258 consumate e1.242 residue entro1.500;24 riservate a ciascuna guida successiva. Le76 storiche precedenti restano separate e conservate.

Runner corretto e verificato,nuovo congelamento681 file e guardia di consenso passati: `campaign-finite-v2/preflight.json`,seal0f0ba546e7eb06fa4ea009c76e8b034613045b26b1f8040f8a6f6ebe4eba1ed3. Nessuna chiamata o nuovo job reale dopo lo stop. La campagna precedente è conclusa: la sua autorizzazione non riapre il codice modificato. Stessi dati pubblici,modello/OpenAI tramite Codex,isolamento e controlli;stop globale al primo non valido,nessun aumento o riavvio automatico,held-out esclusi.

Restano tre guide reali valide,verifica UI/persistenza effettiva,generalità,policy applicativa e build per l'utente. **Obiettivo non completato.** La build di verifica non è la build di consegna.


## Ripresa v2 autorizzata

**Ripresa autorizzata 05-11-2026 — APP-232:** consenso call_68a13f3eb8eb4c5393a9453d34fadb20/0, «Autorizzo la ripresa entro 500/1500, riserva 24», legato al seal 0f0ba546e7eb06fa4ea009c76e8b034613045b26b1f8040f8a6f6ebe4eba1ed3. Campagna finita v2 sul codice congelato: stesso job Crustle e piano pagato; altri due soltanto dopo una valida. Baseline 258 v28 /334 storiche /0 nuove valide; massimo 242/500/500 nuove e1.242 nel pool, stessi tetti500/1500/riserva24. Tutti i controlli e scaling, nessuna modifica manuale ai contenuti, held-out esclusi. Stop globale al primo non valido, nessun riavvio o aumento automatico. Esito reale e sessione ancora da registrare; le note seguenti sono cronologia.
