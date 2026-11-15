/* Real account event listener in Chromium; synthetic auth/network only. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const {chromium}=require('playwright-core'),chrome=require('@sparticuz/chromium').default;
const root=path.resolve(__dirname,'../public');
const server=http.createServer((req,res)=>{const u=new URL(req.url,'http://localhost');if(u.pathname.startsWith('/api/'))return res.writeHead(200,{'Content-Type':'application/json'}).end('{}');
 const f=path.resolve(root,'.'+(u.pathname==='/'?'/index.html':u.pathname));if(!f.startsWith(root+path.sep))return res.writeHead(403).end();fs.readFile(f,(e,data)=>e?res.writeHead(404).end():res.writeHead(200,{'Content-Type':({'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json'})[path.extname(f)]||'application/octet-stream'}).end(data));});
(async()=>{let browser;try{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
 browser=await chromium.launch({executablePath:await chrome.executablePath(),args:chrome.args,headless:true});
 const ctx=await browser.newContext({viewport:{width:Number(process.env.REEL_TEST_WIDTH||390),height:844},serviceWorkers:'block'});await ctx.route('**/*',r=>r.request().url().startsWith(origin+'/')?r.continue():r.abort());
 const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(origin);await page.waitForFunction(()=>typeof Creator!=='undefined'&&Creator.ready);
 await page.evaluate(()=>{
  document.querySelector('#view-home').hidden=true;document.querySelector('#view-account').hidden=false;
  const card=document.querySelector('#acctAccounts');card.hidden=false;
  document.querySelector('#acctAccountsList').innerHTML='<button data-unlink="fixture-id">فك الربط</button>';
  PublishApp._accountOwner='fixture-user';PublishApp.init=async()=>{};PublishApp.renderConnections=async()=>{window.__refreshes++};window.__refreshes=0;
  window.__messages=[];window.toast=msg=>window.__messages.push(msg);window.confirm=()=>true;
  const realTimer=window.setTimeout;window.setTimeout=(fn,ms,...args)=>ms===20000?(window.__deadline=fn,999999):realTimer(fn,ms,...args);
  window.clearTimeout=((real)=>id=>id===999999?undefined:real(id))(window.clearTimeout);
  window.AuthApp={getUserId:()=> 'fixture-user',getToken:()=>new Promise(resolve=>window.__releaseToken=resolve)};
  window.__calls=0;window.fetch=async()=>{window.__calls++;throw Error('unexpected network')};PublishApp.wireConnections();
 });
 const button=page.locator('[data-unlink="fixture-id"]');await button.click();assert.equal(await button.isDisabled(),true);
 await page.evaluate(()=>window.__deadline());await page.waitForFunction(()=>window.__messages.length===1);
 assert.match((await page.evaluate(()=>window.__messages[0])),/لم يُرسل/);assert.equal(await button.isDisabled(),false);
 await page.evaluate(()=>window.__releaseToken('fixture-token'));await page.waitForTimeout(100);assert.equal(await page.evaluate(()=>window.__calls),0);
 await page.evaluate(()=>{
  window.__messages=[];window.AuthApp.getToken=async()=> 'fixture-token';window.fetch=(url,opts)=>{window.__calls++;window.__request={url,signal:opts.signal};return new Promise(resolve=>window.__releaseResponse=resolve)};
 });
 await button.click();await page.waitForFunction(()=>typeof window.__releaseResponse==='function');await page.evaluate(()=>window.__deadline());await page.waitForFunction(()=>window.__messages.length===1);
 assert.match((await page.evaluate(()=>window.__messages[0])),/قد يكون الطلب وصل/);assert.equal(await page.evaluate(()=>window.__request.signal.aborted),true);assert.equal(await button.isDisabled(),false);
 await page.evaluate(()=>window.__releaseResponse({ok:true,json:async()=>({ok:true})}));await page.waitForTimeout(100);
 assert.equal(await page.evaluate(()=>window.__messages.length),1);assert.equal(await page.evaluate(()=>window.__refreshes),0);assert.deepEqual(errors,[]);
 await ctx.close();console.log(`ALL OK: Chromium disconnect deadlines and late responses at ${process.env.REEL_TEST_WIDTH||390}px; no real request`);
}finally{if(browser)await browser.close();server.close()}})().catch(e=>{console.error(e);server.close();process.exitCode=1});
