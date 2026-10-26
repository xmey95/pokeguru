# Caricamenti e attività — APP-081

24 ottobre 2026 · ramo locale `task/production-design-system`.

## Risultato

| Situazione | Presentazione |
| --- | --- |
| Prima lettura di progetti, carte, Catalogo, Eventi, Thread e meta | Segnaposto strutturali con stato accessibile; nessun falso “vuoto” durante l'attesa |
| Operazione breve | Indicatore nel controllo o accanto all'etichetta, senza bloccare l'intera pagina |
| Catalogo | Barra e conteggio dei dettagli sul totale del job; ricerca inventario indeterminata; pausa e ripresa accanto allo stato |
| Play e Regional | Stato del blocco, eventi controllati/archiviati e liste scaricate aggiornati; nessuna percentuale sul totale ignoto |
| Codex | Indicatore con tempo trascorso in Thread, analisi, revisione Matchup e prova AI; contenuto precedente consultabile |
| Navigazione durante un'operazione | Stato conservato, timer continuo, doppi invii bloccati, conclusione recuperata tornando nella sezione |

Componenti: `Loading.tsx`, `CatalogActivity.tsx`, `useProgressPoll.ts`; token esistenti e nessuna nuova dipendenza. Polling seriale ogni 1,5 secondi dopo la risposta; pulizia all'uscita e protezione dai risultati tardivi. La rilettura del Catalogo durante il download resta limitata. Per gli Eventi “running” nel cursore persistito indica anche un blocco da proseguire: lo spinner dipende dalla richiesta effettivamente attiva nella sessione.

Le animazioni rispettano `prefers-reduced-motion`. Il titolo comunica l'attività tramite live region; tempo trascorso e contatori restano leggibili senza annunci ogni secondo. Nessun overlay e nessuno spostamento forzato del focus da parte dei loader.

## Verifiche eseguite

Build/typecheck passati. Su Windows Electron, archivi temporanei:

- `node tests/loading-startup-ui.mjs`: aperture ritardate, vuoto solo dopo lettura, totale ignoto, errore/ripresa stato, cleanup dopo risposta tardiva.
- `node tests/catalog-ui-live.mjs`: valori della barra, pausa/ripresa, new/full, ritorno durante download, filtri, fonti e gestione.
- `node tests/tournament-ui-live.mjs --offline`: Play/Regional pendenti, conteggi, consultazione delle liste, ritorno e completamento, cooldown/errori e riapertura.
- `node tests/thread-composer-ui-live.mjs`: discussione/proposta, timer conservato, comandi bloccati contro doppi invii, esito ed errore recuperabile.
- `node tests/matchup-switcher-ui-live.mjs --discussion --navigation`: guida precedente, revisione, richiesta pendente durante navigazione, errore/riprova, stesso turno e conclusione fuori vista.
- `node tests/matchup-switcher-ui-live.mjs --ai-options`: rigenerazione pendente e ritorno, guida invariata, configurazione e instradamento.
- `node tests/ai-settings-ui-live.mjs`: salvataggio/prova pendenti, conclusione fuori vista e configurazione conservata. Corretto uno stato di azione che restava attivo dopo la navigazione.
- `node tests/workspace-ui-live.mjs`: regressione Lista/Thread/Matchup e risorse, tastiera, lista persistente e breakpoint.
- `node tests/import-ui-live.mjs`: singolo indicatore di lettura, file tardivi, annullamento, rollback, isolamento e riapertura.

Dieci stati × tre viewport = **30 schermate**, 1440×900, 1280×720 e 640×720. Nessun overflow o sovrapposizione rilevati. Contrasto minimo del testo **5,16:1**; movimento ridotto verificato. Lo startup compatto ha pochi testi per definizione: l'audit richiede almeno tre nodi testuali, mantenendo le soglie di contrasto e target invariati.

## Schermate

