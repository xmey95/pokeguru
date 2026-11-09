import type {AiEvidenceArchive} from './ai-evidence-archive'
import {guideUntilValidAuthority} from './guide-run-policy'
import {guideHash,type GuidePacket} from './matchup-guide-packet'
import type {AiRunConfig} from '../shared/ai'

const role='guide-transport-selection-v1'
type Archive=Pick<AiEvidenceArchive,'id'|'projectId'|'values'|'saveValue'>
/** An immutable host policy for new explicit app workflows. Historical jobs
 * keep their exact transport selection, including raw-recovery identities. */
export function hasMinimumGuideTransport(archive:Pick<Archive,'id'|'projectId'|'values'>):boolean{
 const rows=[...archive.values<any>(role)];if(!rows.length)return false
 const authority=guideUntilValidAuthority(archive),policy=rows[0].value
 if(rows.length!==1||rows[0].key!=='policy'||!authority||!policy||Object.keys(policy).length!==7||policy.version!==1||policy.selection!=='minimum-visible'||policy.jobId!==archive.id||policy.projectId!==archive.projectId||policy.packetHash!==authority.packetHash||policy.configHash!==authority.configHash||policy.authorityHash!==guideHash(authority))throw Error('Politica di trasporto della guida alterata o estranea.')
 return true
}
export function pinMinimumGuideTransport(archive:Archive,packet:GuidePacket,config:AiRunConfig):void{
 const authority=guideUntilValidAuthority(archive)
 if(!authority||authority.packetHash!==guideHash(packet)||authority.configHash!==guideHash(config))throw Error('Trasporto compatto privo di autorità sulle fonti e sul modello.')
 if(hasMinimumGuideTransport(archive))return
 if([...archive.values('guide-attempt-start')].length)throw Error('Un job storico non può cambiare politica di trasporto.')
 archive.saveValue(role,'policy',{version:1,selection:'minimum-visible',jobId:archive.id,projectId:archive.projectId,packetHash:authority.packetHash,configHash:authority.configHash,authorityHash:guideHash(authority)})
}
