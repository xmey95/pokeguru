# APP-255 — Generalità del percorso e requisiti ancora aperti

7 novembre 2026. Riesame offline in sola lettura del codice congelato per la v19. **Nessuna nuova chiamata reale, nessun contenuto AI modificato, nessuna concessione adottata.** Restano 453 chiamate v28 / 529 storiche, 0/3 nuove guide valide e la richiesta di consenso APP-253 già pendente. Il riesame tecnico qui concluso non certifica qualità competitiva, affidabilità universale o completamento dell’obiettivo.

## Dipendenze dagli esempi

Il controllo sulle **41 istruzioni effettivamente inviate** nel job corrente non trova nomi del pilota o dei tre nuovi matchup. Sono controllati i prompt archiviati tramite il loro hash; i nomi nelle liste e nelle schede rimangono correttamente nei dati personalizzati. Le 40 risposte complete e il tentativo interrotto sono contati separatamente.

La ricerca mirata nei file delle guide trova tre riferimenti nominativi nei contratti storici: due righe «Controlli del pilota» e una parte del contratto v10. Non è corretto affermare che non esistano nel repository. Il percorso finito usa `guideFiniteInstructions` e `guideFinitePhysicalRules`, che mantengono regole generali; i contratti storici restano necessari per leggere e autenticare gli originali precedenti. I test verificano anche la stabilità dei loro byte. Le vecchie stringhe non compaiono nelle istruzioni dei 41 invii correnti.

Sono ricercati nel sorgente applicativo anche **56 identificativi** dei casi, progetti, job e stampe del pacchetto. Nessun ramo di esecuzione dipende da queste identità. L’unica corrispondenza è `me02.5-016` nella tabella preesistente delle trascrizioni del catalogo: ha fonte dell’immagine e impronta, e il relativo adapter richiede identità e gameplay esatti, senza sovrascrivere dati upstream cambiati o dedurre attacchi gratuiti per stampe ignote. Non è un’eccezione tattica o un’approvazione della guida. Tre test specifici del catalogo confermano questi vincoli. L’audit non ricontrolla dal vivo quella fonte e non attribuisce alle trascrizioni la copertura dell’intero catalogo.

Questa è una ricerca mirata accompagnata dalla lettura del flusso attivo, non una prova formale dell’assenza di qualsiasi dipendenza possibile da qualsiasi carta. Il risultato sostiene l’assenza di scorciatoie per gli esempi esaminati; la qualità ottenuta da altri mazzi resta una verifica distinta.

## Personalizzazione e controlli

| Aspetto | Evidenza corrente | Portata effettiva |
| --- | --- | --- |
| Lista personale | `resolveGuideList` risolve stampe e quantità e richiede 60 carte; `buildGuidePacket` conserva originale e riconciliazione; i tre packet congelati coincidono con tutte le stampe/quantità delle rispettive selezioni | Non sostituisce carte mancanti con quelle del pilota |
| Singolo matchup | Liste avversarie complete e separate nel packet; piano e casi collegati alla lista scelta; varianti con fonti distinte | Nessun mazzo avversario immaginario ottenuto sommando liste |
| Identità delle prove | Cambiando progetto, quantità della nostra lista, quantità avversaria o hash di una fonte cambia `packetHash` | Controllo di dipendenza, non giudizio tattico |
| Correttezza delle linee | Lettori del registro, transizioni, risorse, attacchi, costi, Premi, audit quantitativi e riesami obbligatori | Gli effetti e la competenza della scelta richiedono anche il giudizio del critico; una ricevuta contabile non li certifica |
| Approvazione finale | `assertFiniteGuideApproval` ricostruisce richieste e originali, verifica scope, fonti e tutti i pass finali senza rilievi; sigilli e consumo coerenti | Il solo output del modello o il successo del trasporto non basta |
| Costo e arresti | Massimo locale, due errori di formato/due negativi, riserva persistente, preflight e scaling | Un arresto finito è garantito dal limite; l’esito valido entro quel limite non è garantito |

Fonti locali lette: `src/main/matchup-guide-packet.ts`, `guide-causal-contract.ts`, `guide-finite-instructions.ts`, `guide-finite-plan.ts`, `guide-finite-approval.ts`, `guide-delivery-policy.ts`, `guide-delivery-allowance.ts`, `src/shared/guide-analysis-scope.ts` e `src/shared/guide-delivery.ts`.

## Profilo applicativo e limiti di generalità

