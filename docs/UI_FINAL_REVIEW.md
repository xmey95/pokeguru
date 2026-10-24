# Revisione grafica finale — APP-080

24 ottobre 2026 · Windows · ramo `task/production-design-system`  
Base della revisione: `d7816c6`. Perimetro: renderer, presentazione degli stati, test UI e documentazione.

## Esito

Revisione completata per Lista, importazione/vincoli, Thread/confronto/adozione, Matchup/revisioni, Catalogo, Eventi Play/Regional e Impostazioni AI. Le correzioni mantengono la direzione visiva e le dimensioni già condivise. I controlli eseguiti non hanno rilevato overflow orizzontale o sovrapposizioni fra contenuto e lista persistente.

## Correzioni

| Incoerenza osservata | Correzione applicata |
| --- | --- |
| In Thread/Matchup “Pronta per controllo” compariva sia nell'intestazione sia nella lista, una volta verde e una neutra | Rimosso il duplicato nell'intestazione. Il pannello mantiene lo stato neutro; il verdetto Standard resta nella Lista |
| “Lista corrente” e “Lista principale” indicavano lo stesso oggetto | “Lista principale” uniforme in titolo, importazione, vincoli, confronto e messaggi del renderer |
| Pannelli equivalenti usavano titoli da 20 e 24 px; la scheda Catalogo saltava da h1 a h3 | Titoli interni a 20 px e nome della carta in h2, coerente con il dettaglio Eventi. Titoli pagina/sezione e titoli di lettura conservano livelli distinti |
| Annullamento con peso visivo diverso nei moduli | Annulla come azione testuale in importazione e creazione Thread, come nei vincoli e nelle preferenze. Nel dialogo di adozione resta un pulsante secondario ben visibile |
| Azioni del Thread più ravvicinate rispetto agli altri moduli | Spazio di 12 px e allineamento coerente dei pulsanti |
| Un avviso AI usava una classe senza stile | `warning-banner` ora condivide colori, bordo, spazi e corpo dei messaggi di attenzione |
| Una ricerca vuota lasciava un pannello bianco nel Catalogo e due messaggi in Eventi | Un solo stato a tutta larghezza, con Azzera filtri e ritorno del focus alla ricerca. Il torneo selezionato resta invariato |
| Un modello/livello del Thread non più disponibile poteva apparire come preferenze globali/predefinito, pur conservando un override | Valore esplicito conservato, Personalizzata nella disclosure, errore o incertezza visibile e Ricarica modelli. Nessun cambio alla configurazione inviata o alle API |
| Nota del modulo Nuovo progetto più prominente degli altri metadati | Stesso stile secondario delle note negli altri moduli |

## Regole confermate

- Sidebar desktop **224 px**, lista persistente **384 px** sopra 1240 px; sotto la soglia, dock di **220 px**. Scorrimento indipendente; Lista usa l'intera area centrale.
- Una famiglia tipografica di sistema; testo UI 14 px, lettura delle carte/guide 15 px, metadati almeno 12 px.
- Verde petrolio per azioni/selezione, viola per proposta, ambra per incertezza, rosso per errore. Un risultato incompleto non diventa uno stato positivo.
- Dati principali subito disponibili; metadati, provenienza e manutenzione apribili. I limiti necessari per interpretare un risultato restano visibili.
- Adozione dell'intera candidata solo dopo conferma manuale. Indietro/Avanti conserva il contesto senza rieseguire salvataggi o richieste.

## Matrice delle schermate finali

Le schermate usano un profilo separato con lista, candidate, guide ed eventi dimostrativi; il catalogo è il campione già acquisito. Account, modelli e prova AI sono simulati.

| Sezione | 1440×900 | 1280×720 | 640×720 |
| --- | --- | --- | --- |
| Lista | [Apri](design-review/final/lista-1440.png) | [Apri](design-review/final/lista-1280.png) | [Apri](design-review/final/lista-640.png) |
| Thread | [Apri](design-review/final/thread-1440.png) | [Apri](design-review/final/thread-1280.png) | [Apri](design-review/final/thread-640.png) |
| Matchup | [Apri](design-review/final/matchup-1440.png) | [Apri](design-review/final/matchup-1280.png) | [Apri](design-review/final/matchup-640.png) |
| Catalogo | [Apri](design-review/final/catalogo-1440.png) | [Apri](design-review/final/catalogo-1280.png) | [Apri](design-review/final/catalogo-640.png) |
| Eventi Play | [Apri](design-review/final/eventi-1440.png) | [Apri](design-review/final/eventi-1280.png) | [Apri](design-review/final/eventi-640.png) |
| Impostazioni AI | [Apri](design-review/final/ai-1440.png) | [Apri](design-review/final/ai-1280.png) | [Apri](design-review/final/ai-640.png) |
| Confronto candidata | Coperto anche dalla regressione workspace | [Apri](design-review/final/confronto-1280.png) | [Apri](design-review/final/confronto-640.png) |
| Regional | Coperto dal percorso Eventi | [Apri](design-review/final/regional-1280.png) | [Apri](design-review/final/regional-640.png) |
| Ricerca senza risultati | Componente fluido condiviso | [Apri](design-review/final/ricerca-vuota-1280.png) | [Apri](design-review/final/ricerca-vuota-640.png) |

