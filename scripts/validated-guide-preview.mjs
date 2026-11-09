import assert from 'node:assert/strict'
import {createHash,randomUUID} from 'node:crypto'
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs'
import {join,resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
import {spawn} from 'node:child_process'
import {DatabaseSync,backup} from 'node:sqlite'
import {workspace,demoEnvironment,demoElectronExecutable} from './guide-demo.mjs'

export const defaultApproval=join(workspace,'.verify/app259-until-valid-20261108/first-valid/approved-source.json')
const hash=value=>createHash('sha256').update(value).digest('hex')

/** Copies one actual, sealed result; never reconstructs or edits guide content.
 * The approval is emitted only after full validation, save, reopen and UI QA. */
export async function prepareValidatedGuidePreview(approvalPath=defaultApproval,parent=join(workspace,'.verify/validated-guide-preview')){
 const approval=JSON.parse(readFileSync(approvalPath,'utf8'))
 assert.equal(approval.passed,true,'Only an approved guide can be previewed')
 assert.equal(approval.terminal?.passed,true,'The real validation run must have completed')
 const sourcePath=resolve(workspace,approval.sourcePath),reportPath=resolve(workspace,approval.reportPath)
 const sourceBytes=readFileSync(sourcePath),reportBytes=readFileSync(reportPath),report=JSON.parse(reportBytes)
 assert.equal(hash(sourceBytes),approval.sourceHash,'Source archive changed')
 assert.equal(hash(reportBytes),approval.reportHash,'Original report changed')
 assert.equal(hash(JSON.stringify(report.guide)),approval.guideHash,'Guide content changed')
 assert.equal(report.jobId,approval.jobId);assert.equal(report.jobId,approval.terminal.jobId)
 assert.equal(report.guide.review.verdict,'pass')
 const profile=join(resolve(parent),'session-'+randomUUID());mkdirSync(join(profile,'data'),{recursive:true})
 const source=new DatabaseSync(sourcePath,{readOnly:true});let title
 try{
  const row=source.prepare('SELECT payload FROM matchup_reports WHERE project_id=? AND opponent_id=?').get(report.projectId,report.opponentId)
  assert.deepEqual(JSON.parse(row?.payload??'null'),report,'Report must match the validated SQLite original')
  assert.equal(source.prepare('SELECT status FROM ai_jobs WHERE id=?').get(report.jobId)?.status,'applied')
  const meta=JSON.parse(source.prepare('SELECT payload FROM meta_snapshots WHERE id=?').get(report.metaId)?.payload??'null')
  const project=source.prepare('SELECT name FROM projects WHERE id=?').get(report.projectId)
  assert(meta&&project,'Frozen project and meta must be present')
  const opponent=meta.decks.find(d=>d.id===report.opponentId);assert(opponent)
  title=project.name+' – '+opponent.name
  await backup(source,join(profile,'data/pokeguru.sqlite'))
 }finally{source.close()}
 assert.equal(hash(readFileSync(sourcePath)),approval.sourceHash,'Preview preparation must not alter its source')
 const manifest={formatVersion:1,mode:'validated-readonly',guides:[{projectId:report.projectId,opponentId:report.opponentId,metaId:report.metaId,title,promptVersion:report.guide.basis.promptVersion,generatedAt:report.generatedAt}]}
 writeFileSync(join(profile,'demo-profile.json'),JSON.stringify(manifest,null,2))
 writeFileSync(join(profile,'provenance.json'),JSON.stringify({approvalPath:resolve(approvalPath),sourcePath,sourceHash:approval.sourceHash,reportHash:approval.reportHash,guideHash:approval.guideHash,realCalls:0},null,2))
 return {profile,manifest,approval,report}
}
async function main(){
 const {profile}=await prepareValidatedGuidePreview(process.argv[2]??defaultApproval)
 const child=spawn(demoElectronExecutable(),['.'],{cwd:workspace,env:demoEnvironment(profile),stdio:'inherit',windowsHide:false})
 child.on('spawn',()=>{mkdirSync(join(workspace,'.verify/validated-guide-preview'),{recursive:true});writeFileSync(join(workspace,'.verify/validated-guide-preview/latest-session.json'),JSON.stringify({profile,pid:child.pid,mode:'validated-readonly',realCalls:0},null,2))})
 child.on('error',error=>{console.error(error.message);process.exitCode=1})
 child.on('exit',code=>{process.exitCode=code??1})
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await main()
