import {it,expect} from 'vitest'
import {guideCampaignAllowance,assertGuideCampaignDispatch} from '../src/main/guide-campaign-budget'
const ceilings={perGuide:500,pool:1500,reserveEachLater:24}
const counts=(values:number[])=>values.map((calls,i)=>({id:'case-'+i,calls}))
it('deducts inherited and diagnostic calls before granting any linked successor',()=>{
  expect(guideCampaignAllowance(counts([255,0,0]),'case-0',ceilings)).toEqual({remaining:245,total:255,consumedByGuide:255,reservedForLater:48})
  expect(guideCampaignAllowance(counts([300,0,0]),'case-0',ceilings).remaining).toBe(200)
  expect(guideCampaignAllowance(counts([500,0,0]),'case-0',ceilings).remaining).toBe(0)
  expect(()=>assertGuideCampaignDispatch(counts([501,0,0]),'case-0',ceilings)).toThrow('tetto')
})
it('counts a pending dispatch once and preserves the reserve of every later guide',()=>{
  const limited={perGuide:500,pool:330,reserveEachLater:24}
  expect(guideCampaignAllowance(counts([255,0,0]),'case-0',limited).remaining).toBe(27)
  expect(assertGuideCampaignDispatch(counts([282,0,0]),'case-0',limited).total).toBe(282)
  expect(()=>assertGuideCampaignDispatch(counts([283,0,0]),'case-0',limited)).toThrow('riserva')
  expect(()=>assertGuideCampaignDispatch(counts([0,0,0]),'case-0',limited)).toThrow('registrata')
  expect(guideCampaignAllowance(counts([282,10,0]),'case-0',limited).remaining).toBe(0)
})
it('rejects unknown, duplicated, fractional, negative and overflowing counters',()=>{
  for(const rows of [[{id:'x',calls:-1}],[{id:'x',calls:0.5}],[{id:'x',calls:0},{id:'x',calls:1}],[{id:'x',calls:Number.MAX_SAFE_INTEGER+1}]])expect(()=>guideCampaignAllowance(rows,'x',ceilings)).toThrow()
  expect(()=>guideCampaignAllowance(counts([0,0]),'foreign',ceilings)).toThrow()
  expect(()=>guideCampaignAllowance(counts([500,500,500,1]),'case-0',ceilings)).toThrow('tetto')
})
