# Integrazione del contratto di convergenza — gate B

**Piano precedente:** dopo l'accordo dell'utente sulla copertura tattica finita, la dipendenza d'integrazione diventa APP-232. Seguire [contratto](FINITE-EVIDENCE-CONTRACT.md) e [stato corrente](FINITE-EVIDENCE-IMPLEMENTATION.md). APP-231 resta incompleta; la migrazione del suo grafo generale non è un prerequisito della nuova consegna. Le soglie pratiche qui fissate restano valide anche per il nuovo percorso.

04 novembre 2026. Piano di implementazione offline successivo ad APP-230. Nessuna nuova prova reale o attivazione del formato v28 è autorizzata da questo documento. Obiettivo finale invariato: tre guide valide, valutazione generale e app utilizzabile.

## Confini e decisioni prima del codice attivo

1. **Versione distinta dell'orchestrazione.** Il contratto nativo dei turni e i suoi lettori restano quelli attuali. Nuovi record di obblighi, ammissioni, dipendenze e certificazioni hanno namespace/versione propri, legati a packet, frame, scope, configurazione e versione dei validatori. Un vecchio pass non è interpretato come una nuova certificazione.
2. **Mapping esplicito.** Conservare ogni originale e la revisione indipendente che lo collega a obblighi atomici o formule `all/any`. Il critico deve verificare condizioni, quantificatori e pertinenza. Nessuna deduplicazione per testo, nessuna trasformazione di un confronto universale in una sola linea positiva. Mapping ambiguo resta aperto. Intenzioni originali dei piani adottati, obblighi di prodotto e rilievi storici fanno parte dell'importazione; i piani non adottati restano proposte.
3. **Prove e autorità host.** Estrarre ricevute esclusivamente dai validatori/archivi reali; l'AI restituisce giudizi e riferimenti, mai autorità. Indici, assegnazioni, validità meccanica e certificazioni rimangono separati. L'adapter fornisce corpi e fatti necessari al ruolo, non soltanto hash.
4. **Risoluzione prima della nuova costruzione.** Il coordinatore ammette ogni nuovo rilievo e risolve visibilità del contesto, valutazione mancante o prova necessaria. Si costruiscono soltanto le prove ancora richieste. Alcuni obblighi dipendono dai metadata: il grafo permette di produrre prima quella valutazione, senza pretendere di chiudere tutti i goal prima di qualunque metadata.
5. **Insiemi comparativi atomici.** Quando si ammette un nuovo concorrente si aggiorna l'insieme dei confronti pertinenti e si invalidano i massimi/minimi dipendenti prima di ogni possibile finalizzazione. Non si certifica la migliore risposta dal solo indice o da una coppia che omette altri concorrenti.

## Tutte le famiglie, nello stesso incremento

Usare la matrice dell'[audit](CONVERGENCE-AUDIT.md), con un manifest eseguibile per ogni famiglia: preparazione/fonti; setup; linea principale; alternative iniziali; piano delle repliche; selezione; costruzione/riparazione nativa; metadata per linea e coppia; ammissione; composizione dei metadata; critica degli obblighi e critica globale; riparazione dei soli testi; prosa e fonti tardive; attestazione finale; persistenza/ripresa e stato UI.

Per ognuna definire input originali, vista esplicita, dipendenze, schema, lettore, unità di partizione, cache, preflight e costo residuo. I ruoli che scelgono intenzioni non ricevono sistematicamente tutti i journal; quelli che certificano ricevono tutte le prove necessarie al loro claim. Il manifest finale controlla copertura di originali, rami, confronti e fonti per la guida intera.

Un confronto numerico può utilizzare valutazioni intermedie verificate; una proposizione semantica con più testimoni mantiene il gruppo necessario. Se una sua unità completa resta irriducibile e oltre capienza, fermarsi prima della rete con diagnosi. Non aumentare i limiti, togliere dati o trasferire pass fra frammenti per farla entrare. Il successo della campagna richiederà comunque che le unità effettivamente necessarie siano eseguibili.

## Migrazione e contabilità

Preferire lo stesso job con un manifest di migrazione: originali importati e loro origine, piani adottati e loro ascendenza, prove fisiche riutilizzabili dopo controllo, giudizi da invalidare e certificazioni ancora da ottenere. Conservare byte, chiavi e binding di tutte le risposte pagate e dei checkpoint. La proposta 252 e i 55 frammenti sono disponibili, ma non equivalgono ad approvazioni.

La migrazione non deve eseguire provider né avviare riesami durante la lettura di uno snapshot. La vecchia via resta disponibile per i contratti storici. Una nuova certificazione di un vecchio testimone non riscrive quel testimone.

Contabilità cumulativa: 252 principali + 3 diagnostiche = 255 v28, più 76 precedenti = 331 storiche. Massimi più recenti 500 per guida / 1500 v28, riserva 24 per ciascuno degli altri due casi: residui 245 sul primo e 1245 nel pool. Non duplicare le chiamate importate dalla diagnostica, azzerare i contatori o consumare la riserva futura. Un eventuale nuovo job deve mantenere un limite condiviso con i predecessori e richiede autorizzazione specifica prima della rete.

## Prestazione: soglie fissate prima dell'integrazione

Per il replay offline **dal database già copiato fino al primo descrittore necessario o a un blocco esplicito**, in processo Node 24 dedicato:

- avvio freddo: massimo **60 secondi**;
- ripresa nello stesso processo con input immutati: massimo **10 secondi**;
- picco RSS del processo: massimo **768 MiB**.

Comprendere apertura, verifica dei binding/prove richiesti, migrazione/proiezione e preflight. Escludere soltanto copia preparatoria del database e compilazione del test harness. Eseguire sul job reale fermato e sui due casi freddi; il codice non deve riconoscere i loro nomi. Un'unità futura ancora ignota non è dichiarata entro soglia dal solo replay del prefisso.

Il precedente replay richiede circa 286 secondi e fallisce il proprio limite di 240: resta una prova negativa. Non alzare le nuove soglie dopo un fallimento per dichiarare passato il gate. Prima misurare dove si ripetono letture, hash e controlli; usare proiezioni incrementali e cache immutabili con invalidazione verificata. La riapertura completa usata dal prototipo APP-230 non è la strategia da adottare in produzione.

## Criteri di accettazione B

- Importazione completa degli originali con copertura verificabile, incluse intenzioni storiche e vincoli di prodotto; zero approvazioni inventate.
- Unità critiche coerenti e indipendenti, tutti i rami/coppie e tutti i testimoni necessari coperti; nessun falso pass da sola assegnazione, directory o budget esaurito.
- Test negativi per tampering, omissioni, fonti tardive, cambi di frame/pescata/risorse, nuovi concorrenti, giudizi critici invalidi e riformulazioni senza progresso.
- Cache e ripresa che conservano le risposte compatibili senza ricomprare piani, testimoni o riesami; invalidazioni dipendenti dai contenuti correnti. Storia integrale preservata.
- Scalabilità misurata per tutte le famiglie con input reali e stress, limiti e calibrazione invariati, riserve e stop verificati prima della rete.
- Tre replay, soglie locali rispettate, typecheck/build e suite pertinenti; default v27 e blocco del provider sperimentale mantenuti.

Solo dopo questi risultati: congelare codice/dati, ricalcolare il budget effettivo e chiedere la riapertura della prova reale entro i tetti esistenti. Non è una garanzia di successo del modello. I gate C — tre guide reali valide, UI/persistenza, valutazione generale, policy applicativa e build per l'utente — restano indispensabili per completare APP-225.
