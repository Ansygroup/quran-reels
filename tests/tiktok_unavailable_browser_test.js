'use strict';
// Chromium, synthetic account and isolated loopback server; API and external network blocked.
const assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const {chromium}=require('playwright-core'),chrome=require('@sparticuz/chromium').default;
const root=path.resolve(__dirname,'../public');
const server=http.createServer((req,res)=>{const u=new URL(req.url,'http://localhost');if(u.pathname.startsWith('/api/'))return res.writeHead(403).end();const file=path.resolve(root,'.'+(u.pathname==='/'?'/index.html':u.pathname));if(!file.startsWith(root+path.sep))return res.writeHead(403).end();fs.readFile(file,(err,data)=>err?res.writeHead(404).end():res.writeHead(200,{'Content-Type':({'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml'})[path.extname(file)]||'application/octet-stream'}).end(data));});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;const browser=await chromium.launch({executablePath:await chrome.executablePath(),args:chrome.args,headless:true});
try {
 const ctx=await browser.newContext({viewport:{width:Number(process.env.REEL_TEST_WIDTH||390),height:844},serviceWorkers:'block'});
 await ctx.route('**/*',r=>r.request().url().startsWith(origin+'/')?r.continue():r.abort());
 const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(origin,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>typeof Creator!=='undefined'&&Creator.ready);
 await page.evaluate(()=>{
  document.querySelector('#view-home').hidden=true;document.querySelector('#view-account').hidden=false;document.querySelector('#cookieBar').hidden=true;
  const a=PublishApp;a._accountOwner='owner';a._connectionsState='loaded';
  a.connections=[{id:'yt',platform:'youtube',account_name:'قناة تجريبية',is_default:true,has_refresh:true},{id:'tt',platform:'tiktok',account_name:'حساب تجريبي',is_default:true,has_refresh:true}];
  a.data={config:{settings_revision:'11111111-1111-4111-8111-111111111111',enabled:true,platforms:['youtube','tiktok'],all_channels:false,template:{content_mode:'mix',background:'rotate'}},available:[{key:'youtube',name:'يوتيوب',publish:true,connect:'youtube',ready:true},{key:'tiktok',name:'تيك توك',publish:false,connect:null,ready:false}],options:{content_modes:['mix'],backgrounds:['rotate'],reciters:[]},runs:[],stats:{published:0,scheduled:0,failed:0}};
  window.AuthApp={getUserId:async()=> 'owner',getToken:async()=> 'fixture'};window.fetch=async()=>({ok:true,json:async()=>({connections:a.connections})});a.renderAccount(a.data);a.bindEvents();
 });
 await page.evaluate(()=>PublishApp.renderConnections('fixture'));
 const card=page.locator('.chan-group[data-soc="tiktok"]');assert.match(await card.innerText(),/قريبًا/);assert.match(await card.innerText(),/حساب تجريبي/);
 assert.equal(await card.locator('[data-connect]').count(),0);assert.equal(await card.locator('[data-unlink="tt"]').count(),1);
 await page.locator('#acctCustomize > summary').click();const option=page.locator('#plat-tiktok');assert.equal(await option.isDisabled(),true);assert.equal(await option.isChecked(),true);
 assert.match(await page.locator('#acctPlatforms').innerText(),/التشغيل يتوقف.*حفظ التعديلات يزيل/);
 assert.deepEqual(await page.evaluate(()=>PublishApp.data.config.platforms),['youtube','tiktok']);
 // The explicit save sends only available platforms; it does not silently do so during render.
 await page.evaluate(()=>{window.sent=[];PublishApp.api=async(action,body)=>{window.sent.push({action,body});return {ok:false,status:400,error:'fixture blocked'}}});
 assert.equal(await page.evaluate(()=>window.sent.length),0);await page.evaluate(()=>PublishApp.saveSettings());
 const sent=await page.evaluate(()=>window.sent);assert.equal(sent.length,1);assert.equal(sent[0].action,'save');assert.deepEqual(sent[0].body.platforms,['youtube']);
 assert.deepEqual(await page.evaluate(()=>PublishApp.data.config.platforms),['youtube','tiktok']);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.deepEqual(errors,[]);
 await ctx.close();console.log('PASS TikTok coming soon, existing connection and saved selection, explicit save (mock browser)');
}finally{await browser.close();server.close()}
})().catch(e=>{console.error(e);server.close();process.exitCode=1});
