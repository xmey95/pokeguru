<p align="center">
  <img src="resources/icon.png" alt="Logo Pokéguru" width="96" height="96">
</p>

<h1 align="center">Pokéguru</h1>

<p align="center"><strong>Il tuo spazio per preparare, analizzare e migliorare mazzi Pokémon TCG.</strong></p>

<p align="center">
  <a href="https://github.com/xmey95/pokeguru/releases/latest">Scarica l'app</a> ·
  <a href="#primi-passi">Primi passi</a> ·
  <a href="#sviluppo">Sviluppo</a> ·
  <a href="https://github.com/xmey95/pokeguru/issues">Segnala un problema</a>
</p>

Pokéguru è un'app desktop per lo **Standard occidentale**. Riunisce le tue liste, un catalogo di carte, dati di torneo e analisi AI in progetti locali indipendenti. Importa un mazzo, studia i matchup e confronta proposte complete: ogni modifica alla lista principale passa dalla tua decisione.

Disponibile per **Linux, Windows e macOS**, con consultazione offline dei dati già acquisiti e Codex come motore AI.

## Cosa puoi fare

| Funzione | Nel tuo percorso di gioco |
| --- | --- |
| **Organizza i mazzi** | Crea progetti separati, importa testo o file `.txt`, consulta lo storico e copia la lista negli appunti. Archivia e ripristina i progetti quando serve. |
| **Esplora le carte** | Cerca nel Catalogo condiviso, consulta effetti e immagini disponibili e confronta stampe e rarità della stessa carta di gioco. Gli aggiornamenti sono riprendibili e mostrano la copertura acquisita. |
| **Controlla la lista** | Valuta costruzione, rotazione e ammissione alla data scelta. Distingui errori certi e casi da verificare; imposta vincoli di quantità o stampa dal dettaglio delle carte nella Lista. |
| **Studia il metagame** | Consulta archetipi, tornei Play e Regional da Limitless, con liste disponibili, provenienza e copertura dei risultati. |
| **Prepara i matchup** | Genera guide con punti forti, rischi, carte chiave e piano di gioco. Discuti le analisi e conserva le revisioni legate alla versione del mazzo. |
| **Valuta alternative con l'AI** | Apri Thread indipendenti, chiedi modifiche e confronta candidate complete di 60 carte verificate dai controlli locali. Adotta manualmente l'intera lista quando sei convinto. |

La lista principale resta consultabile mentre lavori nei Thread o nei Matchup. Le proposte e le conversazioni dei diversi progetti rimangono separate.

## Installazione

