# Esito del diagnostico narrativo

03 novembre2026. **Entrambe le varianti approvate localmente e dal critico indipendente**, senza rilievi. Tre invocazioni reali, nessun retry o intervento manuale sui contenuti. Tempo runner94,97s, handle80065 terminato exit0.

Il confronto riguardava solo tre spiegazioni del nostro primo turno in uno scenario Crustle–N’s Zoroark, mantenendo congelato il registro. Non è una guida completa e non soddisfa ancora l’obiettivo delle tre guide valide.

| Variante | Schema al provider | comparison | reason | pivot | Critica |
| --- | --- | ---: | ---: | ---: | --- |
| A | Limiti originali |689/1600 |471/800 |520/1500 | Pass, nessun rilievo |
| B | Solo tre maxLength omessi nel trasporto |835/1600 |439/800 |563/1500 | Pass, nessun rilievo |

I limiti e i lettori locali erano identici per entrambe: un testo fuori misura sarebbe stato respinto. I due prompt erano byte-identici. La critica ha esaminato entrambe le varianti nella terza invocazione, con due giudizi distinti vincolati ai rispettivi prefissi.

Questo risultato sostiene la separazione fra correzione delle spiegazioni e ricostruzione del registro. **Non dimostra che i limiti nello schema causassero i troncamenti:** anche A ha funzionato. Per l’integrazione proposta mantenere quindi lo schema originale. Un solo confronto non dimostra affidabilità generale o qualità di tutte le guide.

## Testi prodotti dall’AI

I testi seguenti sono estratti dalle risposte archiviate, senza correzioni o completamenti manuali. Sono spiegazioni del prefisso esaminato, non una guida pubblicata.

### Variante A

**Confronto:** Jolting Charge prepara entrambe le linee: dopo evoluzione, le Energie su Electrike pagherebbero Flashing Barrier, mentre a Dwebble manca ancora una terza Energia per il futuro Superb Scissors. Ascension darebbe subito accesso a Crustle tramite l'effetto dell'attacco, rinunciando però all'accelerazione; concluderebbe comunque il turno senza attaccare con Superb Scissors. Collect offrirebbe una pesca, senza preparare i due nuclei energetici. La scelta conserva Switch e Voltaic per il seguito, ma lascia esposto Joltik. Nel nostro primo turno personale l'evoluzione ordinaria è vietata: oggi non si infliggono danni né si prendono Premi, e la continuità dipende dalla replica avversaria.

**Sviluppo:** Le ricerche procurano le evoluzioni dei due Base già in campo e conservano Voltaic per la linea Electrike. Mist paga Jolting Charge, che distribuisce l'accelerazione fra i due futuri attaccanti invece di concentrarla su uno solo. Manectric avrebbe così il costo di Flashing Barrier coperto; Crustle richiederebbe ancora una terza Energia. Lo sviluppo prepara due possibilità concrete, ma oggi non consente evoluzioni ordinarie e non garantisce la sopravvivenza di Joltik.

**Seguito condizionale:** Se Electrike e Dwebble restano disponibili dopo la replica avversaria, le evoluzioni in mano permetteranno di proseguire le rispettive linee quando l'evoluzione ordinaria sarà consentita. La scelta dipenderà dalla posizione risultante: Manectric ha già le Energie per Flashing Barrier, mentre Crustle necessita ancora di una terza Energia per Superb Scissors. Switch e Hero's Cape restano risorse da valutare in quel contesto. Il seguito è quindi condizionale: nessuna replica, evoluzione o azione futura è già avvenuta.

### Variante B

**Confronto:** Jolting Charge prepara entrambe le linee senza consumare Switch: le due Lightning su Electrike coprono Flashing Barrier dopo l'evoluzione in Manectric, mentre le due Grass su Dwebble lasciano ancora da assegnare una terza Energia per Superb Scissors. Ascension renderebbe invece disponibile subito Crustle e la sua protezione dagli attacchi dei Pokémon ex, ma concluderebbe il turno senza attaccare con Superb Scissors e senza accelerare le quattro Energie. Collect offrirebbe una pesca dal contenuto incerto, senza questo sviluppo energetico. La scelta privilegia quindi la preparazione dei due attaccanti rispetto all'evoluzione immediata di Dwebble. Nel nostro primo turno personale l'evoluzione ordinaria resta vietata: nessuna delle due linee può già attaccare nella forma evoluta e la continuità dipende dalla replica avversaria.

**Sviluppo:** Le ricerche procurano le evoluzioni dei due Base già in Panchina e conservano Voltaic per la linea Electrike. Usare Mist su Joltik permette l'accelerazione senza spendere Switch; distribuire le Energie prepara entrambi gli attaccanti invece di concentrarle su uno solo. Hero's Cape resta disponibile per scegliere in seguito il destinatario. Lo sviluppo effettivo è dunque energetico: le evoluzioni restano in mano e Joltik rimane esposto.

**Seguito condizionale:** Se Electrike e Dwebble restano disponibili dopo la replica avversaria, le evoluzioni già in mano consentono di proseguire sulle linee preparate. Manectric avrebbe già il costo di Flashing Barrier coperto; a Crustle mancherebbe ancora una terza Energia per Superb Scissors. Voltaic è conservata per il bonus ai danni della linea Lightning, mentre Switch e Hero's Cape mantengono aperte le rispettive scelte. Queste possibilità restano condizionali: il registro si ferma al globale 2, senza garantire la sopravvivenza di Joltik o materializzare il turno successivo.

## Integrità e contabilità

Il replay dei tre raw e dei relativi schemi ricostruisce le stesse stringhe e gli stessi due pass critici. Registro non narrativo, inventario e azioni restano identici alla fonte; nessun campo fisico è riscritto. Anche i tre budget dinamici vengono ricalcolati con i campioni disponibili prima di ogni richiesta e corrispondono agli input archiviati. Nessuna chiamata nel replay.

Massimo autorizzato3, usate3; baseline55 v28 +3 = **58 nel ciclo**, più76 precedenti = **134 storiche**. Restano46 nel pool104, delle quali40 riservate alle due guide successive. Crustle ha6 residue entro64. Non usare il saldo del pool per oltrepassare il tetto per guida. I due job successivi e gli held-out non sono stati avviati. Il job principale resta a55 perché le tre nuove sono nel job diagnostico: nei budget futuri sommare entrambi, mai ripartire da55.

Nessuna adozione delle varianti, prosa finale o report salvato. Database originario invariato,470 file congelati intatti; archivio diagnostico480 file con SQLite, binding/chunk esatti. Esito0/3 guide reali e app ancora defaultv27/guardv28. L’approvazione del diagnostico non riapre la campagna principale.

Evidenze: .verify/app225-segments-20261102/narrative-ab/{results,integrity,authorization,seal}.json, narrative-ab-live.log, narrative-ab-integrity.log e narrative-ab-archive/manifest.json. La proposta di collegamento è in [NARRATIVE-REPAIR-INTEGRATION.md](NARRATIVE-REPAIR-INTEGRATION.md).
