# Pokéguru v0.3.11

Le nuove analisi AI usano statistiche deterministiche su tutte le partecipazioni Evento pertinenti e recuperano gli originali necessari alla richiesta. Vengono eliminati i passaggi AI obbligatori di sintesi dell'intero archivio: il modello approfondisce i dubbi che possono cambiare la risposta e produce una risposta proporzionata al compito.

Modello e livello di ragionamento restano quelli scelti. Carte nuove nella bozza richiedono i testi originali e una revisione. Restano i controlli su fonti, identità delle carte, 60 carte, vincoli, ACE SPEC e ammissibilità della candidata, con adozione esclusivamente manuale.

## Misure e limiti

Nel confronto live sullo stesso campione congelato di 32 partecipazioni, con gpt-6.1-sol:

| Compito | Prima | Nuovo flusso |
| --- | ---: | ---: |
| Domanda su carta | 19,1 s | 21,7 s |
| Sostituzione con vincoli | 147,3 s | 21,0 s |
| Miglioramento generale | 570,7 s | 84,0 s |
| Guida matchup | 433,0 s | 48,6 s |
| Revisione | 73,8 s | 51,2 s |

Totale **20m44s → 3m47s (−81,79%)**, chiamate **46 → 12**. Quattro casi su cinque migliorano; la domanda puntuale resta a due chiamate e richiede ulteriore lavoro (APP-192).

I criteri principali di qualità e le candidate sono stati controllati; le prove negative respingono liste errate, vincoli violati, due ACE SPEC, stampe e fonti sconosciute. Il campione non dimostra equivalenza qualitativa universale, miglioramento competitivo o latenza sull'intero archivio. Le misure iniziali e le ambiguità minori sono conservate nel [rapporto completo](AI-DECISION-FLOW.md). Separatamente, conteggi e distribuzioni sono stati riconciliati offline sul corpus completo.

## Aggiornamento

Il nuovo flusso si applica alle analisi avviate con questa versione. I lavori già avviati conservano algoritmo e checkpoint precedenti; la correzione del recupero delle Strategie della v0.3.10 rimane inclusa. Schema del database **16**, senza nuove migrazioni.

Pacchetti per Linux x64, Windows x64, macOS Intel e Apple Silicon, con manifest di provenienza, attestazioni GitHub e `SHA256SUMS.txt`.

I pacchetti macOS usano firma ad hoc, senza Developer ID né notarizzazione; resta da provare l'apertura Finder su un Mac Apple Silicon esterno alla CI (APP-147). L'installer Windows è senza firma Authenticode. APP-187 mantiene l'indagine sui picchi intermittenti del renderer macOS. [Guida alla distribuzione](https://github.com/xmey95/pokeguru/blob/main/docs/DISTRIBUTION.md).

[Confronto completo con v0.3.10](https://github.com/xmey95/pokeguru/compare/v0.3.10...v0.3.11).
