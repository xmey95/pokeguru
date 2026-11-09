# Profilazione per fase e costo locale delle guide — APP-262

Incremento del 9 novembre 2026, sopra `dev` 1712533c82309a5c86df334bbd79b7180dfb3e53. Worktree isolato `.verify/app262-guide-performance/worktree`, ramo `task/app-262-guide-phase-performance`. `main` verificato a 5a6ba8321ee6b97c486968b852379f8b4bfa51ff, release v0.3.13 conservata. Nessun packaging o nuova pubblicazione.

## Misure e loro significato

Il profiler CPU sul checkpoint APP-260 individua scansioni ripetute dei descrittori durante la ricostruzione degli audit. La prova con profiler dura 279,753 s: `originalParts` usa 44,327 s di campioni propri, il lettore JSON `get` 39,242 s, gli hash generali 34,411 s e quelli delle unità 21,371 s. Fra gli stack più costosi ci sono selezione, decodifica e confronto di audit appartenenti a registri diversi. Questi tempi propri non sono il costo totale delle rispettive fasi e non si devono sommare ai tempi inclusivi. La profilazione è diagnostica; il confronto di accettazione usa esecuzioni separate senza profiler.

Il comando `scripts/guide-phase-profile.ts` legge gli originali con `AiEvidenceArchive` in sola lettura, riconcilia identità di tentativi, raw e ricevute di invio, e produce contatori, nomi delle fasi e ID del job per la riconciliazione locale. È uno strumento tecnico locale, distinto dall’export anonimo della diagnostica dell’app. Il file di output deve essere nuovo: non può sovrascrivere database o report esistenti. Non carica un provider.

Riproduzione con Node24 e dipendenze installate:

```text
node node_modules/typescript/bin/tsc -p scripts/guide-phase-profile.tsconfig.json
node .verify/guide-phase-profile/scripts/guide-phase-profile.js <database.sqlite> <jobId> <nuovo-report.json>
```

| Archivi approvati | Tentativi | Risposte raw | Input registrato | Output registrato | Tentativi senza usage |
| --- | ---: | ---: | ---: | ---: | ---: |
| Crustle–N’s Zoroark | 146 | 136 | 7.761.430 | 210.324 | 10 |
| Alakazam/Dudunsparce–Basic Box | 142 | 137 | 9.364.309 | 239.324 | 5 |
| Dhelmise–Lucario/Hariyama | 310 | 301 | 20.393.279 | 392.707 | 9 |
| Totale | 598 | 574 | 37.519.018 | 842.355 | 24 |

Il cached input registrato è 601.472 token, già incluso nell’input; non si somma una seconda volta. I 24 usage mancanti restano ignoti. I tentativi non sono tutti invii al provider e gli invii non sono tutti risposte complete. Le ricevute di invio sono conteggiate separatamente dai raw. Le durate registrate includono elaborazione locale della risposta: non sono latenza pura del servizio né fatturazione.

| Famiglia e finalità esplicita | Tentativi | Durata registrata (s) | Input registrato | Output registrato |
| --- | ---: | ---: | ---: | ---: |
| Segmenti / costruzione | 212 | 9.651,5 | 12.289.606 | 306.173 |
| Premesse / critica indipendente | 165 | 6.076,0 | 9.872.794 | 210.202 |
| Scenari / riparazione esplicita | 46 | 2.589,4 | 3.132.706 | 120.042 |
| Metadati / costruzione | 22 | 1.559,5 | 1.194.149 | 73.601 |
| Altri riesami indipendenti | 50 | 1.363,1 | 4.065.620 | 47.652 |
| Prosa / costruzione | 53 | 1.134,7 | 4.676.784 | 44.043 |
| Piano / costruzione | 18 | 691,8 | 793.662 | 25.340 |
| Segmenti / riparazione esplicita | 32 | 496,0 | 1.493.697 | 15.302 |

Questa classificazione segue la famiglia del planner e il nome della fase. Le ricostruzioni possono usare nomi di costruzione: «riparazione esplicita» è un limite inferiore. I nomi integrali sono nei JSON per rendere controllabile il raggruppamento.

