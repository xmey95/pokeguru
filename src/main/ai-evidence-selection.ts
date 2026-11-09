import type {AiEvidenceArchive} from './ai-evidence-archive'

type Archive=Pick<AiEvidenceArchive,'values'>&Partial<Pick<AiEvidenceArchive,'valuesByField'>>
/** Lightweight archive views retain the exact full-scan fallback. */
export function* matchingEvidenceValues<T>(archive:Archive,role:string,field:string|readonly string[],expected:string):Generator<{key:string;value:T}>{
 if(archive.valuesByField&&typeof expected==='string'){yield* archive.valuesByField<T>(role,field,expected);return}
 const path=typeof field==='string'?[field]:field
 for(const row of archive.values<T>(role))if(path.reduce<any>((v,key)=>v[key],row.value)===expected)yield row
}
