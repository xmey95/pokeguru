# Ottimizzazione di tempi e consumi — APP-260

Completata il 9 novembre 2026 e integrata nel codice dell’app. Le tre guide approvate sono conservate integralmente: nessuna rigenerazione o modifica manuale, nessuna nuova chiamata reale. [Prova PokeGuru](../../../Prova-PokeGuru.cmd): riaprire l’app per caricare il backend aggiornato. Il profilo scrivibile persistente resta separato dagli originali.

## Risultati misurati

Confronto sullo stesso checkpoint lungo: 290 tentativi, 281 risposte originali. Ogni esecuzione si ferma al solo provider intercettato; prompt, schema, prossimo input hash ed esiti preesistenti devono coincidere. Nessuna chiamata al servizio.

| Misura | Tempo | Picco RSS |
|---|---:|---:|
| Riferimento senza profiler | 456,7 s | 1462,3 MiB |
| Candidata finale, prima osservazione a freddo | 238,5 s | 1389,1 MiB |
| Candidata finale, ripetizione a freddo | 231,7 s | 1198,4 MiB |
| Seconda esecuzione nello stesso processo | 232,4 s | 1368,8 MiB |

Il criterio preventivo era almeno il 30% di riduzione del tempo sul checkpoint e nessuna regressione della memoria. Superato anche confrontando prudentemente la ripetizione calda con il riferimento freddo. Nell’ultima misura fredda: tempo −49,3%, memoria −18,1%. La variabilità della memoria è visibile nelle due osservazioni, non nascosta. Parte del riferimento aveva test di correttezza concorrenti; le ultime due esecuzioni finali non avevano altri test concorrenti. Non è un confronto isolato ripetuto del tempo di una nuova guida completa né della latenza del servizio.

La prima selezione degli audit aveva ridotto il tempo ma peggiorato la memoria: 456,682→248,221 s e 1462,344→1604,098 MiB. Il gate negativo resta conservato in isolated-comparison.json e non è stato promosso a pass. Profiler e benchmark intermedi sono archiviati separatamente.

## Consumi e richieste evitabili

La nuova azione esplicita dell’app sceglie il trasporto con meno token visibili fra le codifiche reversibili esistenti anche quando il plain rientra già nel target. Include sempre il plain fra i candidati: non impone compressione quando costa di più. Policy host immutabile legata a job, progetto, pacchetto e configurazione; ripresa identica e nessun cambio retroattivo dei job pagati. Limiti tecnici, calibrazione, output, margini, riserve e scaling restano invariati.

| Primo piano archiviato | Token prompt precedente | Trasporto minimo | Riduzione |
|---|---:|---:|---:|
| Crustle–N’s Zoroark | 40.528 | 21.854 | 46,1% |
| Alakazam/Dudunsparce–Basic Box | 50.807 | 26.630 | 47,6% |
| Dhelmise–Lucario/Hariyama | 34.272 | 34.272 | 0,0% |

Totale dei tre soli prompt: 125.607→82.756 token, −34,1%. Schema invariato ed escluso da questi conteggi. L’espansione conserva ogni dato byte per byte. Sono conteggi locali dei trasporti, non una misura dei consumi futuri di un’intera guida o della fatturazione OpenAI. Il terzo piano era già compattato.

Il recupero raw segue ora la stessa catena immutabile dei rifiuti della cache di run(). Conserva il vecchio valore respinto e riempie soltanto il suo slot sostitutivo vuoto da un raw esatto, autenticato e riuscito, riletto con schema e validatori correnti. Non ricompra la risposta, non inventa tentativi o token e non trasforma un parere negativo in pass. Ricevuta2 con chiavi origine/sostituzione; ricevuta1 storica invariata. Test con dati derivati obsoleti, riapertura, modello/schema estranei e raw falliti/non conformi verificano il comportamento. Non viene promesso un numero fisso di chiamate risparmiate per ogni nuova guida.

## Interventi locali

- Selezione di unità e descrittori attraverso metadati primitivi: tutti i chunk compressi e le dimensioni correnti sono improntati anche per le righe escluse. Nessun verdetto, pass o oggetto modificabile memorizzato. Le righe scelte passano ancora i lettori completi; genitori nulli e percorsi non rappresentati mantengono l’accesso originale e i suoi errori.
- Conteggio esatto o200k con cache limitata dei frammenti indipendenti, confronto del confine pubblico e fallback all’encoder completo. Unicode, UTF16 malformato, stringhe speciali, JSON, eviction e frammenti lunghi verificati contro il conteggio integrale.
- Firme brevi e AST condivisi solo nei grafi privati immutabili dei codec3/4. Frequenze, ordine e byte storici rimangono identici. Fixture golden, espansione integrale e collisioni artificiali devono bloccare qualsiasi alterazione prima del provider.

Tutti i controlli e la personalizzazione sulla lista esatta/singolo matchup rimangono attivi. Nessun tetto numerico prefissato di chiamate o riparazioni per i nuovi until-valid; quote, contesto, output e problemi del servizio possono ancora sospendere il lavoro. I contratti bounded storici non vengono migrati.

## Qualificazione finale

Un solo full run offline: **1251 passati, 12 esclusi, 0 falliti, 192 file**. Due test Electron opt-in aggiuntivi passati:riapertura/pausa/quote/cache e reattività con12.000liste,binario Codex inesistente. Sono due dei12esclusi dal full,non due nuovi casi del full. Typecheck e build passati sul medesimo codice. Tre lettori completi delle approvazioni originali, hash invariati, stessi contatori e liste da60. UI ordinaria scrivibile e preview readonly delle tre guide a1440/1280/640; persistenza, riapertura, isolamento e cinque azioni vietate in readonly verificati. Ispezione visiva a1440 e640. Zero AI durante la qualificazione.

L’integrazione host e il ciclo nuovo fino ad approvazione/riparazione/ripresa sono verificati con provider sintetico; IPC, archivi, persistenza e interfaccia usano l’app reale. Soltanto la risposta del metagame pubblico è fissata sullo snapshot originale nei test UI. Non è stata avviata una nuova generazione reale da IPC ordinario. Le tre generazioni reali già approvate restano la prova del percorso di gioco, preservata da lettori correnti e confronti esatti; non sono state rigenerate per l’ottimizzazione.

Manifest riproducibile: .verify/app260-optimization-20261108/qualification.json. Contiene sorgenti/compilati, hash, casi esclusi, metriche, prove dei controlli e percorsi UI. Prima delle modifiche in before/, cronologia documenti in docs-before-final/, negativi e misure precedenti conservati. Le aggiunte al codice non introducono nomi dei matchup selezionati o rami specifici per le loro carte.

## Limiti

Il replay lungo richiede ancora minuti e molta RAM; questa fase non certifica convergenza universale, un costo massimo o un tempo fisso per tutte le guide. I risparmi di trasporto sono misurati, quelli di fatturazione e durata di future guide complete restano da osservare. Fonti delle tre guide congelate al30ottobre2026, orizzonte tattico finito. Nessun held-out live, nuova campagna o pacchetto installabile prodotto. Le prove escluse e i limiti sperimentali restano nel manifest: non sono dichiarati gate verdi mai eseguiti.
