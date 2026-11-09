import {createHash} from 'node:crypto'
import {readFileSync} from 'node:fs'
import {expect,it} from 'vitest'
import {packGuideData,unpackGuideData} from '../src/main/guide-request-budget'
import {packGuideDataV2} from '../src/main/guide-wire-data'
import {packGuideDataV3,packGuideDataV4} from '../src/main/guide-wire-dense'
const golden:{input:any;cases:{codec:number;args:any[];hash:string}[]}=JSON.parse(readFileSync(new URL('./fixtures/guide-wire-identity.json',import.meta.url),'utf8'))
function encode(codec:number,args:any[],input:unknown){return codec===1?packGuideData(input):codec===2?packGuideDataV2(input,...args):codec===3?packGuideDataV3(input,...args):packGuideDataV4(input,...args)}
it.each(golden.cases)('keeps the exact historical wire representation $codec / $args and every original field',c=>{
 const encoded=encode(c.codec,c.args,golden.input)
 expect(createHash('sha256').update(JSON.stringify(encoded)).digest('hex')).toBe(c.hash)
 expect(JSON.stringify(unpackGuideData(encoded))).toBe(JSON.stringify(golden.input))
})
it('cannot reuse an encoder key after a source quantity changes in a new invocation',()=>{
 for(const c of golden.cases){const data=structuredClone(golden.input),before=structuredClone(data),first=encode(c.codec,c.args,data);data.rows[0].count=19;const second=encode(c.codec,c.args,data)
  expect(unpackGuideData(first)).toEqual(before);expect(unpackGuideData(second)).toEqual(data);expect(JSON.stringify(first)).not.toBe(JSON.stringify(second))
 }
})
