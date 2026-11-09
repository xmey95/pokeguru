# Prima guida valida — Crustle contro N’s Zoroark

08-11-2026. Il primo traguardo è raggiunto: guida generata e riparata dall’AI, approvata dai due giudizi finali indipendenti, salvata, riaperta senza provider e verificata nell’app. Questo documento conserva le evidenze del primo risultato; lo stato corrente delle altre due guide è nella [sezione Ripresa del piano](../../PLAN.md#ripresa). L’obiettivo complessivo rimane aperto.

## Consultazione

Eseguire **Apri-guida-verificata-PokeGuru.cmd** nella radice del progetto. Compila l’app locale e apre una copia separata in sola consultazione, con la lista originale. Non usa il profilo personale dell’app installata. Rete, AI, modifiche e recuperi automatici sono bloccati nel backend. La demo storica mantiene il proprio comando e la propria etichetta.

Il profilo è ricreato a ogni avvio sotto `.verify/validated-guide-preview/session-*`. Il preparatore verifica hash del report e del database approvati, identità del job, stato applicato e uguaglianza del report SQLite; copia tutti gli originali senza modificare testi o approvazioni.

## Risultato verificato

- Otto capitoli, due scenari, due repliche e relativo seguito per ciascuno, due esercizi con soluzione.
- Personalizzazione sulla lista Crustle esatta da 60 carte. Quattro liste avversarie conservate separatamente; i due scenari dichiarano la stessa lista concreta Puebla/posizione 12. Non vengono fuse le varianti.
- Dati congelati del pacchetto originale: non è un aggiornamento del metagame al giorno della consegna.
- Inventari, stati, sviluppo, accessi, attacchi, Energie, costi, KO/Premi, copertura tattica, fonti e audit quantitativi rimangono obbligatori.
- Due approvazioni finali senza rilievi. Sigilli, originali e storia dei rifiuti conservati; nessun testo della guida corretto manualmente.
- SQLite, riapertura completa senza chiamate e interfaccia reale a 1440/1280/640 pixel passati, senza errori del renderer. La consultazione dedicata verifica inoltre lista da 60 carte, riapertura dello stesso profilo e blocco effettivo di generazione, ripresa, recupero, rete e scritture. Anche la demo storica e la modalità normale passano la regressione UI.

Una guida approvata nel contratto finito non prova l’ottimalità di ogni scelta o una vittoria forzata. Le alternative non eseguite e l’orizzonte fino al nostro turno successivo restano espliciti. L’intera applicazione non è ancora qualificata per generare qualsiasi guida.

## Percorso e consumi

Il nuovo job ha registrato **146 tentativi**, **140 invocazioni effettivamente avviate** e **136 risposte complete**. Sei tentativi sono stati fermati prima del provider; quattro invocazioni non hanno prodotto un raw completo. Nessun contatore è stato cancellato. La contabilità conservativa collegata arriva a **601 nel ciclo v28 e 677 incluse le 76 precedenti**.

Gli usage restituiti dal servizio sommano 7.761.430 token di input e 210.324 di output, senza input cached dichiarato. Non sono una stima monetaria. Dall’avvio del nuovo job alla verifica finale trascorrono circa 3 ore e 17 minuti, includendo correzioni software e verifiche offline; le durate registrate nei tentativi sommano circa 80 minuti. L’ultima ripresa sul codice congelato completa la fase pendente con 17 risposte nuove in circa 11 minuti e 26 secondi.

**Non è un benchmark a freddo del codice finale:** il job è passato attraverso undici epoche con correzioni software. L’automazione dei contenuti è dimostrata per questa guida; convergenza e costo su nuovi job e altri matchup restano da misurare.

## Correzioni generali determinanti

Il ciclo distingue proposte provvisorie da candidati ricertificati. Un rifiuto quantitativo alimenta una nuova proposta AI con riferimenti autenticati, senza trasformare il rifiuto in un pass. I messaggi sui 600 caratteri identificano campo e lunghezza effettivi. I nuovi audit ricevono annotazioni dei danni dopo il setup e storia fisica fino alla finestra: il critico deve verificare la conservazione del valore, senza assumere automaticamente zero danni. Le nuove ricevute si invalidano se cambiano annotazioni o storia; gli originali storici mantengono il proprio contratto.

Queste correzioni operano su schemi, percorsi, registri e prove, senza selezionare carte o matchup. La validazione generale richiede ancora i due matchup successivi e il riesame della generalità; nessun caso held-out è stato consumato.

## Ottimizzazione successiva

La correttezza del risultato è distinta dalle prestazioni. Il replay di preparazione richiede 88,555 secondi, oltre l’obiettivo di 60; il live raggiunge circa 1.486 MiB di RSS. Il rinvio dell’ottimizzazione è esplicitamente autorizzato dall’utente, senza alzare limiti tecnici o dichiarare questi obiettivi superati.

Prima di nuove campagne: misurare e ridurre la ricostruzione ripetuta degli originali autenticati e la riscrittura dei capitoli quando cambiano soltanto prove locali, conservando tutte le invalidazioni e i giudizi obbligatori. Usare questa guida approvata come riferimento di integrità, non come contenuto da adattare manualmente agli altri mazzi.

## Evidenze locali

- `.verify/app259-until-valid-20261108/first-valid/approved-source.json`: identità e hash del risultato, rilettura integrale sul codice congelato.
- `first-valid/metrics.json`, `terminal.json`: contabilità e tempi senza tetti numerici.
- `crustle--n-s-zoroark/generated.json`, `data.sqlite`: report e originali AI completi.
- `crustle--n-s-zoroark/ui/result.json`, `preview-ui/result.json`: UI effettiva e consultazione isolata.
- `resume11-targets.json`: 61 test correnti in sette file, senza duplicare gli archivi `.verify`; typecheck e build passati.
- `preview-profile-tests.json`: gate del profilo storico e di quello verificato.
- `.verify/app258-demo-20261107/ui/result.json`: regressione UI della demo storica e della modalità normale.

APP-259 resta In progress per ottimizzazione e completamento del percorso generale. Nessun altro job reale attivo e nessuna nuova chiamata dopo la prima guida valida.


**Consegna interattiva APP-259:** comando effettivo start-guide-demo.ps1 -ValidatedGuide eseguito, finestra Electron1104 aperta e reattiva, profilo .verify/validated-guide-preview/session-4d3e5e0e-28d1-4a80-8898-4703dfeee57f. UI automatica reale/rilettura già passate; controllo diretto Computer Use non completato per app approval timed out, nessun input inviato o bypass. Questo limite di osservazione è distinto dagli esiti positivi dei test. Nessuna nuova chiamata provider dopo il terminale positivo. La finestra è lasciata disponibile all’utente.
