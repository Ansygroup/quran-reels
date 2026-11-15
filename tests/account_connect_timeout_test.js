/* OAuth start deadline, duplicate and session guards; all auth/network mocked. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),{JSDOM,VirtualConsole}=require('jsdom');
const html=fs.readFileSync('public/index.html','utf8'),src=fs.readFileSync('public/js/publish.js','utf8');
const tick=()=>new Promise(r=>setImmediate(r));
function setup(){
 const vc=new VirtualConsole(),errors=[];vc.on('jsdomError',e=>errors.push(e.message));
 const dom=new JSDOM(html,{url:'https://app.test/',runScripts:'outside-only',virtualConsole:vc}),w=dom.window,d=w.document;
 w.eval(src);const app=w.PublishApp,render=app.renderConnections.bind(app);app._accountOwner='a';app.init=async()=>{};let messages=[],calls=[],timers=[];
 w.toast=(message,type)=>messages.push({message,type});w.setTimeout=(fn,ms)=>{assert.equal(ms,20000);const t={fn,active:true};timers.push(t);return t};w.clearTimeout=t=>{t.active=false};
 w.AuthApp={getToken:async()=>'token-a',getUserId:()=> 'a'};
 w.fetch=async(...args)=>{calls.push(args);return {ok:true,json:async()=>({url:'https://untrusted.test/'})}};
 d.querySelector('#acctAccountsList').innerHTML='<button data-connect="youtube">YouTube</button><button data-connect="facebook">Facebook</button>';app.wireConnections();
 return {dom,w,app,render,button:d.querySelector('[data-connect="youtube"]'),messages,calls,errors,fire(){const t=timers.find(x=>x.active);assert(t);t.fn()}};
}
(async()=>{
 // Token and identity checks are inside the deadline, with no late request.
 {const x=setup();let release;x.w.AuthApp.getToken=()=>new Promise(r=>release=r);x.button.click();await tick();assert(x.button.disabled);x.fire();await tick();await tick();assert.equal(x.button.disabled,false);assert.equal(x.calls.length,0);assert.match(x.messages[0].message,/لم يُرسل/);release('token-a');await tick();await tick();assert.equal(x.calls.length,0);x.dom.window.close();}
 {const x=setup();let checks=[];x.w.AuthApp.getUserId=()=>new Promise(r=>checks.push(r));x.button.click();await tick();x.fire();await tick();assert.equal(x.button.disabled,false);x.app._accountOwner='b';for(const f of checks)f('b');await tick();await tick();assert.equal(x.calls.length,0);assert.equal(x.messages.length,0);x.dom.window.close();}
 // Network ignoring abort and a stalled JSON reader cannot trigger a late redirect.
 {const x=setup();let release;x.w.fetch=(...args)=>{x.calls.push(args);return new Promise(r=>release=r)};x.button.click();await tick();assert.equal(x.calls.length,1);x.fire();await tick();await tick();assert.equal(x.button.disabled,false);assert.equal(x.calls[0][1].signal.aborted,true);assert.match(x.messages[0].message,/قد يكون الخادم استقبل الطلب/);release({ok:true,json:async()=>({url:'https://accounts.google.com/o/oauth2/auth'})});await tick();await tick();assert.equal(x.messages.length,1);assert(!x.errors.some(e=>/navigation/i.test(e)));x.dom.window.close();}
 {const x=setup();let release;x.w.fetch=(...args)=>{x.calls.push(args);return Promise.resolve({ok:true,json:()=>new Promise(r=>release=r)})};x.button.click();await tick();x.fire();await tick();await tick();assert.equal(x.button.disabled,false);assert.match(x.messages[0].message,/قد يكون الخادم استقبل الطلب/);release({url:'https://accounts.google.com/o/oauth2/auth'});await tick();await tick();assert.equal(x.messages.length,1);assert(!x.errors.some(e=>/navigation/i.test(e)));x.dom.window.close();}
 // A -> logout -> A is a different auth generation, not permission to use an old response.
 {const x=setup();let release;x.w.fetch=(...args)=>{x.calls.push(args);return new Promise(r=>release=r)};x.button.click();await tick();x.app.clearAccountData(null);x.app.clearAccountData('a');release({ok:true,json:async()=>({url:'https://accounts.google.com/o/oauth2/auth'})});await tick();await tick();assert.equal(x.messages.length,0);assert(!x.errors.some(e=>/navigation/i.test(e)));x.dom.window.close();}
 // Re-rendered buttons, including a different platform, are disabled while a
 // start is in flight; a synthetic click must not create a second request.
 {const x=setup();let release;x.app.available=[{key:'youtube',name:'يوتيوب',publish:true,ready:true},{key:'facebook',name:'فيسبوك',publish:true,ready:true}];x.app.data={config:{platforms:[]}};x.app._autoDirty=true;
  x.w.fetch=(url,opts)=>{if(String(url).includes('op=list'))return Promise.resolve({ok:true,json:async()=>({connections:[{id:'c1',platform:'youtube',account_name:'fixture'}]})});x.calls.push([url,opts]);return new Promise(r=>release=r)};
  x.button.click();await tick();assert.equal(x.calls.length,1);await x.render('token-a');const buttons=[...x.w.document.querySelectorAll('[data-connect]')];assert(buttons.length>=2&&buttons.every(b=>b.disabled));buttons[buttons.length-1].dispatchEvent(new x.w.MouseEvent('click',{bubbles:true}));await tick();assert.equal(x.calls.length,1);
  x.fire();await tick();await tick();assert(buttons.every(b=>!b.disabled));release({ok:true,json:async()=>({url:'https://accounts.google.com/o/oauth2/auth'})});await tick();await tick();assert(!x.errors.some(e=>/navigation/i.test(e)));x.dom.window.close();}
 // Invalid providers, hosts, credentials, protocols and ports never navigate.
 for(const url of ['https://malicious.test/','http://accounts.google.com/','https://accounts.google.com:8443/','https://attacker@accounts.google.com/','not a URL']){
  const x=setup();x.w.fetch=async(...args)=>{x.calls.push(args);return {ok:true,json:async()=>({url})}};x.button.click();await tick();await tick();assert.match(x.messages[0].message,/تعذّر التحقق/);assert(!x.errors.some(e=>/navigation/i.test(e)));x.dom.window.close();}
 console.log('ALL OK: bounded OAuth start, session changes, re-render duplicate guard and URL validation (mock network)');
})().catch(e=>{console.error(e);process.exitCode=1});
