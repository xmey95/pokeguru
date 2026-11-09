/** Preserve raw citations and additionally accept an exact substring of ONE
 * original JSON string value. The added decoded path performs no whitespace normalization or key matching,
 * concatenation, recursive unescaping or synthesis of separate fields. */
export function hasGuideSourceQuote(content:string,quote:string):boolean{
 if(!quote.trim())return false
 if(content.includes(quote))return true
 let decoded:unknown;try{decoded=JSON.parse(content)}catch{return false}
 const pending:unknown[]=[decoded]
 while(pending.length){const value=pending.pop();if(typeof value==='string'){if(value.includes(quote))return true}
  else if(value&&typeof value==='object')pending.push(...Object.values(value))
 }
 return false
}
