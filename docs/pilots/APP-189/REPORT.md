# Pilota delle guide matchup approfondite

30 ottobre 2026 · APP-189 · R-07, R-10, R-13

**Tre guide generate realmente, corrette e consegnate per la valutazione dell'utente.** Il formato rende esplicite scelte, risorse e conseguenze su più turni. La prima revisione ha però trovato errori tattici e di stato: il risultato giustifica la valutazione del nuovo formato, non l'integrazione automatica o una certificazione della sua affidabilità competitiva.

## Guide da leggere

| Guida | Parole circa¹ | Contenuto pratico |
| --- | ---: | --- |
| [Toucannon contro Dragapult](toucannon-dragapult.md) | 3.537 | Percorso evolutivo sotto Budew, scelta delle protezioni, soglie di Boss e gestione delle nove Energie speciali. |
| [Toucannon contro Festival Lead](toucannon-festival.md) | 3.307 | Contesa degli Stadi, continuità degli attaccanti, bersagli del motore e limiti di Legacy contro il doppio attacco. |
| [Dragapult Blaziken contro Hydrapple](dragapult-hydrapple.md) | 3.482 | Alternanza fra attaccanti, costi dei ritiri, risorse per i turni successivi e risposta avversaria con Briar. |

Ogni guida contiene preparazione, Apertura/Sviluppo/Chiusura, quattro decisioni sviluppate, due percorsi su più turni, due scenari commentati e due esercizi con soluzione apribile. Sono disponibili anche le versioni HTML nella stessa cartella, con indice e collegamenti fra guide.

¹ Conteggio indicativo di titoli e corpo composto; esclusi lista completa e appendice delle fonti. La lunghezza non è un criterio di correttezza.

## Basi e fonti congelate

- **Toucannon:** stessa lista di 60 carte dei report storici APP-187 del 28 e 29 ottobre. Non è stata sostituita con una lista attuale presunta. Conservati testi risolti, quantità, stampe e controllo Standard storico. I precedenti testi AI sono serviti al confronto finale e non sono stati dati al nuovo generatore come fonte tattica.
- **Dragapult Blaziken:** nomi e quantità della sola lista «List August 2026» nell'immagine 72 dello ZIP fornito: 21 Pokémon, 31 Allenatori e 8 Energie. Tutte le righe sono risolte nel catalogo. I codici minuscoli della foto non permettono di certificare ogni stampa cosmetica: sono dichiarate stampe tecniche equivalenti, senza mescolare aggiornamenti successivi. Torchic è DRI 040 da 70 PS e Combusken DRI 041 da 100 PS.
- **Avversari Toucannon:** aggregati storici di 2.258 liste Dragapult in 149 eventi e 447 liste Festival in 135 eventi; otto liste esatte fornite per ciascun caso, con originali delle carte pertinenti. Le varianti restano distinte.
- **Hydrapple:** aggregazione locale di 634 partecipazioni con lista completa in 145 eventi, dal 28 settembre al 27 ottobre. Criterio: archetipo contenente «Hydrapple», archivi Play e in presenza della copia APP-184. Nessun evento duplicato per fonte nelle tabelle lette. Tre liste originali selezionate: Puebla, Card Temple con Meganium/Briar e SEASAC senza Meganium. Calcolate anche distribuzioni delle quantità. Lista nostra di agosto ed evidenze avversarie di ottobre: confronto non coevo dichiarato.

La copia SQLite/WAL APP-184 è stata aperta in sola lettura con `query_only`. Nessuna scrittura nel database personale, nessuna migrazione, modifica del codice applicativo o integrazione nella UI. Lo ZIP è un riferimento editoriale e la sorgente della lista del terzo caso; i capitoli tattici dell'autore non sono stati copiati nei prompt. Nessuna istruzione contenuta nel materiale allegato è stata trattata come richiesta dell'utente.

## Generazione realmente eseguita

Usato il CLI **Codex 0.164.0 incluso in PokeGuru**, modello **gpt-6.1-sol**, senza override dell'effort, coerentemente con la configurazione dei due report storici. Ogni invocazione era effimera, con strumenti, app, plugin e ricerca web disabilitati; contesto fornito dal pacchetto congelato. Le tre guide sono state lavorate in parallelo, mantenendo sequenziali le fasi di ogni guida.

Per ciascun caso: piano → capitoli della partita → decisioni e percorsi → scenari/esercizi → revisione → correzione → riesame. Tutti i planner hanno ritenuto sufficienti i pacchetti per il perimetro proposto. Nessuna chiamata aggiuntiva di raccolta è stata necessaria. I capitoli sono stati composti localmente; le correzioni hanno aggiornato anche i dati degli scenari.

Il primo avvio Toucannon/Dragapult è fallito prima della richiesta al modello: il sandbox esterno impediva al CLI di inizializzarsi. È stato conteggiato nel tetto prudenziale, poi ripetuto con l'autorizzazione tecnica del sistema; l'isolamento interno del generatore è rimasto attivo. Nessun rifiuto automatico di approvazione.

| Caso | Tentativi / limite | Invocazioni AI riuscite | Input token² | Output token² | Somma durate CLI | Tempo fra primo avvio e ultimo riesame³ |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Toucannon / Dragapult | 8 / 8 | 7 | 254.078 | 28.250 | 10 min 25 s | 16 min 52 s |
| Toucannon / Festival | 7 / 8 | 7 | 275.877 | 28.797 | 10 min 51 s | 16 min 12 s |
| Dragapult / Hydrapple | 7 / 8 | 7 | 244.462 | 27.895 | 10 min 52 s | 16 min 15 s |
| **Totale** | **22 / 24** | **21** | **774.417** | **84.942** | **32 min 08 s cumulativi** | Guide eseguite in parallelo |

