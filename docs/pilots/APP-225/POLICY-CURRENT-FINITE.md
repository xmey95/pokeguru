# Budget applicativo sulla generazione finita corrente

**Checkpoint successivo:** la [regressione completa](POLICY-CURRENT-FINITE-FULL.md) è conclusa con961 passati/46 esclusi effettivi,inclusa la UI separata. Stato corrente APP-232/225 Blocked per il consenso v7 pendente;questa pagina conserva la verifica mirata precedente.

5 novembre 2026. Verifica offline nel perimetro dell’obiettivo APP-225, durante l’attesa del consenso per la v7. **Copia isolata, non adottata. Zero chiamate reali.** Codice e runner v7, database della campagna, autorizzazioni e contabilità restano invariati:327v28/403storiche/0 nuove guide valide, residui173primo/1173pool entro500/1500/riserva24.

La policy v5 era stata preparata su una base precedente. La nuova copia unisce i533 source/test correnti con i13 file della policy e i suoi test, verificando le impronte della base prima di copiare. I successivi affinamenti della v5 sul blocco misto token/chiamate sono conservati e registrati esplicitamente; la vecchia copia resta intatta. Nessuna modifica è applicata ai sorgenti canonici o al freeze v7.

## Difetto trovato e corretto nella copia

Un nuovo test attraversa la vera funzione di generazione finita con budget iniziale16. Il controllo blocca prima del provider e conserva il contesto. Dopo un’estensione esplicita a128 e la riapertura dello stesso job, il generatore tentava di riscrivere `guide-schedule/initial`, sostituendo maximum16 con128: l’archivio immutabile lo respingeva. Il difetto non è un esaurimento di token del servizio; è una collisione dello snapshot prima del primo invio.

La copia conserva per sempre il piano iniziale. Un massimo autorizzato maggiore produce un record separato `guide-schedule-replan-v1`, collegato all’hash iniziale. Ogni altro fatto del piano deve essere identico, il massimo deve crescere e l’autorizzazione del job resta obbligatoria. Nessun limite viene innalzato automaticamente e nessuna risposta AI o approvazione viene creata. Il test ora raggiunge soltanto la prima richiesta pendente e la interrompe prima del provider, con un solo avvio intercettato nella copia e le due scelte di budget conservate.

La correzione riguarda soltanto la futura integrazione della policy: **la v7 congelata non cambia**. La campagna usa lo stesso massimo206 del job e non attraversa questa variazione del tetto iniziale. Le eventuali modifiche future richiederanno una nuova verifica del codice combinato prima dell’adozione.

## Verifiche effettive

- **21 test mirati** sulla copia combinata: scelte persistenti, isolamento, payload estranei, estensioni idempotenti, quota distinta, blocchi misti/mancanti/incoerenti, servizio, worker RPC reale, generazione sintetica e migrazione del critico corrente.
- **3 regressioni storiche** v23/v24 sul piano iniziale e sulle riserve. Gli altri118 casi del file sono esclusi dal filtro di questa esecuzione, non dichiarati rieseguiti.
- **1 prova UI reale** con Electron, preload e worker: estensione16→32, tre tentativi conservati,29 residue, ripresa solo tramite azione separata, limite conservato dopo riapertura. Job e guida esplicitamente sintetici, provider disabilitato, nuovo profilo copiato e database sorgente invariato. Screenshot1440/640px ispezionati, nessun overflow o errore renderer. Defaultv27 e guardv28 conservati.
- **Typecheck e build passati** dopo la correzione. Il primo build della copia mancava dei file scripts importati dai test: copiati gli stessi scripts canonici, senza modificarli. Il primo lancio Electron nel sandbox esterno non riusciva; lo stesso test immutato passa fuori dal sandbox del tool, senza provider o riapertura della campagna.

Sono **25 test passati su9 file**, non una nuova suite completa della copia. I497 test della base v7 restano un’evidenza separata. Le differenze candidate sono14 file source e7 test; tutti gli altri source/test canonici e gli864 input v7 risultano invariati. La policy e questa correzione non sono state adottate, l’app installata non è modificata.

## Generalità: cosa prova l’audit

L’audit corrente esamina le istruzioni realmente emesse da tutte le cinque fasi finite e29 moduli pertinenti, incluse le nuove quantità nelle fonti. Non trova nomi o routing dei matchup del pilota o dei tre nuovi casi nelle istruzioni finite e nei moduli controllati. Le vecchie stringhe con esempi del pilota presenti nei lettori storici restano immutate per compatibilità; il nuovo percorso emette le regole generali tramite `genericGuideInstructions`.

Questo audit, le fixture indipendenti e i controlli positivi/negativi sono prove del perimetro implementativo. **Non provano l’affidabilità competitiva su ogni matchup.** I tre nuovi casi reali restano0/3; held-out non usati, nessun invio esterno autorizzato da questa verifica.

## Cosa manca per la consegna

| Requisito dell’obiettivo | Stato ed evidenza richiesta |
|---|---|
| Tre guide complete e valide | Incompleto:0/3, stop reale v6 archiviato. La [v7 pronta](CAMPAIGN-V7-PREPARED.md) attende il consenso già richiesto. |
| Controlli, scaling e originali | Base v7 verificata,864 input intatti; copia combinata25 test mirati. Occorre rieseguire le verifiche pertinenti sul codice effettivamente adottato. |
| Salvataggio, riapertura e UI delle guide reali | Incompleto: l’esercizio UI corrente è sintetico e riguarda il budget. Servono i tre report validi reali. |
| Valutazione della generalità | Audit statico e istruzioni emesse verificati; qualità dei tre nuovi matchup ancora da esaminare. Gli held-out restano esclusi. |
| Budget iniziale utile | Da calibrare:16 è inferiore al minimo preliminare17 del percorso finito e alle soglie fredde59 osservate. Non basta sostituirlo con17. Servono preflight corrente, misure delle guide valide e margine esplicito; nessuna promessa di convergenza. |
| Retry, estensione e arresto | Copia verificata: nessun aumento o riavvio automatico; il tetto maggiore non risolve blocchi di token, formato o semantica. Adozione ancora pendente. |
| Attivazione nell’app | Non eseguita; subordinata alle guide reali, alla verifica generale, alla calibrazione e alle verifiche combinate. |
| Build utilizzabile dall’utente | Incompleta: la build della copia è verificata e disabilitata sul nuovo percorso; non è la consegna finale richiesta. |

Evidenze autorevoli: `.verify/app225-segments-20261102/verification-policy-current-finite.json`, `policy-current-finite-preparation.json`, `current-finite-generality-audit.json`, report dei test e screenshot nel dossier `policy-current-finite-ui`. Restano anche i report negativi prima della correzione e del primo lancio Electron.

APP-232 resta l’unica attività principale In progress, APP-225 Blocked e obiettivo completo aperto. La richiesta di riapertura v7 rimane pendente e non viene duplicata. Nessuna nuova autorizzazione creata, nessun contenuto AI corretto manualmente, nessun aumento dei tetti.
