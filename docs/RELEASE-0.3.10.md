# Pokéguru v0.3.10

Corregge il salvataggio delle Strategie che terminavano con **«Evidenze del turno non valide»** dopo un’analisi estesa. Un vecchio limite di 250.000 caratteri poteva rifiutare evidenze corrette e lasciare risposta e candidata pronte ma non applicate.

La risposta, la candidata ammissibile e tutte le evidenze vengono ora conservate integralmente. Restano i controlli su schema, fonti citate, progetto, sessione e lista proposta.

## Recuperare un risultato già pronto

Chiudi normalmente Pokéguru, installa la nuova versione e riapri l’app. Il recupero prova ad applicare il risultato conservato; se compare ancora il comando, usa **Completa salvataggio** nella Strategia. Non occorre scartare il risultato, cancellare il database o ripetere l’analisi AI.

Il recupero è stato verificato su una copia del risultato reale bloccato: 426.754 caratteri di evidenze, 121 fonti e 29 citazioni. Salvate una risposta e una candidata, con lista principale e primo messaggio invariati. Due avvii Electron hanno confermato assenza di duplicati e nessuna nuova chiamata AI. Questa è una verifica di persistenza, non di qualità competitiva della proposta.

Schema del database **16**, senza nuove migrazioni. Build/typecheck e 381 test locali passati; 47 prove opzionali escluse dalla suite ordinaria.

Disponibili AppImage Linux x64, installer Windows x64 e DMG macOS Intel/Apple Silicon, con manifest di provenienza, attestazioni GitHub e `SHA256SUMS.txt`.

I pacchetti macOS usano una firma ad hoc, senza Developer ID né notarizzazione; restano i limiti Gatekeeper e la prova Finder su un Mac Apple Silicon esterno alla CI. L’installer Windows è senza firma Authenticode. Resta aperta l’indagine APP-187 sui picchi intermittenti del renderer nei runner macOS; questa correzione non modifica quel comportamento. [Guida alla distribuzione](https://github.com/xmey95/pokeguru/blob/main/docs/DISTRIBUTION.md).

[Confronto completo con v0.3.9](https://github.com/xmey95/pokeguru/compare/v0.3.9...v0.3.10).
