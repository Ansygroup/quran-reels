/* Synthetic session switches around connection requests; no real network. */
const assert=require('node:assert/strict'),fs=require('node:fs');const {JSDOM,VirtualConsole}=require('jsdom');
const vc=new VirtualConsole(),errors=[];vc.on('jsdomError',e=>errors.push(e.message));
const dom=new JSDOM(fs.readFileSync('public/index.html','utf8'),{url:'https://app.test/',runScripts:'outside-only',virtualConsole:vc});
const w=dom.window,d=w.document;w.eval(fs.readFileSync('public/js/publish.js','utf8'));const app=w.PublishApp;
let uid='a',getToken=async()=>'a-token',calls=[],messages=[],refreshes=0;
w.AuthApp={getUserId:async()=>uid,getToken:()=>getToken()};w.toast=m=>messages.push(m);w.confirm=()=>true;
// Simulate the account refresh and clearing; the browser account switch itself
// is exercised separately in account_reel_browser_test.js.
app.init=async()=>{refreshes++;app._accountOwner=uid;d.querySelector('#acctAccountsList').innerHTML=''};
app.wireConnections();const tick=()=>new Promise(r=>setImmediate(r));
const setup=(attr)=>{uid='a';app._accountOwner='a';calls=[];messages=[];refreshes=0;d.querySelector('#acctAccountsList').innerHTML=`<button ${attr}>button</button>`};
const button=()=>d.querySelector('#acctAccountsList button');
const response=(data)=>({ok:true,status:200,json:async()=>data});
(async()=>{
 let resolveToken;setup('data-connect="youtube"');getToken=()=>new Promise(r=>resolveToken=r);w.fetch=async(...args)=>{calls.push(args);return response({})};button().click();await tick();uid='b';resolveToken('b-token');await tick();await tick();assert.equal(calls.length,0,'connection start must not use a different account token');assert.equal(refreshes,1);assert.equal(messages.length,0);
 setup('data-unlink="channel-a"');getToken=()=>new Promise(r=>resolveToken=r);button().click();await tick();uid='b';resolveToken('b-token');await tick();await tick();assert.equal(calls.length,0,'disconnect must not be sent under a different account');assert.equal(refreshes,1);assert.equal(messages.length,0);
 let resolveFetch;setup('data-connect="youtube"');getToken=async()=>'a-token';w.fetch=(...args)=>{calls.push(args);return new Promise(r=>resolveFetch=r)};button().click();await tick();assert.equal(calls.length,1);uid='b';resolveFetch(response({url:'https://accounts.google.com/o/oauth2/v2/auth?fixture=1'}));await tick();await tick();assert.equal(refreshes,1);assert.equal(messages.length,0);assert(!errors.some(e=>/navigation/i.test(e)),'late OAuth response must not navigate');
 setup('data-unlink="channel-a"');w.fetch=(...args)=>{calls.push(args);return new Promise(r=>resolveFetch=r)};button().click();await tick();assert.equal(calls.length,1);assert.equal(calls[0][1].headers.Authorization,'Bearer a-token');uid='b';resolveFetch(response({ok:true}));await tick();await tick();assert.equal(calls.length,1,'old response must not request or overwrite new account channels');assert.equal(messages.length,0,'old response must not report success in the new session');assert.equal(refreshes,1);
 setup('data-connect="youtube"');app.available=[{key:'youtube',name:'يوتيوب',publish:true,ready:true}];app.data={config:{enabled:false,platforms:[]}};w.fetch=(...args)=>{calls.push(args);return new Promise(r=>resolveFetch=r)};
 const loading=app.renderConnections('a-token');await tick();assert.equal(calls.length,1);uid='b';resolveFetch(response({connections:[{id:'a-private',platform:'youtube',account_name:'قناة خاصة'}]}));await loading;await tick();assert.equal(refreshes,1);assert(!d.querySelector('#acctAccountsList').textContent.includes('قناة خاصة'));
 console.log('ALL OK: account switch prevents stale connection requests, redirects, results and channel rendering (mock DOM/network)');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>dom.window.close());
