/* Two Chromium tabs with shared localStorage and mocked auth; events held
   deliberately to exercise the window before browser delivery. No real auth. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const {chromium}=require('playwright-core'),chrome=require('@sparticuz/chromium').default;
const auth=fs.readFileSync(path.join(__dirname,'../public/js/auth.js'));
const server=http.createServer((req,res)=>{const u=new URL(req.url,'http://localhost');
 if(u.pathname==='/auth.js')return res.writeHead(200,{'Content-Type':'application/javascript'}).end(auth);
 return res.writeHead(200,{'Content-Type':'text/html'}).end('<!doctype html><script src="/auth.js"></script><script>window.fixtureAuth=QRAuth</script>');
});
(async()=>{let browser;try{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
 browser=await chromium.launch({executablePath:await chrome.executablePath(),args:chrome.args,headless:true});
 const ctx=await browser.newContext({viewport:{width:Number(process.env.REEL_TEST_WIDTH||390),height:844},serviceWorkers:'block'});
 await ctx.route('**/*',r=>r.request().url().startsWith(origin+'/')?r.continue():r.abort());
 const seed=await ctx.newPage();await seed.goto(origin);await seed.evaluate(()=>localStorage.setItem('qr_session',JSON.stringify({access_token:'token-a',refresh_token:'refresh-a',expires_at:Date.now()-1000,user:{id:'a',email:'a@example.test'}})));await seed.close();
 const a=await ctx.newPage();
 await a.addInitScript(()=>{const add=window.addEventListener;window.__heldStorage=[];window.addEventListener=function(type,listener,options){if(type==='storage')return add.call(this,type,event=>window.__heldStorage.push(()=>listener.call(window,event)),options);return add.call(this,type,listener,options)}});
 await a.goto(origin);const b=await ctx.newPage();await b.goto(origin);
 await a.evaluate(()=>{
  window.fetch=async url=>{if(String(url)==='/api/app-config')return {json:async()=>({supabase:{url:'https://auth.test',anon:'fixture'}})};
   if(String(url).includes('/token?'))return new Promise(resolve=>window.__completeRefresh=()=>resolve({ok:true,status:200,json:async()=>({access_token:'late-a',refresh_token:'late-r',user:{id:'a'}})}));throw Error('unexpected fixture request')};
  window.__tokenPromise=fixtureAuth.token();
 });
 await a.waitForFunction(()=>typeof window.__completeRefresh==='function');
 await b.evaluate(()=>{window.fetch=async url=>String(url)==='/api/app-config'?{json:async()=>({supabase:{url:'https://auth.test',anon:'fixture'}})}:{ok:true,status:204};});
 const out=await b.evaluate(()=>fixtureAuth.signOut());assert.equal(out.local_cleared,true);assert.equal(out.remote,'confirmed');
 await a.evaluate(()=>window.__completeRefresh());
 assert.equal(await a.evaluate(()=>window.__tokenPromise),null);
 assert.equal(await a.evaluate(()=>localStorage.getItem('qr_session')),null);
 assert.equal(await a.evaluate(()=>fixtureAuth.user()),null);
 // The stored event was deliberately not delivered before the response.
 await a.waitForFunction(()=>window.__heldStorage.length>0);assert(await a.evaluate(()=>window.__heldStorage.length)>0);
 await a.evaluate(()=>{for(const f of window.__heldStorage.splice(0))f()});assert.equal(await a.evaluate(()=>fixtureAuth.user()),null);
 await ctx.close();console.log('ALL OK: two real tabs, held storage event, late mock refresh cannot overwrite the observed logout');
}finally{if(browser)await browser.close();server.close()}})().catch(e=>{console.error(e);server.close();process.exitCode=1});
