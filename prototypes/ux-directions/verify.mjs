import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_CORE || 'playwright-core');
const dir = path.dirname(fileURLToPath(import.meta.url));
await mkdir(path.join(dir,'screenshots'),{recursive:true});
const browser = await chromium.launch({executablePath:process.env.EDGE_BIN || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
const page = await browser.newPage();
const errors=[];page.on('pageerror',e=>errors.push(e.message));
const action = key => page.locator(`[data-action="${key}"]:visible`).first();
async function checkLayout(label){const overflow=await page.evaluate(()=>({body:document.documentElement.scrollWidth>innerWidth+1,items:[...document.querySelectorAll('button,input,textarea,table,h1,h2')].filter(e=>e.getClientRects().length&&!e.closest('dialog:not([open])')).filter(e=>e.getBoundingClientRect().right>innerWidth+1||e.getBoundingClientRect().left< -1).map(e=>e.textContent.slice(0,50))}));assert.equal(overflow.body,false,label);assert.deepEqual(overflow.items,[],label);}
async function start(concept,width=1440,height=900){await page.setViewportSize({width,height});await page.goto(new URL(`index.html?concept=${concept}&capture=1`,import.meta.url).href);await checkLayout(concept+' '+width);}
try {
  for(const concept of ['a','b','c'])for(const [width,height] of [[1440,900],[1024,768],[640,720],[640,580]]){
    await start(concept,width,height);
    if(width===1440||height===720)await page.screenshot({path:path.join(dir,`screenshots/${concept}-${width}.png`),fullPage:false});
    for(const section of ['deck','decisions','prepare']){await action(section).click();await checkLayout(concept+' '+section+' '+width);}
  }
  await start('a');
  await page.locator('#ask').fill('Valutiamo una quarta copia di Absol togliendo una Iono.');
  await action('ask').click();
  await action('compare').click();
  assert.ok(await page.locator('dialog').isVisible());
  await action('adopt').click();
  assert.match(await page.locator('dialog').innerText(),/v3 a v4/);
  await action('confirm').click();
  await action('prepare').click();
  assert.match(await page.locator('.guide').innerText(),/Guida storica/);
  await page.screenshot({path:path.join(dir,'screenshots/after-adoption.png')});
  await start('a',640,580);
  await page.locator('[data-action="card"][data-name="Iono"]').click();
  await page.locator('#ask').fill('Bozza da conservare');
  await action('mobile-list').click();
  await action('mobile-context').click();
  assert.equal(await page.locator('#ask').inputValue(),'Bozza da conservare');
  await checkLayout('compact context');
  await start('b',640,580);
  await action('old').click();
  assert.ok(await action('adopt').isDisabled());
  await action('rebase').click();
  await checkLayout('stale dialog 640');
  await action('new-current').click();
  assert.match(await page.locator('#ask').inputValue(),/v3/);
  await start('c',640,720);
  await page.locator('[data-action="phase"][data-value="1"]').click();
  assert.match(await page.locator('.reading').innerText(),/compromesso/);
  await action('relevant-card').click();
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('dialog').isVisible(),false);
  await page.locator('#guide-question').fill('Approfondiamo il compromesso.');
  await action('guide-ask').click();
  assert.match(await page.locator('.guide-question').innerText(),/Discussione aperta/);
  await page.locator('[data-action="opponent"][data-name="Gardevoir ex"]').click();
  await action('generate').click();
  await checkLayout('empty guide dialog');
  assert.deepEqual(errors,[]);
  console.log('OK: 3 architetture × 4 dimensioni, 3 attività; domanda → confronto → conferma → guida storica; base superata; carta contestuale, fasi e domanda guida; nessun errore JS o overflow orizzontale.');
} finally { await browser.close(); }
