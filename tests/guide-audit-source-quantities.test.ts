import {it,expect} from 'vitest'
import {auditSourceQuantities} from '../src/main/guide-audit-source-quantities'
it.each([
 ['You must discard a card from your hand.',[1]],
 ['Once during your turn, you may draw 2 cards.',[2,1]],
 ['Twice during the game.',[2]],
 ['Attach an Energy card to a Pokémon.',[1]],
 ['Discard a Basic Lightning Energy card.',[1]],
 ['Search your deck for a Basic {F} Energy card or a Basic {F} Pokémon, reveal it, and put it into your hand. Then, shuffle your deck.',[1]],
 ['Choose a random card.',[1]],
 ['Search for an Evolution Pokémon.',[1]],
 ['Flip a coin. If heads, prevent damage.',[1]],
 ['Put a damage counter on that Pokémon.',[1]],
 ['Flip 2 coins.',[2]],
 ['Discard 2 cards.',[2]],
 ['Scarta una carta.',[1]]
] as const)('extracts an actual printed cardinality from %s',(quote,values)=>expect(auditSourceQuantities(quote).sort()).toEqual([...values].sort()))
it.each([... 'GRWLPFDMYNC'])('recognizes a singular noun with the printed {%s} type icon',type=>{
 expect(auditSourceQuantities(`Search for a Basic {${type}} Pokémon.`)).toEqual([1])
 expect(auditSourceQuantities(`Attach a Basic {${type}} Energy card.`)).toEqual([1])
})
it.each(['a Basic {Z} Pokémon','a Basic {XYZ} Pokémon','a Basic {FF} Energy card','a {F} few cards','a {F} pair of cards','a {F} coins','a {F} damage counters','a {F} card-shaped token'])('does not infer a singular quantity from %s',quote=>expect(auditSourceQuantities(quote)).not.toContain(1))
it.each(['a few cards','a lot of Energy','a number of Pokémon','a pair of cards','a wide field','another card','any cards','all at once','Once a player reaches the goal','a few coins','a pair of coins','a number of damage counters','a coin-shaped token','a card-sized object','Flip 2 coins.'])('does not infer one from %s',quote=>expect(auditSourceQuantities(quote)).not.toContain(1))
