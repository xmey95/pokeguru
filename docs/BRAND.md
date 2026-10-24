# Identità visiva Pokéguru — APP-082

24 ottobre 2026 · ramo locale `task/production-design-system`.

![Simbolo Pokéguru](../resources/icon.png)

## Simbolo e uso

Due carte sovrapposte richiamano la costruzione del mazzo. La G centrale identifica Pokéguru; l'accento oro ne completa il tratto. Il simbolo usa forme originali, senza illustrazioni di carte o marchi Pokémon.

Il fondo passa da petrolio `#183C46` a verde `#0B7169`; carta posteriore menta `#A8DFCC`, carta anteriore `#F7FCFA`, lettera `#163E46` e accento `#D7A842`. L'oro appartiene al marchio; non introduce un nuovo colore di stato nell'interfaccia.

Nella sidebar il simbolo misura 40×40 px, affiancato dal nome testuale esistente. Sotto 1240 px resta il simbolo; a 640 px misura 36×36 px. Le proporzioni restano quadrate. L'immagine ha nome accessibile “Pokéguru”; il testo visivo del nome non viene annunciato due volte.

## Sorgente ed esportazioni

Modificare solo [il master SVG](../resources/brand/pokeguru.svg), poi eseguire:

```sh
npm run brand:generate
npm run build
```

La generazione usa Chromium di Electron in una finestra nascosta, senza rete, font o dipendenze aggiuntive. Richiede le dipendenze di sviluppo e un ambiente grafico; su Linux può essere eseguita sotto Xvfb. Gli asset derivati sono versionati: la build ordinaria non richiede una nuova rasterizzazione.

| Destinazione | Asset |
| --- | --- |
| Sidebar e favicon vettoriale | `src/renderer/public/favicon.svg`, copia del master |
| Favicon di compatibilità | `favicon.ico` a 16/32/48 px e `favicon-32.png` |
| Finestra Electron | `resources/icon.png`, 256 px; nel pacchetto copiato in `resources/icon.png` |
| Eseguibile e configurazione installer Windows | `build/icon.ico`, 9 dimensioni da 16 a 256 px |
| Pacchetto Linux | `build/icons/`, 11 PNG quadrati da 16 a 1024 px |

`electron-builder.yml` configura esplicitamente le icone e la risorsa della finestra. Su Windows l'AppUserModelID coincide con l'appId già esistente. Il marchio non cambia nome del pacchetto, percorsi dei profili o archivio.

## Verifiche eseguite

- Generazione completata; intestazioni e dimensioni degli 11 PNG e dei frame ICO controllate. Master e copia favicon identici.
- Ispezione visiva a 16/32/48/256 px; logo nella UI a 1440×900, 1280×720 e 640×720.
- Build/typecheck passati. La build conserva riferimenti relativi alle favicon, utilizzabili da `file://`.
- Test `workspace-ui-live.mjs` passato alle sei larghezze da 640 a 1440 px, con tastiera, lista persistente e assenza di sovrapposizioni.
- Pacchetto Windows x64 creato con `electron-builder --dir --win --x64 --publish never`. Logo e favicon SVG/PNG/ICO decodificati nell'app confezionata; proporzioni e nome accessibile verificati a 1440/1280/1240/640 px.
- Icona incorporata estratta dall'eseguibile Windows e ispezionata; PNG della finestra nel pacchetto identico alla sorgente. `package-smoke.mjs` passato: avvio, salvataggio, riapertura e migrazione I1 con profili isolati.

**Limiti:** PNG Linux generati e configurati, ma AppImage non costruita né avviata in questa sessione Windows. Le icone NSIS sono configurate; installer non costruito/installato. Nessun merge, pubblicazione o avvio di I4. La demo usa un archivio temporaneo e operazioni remote simulate.
