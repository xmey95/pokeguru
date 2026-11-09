/** Explicit synthetic qualitative prose, never a real audit judgment. */
export const auditText=(text:string)=>[{text,quantity:null,card:null,measureId:null}]
export const auditTextFor=(data:{auditNarrativeVersion?:number},text:string)=>data.auditNarrativeVersion===4?{text,parts:auditText(text)}:auditText(text)
/** Synthetic reviewer for protocol tests; never evidence of AI correctness. */
export const auditLanguagePass=(data:any)=>({reviewedHash:data.reviewedHash,verdict:'pass',targets:Object.fromEntries(data.targets.map((t:any)=>[t.key,{allClaimsChecked:true,annotations:t.spans.map((s:any)=>({spanId:s.id,kind:'qualitative',declaredCount:null,quantity:null,measureId:null,contextId:null,source:null,cardId:null,...data.reviewProtocol>=3?{calculation:null}:{},reason:'Synthetic qualitative interpretation in a protocol fixture.'})),findings:[]}]))})