| Modalità | Cosa viene misurato |
| --- | --- |
| Generazione AI a freddo | Non eseguita in questo incremento. Le tre storie hanno più epoche e riprese; manca un confine storico affidabile tra ogni esecuzione. Nessuna durata/costo a freddo viene dedotta da quei totali. |
| Riparazioni reali già pagate | Contatori per fase negli originali; negativi, timeout e usage mancanti conservati. |
| Nuova generazione e riparazioni sintetiche | Gate completo dell’app con provider sintetico, misure locali separate. Non dimostra latenza o qualità del servizio reale. |
| Ripresa lunga | Copia del medesimo checkpoint con 290 tentativi e 281 raw, tutti i lettori correnti, arresto davanti al solo provider intercettato. |
| Replay/cache della guida completa | Riapertura e recupero senza nuove chiamate, verificati nel ciclo sintetico; gli originali reali approvati sono riletti senza rigenerarli. |

## Intervento generale

La selezione congiunta ordinata legge prima la versione dell’audit e poi l’hash del registro (`sourceHash`). Un solo passaggio identifica le versioni 3/4 pertinenti. Per la compatibilità con la versione 2, ricava gli identificativi dai descrittori pertinenti e seleziona gli esiti corrispondenti. I confronti completi di packet, native, modalità, quantità, decisioni, turni e feedback restano dopo la selezione.

Ogni lookup legge e impronta tutti i chunk compressi e la dimensione corrente, anche per le righe escluse. La cache conserva soltanto foglie stringa o la constatazione che una foglia non è una stringa, entro gli stessi 4 MiB e 16.384 elementi preesistenti. Non conserva oggetti modificabili, validazioni o pass. Percorsi e stringhe grandi non vengono memorizzati. L’accesso ai campi rispetta l’ordine dei filtri, inclusi gli errori su genitori nulli. I risultati selezionati vengono sempre decodificati in oggetti isolati.

Nessun cambiamento ai prompt, agli schemi, alle liste, al matchup, alla critica indipendente, ai validatori, allo scaling o alle riserve. Nessun nuovo tetto di chiamate/riparazioni. Il recupero dei raw e la diagnostica degli arresti restano quelli esistenti. Il risparmio cercato è nel lavoro locale necessario a ritrovare le risposte pagate; i token visibili della richiesta successiva devono restare identici.

### Esperimento scartato: costruzione ripetuta degli schemi

La successiva profilazione del ciclo sintetico individua un secondo costo locale: `guideSegmentNativeSchema` costruisce e clona lo schema prima di raggiungere la cache di `boundGuideSchema`. La candidata aggiunge una memoizzazione all'ingresso del costruttore puro. La chiave comprende l'intero packet corrente, l'ID del caso e la lista avversaria; non usa soltanto l'hash di dipendenza dichiarato. I template provengono dal codice. La cache JSON preesistente mantiene il limite complessivo di 16 MiB/256 elementi, restituisce alberi isolati e non memorizza errori. I valori non rappresentabili senza perdita come JSON continuano a percorrere il calcolo originale. Nessun validatore, replay dei registri o critico viene eliminato.

Quattro impronte di schema sono state prodotte con il costruttore precedente alla modifica: v27, v28, un altro ID e una fonte carta modificata lasciando identico l'hash dichiarato. I test verificano quegli stessi byte, mutazione dei risultati, modifica in-place della fonte e avversario estraneo. Il confronto ABBA della sola funzione pura (400 chiamate per giro, stesso processo) misura 1.323,669/924,067/615,043/1.605,050 ms: riduzione media 47,4%, schemi identici. Non è una misura del tempo completo di generazione. Artefatto `schema-comparison.json`; fixture sperimentali conservate nel worktree sotto `.verify/app262/rejected-schema-experiment`.

