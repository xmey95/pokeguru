import {guidePrizeRuleSources} from './guide-prize-rule-sources'
import {guideHash,guideSource} from './matchup-guide-packet'
import type {GuideSource} from '../shared/matchup-guide'

/** A sourced paraphrase, explicitly distinguished from a verbatim excerpt.
 * It supplies rule applicability, never an inventory or a neutral scalar. */
export function guideGameRuleSources(asOf:string):GuideSource[]{
 const prizes=guidePrizeRuleSources(asOf)
 if(!/^\d{4}-\d{2}-\d{2}/.test(asOf)||asOf.slice(0,10)<'2025-09-26')return prizes
 return [...prizes,guideSource('rules:damage:calculation-order','rules','Official Pokémon TCG rulebook — damage procedure (curated paraphrase)','https://assets.pokemon.com/assets/cms2/pdf/trading-card-game/rulebook/par_rulebook_en.pdf',{
  version:'damage-evidence-2026-11-06.1',availableFrom:'2025-09-26',checkedAt:'2026-11-06',evidenceType:'curated-paraphrase',locator:'Printed pages 14 (B) and 20 (F, damage procedure)',
  scope:'Western Pokémon TCG attack damage. Not Standard admission or Pokémon TCG Pocket. Does not prove the current board, damage, KO, lack of modifiers, or a numeric neutral factor.',
  summary:'Begin with printed base damage and any damage formula in the attack text. Apply effects on the attacker, then the defending Active Pokémon’s Weakness only when it matches the attacker’s type, then matching Resistance, then effects on the defender. Inspect the actual cards and all relevant effects. Putting damage counters directly is a separate procedure, unaffected by Weakness, Resistance or other damage modifiers. An inapplicable Weakness or Resistance does not change damage. This paraphrase supplies no numeric multiplier.'
 }),guideSource('rules:damage:nonpositive','rules','Official Pokémon TCG rulebook — nonpositive final attack damage','https://assets.pokemon.com/assets/cms2/pdf/trading-card-game/rulebook/par_rulebook_en.pdf',{
  version:'damage-floor-evidence-2026-11-08.1',checkedAt:'2026-11-08',edition:'Scarlet & Violet—Paradox Rift',evidenceType:'verbatim-excerpt',locator:'Printed page20, Full details of attacking, F6',
  excerpt:'If the damage is 0 or less, don’t put on any damage counters!',
  scope:'Final attack damage after the applicable damage procedure. Does not prove base damage, modifiers, their applicability, a current inventory balance, prevention, or a neutral multiplier. Direct placement of damage counters follows its separate procedure.'
 })]
}
export function isGuideGameRuleSource(source:GuideSource,asOf:string):boolean{
 return guideGameRuleSources(asOf).some(s=>s.id===source.id&&guideHash(s)===guideHash(source))
}