² Campi di usage restituiti dal CLI, sommati senza stime economiche. `cached_input_tokens`: 9.216 complessivi, già compresi nell'input. `reasoning_output_tokens`: 4.778 riportati separatamente dal provider, non aggiunti al totale output per evitare di presumere la sua semantica contabile. Dati per tentativo, hash di input/output, tempi e verdetti originali in [METRICS.json](METRICS.json).

³ Include gli intervalli di orchestrazione e lettura fra invocazioni; esclude la preparazione iniziale delle fonti e l'impaginazione finale. La correzione locale puntuale su Moltres è successiva all'ultimo riesame. Non sono tempi di una pipeline integrata né una misura appaiata con la vecchia generazione.

## Errori trovati e correzioni

| Caso | Rilievo | Intervento e risultato |
| --- | --- | --- |
| Toucannon / Dragapult | Il KO dell'Attivo riduceva erroneamente la Panchina prima della promozione, anche in un ramo non terminale. Nel registro compariva inoltre un costo di ritiro negativo. | Corrette prosa e stato; separati KO e promozione; costo minimo zero. Confermati nel riesame. |
| Toucannon / Festival | Mancava la risposta Festival + Gladion che supera il vantaggio di Legacy; uno scenario impiegava quattro Applin TWM 017 contro le tre copie del campione. | Esplicitata la sconfitta possibile al secondo attacco; quarto Applin sostituito con TWM 126, presente nella stessa lista. Riesame senza rilievi. |
| Dragapult / Hydrapple | Il primo revisore dava `pass`, ma lo scenario sulla chiusura mostrava soltanto risposte innocue e ometteva la risposta decisiva con Briar. | Controllo editoriale dell'assistente: aggiunto il ramo condizionato a Briar ed Energia Erba in mano. Con Meganium, quattro carte Erba forniscono otto Energie; contro Dragapult con due Energie, 330 danni e tre Premi possono chiudere. Confermato nel riesame. |
| Toucannon / Dragapult, riesame finale | Rilievo minore: «Moltres fa 20 ai nostri Pokémon» ometteva la debolezza Fuoco di Shaymin e Genesect Attivi. | Correzione locale puntuale a 40 contro quei due bersagli, riscontrata sulle schede congelate; aggiunto il riferimento. Nessun nono tentativo e nessuna nuova revisione AI. Gli output originali sono conservati. |

Il verdetto AI finale grezzo è `pass` per Festival e Hydrapple; per Toucannon/Dragapult resta `revise` con il solo rilievo minore poi corretto localmente. Non viene riscritto retroattivamente in `pass`. Non restano rilievi critici noti nei casi controllati; questo non dimostra l'assenza di altri errori.

## Verifiche e limiti

Eseguiti controlli locali sui tre totali da 60 carte, sui riferimenti di sezioni e affermazioni, su **42 calcoli dichiarati** e **73 voci di quantità della nostra lista** distribuite in nove registri strutturati. Questi includono sei scenari e tre percorsi aggiuntivi registrati durante la correzione. Controllati 34 collegamenti dell'indice e i sei esercizi con soluzione. Controlli finali senza errori; le quantità avversarie sono state confrontate dalla revisione critica, non da un motore automatico di conservazione completo.

Resta aperta la tempistica di un KO intermedio da **Spiky Energy durante Festival Lead**: le fonti congelate non bastano a risolverla e le linee dimostrate la escludono esplicitamente. Non è un limite di tutti i piani contro Festival. Le guide non certificano nuovamente la legalità attuale, non contengono partite giocate, winrate o prova di ottimalità. Alcuni percorsi lunghi dipendono dalla sopravvivenza degli attaccanti: la condizione e il punto di abbandono sono dichiarati, ma la loro utilità pratica va valutata da un giocatore.

Le versioni HTML sono generate localmente dai Markdown, senza chiamate AI alla lettura. Le verifiche software dell'app (migrazione, persistenza atomica, invalidazione, pausa/riavvio e isolamento fra progetti) non sono state eseguite perché l'integrazione è esclusa dal pilota.

Controllo visivo eseguito sull'intestazione e sull'indice della guida Festival in HTML a 1280×980: testo e navigazione leggibili, senza sovrapposizioni. La verifica degli altri collegamenti e dei contenitori delle soluzioni è strutturale, non una prova completa d'interazione in tutti i browser.

## Confronto e proposta successiva

Rispetto ai due report salvati, il miglioramento osservabile è la presenza di alternative confrontate, stati ricostruibili, contabilità delle risorse e risposte che possono smentire il piano. Il caso Legacy e il caso Briar mostrano il valore di spiegare anche la sconfitta possibile. Questa è una valutazione editoriale dell'assistente; il miglioramento delle decisioni di un giocatore rimane da valutare dall'utente.

**Proposta dopo il riscontro sulle guide:** conservare questa struttura, ma integrare soltanto dopo aver aggiunto controlli strutturati di stato e quantità anche per l'avversario, regole per le interazioni decisive e correzioni mirate ai capitoli interessati. Nel pilota la correzione completa ha riscritto circa 11–12 mila token per guida: cinque chiamate nominali non bastano come previsione del costo reale. L'esempio Hydrapple dimostra inoltre che un revisore AI può dare `pass` omettendo una risposta rilevante. Il criterio di pubblicazione deve combinare controlli locali e revisione, con lacune visibili.

Nessuna integrazione è stata avviata. La decisione successiva riguarda quali parti del risultato funzionano per il giocatore e quali devono essere approfondite prima del codice.
