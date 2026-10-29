# APP-166 — Le 19 schede incomplete su Windows

Audit del 28 ottobre 2026. Il contatore indica dati di gioco incompleti: tutte le stampe erano già state scaricate, con `detailAt` valorizzato. Ripetere il download non risolve un campo che continua a mancare nella fonte.

## Evidenza e perimetro

Il vecchio profilo Windows disponibile presenta la corruzione già registrata in APP-151: non è stato riparato o modificato. L'audit usa una copia isolata dell'archivio integro conservato il 27 ottobre. Contiene 3.303 stampe, di cui 3.275 nel perimetro Catalogo Standard acquisito. Esattamente 19 di queste non superavano il controllo di completezza del gameplay.

Tutte le 19 richieste reali `https://api.tcgdex.net/v2/en/cards/<id>` hanno risposto HTTP 200, confermando le omissioni. Anche le 19 immagini ad alta risoluzione sono state acquisite con HTTP 200 e ispezionate una per una: nome, numero, simbolo del costo e testo. Per 16 stampe la scansione mostra il simbolo dell'attacco senza costo; per i tre Trainer contiene il testo mancante. Il [registro nel codice](../src/main/catalog-gameplay-supplements.json) conserva payload originario, campi integrati, URL esatto della scansione e suo SHA-256.

| Stampe | Nome | Dato mancante verificato |
| --- | --- | --- |
| `30th-089`, `30th-139` | Alolan Meowth | Costo gratuito |
| `30th-120` | Igglybuff | Costo gratuito |
| `30th-126` | Poké Pad | Testo effetto |
| `30th-127` | Switch | Testo effetto |
| `30th-128` | Ultra Ball | Testo effetto |
| `me01-071` | Tyrogue | Costo gratuito |
| `me02.5-016`, `me02.5-221`, `sv08.5-004` | Budew | Costo gratuito |
| `sv06-099`, `sv06-181` | Hisuian Growlithe | Costo gratuito del primo attacco; secondo costo conservato |
| `sv06-100` | Hisuian Arcanine | Costo gratuito |
| `sv08-075` | Smoochum | Costo gratuito |
| `sv08-122` | Alolan Diglett | Costo gratuito |
| `sv08-123`, `sv08-208` | Alolan Dugtrio | Costo gratuito |
| `sv10-071` | Ethan's Pichu | Costo gratuito |
| `sv10-085` | Team Rocket's Chingling | Costo gratuito |

## Risoluzione e verifica

L'integrazione si applica alla lettura del Catalogo, comprese cache vecchie e nuove analisi. Richiede corrispondenza di ID, set, numero, nome, categoria, stadio, schema e intero gameplay atteso. Un payload cambiato non viene corretto automaticamente; i dati completi successivamente pubblicati da TCGdex hanno precedenza. Le schede sconosciute con costo assente rimangono incomplete.

La scheda e la sintesi fornita all'AI espongono la provenienza della trascrizione. I payload SQLite grezzi, le identità di gioco persistite, i vincoli e i report già salvati restano invariati. I test verificano tutti i 19 casi, la precedenza di dati nuovi, il rifiuto di stampe/payload diversi e la riapertura della cache senza riscrittura dei payload.

Lettura della copia reale con il codice aggiornato: **3.275 attese, 3.275 acquisite, 3.275 gameplay completi, 0 schede mancanti**. Il numero descrive quell'inventario; non certifica nuovi set, altri errori semantici della fonte o il recupero del profilo corrotto. Il registro va rivalutato se le stampe o i testi cambiano; non è un sistema OCR automatico.

## Verifica dopo reset locale — 29 ottobre 2026 (APP-188)

La nuova segnalazione di 19 schede mancanti è stata confrontata con la diagnostica esportata dalla sessione corrente: versione installata **0.3.4**, precedente alla correzione pubblicata dalla 0.3.7. Il nuovo catalogo contiene 3.275 stampe, tutte acquisite il 29 ottobre, e le 19 lacune coincidono esattamente con i payload attesi dal registro.

Una copia coerente dell’archivio e del WAL effettivamente aperti dal processo è stata verificata con una seconda lettura degli hash e quick_check. Il CatalogStore della v0.3.9 restituisce **3.275 gameplay completi, zero schede mancanti, 19 integrazioni** sia alla prima apertura sia alla riapertura della copia; hash dei payload grezzi invariato. Nessuna scrittura al profilo personale, nessun riavvio o installazione automatica, nessuna nuova chiamata AI. Questa prova conferma la correzione sul catalogo appena scaricato; l’installazione locale va aggiornata alla release pubblicata senza azzerare nuovamente i dati.
