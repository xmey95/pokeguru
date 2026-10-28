# Copertura delle evidenze AI

## Obiettivo

Le analisi Matchup e Thread devono usare le schede pertinenti alla domanda,
mostrare quali dati erano disponibili e conservare una copia verificabile di
quanto è stato fornito a Codex. Una ricerca può essere dichiarata completa
solo rispetto a un insieme definito di stampe e a un criterio di ricerca
controllabile. L'inventario TCGdex non certifica tutte le stampe fisiche
ammissibili allo Standard.

L'AI sceglie automaticamente le interrogazioni necessarie in base alla domanda:
non dipende solo da un pacchetto di evidenze scelto in anticipo dall'app.
Il motore di Pokéguru esegue le query e restituisce dati strutturati; il modello
non riceve accesso diretto a SQLite, filesystem, rete o API arbitrarie.

## Contratto di copertura

Nel ramo di sviluppo APP-161/162 le nuove query Thread/Matchup salvano gli originali in SQLite, mantenendo nella cronologia un indice e un riferimento al job. Catalogo e finestra Eventi sono congelati prima delle query; le pagine Eventi sono limitate per partecipazioni, mentre il raggruppamento globale conserva mazzi esatti, occorrenze, record e abbinamenti. Le sintesi leggono i record progressivamente e conservano i collegamenti ai lotti. Le pagine originali rimangono consultabili in Diagnostica AI. Preparazione Matchup/Thread, configurazione e input sono congelati per fase nel database. I record troppo grandi vengono suddivisi conservando l’esatto testo JSON, la chiave originale e le posizioni; i frammenti non sono osservazioni aggiuntive. Un errore di contesto riduce il lotto, mentre i risultati già validati restano riutilizzabili. Questo incremento non è ancora rilasciato: ripresa automatica e ciclo finale sono in APP-163/164; stato e verifiche nel backlog.

Ogni turno distingue:

1. **Inventario**: fonte, istante, filtro, stampe attese e set osservati.
2. **Dettagli**: stampe con risposta completa, schede confrontabili, lacune
   per stampa e versione del contenuto di gioco.
3. **Ricerca**: insieme interrogato, criterio, corrispondenze, esclusioni e
   schede non interrogabili per dati mancanti.
4. **Contesto**: schede e liste effettivamente inviate, elementi esclusi per
   limite, dimensione del prompt e configurazione del modello.

## Interrogazione automatica del motore

Ogni turno Matchup o Thread può richiedere al motore locale operazioni di sola
lettura con argomenti strutturati: ricerca carte per stampa, identità o testo,
con scheda e varianti nella risposta; ricerca nelle liste ed eventi già acquisiti.
Il controllo Standard deterministico della lista resta nel contesto iniziale
quando disponibile. L'app valida nome dell'operazione,
argomenti, progetto, periodo e dimensione della risposta. Il modello può
chiedere altre query dopo aver visto risultati e sintesi globale, anche per risolvere contraddizioni con prove mirate. Nel percorso persistente non ci sono tetti di 64 MB o 24 passaggi: tre passaggi consecutivi senza nuove prove fermano il lavoro con una causa esplicita, senza presentarlo come completo.
Nessuna query avvia autonomamente download, modifica liste o progetti, oppure
aggira l'isolamento della CLI Codex.

Per ogni chiamata si conservano richiesta, risposta o errore, insieme e versione
dei dati interrogati, fonte, impronta e limiti applicati. La risposta finale
può citare solo risultati effettivamente ricevuti, e l'app verifica almeno gli
ID di fonte. Le evidenze iniziali della lista e dei vincoli restano il contesto
minimo: la selezione delle ricerche ulteriori spetta all'AI e non richiede un
passaggio manuale dell'utente.

La preview precedente all'invio mostra i dati iniziali e il perimetro delle
query possibili; non può anticipare quali ricerche il modello sceglierà. Dopo
la risposta, l'interfaccia mostra chiamate effettive, risultati, fonti e il
prompt esatto conservato con impronta, byte, durata e token quando disponibili.
La scelta delle query e le sintesi possono richiedere più chiamate Codex: latenza e token sono costi reali. Le risposte valide sono salvate nel database e riusate per input/configurazione/procedimento uguali. Rete, timeout e quota hanno al massimo tre tentativi automatici, con deadline persistente; due per risposte non valide. Spazio esaurito, accesso mancante e assenza di progresso richiedono intervento e non vengono confusi con il limite di contesto.

Il numero di schede nel contesto non viene presentato come copertura del
Catalogo. La frequenza di una carta nelle liste pubbliche non prova un
risultato competitivo né la completezza degli eventi.

## Percorso incrementale

- Conservare il testo TCGdex acquisito e applicare eventuali errata curate
  separatamente, con fonte, stampa, data e versione. Una correzione senza
  fonte puntuale resta non applicata.
- Interrogare localmente tutte le schede dell'insieme richiesto prima di
  scegliere quelle da inviare. La lista base e le stampe esplicite hanno
  priorità; omonimi e varianti con regole diverse restano distinti.
- Espandere la ricerca quando la domanda richiede carte oltre alle liste
  osservate mediante interrogazioni scelte dall'AI. Le ricerche semantiche non autorizzano da sole una pretesa di
  esaustività: il turno deve dichiarare il criterio effettivamente eseguito.
- Acquisire su richiesta solo i dettagli mancanti che sono decisivi per
  l'analisi, con limite di richieste e stato riprendibile. Non avviare una
  sincronizzazione massiva dal flusso AI.
- Salvare il pacchetto fornito al modello e le sue impronte. Una revisione
  mantiene leggibili le fonti storiche e segnala i cambiamenti dei dati
  correnti; non riscrive la guida precedente.

## Verifiche di chiusura

- Fixture di stampa esatta, omonimi con effetti diversi, variante rara,
  scheda incompleta, nuova errata e dati torneo non pertinenti.
- Confronto tra anteprima iniziale, query effettive e prompt salvato per
  Matchup, Thread discussione e Thread proposta; riapertura dei pacchetti
  dopo riavvio.
- Misura su archivi sintetici grandi: tempo di query, parse e selezione,
  byte e token del prompt, latenza e uso registrato da Codex quando
  disponibile. Nessuna soglia di costo deriva da sole fixture offline.
- Prova Codex reale su profilo isolato per verificare attribuzione delle
  schede e limiti dichiarati. Le conclusioni del modello richiedono controllo
  contro le fonti salvate; citare un ID non le valida automaticamente.
