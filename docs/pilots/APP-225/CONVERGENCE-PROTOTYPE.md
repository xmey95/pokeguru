# APP-230 — Contratto eseguibile degli obblighi

04 novembre 2026. Incremento A del [contratto di convergenza](CONVERGENCE-CONTRACT.md). Il codice è isolato in [scripts/guide-convergence](../../../scripts/guide-convergence/registry.ts); nessun collegamento al generatore o all'app. Le ricevute dei test sono sintetiche e dichiarate come tali.

## Cosa verifica

Il registro conserva eventi append-only per originali, contesto, testimoni, confronti, ammissioni indipendenti, assegnazioni, certificazioni e osservazioni di avanzamento. Una risposta rifiutata viene provata su una proiezione separata: un errore nell'ultimo campo non lascia obblighi o assegnazioni parziali.

- Gli originali mantengono corpo JSON esatto, origine, fonti e provenienza. Non vengono normalizzati semanticamente dal codice.
- L'ammissione collega ogni originale a una formula di obblighi con congiunzioni/disgiunzioni esplicite, oppure richiede chiarimento. Soltanto un rilievo AI può essere superato con giudizio indipendente e fonti; vincoli utente/prodotto e intenzioni dei seed non vengono ritirati da questa API.
- Il critico può richiedere costruzione, valutazione, recupero di un contesto esistente o chiarimento. Un originale non ancora ammesso non ordina nuove costruzioni. Un indice non diventa una prova.
- Un testimone richiede corpo completo e ricevuta meccanica del repository host, vincolati a linea, corpo, turni, frame, packet, scope e versione dei validatori. La sua presenza o l'assegnazione a un goal non certifica la strategia.
- Una certificazione richiede un'altra richiesta critica, con input attestati dall'host, tutti gli originali collegati e testimoni correnti. Riusa anche il controllo strutturale `assertGuideRequirementResolutions` per l'obbligo atomico. Non trasferisce un vecchio pass alla nuova garanzia.
- I confronti dipendono dal criterio e dall'insieme esplicito dei concorrenti. Il critico deve aver letto i corpi e i turni di tutti i concorrenti di quel confronto. Cambiare l'insieme o un suo testimone invalida il risultato.
- Scope di progetto/job/caso, dipendenze, configurazione, packet, frame e validatori sono vincolanti. La riapertura riproduce i controlli da eventi e ricevute; non legge un booleano `approved` salvato.
- La chiusura richiede tutti gli originali. Una congiunzione incompleta resta aperta; una disgiunzione verificata non genera costruzioni ridondanti per le altre alternative.

Il nome del risultato è `obligationsClosed`: **non autorizza la pubblicazione di una guida**. Restano necessari metadata, formule, confronto completo, critica globale, prosa, persistenza, UI e tutti i gate di APP-225.

## Autorità e limiti

`TrustCatalog` rappresenta ricevute già verificate dall'host negli archivi. È un confine di fiducia, non un campo che l'AI può compilare. I test verificano che una ricevuta mancante, di un altro scope o con corpo diverso non possa essere usata; anche ricalcolare tutta la catena dopo aver cambiato il testo AI non supera il binding alla risposta critica originaria.

Il prototipo non dimostra che un giudizio semantico sia corretto. La corrispondenza fra originale e formula, la pertinenza delle fonti e il superamento motivato di un rilievo dipendono dalla revisione indipendente. La sua integrazione deve dare al critico i dati completi necessari e preservare i controlli finali. Non sono implementati provider, nuovi prompt, simulatore TCG, classificazione automatica delle equivalenze o migrazione della campagna.

I gruppi comparativi sono espliciti: il coordinatore dovrà aggiornare il manifest quando ammette un nuovo concorrente pertinente, prima di consentire la finalizzazione. Il solo salvataggio di un journal non stabilisce a quali confronti appartenga. Le invalidazioni del prototipo sono conservative e possono richiedere un nuovo giudizio anche se il corpo fisico resta riutilizzabile.

