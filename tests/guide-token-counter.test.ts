import {expect,it} from 'vitest'
import {Tiktoken} from 'js-tiktoken/lite'
import o200k from 'js-tiktoken/ranks/o200k_base'
import {countGuideTokens} from '../src/main/guide-token-counter'
const encoder=new Tiktoken(o200k),reference=(s:string)=>encoder.encode(s,[],[]).length
it('matches full ordinary encoding for Unicode, JSON, whitespace, special-token literals and malformed UTF16',()=>{
 const values=['','  \r\n\t x   y\n\n','Pokémon 🐦 👨‍👩‍👧‍👦 e\u0301','العربية 中文 日本語 русский Ελληνικά','<|endoftext|> <|fim_prefix|> ordinary text','literal\ud800source\udfffend','1234567890 -12.45 +009 1e10',JSON.stringify({source:'Exact quoted "condition"\n',zero:0,negative:-1,array:[null,true,false,'^0','+']})]
 for(const text of values)expect(countGuideTokens(text)).toBe(reference(text))
 let state=1347;const alphabet=['a','Z','é','漢','ب',' ','\n','\t','0','3','9','-','"','\\','{','}','🐦','\ud800']
 for(let i=0;i<150;i++){let text='';for(let j=0;j<200;j++){state=(Math.imul(state,1664525)+1013904223)>>>0;text+=alphabet[state%alphabet.length]}expect(countGuideTokens(text)).toBe(reference(text))}
})
it('keeps exact counts across bounded-cache eviction, repeated schemas, changed quantities and uncached long pieces',()=>{
 const before=JSON.stringify({items:Array.from({length:120},(_,i)=>({id:'original-'+i,count:i%4,source:'Keep every field and condition.'}))}),after=before.replace('"count":0','"count":19')
 expect(countGuideTokens(before)).toBe(reference(before));expect(countGuideTokens(after)).toBe(reference(after));expect(countGuideTokens(before)).toBe(reference(before))
 const many=Array.from({length:20000},(_,i)=>' '+String.fromCharCode(0x4e00+i)+'original').join('')
 expect(countGuideTokens(many)).toBe(reference(many));expect(countGuideTokens(before)).toBe(reference(before))
 const long='x'.repeat(3000);expect(countGuideTokens(long)).toBe(reference(long))
},30000)
