import type {AiEvidenceArchive,EvidenceFieldFilter} from './ai-evidence-archive'

type Archive=Pick<AiEvidenceArchive,'values'>&Partial<Pick<AiEvidenceArchive,'valuesByField'>>
/** Lightweight archive views retain the exact full-scan fallback. */
export function* matchingEvidenceValues<T>(archive:Archive,role:string,field:string|readonly string[],expected:string):Generator<{key:string;value:T}>{
 if(archive.valuesByField&&typeof expected==='string'){yield* archive.valuesByField<T>(role,field,expected);return}
 const path=typeof field==='string'?[field]:field
 for(const row of archive.values<T>(role))if(path.reduce<any>((v,key)=>v[key],row.value)===expected)yield row
}

/** Preserve exact ordered access for lightweight archive views too. */
export function* matchingEvidenceFields<T>(archive:Pick<AiEvidenceArchive,'values'>&Partial<Pick<AiEvidenceArchive,'valuesByFields'>>,role:string,filters:readonly EvidenceFieldFilter[]):Generator<{key:string;value:T}>{
 if(archive.valuesByFields){yield*archive.valuesByFields<T>(role,filters);return}
 for(const row of archive.values<T>(role))if(filters.every(f=>f.expected.includes(f.path.reduce<any>((v,k)=>v[k],row.value))))yield row
}
