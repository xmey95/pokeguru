import {expect,it,vi} from 'vitest'
vi.mock('../src/main/guide-json-keys',()=>({createGuideJsonKeys:()=>((value:unknown)=>({key:'forced-collision',length:JSON.stringify(value).length}))}))
import {packGuideDataV3,packGuideDataV4} from '../src/main/guide-wire-dense'
it.each([packGuideDataV3,packGuideDataV4])('fails closed under an artificial private subtree-key collision',encode=>{
 const data={one:'first independent source '.repeat(20),two:'second independent source '.repeat(20),rows:[{count:1,condition:'Original evidence.'},{count:2,condition:'Different original evidence.'}]},before=JSON.stringify(data)
 expect(()=>encode(data)).toThrow();expect(JSON.stringify(data)).toBe(before)
})
