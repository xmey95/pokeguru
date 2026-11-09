# APP-232 — Esito della campagna finita v2

**Aggiornamento successivo:** [candidati e audit separati](AUDIT-CANDIDATES.md) sono ora implementati e verificati offline su istruzione dell’utente. Questo documento conserva l’esito reale della campagna precedente; nessuna nuova prova reale avviata.

5 novembre 2026. **Prova conclusa con esito negativo; attività incompleta.** Crustle–N’s Zoroark si ferma prima di completare il primo scenario. Alakazam/Dudunsparce–Basic Box e Dhelmise–Lucario/Hariyama non sono stati avviati, rispettando lo stop globale concordato. **0/3 nuove guide valide.**

## Autorizzazione ed esecuzione

Consenso `call_68a13f3eb8eb4c5393a9453d34fadb20/0`: «Autorizzo la ripresa entro 500/1500, riserva 24». Seal `0f0ba546e7eb06fa4ea009c76e8b034613045b26b1f8040f8a6f6ebe4eba1ed3`, 681 input congelati. Nessuna modifica al codice durante la prova, nessun contenuto AI corretto manualmente, nessun caso held-out utilizzato.

Runner 81301, terminale exit 1; durata del matchup 547.846 ms, circa 9 minuti e 8 secondi. Ripreso lo stesso job `8d09e700-7b4d-44c8-8cf8-96ded5568d2b`, riutilizzando il piano già pagato. **10 nuove invocazioni**, tutte riuscite come chiamate al provider, senza nuovi errori di formato o di output-limit. Uso misurato: 443.422 token di input e 17.818 di output. Non è una misura separata dei token di ragionamento né una stima di costo.

Contabilità cumulativa conservata: **268 v28** (265 principali e 3 diagnostiche), **344 storiche** includendo le 76 precedenti. Restano 232 chiamate sul primo matchup e 1.232 nel pool entro i tetti 500/1.500 e riserva 24. Sono massimi residui, non un’autorizzazione a riaprire la prova conclusa.

## Cosa ha funzionato e cosa ha bloccato

Ogni proposta ha prodotto un quadro e quattro turni storici con richieste separate. I dieci frammenti superano schema e provenienza; nessun frammento è stato presentato come setup fisicamente approvato.

1. La prima costruzione completa è respinta perché un evento di assegnazione Energia non elenca esattamente tutte le alternative disponibili prima del consumo delle carte in `decisionProof.cards`.
2. La seconda costruzione supera quel controllo e viene respinta per una promozione difensiva omessa in `tactical.promotions`: Dwebble `sv10-011` è un candidato insieme a Electrike `me05-023`, ma l’elenco contiene soltanto Electrike.

L’originale AI **menziona Dwebble e confronta la sua promozione nel motivo dell’evento**. Il difetto osservato è quindi la mancata copertura nel campo strutturato richiesto, non la dimostrazione che l’AI non abbia considerato affatto quel Pokémon. Non abbiamo trasferito automaticamente il testo in un nuovo giudizio strutturato, né disattivato il controllo. Non è stata certificata la legalità completa del setup o la qualità della futura guida.

Dopo due costruzioni il limite locale persistente arresta la generazione con `draft-limit`. Non si è raggiunto il limite complessivo delle chiamate. Nessun riesame indipendente della premessa, scenario completo, capitolo, esercizio o approvazione finale è stato ottenuto in questa campagna. Zero report salvati.

## Verifiche successive senza AI

- Archivio immutabile `campaign-finite-v2-archive/manifest.json`: **699 file** verificati, inclusi i 681 input congelati, i database e gli originali delle chiamate di questa ripresa.
- I 681 input rimangono identici. Tutti e tre i database correnti coincidono logicamente con i backup su schema e **39 tabelle**, inclusa `sqlite_sequence`. Le sorgenti della prima campagna restano intatte. Il controllo preliminare sulle sole 38 tabelle applicative è conservato separatamente.
- Due riaperture del generatore reale su una copia restituiscono lo stesso `draft-limit`, con **zero invii al provider**, 13 tentativi del job e 249 campioni di calibrazione invariati. Nessuna nuova risposta inventata, nessuna trasformazione di un rifiuto noto in approvazione.
- Le verifiche precedenti di 413 casi, typecheck e build riguardano il codice congelato effettivamente usato. Non sono una validazione competitiva delle guide. Il test UI preparato per guide approvate non è stato eseguito: non esiste una guida approvata da mostrarvi.

Evidenze locali in `.verify/app225-segments-20261102/`: `campaign-finite-v2/terminal.json`, `app232-finite-v2-diagnosis.json`, `app232-finite-v2-verification.json`, `app232-finite-campaign-v2-live.log`. Lo stop e l’ordine dei matchup sono verificati dall’archivio.

## Implicazione generale

La partizione ha eliminato l’errore di output nella prova osservata; non dimostra che tutte le richieste future o gli altri matchup riusciranno. Il metodo continua a chiedere all’AI di ricostruire correttamente insiemi di candidati che il codice sa già derivare, poi respinge l’intero setup quando una riga manca. La correzione di un primo rilievo scopre il successivo e ricompra un quadro e quattro turni. Due costruzioni sono state insufficienti in questo caso; aumentare il budget globale non modifica quel meccanismo.

La verifica del nuovo codice non trova nomi o ID dei tre mazzi nel costruttore finito, nelle sue istruzioni o nello schema vincolato: le carte ammesse provengono dalle liste del packet. Questo attesta l’assenza di quei vincoli espliciti nei file esaminati; **la generalità della generazione non è dimostrata**, perché nessuno dei tre nuovi matchup ha ancora prodotto una guida valida e gli altri due non sono stati eseguiti.

Prima di proporre un’altra prova occorre una decisione sul metodo: preparare dal registro gli elenchi esatti di candidati e chiedere all’AI i giudizi per quelle chiavi; correggere soltanto l’audit difettoso con registro immutabile, conservando poi tutti i gate completi e il riesame indipendente. Questa è una proposta, **non una modifica implementata o una ripresa autorizzata**. Non si deve inventare una motivazione per riempire una riga mancante o considerare il controllo superato dal solo budget.

La campagna autorizzata è conclusa. Nessun nuovo tentativo automatico o aumento dei tetti è predisposto. APP-232 resta In progress e APP-225 Blocked. Restano tre guide reali valide, verifica UI/persistenza, audit di generalità, policy applicativa e build locale per l’utente. Default v27, guard v28 e profilo personale invariati; il nuovo percorso non è stato attivato nell’app.
