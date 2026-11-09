# APP-248 — Aggregati, fattore neutro e ripresa autenticata

06-11-2026. Correzione generale e verifiche **solo offline**. Nessuna chiamata AI reale, nessun contenuto della guida modificato manualmente. Restano 412 chiamate v28, 488 storiche e 0/3 nuove guide valide. I tetti 551/1500 e la riserva 24 sono invariati. Nessuna campagna riaperta.

## Correzione dei rilievi

Il primo critico sosteneva che sei Premi distribuiti su stampe diverse non fossero rappresentabili. Il validatore esistente accetta già cinque addizioni dei sei saldi autentici, nella stessa finestra e dello stesso lato, ottenendo sei. Le istruzioni ammettevano i calcoli ma vietavano genericamente di usarli per disponibilità di inventario: ora distinguono il saldo di una singola stampa dal totale completo di una zona. Non occorre un fatto di contesto dedicato per ogni somma.

Il codice fornisce al critico esempi aritmetici verificati dal lettore esistente: somme complete di zona/lato/finestra e identità su misure positive esatte già presenti numericamente nel testo. Non vengono aggiunte costanti libere, saldi inventati o eccezioni per carte/matchup. Non si sommano finestre, lati o zone diversi. Una somma con più di nove saldi non viene presentata come una prova entro gli otto passi. I cataloghi sono suggerimenti non esaustivi; non approvano le affermazioni o l’applicabilità degli effetti. Restano il controllo del testo intero, i findings, unproven, la critica tattica e tutti i lettori finali.

### Verifica del ×1 originale

Nel secondo originale Yveltal usa Clutch, danno stampato20, su Dwebble con70 PS. Il tipo Darkness non corrisponde alla Debolezza Fire del difensore; Dwebble non ha Resistenza. Le carte sul campo non hanno Abilità; il registro del primo round contiene soltanto le assegnazioni delle Energie Base e Clutch, senza Trainer giocati, Strumenti, Stadi, cambi o modificatori di PS. Sono state ispezionate fonti e risorse effettive della finestra, non soltanto la frase del modello. Risultato:20 danni, nessun KO; il fattore neutro è coerente con questo turno iniziale.

L’identità20/20=1 è rappresentabile dal validatore corrente usando due riferimenti alla stessa misura stampata pertinente. Non serve trovare una carta che stampi il numero1, né prendere una copia da una zona estranea. Questo calcolo dimostra soltanto l’identità: non prova da solo che Debolezza, Resistenza o altri effetti siano inapplicabili.

