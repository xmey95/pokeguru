import {auditLanguageSpans} from './guide-audit-quantities'

/** Printed rule quantities only. This never supplies an inventory balance or
 * proves the semantic relation between a quote and a claim: the independent
 * critic and full game reader remain mandatory. Exact quote matching precedes
 * this function. Historical protocol1 retains its literal-only parser. */
export function auditSourceQuantities(quote:string):number[]{
 const values=auditLanguageSpans(quote).flatMap(s=>s.value===null?[]:[s.value])
 for(const m of quote.matchAll(/\b(once|twice)\s+(?:during|per|each)\b/giu))values.push(m[1].toLowerCase()==='once'?1:2)
 for(const m of quote.matchAll(/\bonly\s+(once|twice)(?=[.,;!?]|$)/giu))values.push(m[1].toLowerCase()==='once'?1:2)
 // Bounded singular rule nouns, not a general exemption for the article "a".
 // In particular, "a few", "a lot of", "a number of" and "a pair of" do
 // not provide a witness for one. These are vocabulary classes, never card IDs.
 // Printed type icons modify the noun just like their spelled-out names.
 // Keep this vocabulary closed: arbitrary brace tokens are not quantities.
 const modifier='(?:Basic|Special|Evolution|Stage [012]|Grass|Fire|Water|Lightning|Psychic|Fighting|Darkness|Metal|Fairy|Dragon|Colorless|Trainer|Item|Supporter|Stadium|Tool|random|[{][GRWLPFDMYNC][}])'
 const singular=new RegExp('\\b(?:a|an)\\s+(?:'+modifier+'\\s+){0,3}(?:card|Pok[eé]mon|Energy|coin|damage counter)\\b(?!-)','giu')
 for(const _m of quote.matchAll(singular))values.push(1)
 return [...new Set(values)]
}
