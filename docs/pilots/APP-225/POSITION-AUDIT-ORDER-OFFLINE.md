# APP-244 — Posizioni prima degli audit, con approvazione completa successiva

06-11-2026. Correzione generale e verifica offline completate. Zero nuove chiamate reali; contabilità397v28/473storiche e0/3 nuove guide valide invariata. APP-244 Done per questo incremento; APP-232/APP-225 Blocked e obiettivo generale incompleto. Nessuna campagna reale riaperta.

## Correzione e controlli

Il costruttore del setup continua a eseguire posizione → audit → lettore completo → critica indipendente. È corretta la proiezione preliminare delle posizioni: quando restituisce esclusivamente fatti di costruzione,non pretende decisionProof.cards già completo. Prima,la proiezione si fermava su quel controllo prima che il costruttore dedicato degli audit potesse riempirlo.

La modifica applicativa è una sola condizione privata in guide-ledger-projection.ts,senza eccezioni per carte,matchup o esempi del pilota. I lettori pubblici non attivano il raccoglitore preliminare: mantengono il controllo esatto dei candidati disponibili prima di ogni azione. La raccolta delle posizioni non produce setupReceipt,approvazioni o testo sostitutivo. Esegue gli stessi movimenti e conserva controlli su stock,zone,copie,destinatari,pagamenti,regole dei turni,Attivo,Panchina e Premi. Le annotazioni restano soggette al loro validatore,poi seguono costruzione audit,controlli quantitativi/semantici,lettura completa e critici indipendenti.

Schemi,prompt audit600,lettori finali,limiti148/164,16 crediti,scaling,calibrazione e riserve non sono modificati. Nessun contenuto AI reale viene riscritto,nessun rifiuto promosso a pass e nessun contatore azzerato.

## Verifica completa offline

- **260 test distinti passati,zero fallimenti,27 file pertinenti**; non la suite dell’intero repository. Cinque nuovi casi verificano raccolta con audit pendente,lettore pubblico ancora negativo e controlli su movimenti/destinatari/assegnazioni/primo turno. I24 test mirati sono inclusi nel totale,non sommati.
- Il percorso applicativo completo usa due liste sintetiche diverse e due scenari con una reale assegnazione di Energia nel registro,decisionProof inizialmente nullo e confronto tattico ancora da costruire. Produce gli audit600 attraverso il normale costruttore,li riesamina e supera tutti i lettori e le critiche finali. Salvataggio,rilettura JSON e recupero senza richieste verificati;nessun credito di riparazione utilizzato. Le risposte del provider sono sintetiche: non è una nuova guida reale valida né una prova di convergenza del servizio.
- Esecuzione completa separata dal framework di test: **42 risposte sintetiche**,freddo25.559s,recupero0.772s,picco738.29MiB. Passano le soglie invariate60s/10s/768MiB. La misura cumulativa del processo Vitest esportata dal test mirato era791,38MiB,comprensiva del framework: non viene presentata come pass di memoria. Il gate del percorso completo è misurato e superato separatamente,senza alzare la soglia.
- Typecheck incluso nella build e build Electron passati. UI sulla nuova guida sintetica completa a1440/1280/640px,storico incluso,zero errori renderer. Anche una guida sintetica storica completata viene recuperata dal nuovo codice senza provider.
- Sette archivi immutabili verificati per799/794/798/784/783/903/892file. Tre DB reali sorgente e tutte le39tabelle per ciascuno coincidono con l’archivio terminale. Rispetto alla qualifica precedente,cambiano un file applicativo e quattro file di test/fixture;gli altri566source/test qualificati restano identici.

## Ripresa dagli originali reali

Entrambi i setup negativi del job0793c786-e318-44d9-9f4c-a52357d68202 ora consentono di ricavare le posizioni. Su ciascuno il raccoglitore ricava7 scelte;il lettore pubblico continua a respingere lo stesso input privo di audit completi. Non è quindi un’approvazione implicita.

Due riaperture su copia eseguono generateDeepGuide e raggiungono la prima richiesta guide-finite-audit-4 sul **secondo setup autentico già pagato**,senza terzo quadro o nuovi turni storici. Restano10raw,due rifiuti,377campioni e tutte le8177evidenze precedenti presenti nel database copiato. La richiesta viene intercettata prima del provider;nessun raw nuovo o contenuto manuale. Il primo tentativo simulato conserva i4crediti usati;la seconda apertura addebita correttamente il retry del tentativo interrotto nella sola copia,senza rinnovi (5usati). Gli originali reali restano a4usati/12residui.

Freddo1,756s/riapertura0,811s,picco459,97MiB entro60s/10s/768MiB. È verificata la ripresa fino al confine del provider,non l’esito dei futuri audit reali. Sulle altre due copie il normale avvio isolato arriva alla sola richiesta di piano;un nuovo primo job è correttamente respinto per budget.

## Budget ricalcolato prima della rete

| Voce | Stato |
| --- | --- |
| Consumo v28 /storico |397 /473|
| Nuove chiamate APP-244 |0|
| Tetti cumulativi |551 /500 /500|
| Pool /riserva per ciascuna successiva |1500 /24|
| Residui per guida /pool |154 /500 /500 /1103|
| Job esistente |10 invii,4 crediti usati/12 residui; gate tecnico fino agli audit superato|
| Prima richiesta pendente |56.446 token input stimati,24.000 output riservati,margine8.192;fits/target superati|
| Calibrazione |377campioni,fattore1,611489961838394 conservato|
| Riserva della richiesta pendente |20chiamate future;minimo di questa fase21,non stima di completamento|
| Nuovo primo job |164 richieste di disponibilità contro154;non ammesso|

Il massimo contrattuale residuo del job esistente è154;ciascuna guida successiva ha il profilo freddo164. Massimo482 ulteriori nel percorso noto,879v28/955storiche: non quota da consumare né garanzia di riuscita. Riserve24+24 mantenute. Il piano congelato e le dichiarazioni già pagate non vengono ricomprati.

Il job esistente raggiunge tecnicamente gli audit senza un aumento dei tetti,ma la campagna terminale non viene riaperta automaticamente: questa istruzione autorizza correzione e verifiche offline prima di nuove chiamate. Nessun grant o runner live nuovo,nessun rilancio dei matchup,held-out esclusi. Eventuali nuovi esiti non validi restano soggetti allo stop e ai controlli persistenti.

Evidenze in .verify/app244-position-audit-order-20261106: verification.json,budget.json,probe.ts,replay-*.json,integration.ts,standalone-integration.json,ui/result.json. Suite .verify/app244-regression-tests.json;build .verify/app244-build.log. Le prove complete sintetiche sono distinte dai replay sugli originali reali.
