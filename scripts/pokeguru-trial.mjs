import assert from 'node:assert/strict'
import {existsSync,mkdirSync,readFileSync,writeFileSync,unlinkSync,realpathSync} from 'node:fs'
import {join,resolve,sep} from 'node:path'
import {fileURLToPath} from 'node:url'
import {spawn} from 'node:child_process'
import {prepareValidatedGuidePreview} from './validated-guide-preview.mjs'
import {workspace,demoElectronExecutable} from './guide-demo.mjs'

/** A writable, persistent COPY for the normal app. Approved archives and the
 * installed application's personal profile are never used as destinations. */
export async function preparePokeguruTrial(approvalPath,parent=join(workspace,'.verify/app-trial')){
 const root=resolve(parent);mkdirSync(root,{recursive:true});const actualRoot=realpathSync(root),registration=join(root,'active.json')
 const inside=profile=>realpathSync(profile).toLowerCase().startsWith((actualRoot+sep).toLowerCase())
 if(existsSync(registration)){
  const saved=JSON.parse(readFileSync(registration,'utf8'))
  assert(saved.version===1&&typeof saved.profile==='string'&&inside(saved.profile),'Invalid isolated trial profile')
  assert(existsSync(join(saved.profile,'data/pokeguru.sqlite'))&&!existsSync(join(saved.profile,'demo-profile.json')),'Trial database missing or still read-only')
  return {...saved,reused:true}
 }
 const prepared=await prepareValidatedGuidePreview(approvalPath,root);assert(inside(prepared.profile))
 unlinkSync(join(prepared.profile,'demo-profile.json'))
 const saved={version:1,mode:'app-trial',profile:prepared.profile,approvalPath:resolve(approvalPath),jobId:prepared.approval.jobId,sourceHash:prepared.approval.sourceHash,createdAt:new Date().toISOString()}
 writeFileSync(join(prepared.profile,'trial-profile.json'),JSON.stringify(saved,null,2));writeFileSync(registration,JSON.stringify(saved,null,2))
 return {...saved,reused:false}
}
export function trialEnvironment(profile){
 const installed=join(process.env.LOCALAPPDATA??'','Programs/Pokeguru/resources/codex/bin/codex.exe')
 return {...process.env,POKEGURU_DATA_DIR:profile,POKEGURU_DEMO:'0',POKEGURU_AUTO_SYNC:'0',...!process.env.POKEGURU_CODEX_BIN&&existsSync(installed)?{POKEGURU_CODEX_BIN:installed}:{}}
}
async function main(){
 const approval=process.argv[2]??join(workspace,'.verify/app259-followups-20261108/third-valid/approved-source.json'),trial=await preparePokeguruTrial(approval)
 const child=spawn(demoElectronExecutable(),['.'],{cwd:workspace,env:trialEnvironment(trial.profile),stdio:'inherit',windowsHide:false})
 child.on('error',e=>{console.error(e.message);process.exitCode=1});child.on('exit',code=>{process.exitCode=code??1})
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await main()