Scarica il pacchetto adatto dalla pagina delle [release](https://github.com/xmey95/pokeguru/releases/latest).

| Sistema | Pacchetto | Installazione |
| --- | --- | --- |
| Linux x64 | `.AppImage` | Rendi il file eseguibile e avvialo. È necessario un ambiente desktop. |
| Windows x64 | `-windows-x64-setup.exe` | Avvia l'installer e segui la procedura. |
| macOS Intel | `-macos-x64.dmg` | Apri il DMG e trascina Pokeguru in Applicazioni. |
| macOS Apple Silicon | `-macos-arm64.dmg` | Apri il DMG e trascina Pokeguru in Applicazioni. |

I pacchetti includono la CLI Codex nativa: **non servono Node.js, npm o un'installazione separata di Codex** per usare l'app. Le funzioni AI richiedono connessione e accesso Codex, configurabile in **Impostazioni AI**.

**macOS:** i pacchetti v0.3.0 usano una firma ad hoc gratuita, senza certificato Developer ID né notarizzazione Apple. La CI verifica DMG, firma e avvio del binario su Mac Intel e Apple Silicon; l'apertura da Finder dopo il download su un Mac Apple Silicon esterno alla CI resta da provare. Gatekeeper può bloccarla. Nella v0.2.1 un utente ha visto «L'app è danneggiata e non può essere aperta» su Apple Silicon; il nuovo pacchetto non va considerato una correzione confermata di quel caso finché non viene provato sul suo Mac. Consulta la [guida alla distribuzione e alla prova manuale](docs/DISTRIBUTION.md). L'installer Windows è senza firma Authenticode. La release include `SHA256SUMS.txt`, manifest di provenienza e attestazioni GitHub per verificare i pacchetti.

## Primi passi

1. **Crea un progetto.** Dal selettore dei progetti scegli **Nuovo progetto**, assegna un nome e usa il circuito occidentale Standard.
2. **Importa la lista.** Nella sezione **Lista**, incolla il testo o scegli un file `.txt`. Controlla quantità e righe non riconosciute. Per esplorare l'interfaccia puoi usare la [lista dimostrativa](examples/lista-demo.txt): contiene 12 carte ed è una bozza, non un mazzo pronto da giocare.
3. **Aggiorna il Catalogo.** Usa **Aggiorna nuove carte** per acquisire schede e miniature disponibili. Torna alla Lista per consultare le carte, chiarire eventuali ambiguità e leggere l'esito Standard. Nel dettaglio di una carta puoi aggiungere i vincoli da rispettare.
4. **Prepara le analisi.** In **Impostazioni AI**, verifica l'accesso Codex e scegli modello e livello di ragionamento, oppure lascia **Automatico**. In **Eventi** aggiorna Play e Regional per rendere disponibili le relative evidenze locali.
5. **Studia e confronta.** In **Matchup** scegli un archetipo e genera una guida; nei **Thread** discuti la lista o chiedi una proposta. Puoi consultare i dati inviati e le fonti delle risposte. Le candidate valide restano separate finché non le adotti.
6. **Porta con te la lista.** Usa **Copia export** dalla Lista per copiarla negli appunti. Versioni, discussioni e guide restano nel progetto alla riapertura.

## Dati locali e servizi online

Progetti, liste, vincoli, conversazioni e guide vengono salvati sul computer. Catalogo ed Eventi sono condivisi tra i progetti. Puoi consultare i dati acquisiti, cercare le carte locali e preparare import/export anche offline.

La connessione serve per aggiornare le fonti, acquisire immagini mancanti e generare nuove risposte AI. All'apertura, l'app controlla la scadenza giornaliera degli aggiornamenti globali; stato, attese ed errori sono visibili. Restano disponibili aggiornamento manuale, pausa e ripresa.

Quando avvii una richiesta AI, il messaggio e il contesto pertinente — per esempio lista, vincoli, schede delle carte ed evidenze dei tornei — vengono inviati a Codex. Credenziali e token sono gestiti da Codex e non vengono copiati nel database dei progetti. L'accesso è condiviso con gli altri client Codex locali; la disconnessione dall'app interessa anche questi client.

L'archivio è in `data/pokeguru.sqlite` nella cartella dati dell'app. Prima delle migrazioni di schema viene creata una copia verificata; le immagini e le preferenze AI sono separate dal database. Per backup e ripristino consulta la [guida ai dati locali](docs/DATABASE.md).

## Copertura e limiti

- **Formato supportato:** Standard occidentale. La costruzione assistita completa da zero, il circuito giapponese e altri motori AI sono sviluppi futuri.
- **Controlli Standard:** l'esito si riferisce alle regole versionate incluse nell'app e alle stampe effettivamente coperte. I casi mancanti o ambigui restano da verificare. Aggiornare il Catalogo non aggiorna le regole: le nuove regole arrivano con una release. L'esito non è una certificazione di legalità torneo.
- **Fonti e analisi:** il Catalogo usa TCGdex; metagame ed eventi provengono da Limitless. La copertura dipende dai dati disponibili e le guide AI possono contenere errori. Quota del meta, piazzamenti e risultati contro il campo non sono il winrate del tuo mazzo.
- **Import/export:** il percorso è verificato con round trip locale e campioni in Limitless. Il formato di copia è predisposto per Pokémon TCG Live; l'importazione diretta nel client non è ancora verificata.

### Novità della v0.3.0

Questa versione include piani Matchup in prosa più scorrevole e **Ricerca avanzata AI** nel Catalogo. Puoi cercare, per esempio, «Pokémon Base con almeno 200 PS e ritirata massimo 1» oppure «carte che recuperano Energie dagli scarti».

La ricerca avanzata usa le schede locali, mostra copertura e risultati incerti e considera il mazzo solo quando la domanda lo richiede esplicitamente. Richiede Codex; i risultati sono temporanei e la qualità tattica resta da valutare su carte reali.

## Sviluppo

Servono **Node.js 24 o successivo**, npm e un ambiente grafico. Dalla radice del repository:

```sh
npm ci
npm run dev
```

| Comando | Scopo |
| --- | --- |
| `npm run typecheck` | Controllo dei tipi TypeScript. |
| `npm test -- --maxWorkers=2 --testTimeout=15000` | Suite locale con gli stessi parametri della CI. |
| `npm run build` | Controllo dei tipi e build in `out/`. |
| `npm start` | Avvio della build locale. |
| `npm run test:e2e:offline` | Prova Electron di progetti, importazione, persistenza e migrazione con dati isolati. |
| `npm run package:linux` | AppImage x64, da eseguire su Linux. |
| `npm run package:win` | Installer NSIS x64, da eseguire su Windows. |
| `npm run package:mac` | DMG per l'architettura del Mac usato per la build. |

Su Linux i test grafici possono essere eseguiti con `xvfb-run -a npm run test:e2e:offline`. Le prove live di fonti e AI sono separate: richiedono i servizi corrispondenti e, per le generazioni, accesso Codex e disponibilità d'uso. L'elenco completo dei comandi è in [package.json](package.json).

Lo stack usa Electron, React, TypeScript e SQLite. I rami `task/*` confluiscono in `dev` tramite PR; la [CI](.github/workflows/ci.yml) verifica Linux, Windows, macOS Intel e Apple Silicon. Il merge di una nuova versione in `main` avvia il [workflow di release](.github/workflows/release.yml), con build, prove dei pacchetti e pubblicazione dopo i controlli.

## Documentazione e feedback

| Documento | Contenuto |
| --- | --- |
| [Prodotto e requisiti](docs/PRODUCT.md) | Flussi, perimetro e requisiti del prodotto. |
| [Roadmap](docs/PLAN.md) | Incrementi previsti e punto di ripresa. |
| [Backlog](docs/BACKLOG.md) | Stato delle attività e verifiche registrate. |
| [Decisioni e fonti](docs/DECISIONS.md) | Scelte tecniche e provenienza dei dati. |
| [Archivio e recupero](docs/DATABASE.md) | Persistenza, migrazioni, backup e ripristino. |
| [Design system](docs/DESIGN_SYSTEM.md) | Componenti, navigazione e criteri dell'interfaccia. |
| [Istruzioni di progetto](AGENTS.md) | Procedura per contribuire con Codex. |

Per un problema o una proposta, apri una [issue su GitHub](https://github.com/xmey95/pokeguru/issues). Indica versione dell'app, sistema operativo e passaggi per riprodurre il comportamento; allega una lista di esempio quando utile, evitando credenziali e dati personali.

Le carte e le immagini consultate mantengono l'attribuzione alle rispettive fonti e ai titolari dei diritti. Gli asset delle carte acquisiti dall'app restano nella cache locale e non sono inclusi nel repository o nei pacchetti.