Ulteriori stati: [Thread con scelta AI da verificare](design-review/final/thread-ai-1280.png), [compatto](design-review/final/thread-ai-640.png), [conferma adozione](design-review/final/adozione.png), [importazione](design-review/final/importazione-1280.png).

## Verifiche eseguite

| Percorso | Esito e copertura |
| --- | --- |
| `npm run build` | Typecheck e build riusciti |
| `node tests/workspace-ui-live.mjs` | Lista vuota/caricata, progetto/selettore, Thread/candidata, Matchup e lista persistente; anche 1241/1240×720, 1024×768, risorse a 640×580 |
| `node tests/import-ui-live.mjs` | Annullamento, import file, errori/rollback, riprova, letture tardive, isolamento, riapertura, tastiera |
| `node tests/deck-adoption-live.mjs` | Confronto, conferma manuale con focus contenuto/Escape, adozione intera, base superata, riapertura; dati temporanei |
| `node tests/thread-composer-ui-live.mjs` | Modalità, scrittura, salvataggio osservazioni, errori, richieste pendenti; nuovi scenari per modello/livello assenti, ricarica, ritorno con Indietro e scelta globale |
| `node tests/catalog-ui-live.mjs` | Gestione/ricerca, filtro dal set, tastiera, progressi e avvisi; ricerca vuota, azzeramento di query e set, focus restituito |
| `node tests/catalog-card-ui-live.mjs` | Scheda e stampa coerenti, immagini/testi assenti, promo/incertezza, fonte, vincolo e ritorno; ripetuto dopo l'allineamento del titolo |
| `node tests/tournament-ui-live.mjs --offline` | Entrambe le fonti, filtri/selezioni/liste, dati mancanti/parziali, gestione e ripresa; stato vuoto unico, azzeramento e focus |
| `node tests/ai-settings-ui-live.mjs` | Salvataggio/annullamento, prova separata, file non leggibile, modelli mancanti, errori e operazioni durante la navigazione |
| `node tests/matchup-switcher-ui-live.mjs --guide-links --discussion --ai-options --navigation` | Guida corrente/storica/assente, selettore, revisioni, errore/riprova, override, riferimenti, storico/bozze/scorrimento e isolamento progetti |
| Demo complessiva | 24 viste misurate a tre dimensioni, ispezione visiva, nessun overflow/sovrapposizione rilevato. Contrasto minimo del testo **5,16:1**; [misure](design-review/final/measurements.json) |

Tutti i percorsi elencati sono passati. Le aspettative di due test erano inizialmente rimaste sulla dicitura “lista corrente”: aggiornate e prove rieseguite. I test UI utilizzano archivi isolati; account, generazioni e acquisizioni sono controllati dove indicato nei rispettivi test. Non attestano nuove integrazioni remote.

## Prova manuale nella demo aperta

1. **Lista:** aprire una carta e i suoi dettagli; provare Importa / sostituisci → Annulla.
2. **Thread → Piano più rapido:** Apri confronto; consultare contemporaneamente la lista principale; richiudere con Escape.
3. **Matchup → Gardevoir ex · fixture UI:** leggere il piano, aprire Discussione e revisioni, seguire un riferimento interno e tornare con Indietro.
4. **Catalogo:** cercare Mega Absol; aprire Stampe e metadati. Cercare una parola inesistente e usare Azzera filtri.
5. **Eventi:** alternare Play online e Regional; filtrare un giocatore, poi azzerare una ricerca senza risultati.
6. **Impostazioni AI:** cambiare modello/livello, salvare o annullare, eseguire la prova simulata.
7. Ridimensionare la finestra, usare Tab, Shift+Tab, Enter, Escape e Alt+frecce.

## Limiti e prossimo passo

Verificato su Windows nella finestra Electron; Linux, lettore di schermo e fattori di scala OS elevati richiedono una prova nel relativo ambiente. L'audit del contrasto esclude controlli disabilitati, immagini e contenuti chiusi: non è una certificazione completa di accessibilità.

Nessuna nuova acquisizione o generazione AI reale, né deduzione di legalità/qualità competitiva dalle fixture. Nessuna modifica a backend, database, prompt o validatori. Ramo locale, nessun merge, release o avvio di I4. Il prossimo passo è la prova dell'utente della coerenza complessiva e del ritmo di lettura.
