# APP-227 — Partizione dei metadata e delle critiche

Stato al 4 novembre 2026: implementazione locale verificata offline. Nessuna chiamata reale dopo lo stop della campagna20, nessun contenuto sintetico adottato. APP-227 è Done per il solo incremento offline; APP-225 resta Blocked per la ripresa reale dopo lo stop concordato e la preparazione del nuovo runner. Le tre nuove guide reali sono ancora 0/3. Il default dell'app resta v27 con guardia sul provider v28.

## Comportamento implementato

Quando il caso completo entra nei limiti si conserva la richiesta storica. Se una singola richiesta di metadata supera i limiti, il lavoro viene diviso in valutazioni delle singole alternative e confronti di tutte le coppie. Ogni unità riceve la linea principale e le prove native complete dei rami assegnati. La composizione riceve tutte le valutazioni e passa lo stesso lettore completo dei metadata; i corpi dei registri non vengono riscritti. Frammenti e composizione possono richiedere ulteriori testimoni. I requisiti distinti per lo stesso caso vengono conservati insieme, senza troncarli al limite di una singola risposta.

Le critiche indipendenti vengono partizionate solo quando il caso completo non entra. La copertura obbligatoria comprende ogni coppia di alternative, ogni obiettivo originale con il gruppo completo dei suoi testimoni e tutti i rilievi storici pertinenti. Un requisito non assegnato rimane associato all'intero insieme dei rami: se questa prova indivisibile non entra, il blocco resta esplicito.

Le viste dello storico dichiarano la loro proiezione, conservano i finding originali e i riferimenti ai contesti integrali immutabili. I contesti originali vengono verificati prima della proiezione. Ogni critica testuale conserva tutta la prosa, esaminandola contro le prove del caso assegnato. I controlli locali continuano a verificare i casi completi.

Un manifest verifica la copertura di ogni caso e un secondo manifest vincola l'intero gruppo di critiche alla guida e alle fonti correnti. L'attestazione finale v2 richiede tutti i pass di quel gruppo: un pass parziale, una critica preventiva o un insieme con unità mancanti non approva una guida. Le attestazioni storiche mantengono il proprio contratto.

Identità e cache includono scope, fonti, contenuti, requisiti e istruzioni. Le critiche già accettate vengono ricostruite e verificate prima del riuso, anche se la calibrazione cambia il nuovo piano. Un nuovo contesto non eredita il pass. La capienza empirica degli output distingue costruttori nativi, frammenti, composizione e critiche.

La pianificazione preventiva e l'esecutore usano le medesime regole di raggruppamento e riserva. Limiti di token, calibrazione conservativa, risorse, turni, attacchi, Energie, Premi, fonti e controlli tattici restano invariati. Nessuna unità indivisibile viene troncata per entrare.

## Verifiche locali

- 19 test mirati passano: conservazione dello storico, audit completi, testimoni multipli, omissioni, distinzione tra critica preventiva e finale, isolamento delle famiglie di capienza, riuso dopo calibrazione e rifiuto del contesto cambiato.
- Tre test di partizione passano, incluso un percorso completo sintetico in circa 98 secondi. La guida composta coincide con quella ordinaria e la rimozione di una critica invalida l'attestazione. Il test di copertura usa cinque alternative; il percorso completo usa le tre repliche obbligatorie.
- Il primo percorso completo ha trovato un controllo finale applicato erroneamente alla fase preventiva; corretto. La successiva prova con cinque alternative ha completato il percorso ma superato il timeout del test. Entrambi gli esiti sono conservati; non sono dichiarati verdi.
- Typecheck e build passano, sessione96762 terminale exit0. Suite completa689 pass/44 esclusi,113 file/37 esclusi,sessione48997 terminale exit0 in809 secondi.
- Due replay su copie dei casi non avviati passano e raggiungono soltanto il piano iniziale, senza provider.
- Il replay finale del prefisso reale passa:2 test,sessione59091 terminale exit0 in624.62 secondi. Conserva232 tentativi e161 checkpoint,completa soltanto una sonda sintetica di fine turno e raggiunge `metadata-fragments`. Nessun provider,sonda non adottata. Il primo replay aveva superato il timeout locale di240 secondi; il carico finito misurato è stato ripetuto entro900 secondi. Nessun timeout dell’app è cambiato.
- Audit in sola lettura: 19 archivi, 9559 file, binding e chunk invariati rispetto all'archivio20; 76 chiamate precedenti conservate. Zero guide reali aggiunte.

Audit: i 63 file condivisi dei controlli sono invariati rispetto al freeze della correzione end-turn. Le nuove unità non contengono nomi delle carte dei matchup o identificativi del job reale. Questo controllo statico e i test indipendenti non sostituiscono una futura verifica reale di generalità.

Freeze dell'implementazione: 477 input, manifest `c35a7f07cd8f9604db9df3c1312aa003900f126b912be486ce27a69622f0620a`. Esito autorevole `verification-partition.json`;budget `partition-budget.json`. Evidenze sotto `.verify/app225-segments-20261102/partition-*`; i vecchi freeze e report della correzione fine turno restano separati.

## Budget e limiti della previsione

Consumo reale invariato: 232 chiamate principali più 3 diagnostiche = 235 v28; aggiungendo le 76 precedenti, 311 storiche. Tetti approvati: 500 cumulative per guida, 1500 v28; 24 riservate a ciascuna guida successiva. Restano 265 sul primo caso e 1265 nel pool, con gli altri due job ancora assenti.

Sul prefisso copiato il caso grande richiede 10 valutazioni e 45 confronti: 55 unità, raggruppate in 18 chiamate per i frammenti. La composizione riserva una chiamata; l'altro caso conserva una richiesta di metadata. Aggiungendo il turno ancora da ottenere dal modello, sono 21 richieste note prima delle critiche e della prosa. La riserva esterna ereditata di tre chiamate porta il preflight corrente a 24 chiamate prenotate. È una riserva di questa fase, non una previsione del ciclo completo: la partizione dei critici futuri può richiederne altre.

Composizione effettiva, numero di critiche, prosa, nuovi finding e riparazioni dipendono da risposte ancora inesistenti. La riserva attuale della composizione non dimostra che il suo input futuro entri nei limiti. I critici effettivi vengono pianificati prima della prosa e ogni fase ricontrolla capacità e riserve prima della rete. Non dichiarare sufficiente il solo margine di 265 chiamate e non avviare richieste reali dalla sola verifica offline.

Prima di una ripresa reale servono un nuovo runner congelato coerente con il codice,il suo preflight e la riapertura esplicita dello stop concordato. Suite,replay,audit del freeze e budget di questa fase sono conclusi. Il preflight locale del caso reale richiede circa dieci minuti: è un limite misurato,non una previsione della latenza delle chiamate o della riuscita della guida. L'attività complessiva richiede ancora tre guide autonome valide, verifica di persistenza/UI, generalità su casi indipendenti e politica dell'app; questi risultati non sono dimostrati dai test sintetici.
