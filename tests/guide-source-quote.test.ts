import {it,expect} from 'vitest'
import {hasGuideSourceQuote} from '../src/main/guide-source-quote'
it.each(['First line.\n\nAdd 7.','He said "draw 4".','Path \\ and é — literal.'])('accepts exact original JSON string values with escapes: %s',quote=>{
 const content=JSON.stringify({gameplay:{effects:[{text:quote}]}})
 expect(hasGuideSourceQuote(content,quote)).toBe(true)
 expect(hasGuideSourceQuote(quote,quote)).toBe(true)
})
it('keeps raw serialized citations compatible without joining or normalizing decoded fields',()=>{
 const content=JSON.stringify({effect:'First\nSecond',parts:['Add ','7.'],keyOnly:'value',nested:JSON.stringify({effect:'Take\n3.'})})
 expect(hasGuideSourceQuote(content,'"effect":"First\\nSecond"')).toBe(true)
 for(const quote of ['First Second','First\r\nSecond','Add 7.','Take\n3.','Invented 3.','   '])expect(hasGuideSourceQuote(content,quote),quote).toBe(false)
 expect(hasGuideSourceQuote('invalid { json','First\nSecond')).toBe(false)
})
