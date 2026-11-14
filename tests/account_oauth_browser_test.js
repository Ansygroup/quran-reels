/* Browser + real local OAuth-start handler, mock auth/provider. No external requests. */
const assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http');
const {chromium}=require('playwright-core');const chrome=require('@sparticuz/chromium').default;
process.env.GOOGLE_CLIENT_ID='fixture-client';process.env.GOOGLE_CLIENT_SECRET='fixture-secret';process.env.TOKEN_ENC_KEY='fixture-only';
const sess=require.resolve('../lib/sess');require.cache[sess]={id:sess,filename:sess,loaded:true,exports:{getUserId:async req=>req.headers.authorization==='Bearer fixture-session'?'fixture-user':null}};
const handler=require('../api/_oauth_start');let received=null;
const html=`<!doctype html><html><head><meta charset="utf-8"></head><body><div id="acctNotice" hidden></div><div id="acctAccountsList"><button data-connect="youtube">Connect</button></div><script>window.AuthApp={getToken:async()=>"fixture-session",getUserId:async()=>"fixture-user"};</script><script src="/publish.js"></script></body></html>`;
const server=http.createServer(async(req,res)=>{
 if(req.url==='/'){res.setHeader('Content-Type','text/html');return res.end(html)}
 if(req.url==='/publish.js'){res.setHeader('Content-Type','application/javascript');return res.end(fs.readFileSync('public/js/publish.js'))}
 if(req.url.startsWith('/api/gw?')){received={method:req.method,url:req.url,authorization:req.headers.authorization};try{return await handler(req,res)}catch{res.statusCode=500;return res.end()}}
 if(req.url==='/api/oauth/callback'){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({cookie:req.headers.cookie||''}))}
 res.statusCode=404;res.end();
});
(async()=>{let browser;try{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${server.address().port}`;process.env.SITE_ORIGIN=origin;
 browser=await chromium.launch({executablePath:await chrome.executablePath(),args:chrome.args,headless:true});
 const context=await browser.newContext({serviceWorkers:'block',viewport:{width:Number(process.env.REEL_TEST_WIDTH||390),height:844}});
 let attempted='',resolveNavigation;const navigation=new Promise(resolve=>{resolveNavigation=resolve});
 await context.route('**/*',route=>{const url=route.request().url();if(url.startsWith(origin+'/'))return route.continue();attempted=url;resolveNavigation();return route.abort()});
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(origin,{waitUntil:'load'});
 // A return URL is not evidence about the currently signed-in user or provider.
 await page.evaluate(()=>{history.replaceState(null,'','/?source=kept#/account?linked=youtube&channel=nondefault&keep=1');PublishApp.reportLinkedFlag()});
 const returnNotice=await page.locator('#acctNotice').textContent();assert.match(returnNotice,/لا يؤكد نجاحه أو الحساب/);assert.match(returnNotice,/قد تكون القناة دي مش الافتراضية/);assert.doesNotMatch(returnNotice,/تم ربط/);
 assert.equal(await page.evaluate(()=>location.search),'?source=kept');assert.equal(await page.evaluate(()=>location.hash),'#/account?keep=1');
 await page.evaluate(()=>{history.replaceState(null,'','/#/account?linked=meta_err&w=store');PublishApp.reportLinkedFlag()});assert.match(await page.locator('#acctNotice').textContent(),/قد تكون بعض القنوات حُفظت بالفعل/);
 await page.evaluate(()=>{history.replaceState(null,'','/#/account?linked=tiktok_err&w=identity');PublishApp.reportLinkedFlag()});assert.match(await page.locator('#acctNotice').textContent(),/تعذّر التحقق من هوية الحساب/);
 await page.evaluate(()=>{history.replaceState(null,'','/#/account?linked=meta_err&w=pages');PublishApp.reportLinkedFlag()});assert.match(await page.locator('#acctNotice').textContent(),/لا يدعم الربط اختيار صفحة من عدة صفحات/);
 await page.evaluate(()=>history.replaceState(null,'','/'));
 // Switch accounts while the token is pending: no OAuth request or navigation.
 await page.evaluate(()=>{window.__uid='fixture-user';window.AuthApp={getUserId:async()=>window.__uid,getToken:()=>new Promise(r=>window.__releaseToken=r)};PublishApp._accountOwner='fixture-user';PublishApp.init=async()=>{window.__refreshed=true;PublishApp._accountOwner=window.__uid};PublishApp.wireConnections()});
 await page.click('[data-connect="youtube"]');await page.waitForFunction(()=>typeof window.__releaseToken==='function');
 await page.evaluate(()=>{window.__uid='other-user';window.__releaseToken('other-session')});await page.waitForFunction(()=>window.__refreshed===true);
 assert.equal(received,null);assert.equal(attempted,'');
 // Force timeout on real event handlers; promises below use only mock auth/network.
 await page.reload({waitUntil:'load'});
 await page.evaluate(()=>{
  window.__messages=[];window.toast=message=>window.__messages.push(message);
  const old=window.setTimeout;window.setTimeout=(fn,ms,...args)=>ms===20000?(window.__deadline=fn,999999):old(fn,ms,...args);
  window.clearTimeout=((oldClear)=>id=>id===999999?undefined:oldClear(id))(window.clearTimeout);
  window.__calls=0;window.AuthApp={getUserId:()=> 'fixture-user',getToken:()=>new Promise(r=>window.__lateToken=r)};
  window.fetch=async()=>{window.__calls++;throw Error('unexpected request')};PublishApp._accountOwner='fixture-user';PublishApp.wireConnections();
 });
 await page.click('[data-connect="youtube"]');await page.evaluate(()=>window.__deadline());await page.waitForFunction(()=>window.__messages.length===1);
 assert.match(await page.evaluate(()=>window.__messages[0]),/لم يُرسل/);assert.equal(await page.locator('[data-connect="youtube"]').isDisabled(),false);
 await page.evaluate(()=>window.__lateToken('fixture-session'));await page.waitForTimeout(100);assert.equal(await page.evaluate(()=>window.__calls),0);assert.equal(attempted,'');
 await page.evaluate(()=>{window.__messages=[];window.AuthApp.getToken=async()=> 'fixture-session';window.fetch=(url,opts)=>{window.__calls++;window.__signal=opts.signal;return new Promise(resolve=>window.__lateResponse=resolve)}});
 await page.click('[data-connect="youtube"]');await page.waitForFunction(()=>typeof window.__lateResponse==='function');await page.evaluate(()=>window.__deadline());await page.waitForFunction(()=>window.__messages.length===1);
 assert.match(await page.evaluate(()=>window.__messages[0]),/قد يكون الخادم استقبل الطلب/);assert.equal(await page.evaluate(()=>window.__signal.aborted),true);
 await page.evaluate(()=>window.__lateResponse({ok:true,json:async()=>({url:'https://accounts.google.com/o/oauth2/auth'})}));await page.waitForTimeout(100);assert.equal(attempted,'');
 await page.reload({waitUntil:'load'});
 await page.evaluate(()=>{PublishApp._accountOwner='fixture-user';PublishApp.wireConnections()});await page.click('[data-connect="youtube"]');
 await Promise.race([navigation,new Promise((_,reject)=>setTimeout(()=>reject(Error('provider navigation did not start')),5000))]);
 assert(received);assert.deepEqual(received,{method:'POST',url:'/api/gw?op=start&p=youtube',authorization:'Bearer fixture-session'});
 assert.match(attempted,/^https:\/\/accounts\.google\.com\//);assert(!attempted.includes('fixture-session'));
 const cookies=await context.cookies(origin+'/api/oauth/callback');const state=cookies.find(c=>c.name==='qr_youtube_st');assert(state&&state.httpOnly&&state.secure&&state.sameSite==='Lax'&&state.path==='/api/oauth');
 const local=await context.newPage();await local.goto(origin);assert(!await local.evaluate(()=>document.cookie.includes('qr_youtube_st')));
 const sent=await context.request.get(origin+'/api/oauth/callback');assert.match((await sent.json()).cookie,/qr_youtube_st=/);
 assert.deepEqual(errors,[]);await context.close();
 console.log('ALL OK: real Chromium OAuth-start POST, HttpOnly state cookie and blocked mock provider navigation; fake session, no external network');
}finally{if(browser)await browser.close();server.close()}})().catch(e=>{console.error(e);server.close();process.exitCode=1});
