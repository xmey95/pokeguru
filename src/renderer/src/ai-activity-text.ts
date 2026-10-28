// Translate application events for players without rewriting saved activity or model summaries.
const activityText = new Map<string, string>([
  ['Preparo il turno e le preferenze Codex.', 'Preparo la tua richiesta.'],
  ['Preparo l’avversario e le preferenze Codex.', 'Preparo il confronto con il mazzo avversario.'],
  ['Preparo lo storico e il commento della discussione.', 'Rileggo la discussione e il tuo nuovo commento.'],
  ['Preparo la nuova base della discussione.', 'Riparto dalla lista e dai tornei aggiornati.'],
  ['Raccolgo la lista e le schede del Catalogo.', 'Leggo la tua lista e gli effetti delle carte.'],
  ['Raccolgo le schede delle due liste dal Catalogo.', 'Leggo le carte del tuo mazzo e di quello avversario.'],
  ['Aggiorno le schede della lista corrente.', 'Rileggo le carte della tua lista.'],
  ['Aggiorno le schede delle due liste.', 'Rileggo le carte del tuo mazzo e di quello avversario.'],
  ['Collego le liste e i risultati degli Eventi pertinenti.', 'Raccolgo i mazzi e i risultati dei tornei utili alla tua domanda.'],
  ['Collego le liste e i risultati dei tornei.', 'Raccolgo i mazzi e i risultati dei tornei.'],
  ['Ricollego le evidenze dei tornei alla revisione.', 'Riprendo i risultati dei tornei per aggiornare la guida.'],
  ['Collego i tornei della nuova base.', 'Raccolgo i risultati dei tornei aggiornati.'],
  ['Codex seleziona le ricerche locali utili alla domanda.', 'Scelgo quali carte, mazzi e tornei approfondire per risponderti.'],
  ['Codex seleziona le ricerche locali utili alla guida.', 'Scelgo quali carte, mazzi e tornei approfondire per la guida.'],
  ['Codex sceglie le ricerche pertinenti.', 'Scelgo cosa approfondire tra le informazioni disponibili.'],
  ['Codex elabora la risposta con le prove raccolte.', 'Preparo la risposta con le informazioni raccolte.'],
  ['Codex costruisce la guida usando lista, schede e tornei.', 'Studio come affrontare il mazzo avversario.'],
  ['Codex costruisce la guida usando le prove raccolte.', 'Preparo la guida con le informazioni raccolte.'],
  ['Codex rivede la guida alla luce del tuo commento.', 'Aggiorno la guida tenendo conto del tuo commento.'],
  ['Codex aggiorna la guida sulla nuova base.', 'Aggiorno la guida con la lista e i tornei attuali.'],
  ['Verifico le carte citate e la risposta strutturata.', 'Controllo le carte citate e la risposta.'],
  ['Controllo le carte nominate e i campi della guida.', 'Controllo le carte citate e la guida.'],
  ['Controllo le carte citate e la guida aggiornata.', 'Controllo le carte citate e la guida aggiornata.'],
  ['Salvo la risposta e la candidata nel Thread.', 'Salvo la risposta e l’eventuale proposta di mazzo.'],
  ['Salvo la guida Matchup.', 'Salvo la guida per affrontare il mazzo avversario.'],
  ['Salvo la revisione nella discussione.', 'Salvo la guida aggiornata nella discussione.'],
  ['Salvo la nuova guida Matchup.', 'Salvo la nuova guida per affrontare il mazzo avversario.']
])

export function aiActivityDetail(detail: string): string {
  const known = activityText.get(detail)
  if (known) return known
  const research = /^Ricerca (\d+): (\d+) interrogazioni locali completate\.$/.exec(detail)
  if (research) return `Approfondimento ${research[1]}: ${research[2]} ${research[2] === '1'
    ? 'ricerca completata' : 'ricerche completate'}.`
  const revision = /^Codex rielabora (la risposta|la guida|la revisione) con nuove schede \((\d+)\/(\d+)\)\.$/.exec(detail)
  if (revision) return `Rivedo ${revision[1] === 'la risposta' ? 'la risposta' : 'la guida'} con le nuove carte trovate (${revision[2]}/${revision[3]}).`
  const batch = /^Analisi estesa: (\d+) di (\d+) lotti completati e salvati\.$/.exec(detail)
  if (batch) return `Parti dell’analisi completate e salvate: ${batch[1]} su ${batch[2]}.`
  // Unrecognised details may carry useful information: never replace them with a guessed phase.
  return detail
}
