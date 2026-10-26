# Tre alternative UX per Pokéguru

**Studio archiviato:** il feedback successivo mantiene l'organizzazione attuale e riprende solo le fasi del piano Matchup. La proposta corrente è in [refinement](../refinement/index.html) e [UI_REFINEMENT](../../docs/UI_REFINEMENT.md).

Aprire `index.html` nel browser. La barra in alto cambia l'architettura, non il tema. `?concept=a`, `b` o `c` apre direttamente la direzione; `capture=1` nasconde la barra dello studio nelle schermate.

- **A, Banco del mazzo:** selezionare una carta, scrivere una domanda e chiedere una variante; aprire confronto e conferma.
- **B, Decisioni:** leggere il risultato e il compromesso; aprire la variante precedente per provare il blocco sulla vecchia base e la prosecuzione in un nuovo percorso.
- **C, Preparazione:** cambiare avversario e fase, aprire la carta, fare una domanda; valutare e adottare la variante, poi riconoscere la guida storica.

La modifica illustrativa è sempre Iono 4→3 / Mega Absol ex 3→4. I dati, i controlli e le risposte sono dimostrativi; non c'è persistenza né invio AI. Le azioni non implementate mostrano un'anteprima esplicita. Le schede delle carte sono segnaposto intenzionali per valutare la gerarchia, non immagini del catalogo.

Il ragionamento, le evidenze nel codice, i compromessi e i criteri di prova sono in [UX_DIRECTIONS](../../docs/UX_DIRECTIONS.md). La sostituzione del pannello sempre aperto è una proposta da decidere; il contratto della UI di produzione rimane documentato in PRODUCT e DESIGN_SYSTEM.

`verify.mjs` richiede `playwright-core` e Edge (percorso personalizzabile con `EDGE_BIN`; modulo con `PLAYWRIGHT_CORE`). Verifica percorsi locali, dialoghi, adozione dimostrativa, base superata e geometria; produce screenshot desktop e compatti. Non misura l'usabilità del prodotto reale.
