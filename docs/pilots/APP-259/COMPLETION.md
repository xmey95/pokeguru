# Consegna del percorso guide

**Aggiornamento 9 novembre 2026:** APP-260 completata e qualificata. [Ottimizzazione, misure e limiti correnti](OPTIMIZATION-APP-260.md). Le tre guide e le prove di questa consegna restano invariate; le prestazioni negative e l’ottimizzazione ancora aperta descritte sotto rappresentano lo stato precedente.

8 novembre2026. APP-259,APP-225 e APP-232 Done sul percorso finito adottato. **Tre guide reali valide e consultabili nell’app.** Nessun contenuto generato è stato modificato manualmente.

## Provare l’app

Aprire [Prova-PokeGuru.cmd](../../../Prova-PokeGuru.cmd). L’app ordinaria usa una copia scrivibile persistente e isolata della terza guida; conserva le modifiche alle riaperture e non avvia automaticamente generazioni. Il collegamento esegue typecheck/build prima dell’avvio. Il profilo è registrato in .verify/app-trial/active.json. L’app installata e gli archivi approvati non sono sovrascritti.

Le nuove azioni esplicite di generazione nell’app costruiscono,controllano,riesaminano e riparano fino all’approvazione, senza un plafond numerico prefissato. Limiti di contesto/output,quote e indisponibilità del servizio possono ancora sospendere il lavoro; diagnostica e ripresa conservano gli originali. Vecchi workflow bounded mantengono i propri contratti.

| Guida approvata | Tentativi del job attivo | Invocazioni provider | Risposte archiviate | Consultazione readonly |
|---|---:|---:|---:|---|
| Crustle–N’s Zoroark |146|140|136|[Apri](../../../Apri-guida-verificata-PokeGuru.cmd)|
| Alakazam/Dudunsparce–Basic Box |142|138|137|[Apri](../../../Apri-guida-Alakazam-PokeGuru.cmd)|
| Dhelmise–Lucario/Hariyama |310|305|301|[Apri](../../../Apri-guida-Dhelmise-PokeGuru.cmd)|

Tutte:otto capitoli,due scenari con due repliche avversarie eseguite e nostro seguito,due esercizi;liste personali esatte60. Le4/5/8liste avversarie di riferimento restano separate,ciascuna60;ogni scenario lega una lista avversaria concreta. I contatori dei job attivi non sostituiscono la contabilità ereditata:1053tentativi v28/1129storici. Tentativi,invocazioni e risposte non sono conteggi di fatturazione.

## Verifiche

- Tre approvazioni complete rilette dal codice adottato,persistenza/riapertura e hash originali invariati; otto capitoli,due scenari,due esercizi per ciascuna. Approvazioni originali e negativi conservati.
- Typecheck/build passati. Full offline1239test:1225pass/2fail/12pending. I due file falliti ripetuti integralmente passano7/7: fixture del critico aggiornato al contratto6 e OTLP locale eseguito fuori sandbox. Risultato più recente per file1227pass/12pending/0fail;non un singolo full run tutto verde. Nessun validatore indebolito.
- UI ordinaria scrivibile e preview readonly a1440/1280/640 senza overflow/errori nei test. Creazione progetto,persistenza,isolamento e cinque azioni vietate in readonly verificati. Zero nuove chiamate al modello nei gate finali.
- Launcher PowerShell corretto per dichiarare AppTrial/ApprovedSource e inoltrare la fonte readonly; avvio effettivo della copia utente riuscito. Chromium segnala permessi sulla cache locale nello stderr; la finestra si è aperta. La prima esecuzione nel sandbox esterno era uscita,quella esterna è stata verificata.
- Adozione di10file applicativi,5test e3launcher; codice vincente19 e versioni precedenti archiviati. Esperimenti prestazionali scartati esclusi. [Riesame della generalità](GENERALITY-AND-APP-READINESS.md).

Manifest finale riproducibile: .verify/app259-app-adoption-20261108/verification.json;contiene fonti,hash,approvazioni,risultati e percorsi dei test. Gli originali frozen first-valid/second-valid/third-valid restano nei due root di campagna.

## Limiti residui

Le fonti sono congelate al30ottobre2026:non è una certificazione del metagame attuale. Il formato tratta un orizzonte finito,non tutte le posizioni né un minimax esaustivo. Le tre guide derivano da più epoche di codice;non sono un benchmark freddo sul medesimo binario. Generazione reale via Codex e nuova integrazione host/IPC sono verificate separatamente:non è stata eseguita una nuova generazione reale dall’IPC ordinario. Nessun held-out live,release o pacchetto installabile prodotto.

Il replay storico19 misura422,662s/1539,496MiB:prestazione ancora negativa e da ottimizzare. APP-250 aveva già superato il proprio diverso gate33,298s/0,907s/710,348MiB. Non confondere questi dati. APP-260 raccoglie consumi,tempo e memoria successivi alla consegna,secondo la priorità dell’utente «prima guida definitiva,poi ottimizziamo».