L’app seleziona due casi, **due repliche per caso**, otto capitoli e due esercizi. Le 72 forme e 36 combinazioni asimmetriche della specifica eseguibile comprendono anche tre/quattro repliche: il loro successo simulato **non dimostra che quelle configurazioni siano abilitate nel generatore dell’app**. Lo schema del piano bounded mantiene esattamente due risposte; accesso o difesa non confrontati devono essere dichiarati con motivazione e fonti.

I limiti dimensionali sono globali: massimo due round di setup, sei eventi per turno, dodici movimenti e otto percorsi Energia per evento; audit fino a 600 caratteri. Un originale più grande viene respinto, senza eliminare azioni necessarie. Questi limiti non sono selezionati in base al mazzo, ma possono escludere linee complesse di qualsiasi mazzo. Il caso principale richiede ancora tre turni; il percorso documenta lo stop quando tutte le risposte terminano prima del seguito necessario. Non equivale alla copertura di tutte le posizioni legali di Pokémon TCG.

La copertura finita non dimostra ottimalità, vittoria forzata, minima globale o assenza di risposte non confrontate. Un consiglio smentito da una risposta plausibile deve essere corretto o circoscritto; non può diventare valido semplicemente chiamando quella risposta un limite. La critica deve verificare realismo, scelta delle linee e testo circoscritto, oltre ai conteggi deterministici.

La proposta APP-253 porta i crediti locali 16→32 entro lo stesso massimo 164. Aumenta il margine delle correzioni, **non** prova sostenibilità del costo medio, riuscita del primo job o convergenza generale. Con 0/3 nuove guide valide manca ancora la misura principale della riuscita. Gli held-out restano esclusi; nessun risultato competitivo su casi non autorizzati viene inventato.

## Audit di completamento dell’obiettivo

| Requisito dell’obiettivo | Evidenza autorevole | Stato |
| --- | --- | --- |
| Gate prestazionale APP-250 | Qualificazione APP-252: percorso completo sintetico 35,703 s / 1,080 s / 654,324 MiB e avvii v19 entro le soglie originali | Superato offline |
| Conservare le 30 risposte originali | Archivio v18 confrontato con v17; oggi 40 raw e 9.768 riferimenti intatti, tre DB / 39 tabelle | Verificato |
| Controlli e scaling | Source congelati, 361 casi pertinenti APP-252, lettori completi e confronto del prompt pendente | Verificato per il perimetro delle prove, senza certificazione universale delle regole |
| Personalizzazione lista/matchup | Packet, hash delle quattro mutazioni, scope e test di isolamento | Presente e verificata tecnicamente |
| Tre nuove guide AI valide | Esito terminale v18: 0/3; v19 preparata, senza autorizzazione o avvio | **Incompleto** |
| Persistenza, riapertura e UI delle tre guide | Percorso sintetico completo e UI positivi; nessuna delle tre nuove guide reali completa | **Incompleto sul risultato richiesto** |
| Generalità senza eccessiva dipendenza dagli esempi | 41 istruzioni, ricerca mirata delle identità, test di contratto e immutabilità | Riesame tecnico positivo con i limiti sopra; **qualità reale ancora da verificare** |
| App pronta alla prova finale dell’utente | `GUIDE_DELIVERY_NETWORK_READY=false`; API di concessione presente, comando utente APP-254 assente | **Incompleto** |
| Tetti e stop concordati | 453/529,576/500/500,pool1500,riserva24; v18 terminale, nessun avvio v19 | Rispettati; nessuna nuova autorità implicita |

## Prove di questo incremento

Gli artefatti sono in `.verify/app255-generality-20261107`: audit dei prompt e degli identificativi con impronte, verifica delle tre nostre liste esatte e delle 4/5/8 liste avversarie complete nei rispettivi packet, 22 test aggiuntivi in quattro file (istruzioni generiche, copertura finita, compatibilità del packet, riparazioni native), tre test del catalogo. Tutti passano, senza fallimenti o skip. Sono verifiche aggiuntive sui sorgenti congelati, non nuovi test introdotti né una nuova esecuzione dell’intera suite. Nessun mock è presentato come integrazione AI reale.

Le 780 impronte del sigillo v19 e i tre database sorgente sono ricontrollati; il codice, i dati preparati e il consenso pendente restano quelli di APP-253. Questo documento non richiede un nuovo consenso e non cambia la proposta.

APP-255 conclude soltanto il riesame offline e la matrice delle lacune. Il prossimo passaggio reale resta subordinato alla decisione già richiesta sulla quota locale e sulla riapertura della campagna congelata. L’obiettivo generale rimane attivo e non completato.
