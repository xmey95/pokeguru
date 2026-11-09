import {guideHash} from './matchup-guide-packet'
import {guideUntilValidAuthority} from './guide-run-policy'
import type {GuideConstructionRuntime} from './guide-reply-phase'
type Context=Pick<GuideConstructionRuntime,'scope'|'archive'>
const role='guide-finite-critic-contract-v1'
/** Protocol identity, never an opinion or an approval. Completed historical
 * guides retain their actual critic; new until-valid work uses full context. */
export function finiteCriticContract(o:Context):2|3{
 const rows=[...o.archive.values<any>(role)]
 if(rows.length>1)throw Error('Contratto del critico ambiguo.')
 if(rows.length){const r=rows[0];if(r.key!=='contract'||r.value.version!==3||r.value.scopeHash!==guideHash(o.scope)||!guideUntilValidAuthority(o.archive))throw Error('Contratto del critico alterato o estraneo.');return 3}
 if(o.archive.value('guide-finite-final-approval-v1','validated'))return 2
 return guideUntilValidAuthority(o.archive)?3:2
}
export function pinFiniteCriticContract(o:Context){
 if(finiteCriticContract(o)===3&&!o.archive.value(role,'contract'))o.archive.saveValue(role,'contract',{version:3,scopeHash:guideHash(o.scope)})
}
