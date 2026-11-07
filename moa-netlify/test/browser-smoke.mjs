import {chromium,webkit,devices} from 'playwright';
import assert from 'node:assert/strict';
const base=process.env.BASE_URL||'http://127.0.0.1:3001';
const output=process.env.SCREENSHOT_DIR||'';
const browsers=[await webkit.launch({headless:true}),await chromium.launch({headless:true,args:['--no-sandbox']})];
const errors=[];let contexts=[];
async function newPage(i){const browser=browsers[i<3?0:1],device=i<3?devices['iPhone 13']:devices['Pixel 5'];const c=await browser.newContext({...device,serviceWorkers:'block'});contexts.push(c);const p=await c.newPage();p.on('pageerror',e=>errors.push(e.message));return p;}
async function closePages(){await Promise.all(contexts.map(c=>c.close()));contexts=[];}
async function shot(page,name){if(output)await page.screenshot({path:`${output}/${name}.png`,fullPage:true});}
async function makeRoom(game,n=6){
 const pages=await Promise.all(Array.from({length:n},(_,i)=>newPage(i)));let p=pages[0];
 await p.goto(base+'/',{waitUntil:'domcontentloaded'});await p.waitForFunction(()=>S.connected);await p.locator('[data-do="create-modal"]').first().click();
 await p.locator(`#overlay [data-do="modal-game"][data-game="${game}"]`).click();await p.locator('#modal-name').fill('하나');await p.locator('[data-form="create"] button[type="submit"]').click();await p.getByText('친구들을 기다리는 중').waitFor();const code=await p.locator('.room-code-chip b').textContent();assert.equal(code.length,8);
 await p.waitForFunction(()=>document.querySelector('.share-qr')?.naturalWidth>0);
 await Promise.all(pages.slice(1).map(async(q,i)=>{await q.goto(`${base}/?room=${code}`);await q.locator('#modal-name').waitFor();await q.locator('#modal-name').fill(`친구${i+2}`);await q.locator('[data-form="join"] button[type="submit"]').click();await q.getByText('친구들을 기다리는 중').waitFor();}));
 await p.waitForFunction(n=>S.room?.players.length===n,n);await p.locator('[data-do="start-game"]').click();await Promise.all(pages.map(q=>q.waitForFunction(()=>S.room?.started)));return pages;
}
try{
 let pages=await makeRoom('tile');await shot(pages[0],'tile-mobile');
 assert.equal(await pages[0].locator('.rack-area .tile').count(),14);await pages[0].locator('.rack-area .tile').nth(0).click();await pages[0].locator('.rack-area .tile').nth(1).click();await pages[0].locator('.rack-area .tile').nth(2).click();await pages[0].locator('[data-do="tile-new"]').click();assert.equal(await pages[0].locator('.table-area .tile').count(),3);await pages[0].locator('[data-do="tile-reset"]').click();assert.equal(await pages[0].locator('.rack-area .tile').count(),14);await pages[0].locator('[data-do="tile-draw"]').click();await pages[0].waitForFunction(()=>S.room.game.turn!==S.room.me);await pages[0].waitForFunction(()=>S.room.game.rack.length===15);assert.equal(await pages[0].locator('.rack-area .tile').count(),15);
 const myCards=await pages[0].evaluate(()=>S.room.game.rack.map(t=>t.id));const otherCards=await pages[1].evaluate(()=>S.room.game.rack.map(t=>t.id));assert.ok(myCards.every(id=>!otherCards.includes(id)));
 // Reload retains the same seat and rack, even with a separate request to the server.
 await pages[0].reload();await pages[0].waitForFunction(()=>S.room?.started);assert.deepEqual(await pages[0].evaluate(()=>S.room.game.rack.map(t=>t.id)),myCards);
 await closePages();
 pages=await makeRoom('island');await shot(pages[0],'island-setup-mobile');
 const idPages=new Map(await Promise.all(pages.map(async p=>[await p.evaluate(()=>S.room.me),p])));
 let g=await pages[0].evaluate(()=>S.room.game),steps=0;assert.equal(g.tiles.length,30);assert.equal(g.ports.length,11);
 const labels=await pages[0].locator('.island-viewport text').evaluateAll(els=>els.filter(e=>['10','12','2:1','3:1'].includes(e.textContent)).map(e=>({spacing:getComputedStyle(e).letterSpacing,pointer:getComputedStyle(e).pointerEvents})));assert.ok(labels.length>0);assert.ok(labels.every(v=>v.spacing==='normal'&&v.pointer==='none'));
 while(g.phase.startsWith('setup_')){
  const rev=g.revision;const p=idPages.get(g.turn);assert.ok(p);await p.waitForFunction(r=>S.room.game.revision===r,rev);const selector=g.phase==='setup_settlement'?'[data-do="island-vertex"]':'[data-do="island-edge"]';await p.locator(selector).first().click();await pages[0].waitForFunction(r=>S.room.game.revision>r,rev);g=await pages[0].evaluate(()=>S.room.game);assert.ok(++steps<=24);
 }
 assert.equal(steps,24);assert.equal(g.phase,'roll');await pages[0].locator('[data-do="island-action"][data-type="roll"]').click();await pages[0].waitForFunction(()=>S.room.game.phase!=='roll');g=await pages[0].evaluate(()=>S.room.game);
 if(g.phase==='discard'){for(const p of pages){const d=await p.evaluate(()=>S.room.game.pendingDiscard);if(d){/* setup hands cannot exceed seven */throw Error('unexpected discard in first roll');}}}
 if(g.phase==='robber'){await pages[0].locator('[data-do="island-hex"]').first().click();await pages[0].waitForFunction(()=>S.room.game.phase!=='robber');g=await pages[0].evaluate(()=>S.room.game);}if(g.phase==='steal'){await pages[0].locator('[data-do="island-steal"]').first().click();await pages[0].waitForFunction(()=>S.room.game.phase==='main');}
 assert.ok(await pages[0].locator('.offer-give-input').count()===5);assert.ok(await pages[0].locator('.offer-want-input').count()===5);
 const edit=pages[0].locator('.offer-want-input[data-resource="wood"]');await edit.fill('2');await pages[0].evaluate(()=>render());assert.equal(await edit.inputValue(),'2');
 await shot(pages[0],'island-main-mobile');
 // Test the special-build UI independently of the randomly dealt resources.
 await pages[0].evaluate(()=>{S.room.game.phase='special';S.room.game.turn=S.room.me;render();});
 assert.ok(await pages[0].getByText('특별 건설 마치기').count());assert.equal(await pages[0].locator('.offer-give-input').count(),0);
 await closePages();
 pages=await makeRoom('dice');await shot(pages[0],'dice-mobile');await pages[0].locator('[data-do="dice-roll"]').click();await pages[0].waitForFunction(()=>S.room.game.rolls===1);await pages[0].locator('[data-do="die-hold"]').first().click();await pages[0].waitForFunction(()=>S.room.game.held[0]);await pages[0].locator('[data-do="dice-score"]').first().click();await pages[0].waitForFunction(()=>S.room.game.turn!==S.room.me);assert.equal(await pages[0].locator('.score-table tbody tr').count(),14);await closePages();
 // The installable shell can load offline, but game actions still require the network.
 const pwaContext=await browsers[1].newContext({...devices['Pixel 5']});contexts.push(pwaContext);const shell=await pwaContext.newPage();await shell.goto(base);await shell.evaluate(()=>navigator.serviceWorker.ready);await shell.reload();await shell.waitForFunction(()=>!!navigator.serviceWorker.controller);assert.ok((await shell.evaluate(()=>caches.keys())).includes('moa-netlify-v2'));
 await pwaContext.setOffline(true);await shell.reload();await shell.getByText('어디서든, 우리끼리').waitFor();await closePages();
 assert.deepEqual(errors,[]);console.log('Browser smoke PASS: 3 WebKit iPhone + 3 Chromium Android, each of three games; QR, privacy/rejoin, 24 island placements, dice turn and offline shell.');
}finally{await closePages();await Promise.all(browsers.map(b=>b.close()));}
