import {EventEmitter} from 'node:events'
import {writeFileSync} from 'node:fs'
import {afterEach,expect,it,vi} from 'vitest'
const mocks=vi.hoisted(()=>({child:null as any,args:[] as string[]}))
vi.mock('node:child_process',()=>({spawn:(_command:string,args:string[])=>{mocks.args=args;return mocks.child}}))
vi.mock('../src/main/codex-setup',()=>({codexLauncher:()=>({command:'fake',prefix:[]})}))
import {runStructuredCodex} from '../src/main/codex-evidence-plan'
import {AiFailure} from '../src/main/ai-failure'
afterEach(()=>vi.useRealTimers())
it('uses the bounded caller deadline and preserves non-content timeout evidence',async()=>{
 vi.useFakeTimers()
 const child=new EventEmitter() as any;child.stdout=new EventEmitter();child.stdout.setEncoding=()=>undefined;child.stderr=new EventEmitter();child.stdin=new EventEmitter();child.stdin.end=()=>undefined;child.kill=vi.fn(()=>{child.emit('close',null);return true});mocks.child=child
 const result=runStructuredCodex('Unsent fixture',{provider:'codex',source:'global',model:null,reasoningEffort:null},{},undefined,undefined,{timeoutMs:960000}).catch(e=>e)
 child.stdout.emit('data','{"type":"turn.started"}\n{"type":"item.completed"}\n')
 await vi.advanceTimersByTimeAsync(600000);expect(child.kill).not.toHaveBeenCalled()
 await vi.advanceTimersByTimeAsync(360000)
 const error:any=await result
 expect(error.code).toBe('timeout');expect(error.executionDetails).toMatchObject({timeoutMs:960000,lastEventType:'item.completed',completedTurns:0,completedItems:1,resultFilePresent:false})
 expect(error.executionDetails.stdoutBytes).toBeGreaterThan(0);expect(child.kill).toHaveBeenCalledTimes(1)
})
it('rejects unbounded execution settings before starting a process',async()=>{
 await expect(runStructuredCodex('',{provider:'codex',source:'global',model:null,reasoningEffort:null},{},undefined,undefined,{timeoutMs:1200001})).rejects.toThrow('fuori dai limiti')
})