È consegnata anche una fonte autenticata e versionata sulla procedura dei danni, esplicitamente qualificata come **parafrasi curata**, distinta dagli estratti letterali dei Premi. Segue il [regolamento ufficiale, pagine stampate14 e20](https://assets.pokemon.com/assets/cms2/pdf/trading-card-game/rulebook/par_rulebook_en.pdf): effetti sull’attaccante, Debolezza/Resistenza pertinenti ai tipi e quindi effetti sul difensore; i segnalini messi direttamente hanno un percorso distinto. La fonte non fornisce un moltiplicatore numerico e non certifica il campo. Le istruzioni richiedono ancora la verifica indipendente dell’applicabilità. Negativi e raw originali restano identici: nessun riesame è stato riscritto o promosso a pass.

## Ripresa senza ricomprare i riesami

Cambiare le istruzioni cambia l’identità del trasporto. I replay intermedi hanno rilevato che questo poteva ricomprare un riesame protocollo4 e ricostruire gli allegati storici con fonti nuove, invalidando una ricevuta già pagata. Il recupero ora considera anche i riesami4 e riusa l’aggregato autenticato prima di dimensionare nuove richieste, solo con gli stessi scope, pacchetto, contesto, fatti e target completi. Legge tutti gli originali dei figli e conserva il loro verdetto. Testo/fonte/target diverso o originale mancante non ottengono il riuso. Gli allegati dei feedback sono quelli della richiesta originale, non quelli ricostruiti dalla versione corrente del codice.

Due riaperture del job reale su copia mantengono draft-limit,25 tentativi/25 raw,392 campioni,un setup costruito e due negativi dello stesso slot, senza raggiungere il provider. I limiti di due errori/due giudizi negativi e i16 crediti non vengono azzerati dalla correzione. Il job esistente **non è ammesso a una nuova ripresa reale**.

## Verifiche

- **283 test distinti su29 file pertinenti passati**, non la suite dell’intero repository. Nessun caso delle copie archiviate è conteggiato. Coperti somme eterogenee, lato/zona/finestra, saldi errati, somme parziali, limite otto passi, identità pertinenti, formule stampate non risolte, fonti alterate, negativi non promossi, recupero dei riesami4 e dell’aggregato prima di nuovi invii, mancato riuso con testo diverso. I test mirati fanno parte di questo totale.
- Typecheck e build Electron passati. Percorso applicativo completo con due liste distinte, due setup con azioni sensibili e audit inizialmente nulli, tutti i lettori/critiche, salvataggio, rilettura JSON e recupero senza invii:38 risposte sintetiche, zero crediti di riparazione,37.248 s a freddo e0.871 s al recupero,735.88 MiB, entro 60 s/10 s/768 MiB.
- UI sulla guida sintetica a 1440/1280/640 px,otto capitoli/due scenari,zero errori renderer. Anche la guida sintetica storica completa viene recuperata senza provider,36 tentativi conservati.
- Quattro replay di avvio/ripresa:due riaperture dello stesso job reale fermo senza invii,nuovo primo job respinto164>139,altri due avvii su copie isolati prima del provider e con392 campioni. Nessuna chiamata reale o modifica ai database sorgente.
- Nove archivi immutabili verificati per 802/799/799/794/798/784/783/903/892 file;tre database reali e39 tabelle ciascuno identici all’archivio terminale. Quattro source/test preesistenti cambiano,tre file si aggiungono;gli altri569 file qualificati restano identici. Manifest corrente576 file.

Le risposte sintetiche verificano percorso e controlli, non la correttezza del modello reale né la convergenza su tutte le guide. Nessuna nuova guida reale approvata o pubblicata. I casi held-out restano esclusi e il gate di rete dell’app resta chiuso.

## Budget prima di altra rete

| Voce | Usate | Residue | Tetto |
|---|---:|---:|---:|
| Prima guida, cumulativa |412|139|551|
| Seconda guida |0|500|500|
| Terza guida |0|500|500|
| Ciclo v28 |412|1088|1500|

76 chiamate storiche precedenti restano separate:totale 488. Riserva 24 per ciascuna guida successiva,392 campioni e fattore massimo1,611489961838394 conservati. Il job corrente ha consumato 6 crediti dei 16;10 residui non annullano i due negativi vincolanti.

Le due nuove richieste ombra, con contesto autentico completo, fonti e prove aritmetiche, rientrano nel target:66.985 input/10.000 output e71.502 input/20.000 output, codifica reversibile shared-v3. Prenotazione prudenziale24 chiamate future; sono diagnostici di dimensionamento, non richieste ammesse oltre lo stop né previsioni di completamento.

Un nuovo job completo mantiene base 148+16 crediti=massimo 164, contro 139 disponibili sulla prima: **mancano 25 di disponibilità per l’ammissione**, non25 chiamate sicuramente necessarie. Non sono autorizzati un aumento, un nuovo job o una riapertura in questo incremento. Un’ipotetica campagna di tre job freschi prenoterebbe massimo 492 nuove chiamate,904 v28/980 storiche, ma richiederebbe almeno576 cumulative sulla prima: supera 551 e quindi non viene avviata. Questi massimi non garantiscono successo né sostituiscono i gate effettivi di token e revisione.

## Evidenze e stato

Evidenze in .verify/app248-aggregates-20261106: verification.json, integrity.json, arithmetic-and-token-diagnostic.json, stopped-replay.json, replay-0-fresh.json, replay-1.json, replay-2.json, standalone-integration.json, completed-legacy.json, ui/result.json e budget.json. Report di regressione .verify/app248-final-regression-tests.json; build .verify/app248-build-final.log. I risultati intermedi con copie archiviate dei test non sono conteggiati come verifiche distinte del codice corrente.

APP-248 Done per la correzione e verifica offline soltanto. APP-232/APP-225 restano Blocked; obiettivo delle tre guide e app utilizzabile dal vivo incompleto. La prossima prova richiede una decisione esplicita su un percorso ammesso dalla contabilità e non può ignorare lo stop del job esistente. Nessun nuovo runner reale, grant o aumento automatico preparato.
