import {ProofRegistry} from '../src/main/guide-obligation-registry'
import {registryContract} from '../scripts/guide-convergence/registry-contract'
import {it, expect} from 'vitest'
import {digest, type ReviewReceipt} from '../src/main/guide-obligation-registry'
registryContract(ProofRegistry, 'guide-obligations-1', 'APP-231 incremental registry — synthetic host receipts, no provider', true)

it('imports new host receipts incrementally and checks every known producer identity', () => {
  const scope = {projectId:'generic-project',jobId:'generic-job',caseId:'generic-case',dependencyHash:'data',configHash:'config'},context={packetHash:'packet',frameHash:'frame',validatorVersion:'rules-1',sourceIds:['rules']}
  const registry = new ProofRegistry(scope, context, {mechanics:[],reviews:[]})
  const original={origin:'ai' as const,rawJson:'{"goal":"Exact original"}',producerRequestId:'producer-first',producerRequestIds:['producer-first','producer-second'],sourceIds:['rules']}
  expect(() => registry.append({type:'original',value:{...original,producerRequestIds:['producer-second']}})).toThrow('Incomplete producer')
  registry.append({type:'original',value:original})
  const id=registry.originalId(original),goal=registry.obligation({statement:'Exact original',conditions:'Full frame conditions',sourceIds:['rules'],comparisonGroupId:null})
  const responseJson=JSON.stringify({obligations:[goal],decisions:[{originalId:id,disposition:'map',formula:{atom:goal.id},reason:'Independent mapping',sourceIds:['rules']}],work:[{obligationId:goal.id,action:'construct',witnessIds:[],reason:'Necessary proof'}]})
  const receipt:ReviewReceipt={kind:'admission',requestId:'producer-second',contractVersion:'guide-obligations-1',scopeHash:registry.scopeHash,contextHash:registry.contextHash,responseHash:digest(responseJson),originalIds:[id],obligationIds:[],witnessRefs:[],sourceIds:['rules'],competitors:{},bindingHash:null}
  registry.importHostReceipts({mechanics:[],reviews:[receipt]})
  expect(() => registry.append({type:'admission',responseJson,receiptHash:digest(receipt)})).toThrow('not independent')
  const foreignVersion={...receipt,requestId:'independent',contractVersion:'admission-prototype-1'} as unknown as ReviewReceipt
  registry.importHostReceipts({mechanics:[],reviews:[foreignVersion]})
  expect(() => registry.append({type:'admission',responseJson,receiptHash:digest(foreignVersion)})).toThrow('bindings differ')
  const independent={...receipt,requestId:'independent'}
  registry.importHostReceipts({mechanics:[],reviews:[independent]})
  registry.append({type:'admission',responseJson,receiptHash:digest(independent)})
  expect(registry.workQueue()).toHaveLength(1)
  expect(registry.audit().obligationsClosed).toBe(false)
})
