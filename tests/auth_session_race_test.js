/* Local auth implementation with synthetic sessions/network; no real provider. */
const assert=require('node:assert/strict'),fs=require('node:fs'),{JSDOM}=require('jsdom');
const src=fs.readFileSync('public/js/auth.js','utf8');
const makeSession=(id,expired=false)=>({access_token:`token-${id}`,refresh_token:`refresh-${id}`,expires_at:Date.now()+(expired?-1000:3600000),user:{id,email:`${id}@example.test`}});
const tick=()=>new Promise(r=>setImmediate(r));const response=(json,status=200)=>({ok:status>=200&&status<300,status,json:async()=>json});
function setup(initial){const dom=new JSDOM('',{url:'https://app.test/',runScripts:'outside-only'}),w=dom.window;if(initial)w.localStorage.setItem('qr_session',JSON.stringify(initial));w.fetch=async(url)=>{if(String(url)==='/api/app-config')return response({supabase:{url:'https://auth.test',anon:'fixture-anon'}});throw Error('unexpected '+url)};w.eval(src+'\nwindow.__auth=QRAuth;');return {dom,w,auth:w.__auth}}
function switchSession(w,id,expired=false){const value=id?JSON.stringify(makeSession(id,expired)):null;if(value)w.localStorage.setItem('qr_session',value);else w.localStorage.removeItem('qr_session');w.dispatchEvent(new w.StorageEvent('storage',{key:'qr_session',newValue:value}));}
(async()=>{
 // Two expired-token readers share one refresh; logout is immediate and a late refresh cannot resurrect A.
 {const {dom,w,auth}=setup(makeSession('a',true));let pendingRefresh,logout,refreshCalls=0;
 const orig=w.fetch;w.fetch=async(url,opts={})=>{if(String(url).includes('/token?')){refreshCalls++;return new Promise(r=>pendingRefresh=r)}if(String(url).includes('/logout?')){assert.match(url,/scope=local/);assert.equal(opts.headers.Authorization,'Bearer token-a');return new Promise(r=>logout=r)}return orig(url,opts)};
 const p1=auth.token(),p2=auth.token();await tick();assert.equal(refreshCalls,1);const out=auth.signOut();assert.equal(auth.user(),null);assert.equal(w.localStorage.getItem('qr_session'),null);await tick();pendingRefresh(response({access_token:'new-a',refresh_token:'next-a',user:{id:'a'}}));assert.equal(await p1,null);assert.equal(await p2,null);logout(response({},204));const result=await out;assert.equal(result.local_cleared,true);assert.equal(result.remote,'confirmed');assert.equal(auth.user(),null);dom.window.close();}
 // Late refresh success or rejection cannot overwrite/clear the new account.
 for(const status of [200,400]){const {dom,w,auth}=setup(makeSession('a',true));let resolve;const orig=w.fetch;w.fetch=async(url,opts)=>String(url).includes('/token?')?new Promise(r=>resolve=r):orig(url,opts);
 const pending=auth.token();await tick();switchSession(w,'b');resolve(response({access_token:'late-a',refresh_token:'late-r',user:{id:'a'}},status));assert.equal(await pending,null);assert.equal(auth.user().id,'b');assert.equal(await auth.token(),'token-b');dom.window.close();}
 // Storage can change before the browser delivers its queued event: old
 // refresh completions must neither resurrect a logout nor erase a new login.
 for(const changed of [null,'b']) for(const status of [200,400]) {
  const {dom,w,auth}=setup(makeSession('a',true));let resolve;const orig=w.fetch;
  w.fetch=async(url,opts)=>String(url).includes('/token?')?new Promise(r=>resolve=r):orig(url,opts);
  const pending=auth.token();await tick();const newValue=changed?JSON.stringify(makeSession(changed)):null;
  if(newValue)w.localStorage.setItem('qr_session',newValue);else w.localStorage.removeItem('qr_session'); // no storage event
  resolve(response({access_token:'late-a',refresh_token:'late-r',user:{id:'a'}},status));
  assert.equal(await pending,null);assert.equal(w.localStorage.getItem('qr_session'),newValue);assert.equal(auth.user()?.id||null,changed);dom.window.close();
 }
 // Re-check after an asynchronously parsed response, not just after fetch.
 {const {dom,w,auth}=setup(makeSession('a',true));let releaseJson;const orig=w.fetch;
  w.fetch=async(url,opts)=>String(url).includes('/token?')?{ok:true,status:200,json:()=>new Promise(r=>releaseJson=r)}:orig(url,opts);
  const pending=auth.token();await tick();w.localStorage.removeItem('qr_session');releaseJson({access_token:'late',refresh_token:'late',user:{id:'a'}});
  assert.equal(await pending,null);assert.equal(w.localStorage.getItem('qr_session'),null);assert.equal(auth.user(),null);dom.window.close();}
 // A queued duplicate event must not cancel a still-current refresh.
 {const {dom,w,auth}=setup(makeSession('a',true));let resolve;const orig=w.fetch;
  w.fetch=async(url,opts)=>String(url).includes('/token?')?new Promise(r=>resolve=r):orig(url,opts);
  const pending=auth.token();await tick();w.dispatchEvent(new w.StorageEvent('storage',{key:'qr_session',newValue:'outdated'}));
  resolve(response({access_token:'fresh-a',refresh_token:'fresh-r',user:{id:'a'}}));assert.equal(await pending,'fresh-a');dom.window.close();}
 // Failed network/rate limit does not falsely log out but cannot supply an expired token.
 {const {dom,w,auth}=setup(makeSession('a',true));const orig=w.fetch;w.fetch=async(url,opts)=>String(url).includes('/token?')?response({},503):orig(url,opts);assert.equal(await auth.token(),null);assert.equal(auth.user().id,'a');assert(w.localStorage.getItem('qr_session'));dom.window.close();}
 // A stale storage event cannot roll the in-memory session back; clear() events are handled.
 {const {dom,w,auth}=setup(makeSession('a'));switchSession(w,'b');w.dispatchEvent(new w.StorageEvent('storage',{key:'qr_session',newValue:JSON.stringify(makeSession('a'))}));assert.equal(auth.user().id,'b');w.localStorage.clear();w.dispatchEvent(new w.StorageEvent('storage',{key:null,newValue:null}));assert.equal(auth.user(),null);dom.window.close();}
 // A delayed user lookup must not overwrite a newer session.
 {const {dom,w,auth}=setup(makeSession('a'));let resolve;const orig=w.fetch;w.fetch=async(url,opts)=>String(url).includes('/auth/v1/user')?new Promise(r=>resolve=r):orig(url,opts);const pending=auth.hydrateFromToken();await tick();switchSession(w,'b');resolve(response({id:'a',email:'a@example.test'}));await pending;assert.equal(auth.user().id,'b');assert.equal(await auth.token(),'token-b');dom.window.close();}
 // A hydration result must also notice a storage change without an event.
 {const {dom,w,auth}=setup(makeSession('a'));let resolve;const orig=w.fetch;w.fetch=async(url,opts)=>String(url).includes('/auth/v1/user')?new Promise(r=>resolve=r):orig(url,opts);const pending=auth.hydrateFromToken();await tick();const next=JSON.stringify(makeSession('b'));w.localStorage.setItem('qr_session',next);resolve(response({id:'a',email:'a@example.test'}));await pending;assert.equal(w.localStorage.getItem('qr_session'),next);assert.equal(auth.user().id,'b');dom.window.close();}
 // Token lookup and logout reconcile a change before any queued event.
 {const {dom,w,auth}=setup(makeSession('a'));const next=JSON.stringify(makeSession('b'));w.localStorage.setItem('qr_session',next);assert.equal(await auth.token(),null);assert.equal(await auth.token(),'token-b');assert.equal(auth.user().id,'b');dom.window.close();}
 {const {dom,w,auth}=setup(makeSession('a'));let requests=0;w.fetch=async()=>{requests++;throw Error('unexpected')};const next=JSON.stringify(makeSession('b'));w.localStorage.setItem('qr_session',next);const result=await auth.signOut();assert.equal(result.session_changed,true);assert.equal(result.remote,'not_attempted');assert.equal(result.current_user.id,'b');assert.equal(requests,0);assert.equal(w.localStorage.getItem('qr_session'),next);dom.window.close();}
 // Logout response belongs to the old session and cannot erase a newer login.
 {const {dom,w,auth}=setup(makeSession('a'));let resolve;const orig=w.fetch;w.fetch=async(url,opts)=>String(url).includes('/logout?')?new Promise(r=>resolve=r):orig(url,opts);const pending=auth.signOut();assert.equal(auth.user(),null);await tick();switchSession(w,'b');resolve(response({},204));assert.equal((await pending).remote,'confirmed');assert.equal(auth.user().id,'b');assert.equal(await auth.token(),'token-b');dom.window.close();}
 // If a new session appears while configuration is loading, don't send the old logout request.
 {const {dom,w,auth}=setup(makeSession('a'));let config,requests=0;w.fetch=(url)=>{if(String(url)==='/api/app-config')return new Promise(r=>config=r);requests++;return Promise.resolve(response({},204))};const pending=auth.signOut();switchSession(w,'b');config(response({supabase:{url:'https://auth.test',anon:'fixture-anon'}}));assert.equal((await pending).remote,'unknown');assert.equal(requests,0);assert.equal(auth.user().id,'b');dom.window.close();}
 // Also detect the change while config loads when its storage event is delayed.
 {const {dom,w,auth}=setup(makeSession('a'));let config,requests=0;w.fetch=(url)=>{if(String(url)==='/api/app-config')return new Promise(r=>config=r);requests++;return Promise.resolve(response({},204))};const pending=auth.signOut();const next=JSON.stringify(makeSession('b'));w.localStorage.setItem('qr_session',next);config(response({supabase:{url:'https://auth.test',anon:'fixture-anon'}}));assert.equal((await pending).remote,'unknown');assert.equal(requests,0);assert.equal(w.localStorage.getItem('qr_session'),next);assert.equal(auth.user().id,'b');dom.window.close();}
 // Timeout includes configuration lookup. Abort and report uncertainty, do not claim server revocation.
 {const {dom,w,auth}=setup(makeSession('a'));let fire;w.setTimeout=(fn)=>{fire=fn;return 1};w.clearTimeout=()=>{};w.fetch=()=>new Promise(()=>{});const pending=auth.signOut();assert.equal(auth.user(),null);await tick();fire();const result=await pending;assert.equal(result.local_cleared,true);assert.equal(result.remote,'unknown');dom.window.close();}
 // A blocked localStorage removal must not be reported as successfully cleared.
 {const {dom,w,auth}=setup(makeSession('a'));w.Storage.prototype.removeItem=function(){throw Error('blocked')};const orig=w.fetch;w.fetch=async(url,opts)=>String(url).includes('/logout?')?response({},503):orig(url,opts);const result=await auth.signOut();assert.equal(result.local_cleared,false);assert.equal(result.remote,'unknown');assert.equal(auth.user(),null);dom.window.close();}
 console.log('ALL OK: mocked auth logout, single-flight refresh, late-session isolation, timeout and local storage failure');
})().catch(e=>{console.error(e);process.exitCode=1});
