/* Destructive request timeout behavior; DOM and all auth/network are mocked. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),{JSDOM}=require('jsdom');
const html=fs.readFileSync('public/index.html','utf8'),src=fs.readFileSync('public/js/publish.js','utf8');
const tick=()=>new Promise(r=>setImmediate(r));
function setup(){
 const dom=new JSDOM(html,{url:'https://app.test/',runScripts:'outside-only'}),w=dom.window,d=w.document;
 w.eval(src);const app=w.PublishApp,realRender=app.renderConnections.bind(app);app._accountOwner='a';app.init=async()=>{};let messages=[],calls=[],refreshes=0,timers=[];
 w.confirm=()=>true;w.toast=(message,type)=>messages.push({message,type});
 w.setTimeout=(fn,ms)=>{assert.equal(ms,20000);const t={fn,active:true};timers.push(t);return t};w.clearTimeout=t=>{t.active=false};
 app.renderConnections=async()=>{refreshes++};
 w.AuthApp={getToken:async()=>'token-a',getUserId:()=> 'a'};
 w.fetch=async(...args)=>{calls.push(args);return {ok:true,json:async()=>({ok:true})}};
 d.querySelector('#acctAccountsList').innerHTML='<button data-unlink="channel-a">فك الربط</button>';app.wireConnections();
 return {dom,w,app,realRender,button:d.querySelector('[data-unlink]'),messages,calls,get refreshes(){return refreshes},fire(){const t=timers.find(x=>x.active);assert(t);t.fn()}};
}
(async()=>{
 // An unresolved token lookup times out without sending; releasing it later
 // must not dispatch the queued destructive request.
 {const x=setup();let release;x.w.AuthApp.getToken=()=>new Promise(r=>release=r);x.button.click();await tick();assert(x.button.disabled);x.fire();await tick();await tick();assert.equal(x.button.disabled,false);assert.equal(x.calls.length,0);assert.match(x.messages[0].message,/لم يُرسل/);release('token-a');await tick();await tick();assert.equal(x.calls.length,0);x.dom.window.close();}
 // A stalled identity lookup must not allow a late request or leak a message
 // into the newly selected account, even when the timeout has already fired.
 {const x=setup();let checks=[];x.w.AuthApp.getUserId=()=>new Promise(r=>checks.push(r));x.button.click();await tick();assert.equal(checks.length,1);x.fire();await tick();assert.equal(x.button.disabled,false);x.app._accountOwner='b';for(const r of checks)r('b');await tick();await tick();assert.equal(x.calls.length,0);assert.equal(x.messages.length,0);x.dom.window.close();}
 // A delayed identity check from an older timeout cannot add a stale notice
 // after another attempt for the same channel has begun.
 {const x=setup();let releaseToken,releaseNotice,checks=0;x.w.AuthApp.getToken=()=>new Promise(r=>releaseToken=r);x.w.AuthApp.getUserId=()=>{checks++;return checks===1?new Promise(r=>releaseNotice=r):'a'};
  x.button.click();await tick();x.fire();await tick();assert.equal(typeof releaseNotice,'function');x.w.AuthApp.getToken=async()=>null;x.button.click();await tick();await tick();assert.equal(x.messages.length,1);
  releaseNotice('a');releaseToken('old-token');await tick();await tick();assert.equal(x.messages.length,1);assert.equal(x.calls.length,0);x.dom.window.close();}
 // Re-rendering the channel list must not allow a second request for the
 // same account/channel while the first request is still in flight.
 {const x=setup();let release;x.app.available=[{key:'youtube',name:'يوتيوب',publish:true,ready:true}];x.app.data={config:{platforms:[]}};x.app._autoDirty=true;
  x.w.fetch=(url,opts)=>{if(String(url).includes('op=list'))return Promise.resolve({ok:true,json:async()=>({connections:[{id:'channel-a',platform:'youtube',account_name:'fixture'}]})});x.calls.push([url,opts]);return new Promise(r=>release=r)};
  x.button.click();await tick();assert.equal(x.calls.length,1);await x.realRender('token-a');const replacement=x.w.document.querySelector('[data-unlink="channel-a"]');assert(replacement.disabled);
  replacement.dispatchEvent(new x.w.MouseEvent('click',{bubbles:true}));await tick();assert.equal(x.calls.length,1);x.fire();await tick();await tick();assert.equal(replacement.disabled,false);
  release({ok:true,json:async()=>({ok:true})});await tick();await tick();assert.equal(x.calls.length,1);x.dom.window.close();}
 // A fetch that ignores abort cannot turn a timed-out request into success.
 {const x=setup();let release;x.w.fetch=(...args)=>{x.calls.push(args);return new Promise(r=>release=r)};x.button.click();await tick();assert.equal(x.calls.length,1);x.fire();await tick();await tick();assert.equal(x.button.disabled,false);assert.equal(x.calls[0][1].signal.aborted,true);assert.match(x.messages[0].message,/قد يكون الطلب وصل/);release({ok:true,json:async()=>({ok:true})});await tick();await tick();assert.equal(x.messages.length,1);assert.equal(x.refreshes,0);x.dom.window.close();}
 // Even a stalled response body is inside the deadline.
 {const x=setup();let release;x.w.fetch=(...args)=>{x.calls.push(args);return Promise.resolve({ok:true,json:()=>new Promise(r=>release=r)})};x.button.click();await tick();assert.equal(x.calls.length,1);x.fire();await tick();await tick();assert.equal(x.button.disabled,false);assert.match(x.messages[0].message,/قد يكون الطلب وصل/);release({ok:true});await tick();await tick();assert.equal(x.messages.length,1);assert.equal(x.refreshes,0);x.dom.window.close();}
 // Missing token is a definite pre-send failure; an ordinary success still
 // reports only that the request was made, never provider revocation.
 {const x=setup();x.w.AuthApp.getToken=async()=>null;x.button.click();await tick();await tick();assert.equal(x.calls.length,0);assert.match(x.messages[0].message,/لم يُرسل/);x.dom.window.close();}
 {const x=setup();x.button.click();await tick();await tick();assert.equal(x.calls.length,1);assert.match(x.messages[0].message,/تم طلب فك الربط/);assert.equal(x.refreshes,1);assert.equal(x.button.disabled,false);x.dom.window.close();}
 console.log('ALL OK: bounded disconnect through auth, identity, network and body; late responses ignored (mocked)');
})().catch(e=>{console.error(e);process.exitCode=1});
