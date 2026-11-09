# Prova reale proposta per la costruzione v28

Stato: prova autorizzata il 02-11-2026 con risposta esplicita «Autorizzo 32 per guida, 96 nuove complessive» e avviata dal runner congelato. Grant in campaign-v28/authorization.json sul seal 9ba38bd9020dd18578a17e83ec4e4e09a4780f7e74af114c0c3b154f3016e86d. Stato effettivo nei database, outcome e campaign-live.log; non avviare copie del processo esistente (handle iniziale 80342). Il default dell'app rimane v27, con massimo ordinario di 16 invocazioni; il percorso v28 reale rimane protetto. Questo protocollo riguarda una prova isolata mediante runner esplicito, non una release.

## Dati, codice e contatori

Tre nuove analisi: Crustle–N's Zoroark, Alakazam/Dudunsparce–Basic Box e Dhelmise–Lucario/Hariyama. Stesse liste pubbliche risolte, schede e aggregati dell'archivio 1–30 ottobre 2026 già usati in APP-221; stessa destinazione OpenAI tramite Codex collegato a PokeGuru, modello gpt-6.1-sol. Eventuali schede o liste ulteriori vengono recuperate esclusivamente dal medesimo archivio locale, entro i limiti esistenti. Nessun output nativo o giudizio dei vecchi tentativi viene usato come scenario iniziale o approvazione della nuova prova.

I progetti e i packet sono preparati in database separati dentro `.verify/app225-segments-20261102/campaign-v28`. I nuovi job vengono creati soltanto in modalità live dopo l'autorizzazione; il primo job Crustle è 30594bb5-5b1d-4e92-bfca-950de782af06. Nessuna modifica al database personale o ai tre job originali. Le loro **76 invocazioni** e le residue **2/3/3 entro 28/84** rimangono registrate; non finanziano implicitamente i nuovi job.

Budget autorizzato: **massimo 32 nuove invocazioni per guida e 96 nuove complessive**, fino a 172 incluse le 76 di questa campagna precedente. Le stime sui corpi archiviati indicano 18/18/20 invocazioni per un percorso freddo senza riparazioni e con una sola prosa; non sono misure di una nuova generazione. Il margine serve alle riparazioni locali e alle critiche, senza garantire la convergenza. Ogni tentativo, retry, timeout o risposta respinta consuma il contatore; gli input identici già pagati vengono recuperati senza nuova invocazione. Nessun rilancio di una campagna fallita o ridistribuzione dei tetti sono implicitamente autorizzati.

Il runner è `.verify/app225-segments-20261102/campaign-live.test.ts`. La modalità seal congela sorgenti, test, configurazione, runner, dati e packet, e registra anche l'hash dell'eseguibile Codex. Copie in frozen e impronte in seal.json. Le verifiche si ripetono prima delle fasi e di ogni invocazione effettiva. Un'autorizzazione esplicita deve corrispondere al seal, ai tre casi e ai tetti proposti; il solo flag live non autorizza chiamate.

Comando operativo, dopo l'autorizzazione e con POKEGURU_V28_CAMPAIGN=live: `node node_modules/vitest/vitest.mjs run .verify/app225-segments-20261102/campaign-live.test.ts --exclude '**/frozen/**' --maxWorkers=1 --reporter=dot`. L'esclusione evita di scoprire anche la copia archiviata del runner. Le modalità prepare, seal, preflight e guard non inviano richieste al modello; guard verifica anche l'arresto prima dei nuovi job senza consenso.

## Esecuzione e arresto

1. Esecuzione sequenziale nell'ordine sopra; nessuna campagna concorrente.
2. Il ciclo autonomo costruisce e verifica segmenti, critica la premessa, confronta le repliche, ripara i soli destinatari contestati, scrive la prosa e richiede tutte le critiche finali. Restano registro unico, inventari/copie, accessi/pescate, costi/Energie, KO/Premi/promozioni, sviluppo, difese e prove di rimozione; nessuna eccezione per carte o matchup.
3. Scaling dinamico e calibrazione restano attivi. Prima di ogni chiamata occorre budget sufficiente anche per i controlli successivi; nessuna chiamata oltre i limiti di contesto/output o i tetti autorizzati.
4. La guida valida viene salvata e riletta nel progetto isolato, con attestazione delle fonti effettivamente ricevute dai critici. Si passa al matchup successivo soltanto se il precedente è valido. Una guida già valida non viene rigenerata.
5. **Al primo matchup terminato senza guida valida si ferma tutta la campagna.** Errori bloccanti, incoerenze dei dati, cambi del codice congelato o impossibilità di riservare la conclusione fermano l'esecuzione. I retry consentiti dal controller restano nel tetto. Nessun riavvio automatico di una campagna fallita, aumento implicito o correzione di codice/contenuti fra i casi.
6. Per tutte le guide riuscite: audit di integrità, originali, fonti, conteggi, persistenza, isolamento e UI. Nessuna pubblicazione/installazione o promozione automatica del default v28.

## Generalizzabilità

Prima della nuova prova sono stati selezionati con un algoritmo indipendente dai risultati AI altri due matchup dall'archivio pubblico: **Slowking–Sharpedo/Toxtricity** e **Rocket's Honchkrow–Alakazam/Dusknoir**. Metodo, esclusioni, liste esatte e provenienza sono in heldout-selection.json, incluso nel congelamento. Il secondo comprende un'altra variante Alakazam: non è una prova su famiglie di carte completamente disgiunte. Il primo usa archetipi estranei ai tre casi correnti e al pilota.

Queste selezioni non entrano nei prompt dei tre job e non sono autorizzate alla generazione dal budget 32/96. Dopo le tre valide, valutazione del codice e prova su casi non usati per tarare il metodo; qualsiasi nuova invocazione su tali dati richiede un perimetro e un budget espliciti. La riuscita sui tre casi correnti, da sola, non dimostra affidabilità per tutte le guide o entro le 16 invocazioni ordinarie.
