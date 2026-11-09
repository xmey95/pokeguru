import assert from 'node:assert/strict'
import fs from 'node:fs'
import {resolve,join} from 'node:path'
import {createHash} from 'node:crypto'
import {DatabaseSync} from 'node:sqlite'
import {_electron as electron} from 'playwright-core'
import {preparePokeguruTrial,trialEnvironment} from '../scripts/pokeguru-trial.mjs'
const root=resolve('.'),out=resolve(process.env.POKEGURU_TRIAL_UI_OUTPUT??'.verify/app259-app-adoption-20261108/normal-trial-ui'),approvalPath=resolve('.verify/app259-followups-20261108/third-valid/approved-source.json'),approval=JSON.parse(fs.readFileSync(approvalPath)),report=JSON.parse(fs.readFileSync(approval.reportPath)),parent=fs.mkdtempSync(resolve('.verify/trial-qa-')),trial=await preparePokeguruTrial(approvalPath,parent),database=join(trial.profile,'data/pokeguru.sqlite'),hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex'),beforeHash=hash(approval.sourcePath)
fs.mkdirSync(out,{recursive:true})
function state(){const db=new DatabaseSync(database,{readOnly:true});try{return {attempts:db.prepare("SELECT count(*) n FROM ai_evidence_values WHERE role='guide-attempt-start'").get().n,report:db.prepare('SELECT payload FROM matchup_reports WHERE project_id=? AND opponent_id=?').get(report.projectId,report.opponentId).payload,project:db.prepare('SELECT name FROM projects WHERE id=?').get(report.projectId),meta:JSON.parse(db.prepare('SELECT payload FROM meta_snapshots WHERE id=?').get(report.metaId).payload)}}finally{db.close()}}
const before=state(),errors=[];let app
try{
 app=await electron.launch({executablePath:resolve('.verify/node_modules/electron/dist/electron.exe'),args:['.'],cwd:root,env:trialEnvironment(trial.profile)})
 const page=await app.firstWindow({timeout:30000});page.setDefaultTimeout(30000);page.on('pageerror',e=>errors.push(String(e)))
 // Pin only the public metagame response to the actual approved snapshot.
 // All project/report/workflow reads and the writable app mode use real IPC.
 await app.evaluate(({ipcMain},snapshot)=>{ipcMain.removeHandler('matchups:get-meta');ipcMain.handle('matchups:get-meta',()=>({ok:true,value:{...snapshot,cached:true}}))},before.meta)
 await page.locator('#project-switcher-trigger').click();await page.getByRole('dialog',{name:'Scegli progetto'}).getByRole('button').filter({hasText:before.project.name}).first().click()
 const mode=await page.evaluate(()=>window.demoApi.getInfo());assert.equal(mode,null)
 await page.getByRole('button',{name:'Guide matchup',exact:true}).click()
 const opponent=before.meta.decks.find(d=>d.id===report.opponentId);assert(opponent)
 await page.locator('#matchup-switcher-trigger').click();await page.getByRole('dialog',{name:'Scegli avversario'}).getByRole('button').filter({hasText:opponent.name}).first().click()
 const guide=page.locator('.strategy-field .deep-matchup-guide');await guide.waitFor({timeout:60000})
 for(const chapter of report.guide.chapters)await guide.getByRole('heading',{name:chapter.title,exact:true}).waitFor()
 assert.equal(await guide.locator('.deep-guide-scenario').count(),2);assert.equal(await guide.locator('.deep-guide-exercise').count(),2)
 assert.equal(await page.getByRole('button',{name:'Rigenera guida',exact:true}).count(),1)
 assert.equal(await page.getByText(/senza un tetto preimpostato alle chiamate/).count(),1)
 const baseline=await page.evaluate(id=>window.projectsApi.getBaseline(id),report.projectId);assert(baseline.ok&&baseline.value.interpretedTotal===60)
 const created=await page.evaluate(()=>window.projectsApi.create({name:'Isolated normal-mode QA',format:'STANDARD'}));assert(created.ok)
 for(const [width,height]of [[1440,900],[1280,800],[640,900]]){await page.setViewportSize({width,height});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1||document.querySelector('.main-content').scrollWidth>document.querySelector('.main-content').clientWidth+1),false);await page.screenshot({path:join(out,'normal-'+width+'.png')})}
 await app.close();app=null
 const after=state();assert.equal(after.attempts,before.attempts);assert.equal(after.report,before.report);assert.equal(hash(approval.sourcePath),beforeHash);assert.deepEqual(errors,[])
 const reused=await preparePokeguruTrial(approvalPath,parent);assert(reused.reused&&reused.profile===trial.profile)
 const db=new DatabaseSync(database,{readOnly:true});try{assert(db.prepare('SELECT id FROM projects WHERE id=?').get(created.value.id))}finally{db.close()}
 fs.writeFileSync(join(out,'result.json'),JSON.stringify({at:new Date().toISOString(),passed:true,newGuideModelCalls:0,normalAppMode:true,writableProjectCreated:true,persistentProfile:true,approvedGuideAndOriginalArchiveUnchanged:true,publicMetaPinned:true,ordinaryIpcRealGenerationNotClaimed:true,viewports:[1440,1280,640],errors,qaProfile:trial.profile,notUserTrialProfile:true},null,2))
}catch(error){if(app){const page=await app.firstWindow();await page.screenshot({path:join(out,'failure.png')}).catch(()=>{})}throw error}
finally{if(app)await app.close()}