L'ammissione e la certificazione conservano originali/risposte esatte. L'append valida oggi su una riapertura completa di controllo: è una scelta per il prototipo e **non è un'implementazione adatta alla latenza dell'app**. Il gate di prestazione dell'integrazione richiede proiezioni incrementali verificate e cache legate a contenuto/versione, senza ricontrolli integrali ripetuti.

## Avanzamento

Le osservazioni registrano obblighi aperti/verificati, nuovi problemi e fatti meccanici pertinenti. Una nuova formulazione può essere collegata a un obbligo esistente soltanto da un'ammissione indipendente; il testo differente non costituisce da solo avanzamento. Un nuovo problema è una scoperta, non un miglioramento automatico. Journal non pertinenti e cambiamenti editoriali con gli stessi fatti non azzerano il contatore.

Le letture dello stato non aumentano i tentativi. Soltanto un evento di osservazione aggiorna il contatore; la soglia è un parametro esplicito. Il valore 3 usato nei test dimostra la transizione e **non è la policy proposta per l'app**. Uno stop preserva obblighi e risultati e non produce un'approvazione.

## Prova con dati reali, senza giudizi inventati

La prova di importazione usa lo snapshot esatto della scelta fermata: **12 requisiti conservati, 13 nuovi rilievi e 10 intenzioni del piano adottato**, 35 originali in totale. I valori vengono serializzati e riaperti senza modifica e rimangono tutti `proposed`; zero certificazioni e zero costruzioni automatiche. I seed della proposta non ancora adottata non diventano invarianti correnti.

È una prova di conservazione degli oggetti forniti. Non è ancora la migrazione completa: mancano l'estrazione delle intenzioni storiche di tutta l'ascendenza, i requisiti di prodotto/utente esterni allo snapshot, le ricevute meccaniche reali e l'ammissione semantica. Nessun contenuto del job o output AI viene cambiato.

## Verifiche e riproduzione

**Esito:** 38 test passati su 4 file: 32 del prototipo sintetico, 1 importazione dello snapshot reale e 5 controlli esistenti. Typecheck dedicato passato. I 477 input attivi restano identici; schema e celle di tutte le 39 tabelle per ciascuno dei tre database coincidono con gli archivi, e i sorgenti restano invariati durante la verifica. Suite completa e build dell’app non ripetute per questo incremento isolato.

Evidenze locali: `.verify/app225-segments-20261102/convergence-prototype-tests-portable.json`, `convergence-prototype-real-originals.json`, `verification-convergence-prototype.json` e log di typecheck. Il manifest finale identifica le versioni effettivamente verificate; i log dei tentativi precedenti restano distinti.

Con Node 24 e TEMP/TMP in una directory scrivibile:

```powershell
node node_modules/typescript/bin/tsc -p scripts/guide-convergence/tsconfig.json
node node_modules/vitest/vitest.mjs run scripts/guide-convergence/registry.test.ts tests/guide-requirement-review.test.ts tests/guide-reply-requirements.test.ts --exclude '**/.verify/**' --maxWorkers=1
```

La prova dello snapshot è opzionale e legge il percorso indicato da `POKEGURU_CONVERGENCE_SNAPSHOT`; si esegue aggiungendo `scripts/guide-convergence/legacy-snapshot.test.ts`. In assenza della variabile viene esclusa. Non utilizza provider o database dell'app.

## Uscita verso l'integrazione

L'integrazione richiede il [piano B](CONVERGENCE-INTEGRATION.md): tutti i ruoli, migrazione verificata, cache, invalidazioni, partizioni, riserve e misure pratiche prima di una nuova campagna. I test di questo incremento non dimostrano convergenza reale o generalità competitiva. Contabilità ferma a 255 v28 / 331 storiche / 0 nuove guide valide; stop reale, limiti 500/1500 e riserva 24 invariati.
