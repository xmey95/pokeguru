import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_CORE||'playwright-core');
const dir=path.dirname(fileURLToPath(import.meta.url));
await mkdir(path.join(dir,'screenshots'),{recursive:true});
const browser=await chromium.launch({executablePath:process.env.EDGE_BIN||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
 for(const [width,height] of [[1440,900],[640,720],[640,580]]){
  await page.setViewportSize({width,height});
  for(const state of ['loaded','historical','legacy','error','loading','empty','long','limited']){
   await page.goto(new URL(`index.html?view=matchup&state=${state}&capture=1`,import.meta.url).href);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,`${width} ${state}`);
   const rectangles=await page.evaluate(()=>{const a=document.querySelector('.workspace').getBoundingClientRect(),b=document.querySelector('.deck-companion').getBoundingClientRect();return{ok:a.right<=b.left+1||a.bottom<=b.top+1,scroll:document.querySelector('.companion-scroll').scrollHeight>document.querySelector('.companion-scroll').clientHeight}});
   assert.ok(rectangles.ok);assert.ok(rectangles.scroll);
   if(state==='legacy')assert.equal(await page.getByRole('tab').count(),0);
   if(state==='limited')assert.match(await page.locator('.refine-limit').innerText(),/Lista avversaria incompleta/);
   if(state==='loaded'){
    await page.locator('#refine-feedback').fill('Conserva questa osservazione.');
    await page.getByRole('tab',{name:'Sviluppo',exact:true}).click();
    assert.equal(await page.locator('.phase-panel:visible').count(),1);
    assert.match(await page.locator('.phase-panel:visible').innerText(),/Scegli quali risorse/);
    await page.getByRole('tab',{name:'Sviluppo',exact:true}).press('End');
    assert.equal(await page.getByRole('tab',{name:'Chiusura',exact:true}).getAttribute('aria-selected'),'true');
    assert.equal(await page.locator('#refine-feedback').inputValue(),'Conserva questa osservazione.');
    await page.getByRole('tab',{name:'Chiusura',exact:true}).press('Home');
    await page.locator('#refine-feedback').fill('');
    await page.locator('.workspace').evaluate(e=>e.scrollTop=0);
    if(height!==580)await page.screenshot({path:path.join(dir,`screenshots/matchup-${width}.png`)});
   }
  }
 }
 assert.deepEqual(errors,[]);
 console.log('OK: otto stati a 1440×900, 640×720, 640×580; tab/tastiera/bozza; guida legacy intera; lista persistente e scroll separato; nessun errore JS o overflow orizzontale.');
}finally{await browser.close()}
