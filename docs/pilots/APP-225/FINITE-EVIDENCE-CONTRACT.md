# APP-232 — Guide approfondite con copertura tattica finita

Decisione autorizzata dall'utente: «mi va bene il tuo consiglio per uscirne» dopo la proposta di guide rigorose con affermazioni circoscritte alle evidenze disponibili. Questo accordo modifica i criteri di validità strategica, non autorizza nuove chiamate reali o una pubblicazione.

## Consegna invariata

Tre guide complete e autonome per Crustle–N’s Zoroark, Alakazam/Dudunsparce–Basic Box e Dhelmise–Lucario/Hariyama. Lista esatta di 60 carte, singolo matchup, otto capitoli approfonditi, due scenari distinti e almeno due esercizi, fonti e limiti. Salvataggio, riapertura, UI, verifica generale, policy e build locale utilizzabile rimangono criteri di completamento. Nessun contenuto AI corretto manualmente.

## Confine strategico approvato

- Due scenari didattici: una decisione favorevole condizionata e una che mostra come un piano possa essere interrotto. Non sono dimostrazioni di vittoria forzata sul matchup.
- Ogni caso mostra la nostra prima mossa, la risposta avversaria e il nostro seguito, oppure una fine partita realmente dimostrata. Nessuna ricerca a profondità indefinita.
- Da due a quattro risposte avversarie complete per caso. Il piano sceglie linee pertinenti, non mosse deliberatamente inferiori; il critico indipendente verifica anche questa qualità. Le categorie accesso e difesa dichiarano se sono rappresentate o non confrontate, con motivazione e fonti. Non confrontato non significa impossibile.
- Il confronto vale soltanto tra le risposte dichiarate, nelle condizioni e pescate esplicite. Il vecchio campo interno `minimumReplyId` indica una risposta al KO non dominata dalle altre confrontate per consumo; non afferma una minima globale o indispensabilità delle carte. La UI deve renderlo esplicito.
- Non è richiesta una controlinea per ogni carta rimossa dalla risposta. Le quantità e il consumo effettivo restano verificati. Il nuovo contratto non ammette `omissionTests` o affermazioni di minimalità universale: una nuova pretesa più forte richiederebbe un altro contratto e le sue prove.
- Il critico può respingere legalità, risorse, fonti, aritmetica, coerenza, realismo, profondità o un consiglio smentito dalle evidenze. Un controesempio corregge o circoscrive l'affermazione, oppure sostituisce una linea entro lo stesso massimo. Non aumenta automaticamente il numero di rami.
- Una lacuna decisiva per una frase affermata blocca quella frase. Una considerazione esterna al confronto diventa un limite visibile e non una prova di assenza. Non basta chiamare «limite» un errore nella linea eseguita.

Il nuovo identificativo è `finite-evidence-1`, separato dal protocollo fisico v28 dei registri. Deve comparire nella base persistita e in ogni scenario; un campo aggiunto al solo JSON di uno scenario non può disattivare i controlli storici. Le richieste e i pass precedenti conservano il loro contratto e non diventano automaticamente validi per quello nuovo.

## Controlli conservati e controlli sostituiti

Restano inventari completi, disponibilità delle carte, ordine e timing, costi degli attacchi e delle ritirate, destinatari delle Energie, accessi, movimenti, evoluzioni, KO, Premi, promozioni, terminalità, sviluppo della linea, coerenza prosa/registri e fonti. Tutte le linee dichiarate devono essere complete, controllate e riesaminate. Nessuna rinuncia per budget.

La copertura obbligatoria di tre ruoli fissi direct/access/defend è sostituita dalla copertura esplicita delle 2–4 risposte selezionate e dall'audit delle categorie non confrontate. Non si inventa un accesso aggiuntivo per riempire un ruolo. L'obbligo delle controprove di rimozione è sostituito dalla delimitazione del confronto; le formule e la non dominanza fra le risposte effettive restano controllate. Gli audit delle carte/attacchi disponibili restano dati da esaminare, non una richiesta di materializzare ogni alternativa.

## Percorso applicativo da completare

1. Congelare un piano finito, condizioni, fonti e scopo delle affermazioni; riesame indipendente della pertinenza prima di costruire le alternative.
2. Costruire e verificare i registri con i validatori esistenti. Sostituire soltanto le unità difettose. Nessuna espansione ricorsiva di `needs-branches`.
3. Valutare tutte e soltanto le linee dichiarate, poi scrivere i capitoli e gli esercizi. Riesame indipendente su contenuti, fonti e scopo completo. Un limite deve comparire accanto al consiglio cui si riferisce.
4. Persistenza/ripresa, invalidazioni dopo cambio delle prove e conservazione dei negativi. Separare errori di trasporto, formato e contenuto. Provare una policy finita di retry/arresto; non stabilire una quota di tentativi da consumare.

Non è necessario completare il grafo generale di scomposizione di ogni intenzione AI di APP-231 per questo contratto. Il lavoro esistente resta conservato e inattivo; non vale come approvazione. Le vecchie richieste AI conservano testo ed esiti nell'archivio, senza diventare obblighi della nuova guida per il solo fatto di essere state generate sotto un contratto diverso. Rilievi fisici o fonti pertinenti alle linee riutilizzate restano da risolvere.

## Uscita e limite dell'esperimento

Prima della rete: percorso completo offline, tre replay su copie, compatibilità e test negativi, typecheck/build, budget ricalcolato e codice congelato. Conservare le soglie già fissate 60 s freddo / 10 s caldo / 768 MiB; il nuovo protocollo deve rispettarle, non aggirarle tramite unità irriducibili crescenti.

Poi una sola campagna sequenziale autorizzata sul codice congelato, fermando ogni guida appena valida e l'intera prova al primo esito non valido. Se ricompare lo stesso ciclo senza progresso, esito negativo del metodo: nessun aumento automatico del budget e nessuna nuova campagna proposta come routine.

255 chiamate v28 già consumate, 331 con le 76 precedenti; 0/3 nuove guide valide. Massimi 500 cumulativi per guida / 1500 nel pool, riserva 24 per ciascuna successiva. Nessun azzeramento per un nuovo contratto/job; eventuali job collegati condividono la contabilità. Il consenso al confine di prodotto non riapre lo stop della campagna. Nessun held-out o profilo personale modificato.

## Stato iniziale verificato

Il vecchio driver automatico d'ammissione arriva a 60,811 s freddo, 10,080 s caldo e 958,8 MiB senza raggiungere il descrittore d'invio; zero provider, database sorgente intatto. È una prova negativa conservata (`app231-dialogue-real-preflight.json`), non una funzionalità pronta. I test dei componenti non equivalgono al percorso completo o alle tre guide reali. L'integrazione del contratto finito viene verificata separatamente, senza attivare un percorso parziale.
