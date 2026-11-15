/* Real browser and real auth event handler; all network/account data is mocked. */
const assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const {chromium}=require('playwright-core'),chrome=require('@sparticuz/chromium').default;
const root=path.resolve(__dirname,'../public');
const server=http.createServer((req,res)=>{
 const u=new URL(req.url,'http://localhost');if(u.pathname.startsWith('/api/'))return res.writeHead(200,{'Content-Type':'application/json'}).end(u.pathname==='/api/app-config'?JSON.stringify({supabase:{url:'https://auth.test',anon:'test-key'}}):'{}');
 const f=path.resolve(root,'.'+(u.pathname==='/'?'/index.html':u.pathname));if(!f.startsWith(root+path.sep))return res.writeHead(403).end();
 fs.readFile(f,(e,data)=>e?res.writeHead(404).end():res.writeHead(200,{'Content-Type':({'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json'})[path.extname(f)]||'application/octet-stream'}).end(data));
});
(async()=>{let browser;try{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
 browser=await chromium.launch({executablePath:await chrome.executablePath(),args:chrome.args,headless:true});
 const ctx=await browser.newContext({viewport:{width:Number(process.env.REEL_TEST_WIDTH||390),height:844},serviceWorkers:'block'});await ctx.route('**/*',r=>r.request().url().startsWith(origin+'/')?r.continue():r.abort());
 const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(origin);await page.waitForFunction(()=>typeof Creator!=='undefined'&&Creator.ready);
 await page.evaluate(()=>{
  const original=window.fetch;window.__accountReads=[];PublishApp.startProgressPolling=()=>{};
  window.fetch=async(url,opts={})=>{
   if(String(url)==='/api/autopilot'&&(!opts.method||opts.method==='GET')){
    const token=opts.headers?.Authorization;window.__accountReads.push(token);
    const cfg={settings_revision:'11111111-1111-4111-8111-111111111111',enabled:false,platforms:['youtube'],all_channels:false,template:{content_mode:'mix',background:'rotate'}};
    if(token==='Bearer token-a')return {ok:true,status:200,json:async()=>({config:cfg,runs:[{id:'ra',status:'queued',title:'تفاصيل الحساب الأول'}],available:[]})};
    if(token==='Bearer token-b')return new Promise(r=>window.__releaseB=()=>r({ok:true,status:200,json:async()=>({config:cfg,runs:[{id:'rb',status:'queued',title:'تفاصيل الحساب الثاني'}],available:[]})}));
    throw Error('unexpected token');
   }
   if(String(url).includes('op=list'))return {ok:true,json:async()=>({connections:[]})};
   if(String(url).includes('/auth/v1/logout')) { window.__logoutCount=(window.__logoutCount||0)+1; window.__logoutRequest={url:String(url),authorization:opts.headers?.Authorization}; if(!window.__delayLogout)return {ok:true,status:204}; return new Promise(resolve=>window.__finishLogout=(ok)=>resolve({ok,status:ok?204:503,json:async()=>({})})); }
   if(String(url)==='/api/app-config')return {ok:true,json:async()=>({supabase:{url:'https://auth.test',anon:'test-key'}})};
   return original(url,opts);
  };
  window.__emitUser=(id)=>{const session=id?{access_token:'token-'+id,refresh_token:'refresh-'+id,expires_at:Date.now()+3600000,user:{id,email:id+'@example.test'}}:null;const value=session?JSON.stringify(session):null;if(value)localStorage.setItem('qr_session',value);else localStorage.removeItem('qr_session');window.dispatchEvent(new StorageEvent('storage',{key:'qr_session',newValue:value}));};
 });
 await page.evaluate(()=>window.__emitUser('a'));await page.waitForFunction(()=>document.querySelector('#queueList').textContent.includes('تفاصيل الحساب الأول'));
 assert.equal(await page.evaluate(()=>PublishApp._accountOwner),'a');
 const before=await page.evaluate(()=>window.__accountReads.length);await page.evaluate(()=>window.__emitUser('a'));await page.waitForTimeout(100);assert.equal(await page.evaluate(()=>window.__accountReads.length),before,'same-identity refresh must not reload');
 await page.evaluate(async()=>{document.querySelector('#acctSavedReviewText').textContent='تفاصيل خاصة';await QRAuth.signOut()});
 assert.equal(await page.evaluate(()=>PublishApp._accountOwner),null);assert.equal(await page.locator('#queueList').textContent(),'');assert.equal(await page.locator('#acctSavedReviewText').textContent(),'');assert.equal(await page.locator('#loginOverlay').isVisible(),false);
 await page.evaluate(()=>window.__emitUser('a'));await page.waitForFunction(()=>document.querySelector('#queueList').textContent.includes('تفاصيل الحساب الأول'));
 await page.evaluate(()=>{document.querySelector('#acctSavedReviewText').textContent='مراجعة خاصة بالأول';const n=document.querySelector('#acctNotice');n.hidden=false;n.textContent='تنبيه خاص بالأول';window.__emitUser('b')});
 assert.equal(await page.locator('#acctSavedReviewText').textContent(),'');assert.equal(await page.locator('#queueList').textContent(),'');assert.doesNotMatch(await page.locator('#acctNotice').textContent(),/خاص بالأول/);
 await page.waitForFunction(()=>typeof window.__releaseB==='function');
 await page.evaluate(()=>window.__emitUser(null));assert.equal(await page.evaluate(()=>PublishApp._accountOwner),null);assert.match(await page.locator('#acctNotice').textContent(),/سجّل الدخول/);
 assert.equal(await page.locator('#loginOverlay').isVisible(),false,'logout event should not open a login dialog');
 await page.evaluate(()=>window.__releaseB());await page.waitForTimeout(200);assert.equal(await page.locator('#queueList').textContent(),'');assert.equal(await page.evaluate(()=>PublishApp._accountOwner),null);
 // Exercise the real logout button and its confirmation, not just the auth API.
 await page.evaluate(()=>{window.__delayLogout=true;window.__emitUser('a');window.location.hash='#/account'});await page.waitForFunction(()=>document.querySelector('#queueList').textContent.includes('تفاصيل الحساب الأول'));
 assert.equal(await page.locator('#acctSignOut').isVisible(),true);
 // A different tab changes storage after the confirmation starts, before a
 // storage event arrives. The button must not sign out the newer session.
 const countBefore=await page.evaluate(()=>window.__logoutCount||0);
 await page.evaluate(()=>{window.__savedConfirm=window.confirm;window.confirm=()=>{const session={access_token:'token-b',refresh_token:'refresh-b',expires_at:Date.now()+3600000,user:{id:'b',email:'b@example.test'}};localStorage.setItem('qr_session',JSON.stringify(session));return true}});
 await page.locator('#acctSignOut').click();
 await page.waitForFunction(()=>document.querySelector('#acctSignOutStatus').textContent.includes('تغيّرت الجلسة'));
 assert.equal(await page.evaluate(()=>QRAuth.user().id),'b');assert.equal(await page.evaluate(()=>window.__logoutCount||0),countBefore);
 await page.evaluate(()=>{window.confirm=window.__savedConfirm;window.__emitUser('a')});await page.waitForFunction(()=>document.querySelector('#queueList').textContent.includes('تفاصيل الحساب الأول'));
 page.once('dialog',dialog=>dialog.dismiss());await page.locator('#acctSignOut').click();assert.equal(await page.evaluate(()=>QRAuth.user().id),'a');
 page.once('dialog',dialog=>dialog.accept());await page.locator('#acctSignOut').click();
 await page.waitForFunction(()=>typeof window.__finishLogout==='function');
 assert.equal(await page.evaluate(()=>QRAuth.user()),null);assert.equal(await page.locator('#queueList').textContent(),'');assert.equal(await page.locator('#loginOverlay').isVisible(),false);
 assert.match((await page.evaluate(()=>window.__logoutRequest)).url,/logout\?scope=local/);assert.equal((await page.evaluate(()=>window.__logoutRequest)).authorization,'Bearer token-a');
 await page.evaluate(()=>window.__finishLogout(false));await page.waitForFunction(()=>document.querySelector('#acctSignOutStatus').textContent.includes('لم يتأكد'));
 assert.match(await page.locator('#acctSignOutStatus').textContent(),/الأتمتة والمهام لا تتوقف/);
 // A later response for A must not display its result over B.
 await page.evaluate(()=>{window.__finishLogout=null;window.__emitUser('a')});await page.waitForFunction(()=>!document.querySelector('#acctSignOut').hidden);
 page.once('dialog',dialog=>dialog.accept());await page.locator('#acctSignOut').click();await page.waitForFunction(()=>typeof window.__finishLogout==='function');
 await page.evaluate(()=>{window.__emitUser('b');window.__finishLogout(true)});await page.waitForTimeout(100);
 assert.equal(await page.evaluate(()=>QRAuth.user().id),'b');assert.equal(await page.locator('#acctSignOutStatus').isVisible(),false);assert.deepEqual(errors,[]);
 await ctx.close();console.log('ALL OK: real browser auth events clear old account immediately; late response ignored; no network or publishing');
}finally{if(browser)await browser.close();server.close()}})().catch(e=>{console.error(e);server.close();process.exitCode=1});
