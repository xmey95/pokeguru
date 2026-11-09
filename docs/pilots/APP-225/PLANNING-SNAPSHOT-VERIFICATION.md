# Lettura degli snapshot e controllo dell’obiettivo durante l’esecuzione

L’epoca13 termina dopo una sola nuova invocazione147,riuscita con due piani accettati: **150 chiamate v28 e 0/3 nuove guide valide**,226 includendo le76 precedenti. Il processo47933 termina exit1 dopo71.36s. Gli altri due job restano assenti e lo stop globale è rispettato. Archivio508 file/482 input live,112 checkpoint,binding e chunk SQLite conservati.

L’errore è nel coordinatore locale:per costruire il contesto della scelta,richiamava il costruttore dei rami con un caller che vieta nuove chiamate. Il nuovo controllo dell’obiettivo rileva correttamente che il ramo storico non è ancora approvato secondo il nuovo contratto e tenta il riesame. Il caller della lettura lo blocca con «snapshot originale incompleto»,sebbene i turni storici siano completi. La risposta147 è preservata;non è un errore Codex o di quota.

## Correzione

`readGuideReplyBranchSnapshots` legge soltanto rami già completi o terminali dimostrati. Verifica scope,main attuale,piano,catena dei checkpoint,prefisso/pescata e prova della critica storica. Non crea fork,non scrive checkpoint e non chiama il provider. Un ramo mancante,incompleto o mai esaminato viene respinto senza ricostruzione implicita.

Il coordinatore usa questo lettore per preparare scelte e aggiornamenti dei piani. La prova storica informa la decisione di riparazione;non approva il goal o la guida. Il costruttore effettivo mantiene la nuova critica obbligatoria dell’obiettivo prima del seguito o del riuso dei turni. I metadata continuano a rifiutare il ramo se quel controllo manca. Nessuna opzione di bypass della critica viene introdotta nell’esecuzione.

La forma dello snapshot comprende il medesimo riferimento alla main restituito dal costruttore storico. Questo conserva esattamente l’impronta dei contesti,le identità delle richieste e la cache. Il primo tentativo dei test mirati è stato interrotto perché la forma iniziale ometteva quel riferimento e rendeva incompatibili i contesti delle fixture:non è un pass. È stato aggiunto il controllo esplicito dell’impronta;il secondo tentativo passa27 test. Nessun timeout,limite o controllo è stato allentato.

La nuova regressione riproduce l’intera transizione:ramo storico completo con vecchia critica,piano proposto già salvato,lettura senza chiamate/scritture,scelta AI,nuova critica del goal,soli turni mancanti del nuovo ramo,metadata. Il ramo storico adeguato conserva i suoi turni e il contesto originale. Anche il rifiuto di un ramo mai esaminato viene verificato nel lettore.

## Verifiche

27 mirati e typecheck passano. Cinque replay definitivi su copie verificano:147 tentativi/112 checkpoint preservati,solo le scelte pendenti raggiunte al tetto168,piano147 non ricomprato,blocco prima del provider senza residuo,nuovo controllo del goal ancora richiesto,e i due matchup non avviati fermati al piano iniziale su copie da24 chiamate. Originali e job reali restano invariati,nessuna AI. I cinque replay sono ripetuti dopo la suite sul codice definitivo:68.65s,passati.

Suite completa **659 pass/44 esclusi**,106 file passati e37 esclusi su143,in400.39s;**38783 terminale exit0**,poi typecheck/build riusciti. Log `planning-snapshot-full-suite.log` e `planning-snapshot-build.log`. Freeze485 file,hash **ebf5edd7ec90543291ca6162d5617b9772a2ecff75c582109fbb4515ebc033b0**,ricontrollato intatto dopo suite e replay. L’audit verifica14 archivi v28/diagnostico,482 input congelati precedenti e binding/chunk correnti;le76 originali e11 archivi/254 sorgenti separati passano un nuovo controllo readonly. Nessun contenuto AI reale modificato manualmente. La copia policy654/UI resta separata,non adottata o verificata in combinazione con questo codice.

## Ripresa

Tetti **168/216,riserva24 invariati**. Sono già usate150 chiamate v28:66 ulteriori massime,18 sul primo e48 riservate;massimo storico292. Il runner successivo viene preparato entro gli stessi limiti,senza nuovo grant. Ripresa dallo stesso jobCrustle30594bb5-5b1d-4e92-bfca-950de782af06;altri due soltanto dopo una valida,stop globale al primo matchup terminato senza valida e held-out esclusi. Tutti i controlli e lo scaling rimangono obbligatori.

Suite/build,replay definitivi,audit,runner sigillato/guard/preflight e typecheck sono conclusi.482 input congelati,seal **8d27d97bc97835026259809e455c3fac634f8baf75dd861fa2488092b433bb70**. Prima di altra rete serve nuovo consenso alla riapertura sul codice corretto. Il motivo del consenso è lo stop globale concordato,non un aumento dei tetti. La disponibilità di18 invocazioni non garantisce l’approvazione. Grant e processo live assenti. Defaultv27/guardv28 e policy654/UI separata conservati;app finale e obiettivo completo ancora aperti. [Protocollo epoca14](CAMPAIGN-EPOCH14.md).

Evidenze `.verify/app225-segments-20261102/`: `epoch13-live.log`,`campaign-v28-epoch13-archive/manifest.json`,`planning-snapshot-targeted-1.log` (interrotto),`planning-snapshot-targeted-2.log`,`planning-snapshot-replays.log`,`planning-snapshot-real-context.json`,`planning-snapshot-replay-0-168.json`,`planning-snapshot-preservation.json` e `planning-snapshot-freeze/manifest.json`.