function childFixture(){
 const child=new EventEmitter() as any;child.stdout=new EventEmitter();child.stdout.setEncoding=()=>undefined;child.stderr=new EventEmitter();child.stdin=new EventEmitter();child.stdin.end=()=>undefined;child.kill=vi.fn();mocks.child=child;return child
}
it('keeps a process interruption distinct from malformed content, timeout and quota, without retaining private stderr',async()=>{
 const child=childFixture(),pending=runStructuredCodex('Unsent private fixture',{provider:'codex',source:'global',model:null,reasoningEffort:null},{}).catch(e=>e)
 child.stdout.emit('data','{"type":"item.completed"}\n');child.stderr.emit('data',Buffer.from('PRIVATE STDERR'))
 child.emit('close',1073807364)
 const error=await pending;expect(error).toMatchObject({code:'process-interrupted',providerDetails:{reason:'process-terminated',exitCode:1073807364},executionDetails:{completedTurns:0,completedItems:1,resultFilePresent:false}});expect(JSON.stringify(error)).not.toMatch(/PRIVATE/)
})
it('classifies a final split error event without a newline and retains only safe nonzero-exit evidence',async()=>{
 const child=childFixture(),pending=runStructuredCodex('Unsent private fixture',{provider:'codex',source:'global',model:null,reasoningEffort:null},{}).catch(e=>e)
 child.stdout.emit('data','{"type":"turn.started"}\n{"type":"turn.failed","error":')
 child.stdout.emit('data','{"message":"HTTP 503 PRIVATE_PROVIDER_BODY"}}')
 child.emit('close',1)
 const error=await pending
 if(!(error instanceof AiFailure))throw new Error('Expected a typed provider failure')
 expect(error).toMatchObject({code:'network',providerDetails:{reason:'server',httpStatus:503,exitCode:1},executionDetails:{timeoutMs:600000,lastEventType:'turn.failed',completedTurns:0,completedItems:0,resultFilePresent:false,stderrBytes:0,providerErrorEvents:1,unparsedStdoutEvents:0,finalStdoutEventWithoutNewline:true}})
 expect(error.executionDetails!.stdoutBytes).toBeGreaterThan(0);expect(error.executionDetails!.providerErrorHash).toMatch(/^[a-f0-9]{64}$/)
 expect(JSON.stringify(error)).not.toMatch(/PRIVATE|Unsent/);expect(error.message).not.toMatch(/PRIVATE|Unsent/)
})
it('keeps unknown exits unknown while measuring stderr and unparsed output without leaking arbitrary event types',async()=>{
 const child=childFixture(),pending=runStructuredCodex('Unsent fixture',{provider:'codex',source:'global',model:null,reasoningEffort:null},{}).catch(e=>e)
 child.stdout.emit('data','{"type":"PRIVATE_EVENT"}\nNOT_JSON_PRIVATE')
 const stderr=Buffer.from('PRIVATE_UNKNOWN_FAILURE');child.stderr.emit('data',stderr);child.emit('close',1)
 const error=await pending
 if(!(error instanceof AiFailure))throw new Error('Expected a typed provider failure')
 expect(error).toMatchObject({code:'unknown',providerDetails:{reason:'other',httpStatus:null,exitCode:1},executionDetails:{lastEventType:'unknown-event',stderrBytes:stderr.length,providerErrorEvents:0,providerErrorCharacters:0,unparsedStdoutEvents:1,finalStdoutEventWithoutNewline:true}})
 expect(JSON.stringify(error)).not.toContain('PRIVATE');expect(error.message).not.toContain('PRIVATE');expect(error.executionDetails!.providerErrorHash).toMatch(/^[a-f0-9]{64}$/)
})
it('retains completed-turn usage from a final event without a newline before accepting a structured result',async()=>{
 const child=childFixture(),pending=runStructuredCodex('Unsent fixture',{provider:'codex',source:'global',model:null,reasoningEffort:null},{})
 const output=mocks.args[mocks.args.indexOf('--output-last-message')+1];writeFileSync(output,'{"answer":"synthetic"}')
 child.stdout.emit('data','{"type":"turn.completed","usage":{"input_tokens":12,"output_tokens":3,"cached_input_tokens":4}}');child.emit('close',0)
 expect(await pending).toMatchObject({answer:'synthetic',__usage:{inputTokens:12,outputTokens:3,cachedInputTokens:4},__usageEvidence:{scope:'codex-turn',completedTurns:1}})
})
it('retains only allowlisted structured provider codes and parameter names, never arbitrary values or messages',async()=>{
 const child=childFixture(),pending=runStructuredCodex('Unsent private fixture',{provider:'codex',source:'global',model:null,reasoningEffort:null},{}).catch(e=>e)
 for(const event of [
  {type:'error',error:{code:'unsupported_parameter',type:'invalid_request_error',param:'max_output_tokens',message:'Unsupported parameter: max_output_tokens PRIVATE',value:'PRIVATE_VALUE'}},
  {type:'turn.failed',error:{code:'PRIVATE_CODE',type:'PRIVATE_TYPE',param:'PRIVATE_PARAM',message:'PRIVATE_MESSAGE'}},
  {type:'item.completed',error:{code:'server_error',param:'response_format',message:'PRIVATE_ITEM'}}
 ])child.stdout.emit('data',JSON.stringify(event)+'\n')
 child.emit('close',1);const error=await pending
 if(!(error instanceof AiFailure))throw new Error('Expected a typed provider failure')
 expect(error.code).toBe('provider');expect(error.executionDetails?.providerErrorCodes).toEqual(['unsupported_parameter','invalid_request_error']);expect(error.executionDetails?.providerErrorParameters).toEqual(['max_output_tokens'])
 expect(JSON.stringify(error)).not.toContain('PRIVATE');expect(error.message).not.toContain('PRIVATE')
})
