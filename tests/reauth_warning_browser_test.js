'use strict';
/* Real Chromium UI rendering; synthetic account/network, no provider access. */
const assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http');
const {chromium}=require('playwright-core'),chrome=require('@sparticuz/chromium').default;
const html=`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"></head><body><div id="acctDot"></div><div id="acctStateLabel"></div><div id="acctNextRun"></div><input id="acctEnabled" type="checkbox"><div id="acctAlerts"></div><div id="acctAccounts" hidden><div id="acctAccountsList"></div></div><script src="/publish.js"></script></body></html>`;
const server=http.createServer((req,res)=>{if(req.url==='/')return res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'}).end(html);if(req.url==='/publish.js')return res.writeHead(200,{'Content-Type':'text/javascript; charset=utf-8'}).end(fs.readFileSync('public/js/publish.js'));res.writeHead(404).end()});
(async()=>{let browser;try{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
 browser=await chromium.launch({executablePath:await chrome.executablePath(),args:chrome.args,headless:true});const context=await browser.newContext({serviceWorkers:'block',viewport:{width:Number(process.env.REEL_TEST_WIDTH||390),height:844}});
 let external=[];await context.route('**/*',route=>{if(route.request().url().startsWith(origin+'/'))return route.continue();external.push(route.request().url());return route.abort()});const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(origin);
 await page.evaluate(async()=>{
  const app=PublishApp;app._accountOwner='owner';app._autoDirty=true;app.available=[{key:'youtube',name:'يوتيوب',publish:true,connect:'youtube',ready:true}];app.reauth=['youtube'];app.data={config:{enabled:true,platforms:['youtube']}};
  window.__starts=0;window.AuthApp={getUserId:async()=> 'owner',getToken:async()=> 'fixture-session'};window.toast=message=>{window.__message=message};
  window.fetch=async(url)=>{if(String(url).includes('op=list'))return {ok:true,json:async()=>({connections:[{id:'a',platform:'youtube',account_name:'أ',has_refresh:true},{id:'b',platform:'youtube',account_name:'ب',has_refresh:false}]})};window.__starts++;return {ok:true,json:async()=>({url:'https://untrusted.example/'})}};
  document.querySelector('#acctAlerts').innerHTML=app.reauthLineHTML(app.reauth);await app.renderConnections('fake-session');app.wireConnections();
 });
 assert.match(await page.locator('#acctReauth').innerText(),/لا يثبت ذلك حالة الربط الحالية أو يحدد القناة/);assert.match(await page.locator('#acctStateLabel').innerText(),/فشل تجديد سابق/);
 const group=page.locator('.chan-group[data-soc="youtube"]');assert.match(await group.innerText(),/لا يحدد القناة/);
 assert.match(await page.locator('[data-channel="a"]').innerText(),/صلاحيتها الحالية غير مؤكدة/);assert.doesNotMatch(await page.locator('[data-channel="a"]').innerText(),/انتهت صلاحية الربط/);
 assert.match(await page.locator('[data-channel="b"]').innerText(),/تعذّر التحقق من وجود تصريح تجديد صالح/);assert.equal(await page.locator('#btnRetryPublish').count(),1);
 // Replace historical failure fixture with destination scenarios, still entirely mocked.
 await page.evaluate(async()=>{PublishApp.reauth=[];PublishApp.data.config.all_channels=false;window.__rows=[{id:'a',platform:'youtube',account_name:'أ',has_refresh:true,is_default:false},{id:'b',platform:'youtube',account_name:'ب',has_refresh:true,is_default:false}];window.fetch=async()=>({ok:true,json:async()=>({connections:window.__rows})});await PublishApp.renderConnections('fake-session')});
 assert.match(await group.innerText(),/لا تظهر قناة افتراضية/);assert.match(await group.innerText(),/أحدث اتصال إذا غابت/);assert.match(await group.innerText(),/غير المحفوظة/);assert.match(await page.locator('#acctStateLabel').innerText(),/راجع القناة الافتراضية/);
 await page.evaluate(async()=>{window.__rows[0].is_default=true;await PublishApp.renderConnections('fake-session')});assert.match(await group.innerText(),/تظهر قناة افتراضية واحدة/);assert.match(await group.innerText(),/قد تتغير الوجهة/);
 await page.evaluate(async()=>{window.__rows[1].is_default=true;await PublishApp.renderConnections('fake-session')});assert.match(await group.innerText(),/أكثر من قناة افتراضية/);
 await page.evaluate(async()=>{delete window.__rows[1].is_default;await PublishApp.renderConnections('fake-session')});assert.match(await group.innerText(),/حالة الافتراضية في القائمة غير معروفة/);
 await page.evaluate(async()=>{PublishApp.data.config.all_channels=true;await PublishApp.renderConnections('fake-session')});assert.match(await group.innerText(),/التخطيط لكل القنوات المرتبطة/);
 // Restore reauth and the connect mock before exercising the confirmation dialog.
 await page.evaluate(async()=>{PublishApp.reauth=['youtube'];window.fetch=async(url)=>{if(String(url).includes('op=list'))return {ok:true,json:async()=>({connections:[{id:'a',platform:'youtube',account_name:'أ',has_refresh:true},{id:'b',platform:'youtube',account_name:'ب',has_refresh:false}]})};window.__starts++;return {ok:true,json:async()=>({url:'https://untrusted.example/'})}};await PublishApp.renderConnections('fake-session');PublishApp.wireConnections()});
 const reconnect=page.locator('[data-channel="a"] [data-connect]');let promptText='';page.once('dialog',async dialog=>{promptText=dialog.message();await dialog.dismiss()});await reconnect.click();assert.match(promptText,/اختيار الحساب يتم لدى المنصة/);assert.match(promptText,/أتمتة مفعّلة/);assert.equal(await page.evaluate(()=>window.__starts),0);
 page.once('dialog',dialog=>dialog.accept());await reconnect.click();await page.waitForFunction(()=>window.__starts===1&&typeof window.__message==='string');assert.match(await page.evaluate(()=>window.__message),/تعذّر التحقق/);assert.deepEqual(external,[]);assert.deepEqual(errors,[]);
 await context.close();console.log('ALL OK: Chromium warns of historical platform errors and confirms reconnect intent (mock network)');
}finally{if(browser)await browser.close();server.close()}})().catch(e=>{console.error(e);server.close();process.exitCode=1});
