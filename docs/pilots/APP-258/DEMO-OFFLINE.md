# APP-258 — Demo offline delle guide del pilota

7 novembre 2026. Consegnare una parte utilizzabile dell’app prima della qualificazione del nuovo generatore. Autorizzazione: «ok» alla proposta di anticipare la prova locale, mantenendo ferme le campagne reali. **Zero nuove chiamate AI.** Restano 455 v28 / 531 storiche, 0/3 nuove guide valide, tetti 576/500/500, pool 1500 e riserva 24. La proposta 619 non viene adottata.

## Cosa si può provare

Il comando [Avvia-demo-PokeGuru.cmd](../../../Avvia-demo-PokeGuru.cmd) compila il checkout e apre l’app con un nuovo profilo in `.verify/guide-demo/session-*`. Una fascia esplicita distingue la demo dalla generazione corrente e dà accesso a Toucannon–Dragapult, Toucannon–Festival e Dragapult–Hydrapple. Lista esatta da 60 carte, otto capitoli, due scenari, esercizi, fonti e storico sono quelli salvati nel pilota APP-217. Nessuna riscrittura manuale o nuova approvazione attribuita ai contenuti.

Le guide storiche mantengono `matchup-guide-24` e il loro contratto. Hydrapple resta senza originali nativi storicamente non disponibili; non vengono inventati o ricostruiti retroattivamente. I riferimenti tecnici presenti nella prosa restano un limite editoriale del pilota. Non è una certificazione del nuovo formato, del metagame attuale o della forza competitiva.

## Isolamento e blocchi

- I tre SQLite sorgenti vengono aperti in sola lettura. L’aggregazione copia righe originali, verifica identità dei conflitti e chiavi esterne; soltanto la chiave autoincrementale locale delle attività è riassegnata per evitare collisioni tra database. Job, tentativi e contenuti restano originali. Provenienza e hash sono nel profilo.
- Flag esplicito più manifest valido obbligatori. Senza directory separata o manifest, l’avvio demo fallisce; non ripiega sul profilo personale.
- Il backend ammette soltanto gli endpoint di consultazione elencati. Scritture, AI, login/connessione Codex, ripresa/recupero, sincronizzazioni e apertura di siti sono respinti prima dell’esecuzione. I nuovi endpoint futuri sono bloccati per default.
- Sincronizzazione e recupero automatici non partono. Il fetch del worker e le richieste HTTP(S) del renderer sono disabilitati. I comandi AI e di modifica sono rimossi dalla UI; il consumo del vecchio job è sotto «Consumo storico del pilota».
- Il Meta restituito è lo snapshot originale legato al progetto, senza richiesta esterna o sostituzione con quello di un altro matchup. I normali lettori decidono comunque se la discussione è storica: nessun flag di validità viene forzato.
- Il launcher usa solo runtime locali e non installa/scarica Electron. Il profilo normale mantiene il comportamento precedente.

## Verifiche eseguite

1. **175 test passati, 6 file, zero fallimenti o esclusioni**: policy del profilo, persistenza/progetti, contratto guide, budget delle risorse/policy e cronologia di navigazione. Rapporto `.verify/app258-demo-20261107/tests.json`.
2. **Rilettura delle tre guide reali** tramite `readGuideContent`, `readGuideReview`, `assertGuideReport`, `assertGuideIntegrity`, lettore degli originali disponibili e `ProjectStore`. Guide identiche agli originali; liste da 60; isolamento tra progetti e hash sorgenti conservati. Un ulteriore test offline passato; `.verify/app258-demo-20261107/readback.json`.
3. **Typecheck e build passati.** Il formato della generazione, lo scaling e tutti i gate di correttezza restano invariati in questo incremento.
4. **Electron/SQLite/IPC reali, senza sostituzione dei dati o dei servizi di lettura**: tutti e tre i matchup, otto capitoli/due scenari ciascuno, titoli originali, esercizio con soluzione, lista esatta, 1440/1280/640 px senza overflow. Sette comandi vietati provati direttamente via API; storia completa dei job/chiamate identica prima e dopo. Riapertura dello stesso profilo, hash dei contenuti e dei database sorgenti invariati, zero errori renderer. Anche modalità normale aperta su un altro profilo temporaneo: creazione progetto dalla UI riuscita, marker demo assente. `.verify/app258-demo-20261107/ui/result.json`, schermate nella stessa cartella.

L’avvio Electron nel sandbox esterno non riusciva; le prove UI sono state eseguite fuori da quel sandbox, conservando sandbox/context isolation del renderer. Il launcher finale è stato provato anche con Windows PowerShell 5: corretta la lettura della versione Node senza espressioni JavaScript soggette alla rimozione delle virgolette. I tentativi intermedi sono verifiche locali, non chiamate AI. Un selettore UI inizialmente ambiguo è stato ristretto al titolo dello scenario.

**Consegna osservata:** comando PowerShell finale eseguito, build riuscita, profilo `session-3e967e03-de5a-40fc-9f24-af748adaa6f4`; ElectronPID32012, titolo «Pokéguru», finestra con handle16124144. Il child interattivo viene avviato visibile; soltanto il launcher console è nascosto. Ricevuta `.verify/guide-demo/latest-session.json`, log `.verify/app258-demo-20261107/user-launch-final.log`, nessun errore nel relativo stderr. La demo è stata lasciata aperta per l’utente.

## Ripresa del lavoro complessivo

APP-258 conclude la sola consegna dimostrativa. APP-257 resta fermo; il suo vecchio sigillo non rappresenta più il checkout dopo l’integrazione demo e non va riutilizzato per una campagna. I job e i negativi reali non sono stati riaperti, azzerati o reinterpretati.

La parte successiva resta il consolidamento offline del coordinatore: dipendenze degli ancoraggi distinte dai soli testi; limiti sui problemi persistenti anziché negativi eterogenei; ammissione sulle fasi mancanti e riserve effettive. Le due ultime voci cambiano politiche operative e vanno definite e verificate esplicitamente prima dell’adozione; nessuna è applicata di nascosto ai job storici. Controlli di legalità, quantità, fonti e critica finale restano obbligatori. Nessuna nuova prova reale è autorizzata da questa consegna e nessun aumento del budget è proposto.
