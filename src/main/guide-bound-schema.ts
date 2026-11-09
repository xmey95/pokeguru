import { guideZones } from '../shared/guide-setup-ledger'
import {memoGuideJson} from './guide-value-cache'
import type { GuidePacket } from './matchup-guide-packet'
import { guidePlanSchema, guideScenarioSchemaV7, guidePatchSchemaV7 } from './matchup-guide-schema'

/** Constrain the model before output; readers and physical-stock checks remain mandatory. */
export function boundGuideSchema(schema: object, packet: GuidePacket, selectedOpponent?: string): object {
  return memoGuideJson('bound-schema-v1',{schema,packet,selectedOpponent:selectedOpponent??null},()=>boundGuideSchemaUncached(schema,packet,selectedOpponent))
}
function boundGuideSchemaUncached(schema: object, packet: GuidePacket, selectedOpponent?: string): object {
  const opponents = selectedOpponent ? packet.opponentLists.filter(l => l.id === selectedOpponent) : packet.opponentLists
  if (!opponents.length) throw new Error('Lista avversaria vincolata non disponibile.')
  const ours = packet.ourList.cards.map(c => c.printId), theirs = [...new Set(opponents.flatMap(l => l.cards.map(c => c.printId)))], all = [...new Set([...ours,...theirs])]
  const cardData = new Map<string, any>()
  for (const s of packet.sources.filter(s=>s.kind==='card')) { try { const card=JSON.parse(s.content);cardData.set(card.printId,card) } catch { /* Existing evidence gates reject missing gameplay. */ } }
  const basics = (ids: string[]) => ids.filter(id=>cardData.get(id)?.category==='Pokemon' && cardData.get(id)?.stage==='Basic')
  const observed=['matchup-guide-13','matchup-guide-14','matchup-guide-15','matchup-guide-16','matchup-guide-17','matchup-guide-18','matchup-guide-19','matchup-guide-20','matchup-guide-21','matchup-guide-22','matchup-guide-23','matchup-guide-24','matchup-guide-25','matchup-guide-26','matchup-guide-27','matchup-guide-28'].includes(packet.basis.promptVersion)
  const causal=['matchup-guide-11','matchup-guide-12','matchup-guide-13','matchup-guide-14','matchup-guide-15','matchup-guide-16','matchup-guide-17','matchup-guide-18','matchup-guide-19','matchup-guide-20','matchup-guide-21','matchup-guide-22','matchup-guide-23','matchup-guide-24','matchup-guide-25','matchup-guide-26','matchup-guide-27','matchup-guide-28'].includes(packet.basis.promptVersion)
  const v10=causal||packet.basis.promptVersion==='matchup-guide-10'
  const v9=v10||packet.basis.promptVersion==='matchup-guide-9'
  const allowedPrints=(ids:string[],path:string[])=>!v9?ids:path.includes('energyRoutes')?ids.filter(id=>cardData.get(id)?.category==='Energy'):path.includes('moves')?ids.filter(id=>cardData.get(id)?.category!=='Energy'):ids
  const attacks = [...new Set<string>(all.flatMap(id=>(cardData.get(id)?.gameplay?.attacks ?? []).map((a: any)=>a.name).filter((name:unknown)=>typeof name==='string'&&name.trim())))]
  const choice = (ids: string[]) => ({type:'string',enum:ids})
  const walk = (value: any, key = '', path: string[] = []): any => {
    if (Array.isArray(value)) return value.map(v=>walk(v,key,path))
    if (!value || typeof value!=='object') return value
    if(packet.basis.promptVersion==='matchup-guide-28'&&packet.basis.analysisContract==='finite-evidence-1'){
      if(key==='cards'&&['tactical','tacticalAudit','decisionProof'].some(part=>path.includes(part)))return {...value,items:choice(all)}
      if(key==='printIds'&&path.includes('promotions'))return {...value,items:choice(all.filter(id=>cardData.get(id)?.category==='Pokemon'))}
    }
    if(v10&&key==='attack'){
      const ref=value.properties?.printId?value:value.anyOf?.find((v:any)=>v.properties?.printId)
      if(ref?.properties?.attackName){
        const actor=path.includes('calculations')?all:path.includes('opponent')||path.includes('firstOpponentTurn')?theirs:ours
        const pairs=actor.flatMap(printId=>{
          const names=(cardData.get(printId)?.gameplay?.attacks??[]).map((a:any)=>a.name).filter((v:unknown)=>typeof v==='string'&&v.trim())
          return names.length?[{type:'object',additionalProperties:false,properties:{printId:choice([printId]),attackName:choice(names)},required:['printId','attackName']}]:[]
        })
        if(!pairs.length)throw new Error('Nessun attacco verificato per il lato selezionato.')
        return {anyOf:[...pairs,...value.anyOf?.some((v:any)=>v.type==='null')?[{type:'null'}]:[]]}
      }
    }
    if (key==='printId') return choice(allowedPrints(all,path))
    if(causal&&key==='trainer'){
      const actor=path.includes('opponent')||path.includes('firstOpponentTurn')?theirs:ours
      const ids=actor.filter(id=>cardData.get(id)?.category==='Trainer')
      return ids.length?{anyOf:[choice(ids),{type:'null'}]}:{type:'null'}
    }
    if(v9&&key==='draw'){
      const selected=choice(path.includes('opponent')||path.includes('firstOpponentTurn')?theirs:ours)
      return value.anyOf?{anyOf:[selected,{type:'null'}]}:selected
    }
    if (key==='hostPrintId') return {anyOf:[choice(all.filter(id=>cardData.get(id)?.category==='Pokemon')),{type:'null'}]}
    if (key==='opponentListId') return choice(opponents.map(l=>l.id))
    if (key==='specificDraws') return {...value,items:choice(theirs)}
    if (key==='sourceId') return choice(packet.sources.map(s=>s.id))
    if (key==='sourceIds') return {...value,items:choice(packet.sources.map(s=>s.id))}
    if (key==='attackName') return value.type==='string'?choice(attacks):{anyOf:[choice(attacks),{type:'null'}]}
    if (['active','bench','hand','prizes'].includes(key) && path.includes('opening')) {
      const ids=path.includes('ours')?ours:theirs
      if(key==='active') {
        const allowed=basics(ids);if(!allowed.length) throw new Error('Setup vincolato senza un Pokémon Base verificato.')
        return choice(allowed)
      }
      if(key==='bench')return {...value,items:choice(basics(ids))}
      return {...value,items:choice(ids)}
    }
    const out: Record<string,unknown>={}
    for(const [k,v] of Object.entries(value)) out[k]=k==='properties'?Object.fromEntries(Object.entries(v as object).map(([name,node])=>[name,walk(node,name,[...path,name])])):walk(v,k,path)
    if(value.properties?.side&&value.properties?.printId){
      const properties=out.properties as Record<string,unknown>
      if(observed&&properties.from&&properties.to&&path.includes('moves'))return {anyOf:([['ours',ours],['opponent',theirs]] as const).flatMap(([side,ids])=>guideZones.map(from=>({...out,properties:{...properties,side:choice([side]),printId:choice(allowedPrints(ids,path)),from:choice([from]),to:choice(guideZones.filter(z=>z!==from))}})))}
      return {anyOf:[{...out,properties:{...properties,side:choice(['ours']),printId:choice(allowedPrints(ours,path))}},{...out,properties:{...properties,side:choice(['opponent']),printId:choice(allowedPrints(theirs,path))}}]}
    }
    return out
  }
  return walk(schema)
}
export const guidePlanSchemaV7 = { ...guidePlanSchema, properties:{...guidePlanSchema.properties,opponentListId:{type:'string'}},required:[...guidePlanSchema.required,'opponentListId'] }
export { guideScenarioSchemaV7, guidePatchSchemaV7 }
