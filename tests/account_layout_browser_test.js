/* Account redesign: real browser, synthetic account and no provider/API writes. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const {chromium}=require('playwright-core'),chrome=require('@sparticuz/chromium').default;
const root=path.resolve(__dirname,'../public');
const server=http.createServer((req,res)=>{
 const u=new URL(req.url,'http://localhost');if(u.pathname.startsWith('/api/'))return res.writeHead(403).end();
 const file=path.resolve(root,'.'+(u.pathname==='/'?'/index.html':u.pathname));if(!file.startsWith(root+path.sep))return res.writeHead(403).end();
 fs.readFile(file,(err,data)=>err?res.writeHead(404).end():res.writeHead(200,{'Content-Type':({'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml'})[path.extname(file)]||'application/octet-stream'}).end(data));
});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;const browser=await chromium.launch({executablePath:await chrome.executablePath(),args:chrome.args,headless:true});
try{
 const ctx=await browser.newContext({viewport:{width:Number(process.env.REEL_TEST_WIDTH||390),height:844},serviceWorkers:'block'});
 await ctx.route('**/*',r=>r.request().url().startsWith(origin+'/')?r.continue():r.abort());
 const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(origin,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>typeof Creator!=='undefined'&&Creator.ready);
 await page.evaluate(()=>{
  document.querySelector('#view-home').hidden=true;document.querySelector('#view-account').hidden=false;document.querySelector('#cookieBar').hidden=true;document.querySelector('#acctNotice').hidden=true;
  const a=PublishApp;a._accountOwner='u';a._connectionsState='loaded';a.connections=[{id:'channel',platform:'youtube',account_name:'قناة تجريبية',is_default:true,has_refresh:true}];
  a.data={config:{settings_revision:'11111111-1111-4111-8111-111111111111',enabled:true,platforms:['youtube'],all_channels:false,template:{content_mode:'mix',background:'rotate'}},available:[{key:'youtube',name:'يوتيوب',publish:true,ready:true}],options:{content_modes:['mix'],backgrounds:['rotate'],reciters:[]},runs:[],stats:{published:2,scheduled:0,failed:0},pending_review:{available:true,items:[{id:'p',platform:'youtube',status:'draft',target_recorded:false,channel:null}]},failed_review:{available:false,items:[]}};
  a.renderAccount(a.data);a.bindEvents();a.renderProgress({run:{status:'queued',title:'فيديو تجريبي'},events:[{stage:'checking'},{stage:'publishing'}],targets:[{platform:'youtube',status:'failed'}],targets_available:true});
  window.AuthApp={getUserId:async()=> 'u',getToken:async()=> 'fixture'};window.fetch=async()=>({ok:true,json:async()=>({connections:a.connections})});
 });
 await page.evaluate(()=>PublishApp.renderConnections('fixture'));
 for(const id of ['acctCustomize','acctHistoryDisclosure','acctPendingDisclosure','acctFailedDisclosure','acctGuide','acctTools'])assert.equal(await page.locator('#'+id).evaluate(e=>e.open),false,id);
 assert.equal(await page.locator('#acctEnabled + i').isVisible(),true);assert.match(await page.locator('#acctPendingSummary').innerText(),/1 في اللقطة/);assert.match(await page.locator('#acctFailedSummary').innerText(),/تعذّر التحقق/);
 assert.match(await page.locator('#acctProgress').innerText(),/تحتاج مراجعة/);
 if(process.env.ACCOUNT_SCREENSHOT)await page.screenshot({path:process.env.ACCOUNT_SCREENSHOT,fullPage:true});
 await page.locator('.acct-progress-detail summary').click();await page.evaluate(()=>PublishApp.renderProgress({run:{status:'queued'},events:[{stage:'publishing'}],targets:[],targets_available:true}));assert.equal(await page.locator('.acct-progress-detail').evaluate(e=>e.open),true);
 await page.locator('#acctCustomize > summary').focus();await page.keyboard.press('Enter');assert.equal(await page.locator('#acctCustomize').evaluate(e=>e.open),true);
 await page.locator('#acctDed').fill('مسودة تجريبية');assert.equal(await page.locator('#acctDraftBadge').isVisible(),true);
 await page.locator('#acctCustomize > summary').click();assert.equal(await page.locator('#acctDraftBadge').isVisible(),true);
 await page.evaluate(()=>PublishApp.renderAccount(PublishApp.data));await page.locator('#acctCustomize > summary').click();assert.equal(await page.locator('#acctDed').inputValue(),'مسودة تجريبية');
 await page.locator('#acctPendingDisclosure > summary').click();assert.match(await page.locator('#acctPendingReview').innerText(),/لا تلغي المهام/);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'no horizontal overflow');assert.deepEqual(errors,[]);
 await page.evaluate(()=>PublishApp.clearAccountData('other'));assert.equal(await page.locator('#acctDraftBadge').isHidden(),true);assert.match(await page.locator('#acctPendingSummary').textContent(),/جارٍ التحقق/);
 await ctx.close();console.log('PASS uncluttered account layout, keyboard disclosures, truthful review indicators and preserved draft (mocked browser)');
}finally{await browser.close();server.close()}
})().catch(e=>{console.error(e);server.close();process.exitCode=1});