| Stato | 1440 px | 1280 px | 640 px |
| --- | --- | --- | --- |
| Avvio | [Apri](design-review/loading/loading-avvio-1440.png) | [Apri](design-review/loading/loading-avvio-1280.png) | [Apri](design-review/loading/loading-avvio-640.png) |
| Apertura Catalogo | [Apri](design-review/loading/loading-apertura-catalogo-1440.png) | [Apri](design-review/loading/loading-apertura-catalogo-1280.png) | [Apri](design-review/loading/loading-apertura-catalogo-640.png) |
| Apertura Eventi | [Apri](design-review/loading/loading-apertura-eventi-1440.png) | [Apri](design-review/loading/loading-apertura-eventi-1280.png) | [Apri](design-review/loading/loading-apertura-eventi-640.png) |
| Aggiornamento Catalogo | [Apri](design-review/loading/loading-catalogo-1440.png) | [Apri](design-review/loading/loading-catalogo-1280.png) | [Apri](design-review/loading/loading-catalogo-640.png) |
| Play | [Apri](design-review/loading/loading-eventi-play-1440.png) | [Apri](design-review/loading/loading-eventi-play-1280.png) | [Apri](design-review/loading/loading-eventi-play-640.png) |
| Regional | [Apri](design-review/loading/loading-eventi-main-1440.png) | [Apri](design-review/loading/loading-eventi-main-1280.png) | [Apri](design-review/loading/loading-eventi-main-640.png) |
| Thread | [Apri](design-review/loading/loading-thread-1440.png) | [Apri](design-review/loading/loading-thread-1280.png) | [Apri](design-review/loading/loading-thread-640.png) |
| Analisi Matchup | [Apri](design-review/loading/loading-analisi-1440.png) | [Apri](design-review/loading/loading-analisi-1280.png) | [Apri](design-review/loading/loading-analisi-640.png) |
| Revisione Matchup | [Apri](design-review/loading/loading-revisione-1440.png) | [Apri](design-review/loading/loading-revisione-1280.png) | [Apri](design-review/loading/loading-revisione-640.png) |
| Prova AI | [Apri](design-review/loading/loading-prova-ai-1440.png) | [Apri](design-review/loading/loading-prova-ai-1280.png) | [Apri](design-review/loading/loading-prova-ai-640.png) |

## Demo aperta e percorsi

Finestra **Pokéguru · Demo caricamenti — operazioni simulate**, archivio temporaneo separato. Le azioni descritte simulano tempi, conteggi e risposte; non acquisiscono nuove carte/eventi né inviano richieste a Codex.

1. **Catalogo → Aggiorna nuove carte**: inventario, barra, pausa simulata al primo tentativo. **Riprendi** completa l'esempio; la ricerca resta utilizzabile.
2. **Eventi → Aggiorna nuovi tornei / Aggiorna nuovi Regional**: conteggi durante il blocco, liste consultabili e completamento.
3. **Thread → scrivi → Chiedi a Codex**: attesa con timer, poi errore simulato recuperabile. Cambia sezione e torna durante i nove secondi.
4. **Matchup → Gardevoir ex · fixture UI → osservazione → Aggiorna guida**, oppure **Rigenera guida**: la guida valida rimane leggibile durante l'attesa e dopo l'errore simulato.
5. **Impostazioni AI → Esegui prova AI**: attesa e successo simulato. La configurazione di esempio non modifica l'account personale.

## Limiti

Non sono prove di nuove integrazioni remote o di qualità competitiva. Backend, database, autenticazione e prompt di produzione invariati. Il timer misura il tempo trascorso nella sessione, senza indicare durata restante o progresso interno del modello. La ripresa dei job al riavvio resta quella esistente, distinta dal mantenimento dello stato UI nella sessione. Linux, screen reader e scala OS elevata non verificati; audit del contrasto esclusi controlli disabilitati, immagini e disclosure chiuse. Nessun merge, release o avvio I4.
