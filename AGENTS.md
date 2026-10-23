# Istruzioni di progetto per Codex

## Avvio di ogni sessione

1. Leggi `README.md`, `docs/PLAN.md`, i requisiti in `docs/PRODUCT.md` e i task pertinenti in `docs/BACKLOG.md`; consulta `docs/DECISIONS.md` per scelte e fonti.
2. Controlla lo stato reale del repository e le modifiche presenti prima di intervenire. Non sovrascrivere lavoro altrui.
3. Individua fase e incremento autorizzati dall'ultima istruzione dell'utente. Un task `Ready` non autorizza da solo lo sviluppo.
4. Seleziona un task `Ready` coerente con il perimetro autorizzato; comunica brevemente obiettivo e verifica prevista.

## Lavoro

- `docs/BACKLOG.md` è l'unica fonte dello stato dei task; `docs/PLAN.md` governa ordine e obiettivi. Usa ID stabili `APP-NNN` e requisiti `R-NN`.
- Usa Kanban leggero: `Backlog`, `Ready`, `In progress`, `Blocked`, `Done`. Mantieni al massimo un'attività principale `In progress`.
- Una scelta tecnica reversibile nel task si risolve autonomamente; registra le decisioni rilevanti. Registra idee fuori ambito nel backlog senza inserirle silenziosamente nell'incremento.
- Aggiorna il piano se una scoperta cambia dipendenze o ipotesi. Procedi solo nell'ambito del task o incremento richiesto.
- Non dichiarare verificate integrazioni con soli mock. Non dichiarare svolte prove non eseguite.

## Ready e Done

`Ready`: risultato circoscritto, criteri osservabili, dipendenze e decisioni bloccanti risolte, dimensione valutabile autonomamente. Lo stato indica preparazione tecnica, non autorizzazione.

`Done`: risultato presente e conforme ai criteri, verifiche pertinenti eseguite ed esito registrato, limiti espliciti, documenti e riferimenti aggiornati. Per codice, concentra i test sui rischi di import/export, persistenza, vincoli, isolamento dei progetti e integrazioni; per documenti controlla coerenza e tracciabilità.

## Chiusura e ripresa

Registra risultato e verifiche nel task, aggiorna il suo stato in `docs/BACKLOG.md` e la sezione **Ripresa** di `docs/PLAN.md`; riassumi limiti e decisioni necessarie. Un task interrotto resta `In progress` o `Blocked` con nota concreta. La nuova sessione deve poter riprendere dai file senza memoria della chat.
