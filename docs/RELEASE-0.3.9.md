# Pokéguru v0.3.9

Questa versione riduce il lavoro ripetuto nelle analisi AI estese e migliora la rappresentazione dei dati degli Eventi.

- Riuso di lotti e sintesi compatibili quando crescono le prove o si riprende un’analisi.
- Panoramica degli Eventi senza filtro obbligatorio per archetipo.
- Aggregati deterministici per lista esatta, evento e avversario, con denominatori e dati mancanti espliciti. Gli originali restano disponibili per approfondire.
- Lista di partenza e vincoli forniti in ogni lotto; schede originali pronte per le verifiche finali.
- Diagnostica più completa di tempi, chiamate, riuso e volumi, senza includere contenuti personali nell’export.

Sul campione reale analizzato offline: **872 → 344 lotti foglia (−60,55%)** e **51.974.677 → 20.036.920 byte (−61,45%)**. Sono misure della rappresentazione dei dati sul campione, non garanzie di riduzione di tempo/costo o di pari qualità tattica. Modello ed effort non vengono cambiati.

La nuova aggregazione vale per i nuovi workflow; le analisi precedenti mantengono algoritmo e checkpoint. Il database resta allo schema 16, senza nuove migrazioni. Per installare mentre è in corso un’analisi, usa prima Pausa e chiudi normalmente l’app: il lavoro salvato può essere ripreso dopo l’aggiornamento.

Disponibili AppImage Linux x64, installer Windows x64 e DMG macOS Intel/Apple Silicon. Pacchetti accompagnati da manifest di provenienza, attestazioni GitHub e SHA256SUMS.txt.

I pacchetti macOS usano una firma ad hoc, senza Developer ID né notarizzazione; Gatekeeper può bloccare l’apertura dopo il download. La prova Finder su un Mac Apple Silicon esterno alla CI resta aperta. L’installer Windows è senza firma Authenticode. Consulta la [guida alla distribuzione](https://github.com/xmey95/pokeguru/blob/main/docs/DISTRIBUTION.md) e il [rapporto sulle misure](https://github.com/xmey95/pokeguru/blob/main/docs/AI-EVENT-AGGREGATES.md).