Il replay completo dell'esperimento misura però 552,515 s e 1.436,406 MiB: tempo inferiore del 22,6% alla base, memoria superiore del 2,3%. `comparison-final-v2.json` conserva il gate negativo e l'identità esatta di prompt/schema/budget ed evidenze. **L'esperimento non è adottato**: `guide-segments.ts` e il relativo test sono tornati identici alla base; fixture e compilati sperimentali restano solo negli artefatti locali. La modifica applicativa finale comprende soltanto selezione congiunta e recupero degli audit.

## Qualificazione

Concluso il perimetro comparativo di APP-262; il gate assoluto del ciclo sintetico è riportato separatamente sotto. Artefatti locali in `.verify/app262-guide-performance`: profiler, misure sequenziali, confronto esatto, profili per fase, test, rilettura delle approvazioni e verifica del checkout originale. Il criterio fissato prima del risultato del confronto è riduzione del tempo superiore al 10% e nessun peggioramento del picco RSS nella coppia osservata. Un esito negativo non viene scartato o risolto alzando soglie.

Primo confronto conservato in `comparison-first-negative.json`: 714,272→508,530 s (−28,8%), RSS 1.404,148→1.420,695 MiB (+1,18%). Il gate resta **negativo sulla memoria**, benché prompt/schema/budget e tutte le 6.486 associazioni, 6.263 oggetti e 8.464 chunk originali coincidano. La candidata finale elimina anche la closure per riga e gli oggetti temporanei della lettura dei metadati: la cache legge direttamente primitivi stringa/null. La misura adottata è riportata sotto; non costituisce una garanzia del picco RSS in ogni esecuzione. La variabilità rispetto al profiler e ai dati APP-260 rimane esplicita.

La richiesta successiva conserva 84.849 token visibili, stima input109.447, riserva output8.000 e margine8.192; schema e calibrazione coincidono. Nessun risparmio di token del provider viene attribuito alla modifica. Il timer del replay parte dopo copia, apertura e conteggio degli originali; il picco RSS riguarda il processo. Le due versioni usano lo stesso perimetro di misura.

Il confronto alternato ABBA della selezione usa tutte le 23 impronte di registro con audit3/4 nel checkpoint. Prima osservazione: 14.628→7.314 verifiche degli originali, 906.462.108→453.231.054 byte compressi letti e 1.882→384 letture JSON per giro; selezioni integrali identiche. Ogni selezione verifica ancora TUTTI gli originali correnti, ma la congiunzione evita la seconda scansione. I tempi sono nel JSON, con variabilità tra il primo e l’ultimo giro del riferimento; il dato strutturale non dipende dalla velocità della CPU.

Il primo ciclo sintetico, dentro la sandbox, conserva 3 test passati e un negativo: tempo a freddo82,624s oltre il limite60s, dopo i controlli funzionali. Artefatti `synthetic-tests-sandbox-negative.json/.log`. Una sola ripetizione dello stesso file, con codice, input, asserzioni e limiti60s/10s/768MiB invariati, in un processo separato fuori sandbox conserva ancora3pass/1fail: freddo72,506s. Entrambi i negativi restano; nessuna soglia viene alzata. È seguita una profilazione diagnostica del solo ciclo lento, senza altri tentativi di qualificazione invariati alla cieca.

La candidata con cache anticipata dello schema conserva un ulteriore negativo: 89,433 s a freddo. Il confronto con il codice di partenza, verificato identico a dev nei file `src`/`tests`, fallisce a sua volta: 98,624 s contro 60 s. Il limite assoluto risulta quindi non raggiunto anche dalla base nell'ambiente attuale. Questo non trasforma il negativo della candidata in un pass. I due run diagnostici con profiler restano separati: nel primo RSS852,277MiB, nel secondo freddo99,992s; non partecipano alla misura di accettazione. La strumentazione finale conserva tutte e tre le metriche prima delle asserzioni, anche in caso di fallimento; l'export del database sintetico continua a richiedere i limiti invariati.

## Limiti

