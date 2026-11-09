import assert from 'node:assert/strict'
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs'
import {join,resolve} from 'node:path'
import {createHash} from 'node:crypto'
import {DatabaseSync} from 'node:sqlite'
import {_electron as electron} from 'playwright-core'
import {prepareValidatedGuidePreview} from '../scripts/validated-guide-preview.mjs'
import {workspace,demoEnvironment} from '../scripts/guide-demo.mjs'

const output=resolve(process.env.POKEGURU_PREVIEW_UI_OUTPUT??'.verify/app259-until-valid-20261108/preview-ui');mkdirSync(output,{recursive:true})
// Use the same short profile parent as the actual launcher. Nested diagnostic
// output paths can exceed SQLite's Windows backup path limit.
const {profile,manifest,approval,report}=await prepareValidatedGuidePreview(process.env.POKEGURU_PREVIEW_APPROVAL)
const path=join(profile,'data/pokeguru.sqlite'),guide=manifest.guides[0],errors=[]
const hash=value=>createHash('sha256').update(value).digest('hex')
function state(){const db=new DatabaseSync(path,{readOnly:true});try{return {jobs:db.prepare('SELECT * FROM ai_jobs ORDER BY id').all(),calls:db.prepare('SELECT * FROM ai_call_state ORDER BY key').all(),attempts:db.prepare("SELECT count(*) n FROM ai_evidence_values WHERE role='guide-attempt-start'").get().n,report:JSON.parse(db.prepare('SELECT payload FROM matchup_reports WHERE project_id=? AND opponent_id=?').get(guide.projectId,guide.opponentId).payload)}}finally{db.close()}}
const before=state();let app
const launch=async()=>{
 const instance=await electron.launch({executablePath:resolve('.verify/node_modules/electron/dist/electron.exe'),args:['.'],cwd:workspace,env:demoEnvironment(profile)})
 let diagnostic='';instance.process().stderr?.on('data',chunk=>{diagnostic=(diagnostic+String(chunk)).slice(-12000);writeFileSync(join(output,'electron-stderr.log'),diagnostic)})
 return instance
}
try{
 app=await launch();let page=await app.firstWindow();page.on('pageerror',e=>errors.push(String(e)))
 await page.getByRole('region',{name:'Guida verificata offline'}).waitFor()
 await page.getByRole('button',{name:guide.title,exact:true}).click()
 const content=page.locator('.strategy-field .deep-matchup-guide');await content.waitFor()
 for(const chapter of report.guide.chapters)await content.getByRole('heading',{name:chapter.title,exact:true}).waitFor()
 assert.equal(await content.locator('.deep-guide-scenario').count(),2)
 assert.equal(await content.locator('.deep-guide-exercise').count(),2)
 assert.equal(await page.getByRole('button',{name:'Rigenera guida',exact:true}).count(),0)
 const blocked=await page.evaluate(async g=>Promise.all([window.projectsApi.generateMatchup(g.projectId,g.metaId,g.opponentId),window.projectsApi.resumeAiJob(g.projectId,g.opponentId),window.projectsApi.recoverAiJobs(),window.projectsApi.syncCatalog(),window.projectsApi.create({name:'Forbidden',format:'STANDARD'})]),guide)
 assert(blocked.every(r=>r.ok===false&&r.error.includes('Demo offline')))
 for(const [width,height]of [[1440,900],[1280,800],[640,900]]){
  await page.setViewportSize({width,height});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1||document.querySelector('.main-content').scrollWidth>document.querySelector('.main-content').clientWidth+1),false)
  await page.screenshot({path:join(output,`preview-${width}.png`)})
 }
 const baseline=await page.evaluate(id=>window.projectsApi.getBaseline(id),guide.projectId);assert.equal(baseline.ok,true);assert.equal(baseline.value.interpretedTotal,60)
 await app.close();app=null
 app=await launch();page=await app.firstWindow();page.on('pageerror',e=>errors.push(String(e)))
 await page.getByRole('region',{name:'Guida verificata offline'}).waitFor();await page.locator('.strategy-field .deep-matchup-guide').waitFor()
 assert.deepEqual(state(),before,'Preview must not alter jobs, calls, reports or approvals')
 assert.equal(hash(JSON.stringify(before.report.guide)),approval.guideHash)
 assert.equal(hash(readFileSync(resolve(workspace,approval.sourcePath))),approval.sourceHash)
 assert.deepEqual(errors,[])
 writeFileSync(join(output,'result.json'),JSON.stringify({passed:true,realCalls:0,profile,chapters:8,scenarios:2,exercises:2,baseline:60,blocked:blocked.length,reopened:true,viewports:[1440,1280,640],errors},null,2))
}catch(error){if(app){const p=await app.firstWindow();await p.screenshot({path:join(output,'failure.png')}).catch(()=>{})}throw error}
finally{if(app)await app.close()}
