import {it,expect} from 'vitest'
import {buildGuidePacket,packetHash} from '../src/main/matchup-guide-packet'
import {parseDeck} from '../src/shared/deck-import'
import {GUIDE_PROMPT_VERSION} from '../src/shared/matchup-guide'
import type {CatalogPrint,CatalogView} from '../src/shared/catalog'

it('freezes the selected native revision contract in the packet and its dependency hash',()=>{
 // Quantity/source fixture only, not a playable deck or a competitive guide.
 const print:CatalogPrint={id:'sv02-185',setId:'sv02',localId:'185',name:'Iono',setName:'Paldea Evolved',category:'Trainer',rarity:'Uncommon',variants:null,identityId:'iono',identityBasis:'trainer-text',imageBase:null,thumbnail:null,highImageAvailable:null,sourceUpdated:null,sourceUrl:'https://api.tcgdex.net/v2/en/cards/sv02-185',detailAt:'2026-11-02',error:null,gameplay:{hp:null,types:[],evolveFrom:null,attacks:[],abilities:[],effect:'Synthetic text for version binding',trainerType:'Supporter',weaknesses:[],resistances:[],retreat:null}}
 const rawText='60 Iono PAL 185',catalog:CatalogView={circuit:'WESTERN',source:'TCGdex REST v2/en',sourceLanguage:'en',scope:{setIds:['sv02'],names:['Iono']},syncedAt:'2026-11-02',sets:[],prints:[print]}
 const input={basis:{projectId:'independent',deckHash:'quantity-fixture',deckVersionId:null,deckResolutionId:null,metaId:'fixture-meta',opponentId:'fixture-opponent',asOf:'2026-11-02'},baseline:{...parseDeck(rawText),rawText,projectId:'independent',source:'paste' as const,importedAt:'2026-11-02',fileName:null},catalog,evidence:{sampleLists:[]} as any,sample:{url:null,cards:[rawText]},matchup:'Quantity fixture',deckContext:'Source/version compatibility only'}
 const fresh=buildGuidePacket(input)
 expect(fresh.basis.promptVersion).toBe(GUIDE_PROMPT_VERSION)
 const hashes=new Set<string>()
 for(const version of ['matchup-guide-24','matchup-guide-25','matchup-guide-26','matchup-guide-27','matchup-guide-28'] as const){
  const packet=buildGuidePacket({...input,promptVersion:version})
  expect(packet.basis.promptVersion).toBe(version);expect(packet.basis.dependencyHash).toBe(packetHash(packet))
  expect(packet.ourList).toEqual(fresh.ourList);expect(packet.opponentLists).toEqual(fresh.opponentLists)
  hashes.add(packet.basis.dependencyHash)
 }
 expect(hashes.size).toBe(5)
})