Fonti congelate al 30 ottobre 2026 e orizzonte tattico finito. Nessuna ottimalità universale o previsione del costo di nuove guide. I contatori storici appartengono alle tre guide approvate su più epoche di codice. Non sono rigenerate: non occorre comprare nuove risposte per misurare questa modifica locale con prompt e schemi identici. Restano da misurare separatamente eventuali riduzioni future dei consumi effettivi di generazione a freddo.

## Risultato adottato e verifiche finali

| Osservazione senza profiler | Tempo (s) | Picco RSS (MiB) | Esito del confronto |
| --- | ---: | ---: | --- |
| Base dev1712533 | 714.272 | 1404.148 | Riferimento |
| Prima selezione congiunta | 508.530 | 1420.695 | Negativo memoria, conservato |
| Selezione con primitivi, adottata | 325.805 | 1363.633 | Tempo e RSS nei criteri comparativi |
| Cache anticipata dello schema, esclusa | 552.515 | 1436.406 | Negativo memoria, conservato |

Replay 714.272→325.805 s (−54.4%), RSS 1404.148→1363.633 MiB (−2.9%). Sono osservazioni sequenziali in processi nuovi, con forte variabilità dell'host e senza test concorrenti. Non sono ripetizioni randomizzate del replay e non dimostrano che l'intera differenza dipenda dal codice. Il confronto ABBA della selezione misura −57.1% in media; la riduzione strutturale di byte del 50% e di letture JSON da 1.882 a 384 è deterministica sullo stesso input. I risultati selezionati coincidono. La variante di schema scartata non rientra nel codice finale.

Ultimo esito per file delle regressioni e successivo file del ciclo completo: **322 passati, 1 fallito, 0 esclusi, 35 file**. Il giro parallelo conserva 318 passati/1 timeout; il file del flusso applicativo è stato rieseguito da solo, senza cambiare il limite di 120 s. Non è un unico giro completamente verde. Le prove preliminari non si sommano. Typecheck, compilazione del profiler e build applicativa passati. Non è un full run di tutta la release e non sono state ripetute prove UI: nessun file dell'interfaccia è cambiato.

Ciclo sintetico sul codice adottato: freddo **81.236 s**, ripresa **2.343 s**, picco **887.680 MiB**, 48 richieste sintetiche, 16 riparazioni e 8 pareri negativi conservati. Tutti i controlli funzionali precedenti alle asserzioni delle risorse sono eseguiti: corruzione, critici indipendenti, persistenza, rilettura e ripresa senza riacquisti. Gate invariato 60 s/10 s/768 MiB: **negativo nel giro finale, conservato e non promosso a pass**. Il JSON delle metriche viene salvato anche in caso di errore; la copia del DB sintetico richiede invece il pass.

Il confronto sulla base invariata aveva già misurato 98,624 s contro 60 s. La scoperta distingue questo limite generale dalla regressione ipotizzata durante il lavoro: APP-262 chiude la profilazione e la riduzione del primo costo locale con confronto equivalente; non garantisce il limite assoluto su ogni macchina né lo innalza. APP-263 conserva il lavoro successivo sul costo a freddo. Il campo `passed` del manifest resta false e non nasconde l'esito complessivo delle asserzioni.

Tre guide reali approvate rilette con i validatori completi del codice adottato, hash e liste da 60 conservati. Checkout originale: 1062 file, HEAD e stato Git invariati. Profili storici: 598 tentativi, 583 invii registrati, 574 raw; 24 usage mancanti dichiarati. **Zero nuove chiamate AI reali**, nessun risparmio di token del provider attribuito a questa modifica, nessun pacchetto o rilascio.

Manifest locale: `.verify/app262-guide-performance/qualification.json`. Runner locali conservati: `qualify-final.ps1`, `finish-final.ps1` e `summarize-final.cjs` nello stesso parent; usare nuove destinazioni per eventuali repliche e conservare queste osservazioni; il profiler tracciato accetta qualsiasi database/job/output nuovo. Sono conservati benchmark, input congelati, compilati delle varianti, negativi e hash dei tre file applicativi adottati.
