/* Firebase QRAuth: تجديد واحد مشترك، الخروج فوري، والرد المتأخر لا يُحيي جلسة قديمة ولا يمسح جلسة جديدة. */
const assert=require('node:assert/strict'),fs=require('node:fs'),{JSDOM}=require('jsdom');
const src=fs.readFileSync('public/js/auth.js','utf8');
const LS='qr_fb_session';
const makeSession=(id,expired=false)=>({access_token:`token-${id}`,refresh_token:`refresh-${id}`,expires_at:Date.now()+(expired?-1000:3600000),user:{id,email:`${id}@example.test`}});
const tick=()=>new Promise(r=>setImmediate(r));
const response=(json,status=200)=>({ok:status>=200&&status<300,status,json:async()=>json});
function setup(initial){const dom=new JSDOM('',{url:'https://app.test/',runScripts:'outside-only'}),w=dom.window;if(initial)w.localStorage.setItem(LS,JSON.stringify(initial));
 w.fetch=async url=>{if(String(url)==='/api/app-config')return response({firebase:{apiKey:'fixture-key'}});throw Error('unexpected '+url)};
 w.eval(src+'\nwindow.__auth=QRAuth;');return {dom,w,auth:w.__auth}}
function switchSession(w,id){const value=id?JSON.stringify(makeSession(id)):null;if(value)w.localStorage.setItem(LS,value);else w.localStorage.removeItem(LS);w.dispatchEvent(new w.StorageEvent('storage',{key:LS,newValue:value}))}
const fbToken=(id)=>({id_token:`new-${id}`,refresh_token:`next-${id}`,user_id:id,expires_in:'3600'});
(async()=>{
 // قارئان بتوكن منتهٍ يتشاركان تجديدًا واحدًا؛ الخروج فوري والرد المتأخر لا يُحيي A.
 {const {w,auth}=setup(makeSession('a',true));let pending,calls=0;const orig=w.fetch;
  w.fetch=async(url,opts={})=>{if(String(url).includes('securetoken.googleapis.com')){calls++;return new Promise(r=>pending=r)}return orig(url,opts)};
  const p1=auth.token(),p2=auth.token();await tick();await tick();assert.equal(calls,1);
  const out=auth.signOut();assert.equal(auth.user(),null);assert.equal(w.localStorage.getItem(LS),null);
  await tick();pending(response(fbToken('a')));assert.equal(await p1,null);assert.equal(await p2,null);
  const result=await out;assert.equal(result.local_cleared,true);assert.equal(auth.user(),null);assert.equal(w.localStorage.getItem(LS),null);}
 // رد متأخر (نجاح أو رفض) لا يكتب فوق حساب B الجديد ولا يمسحه.
 for(const status of [200,400]){const {w,auth}=setup(makeSession('a',true));let resolve;const orig=w.fetch;
  w.fetch=async(url,opts)=>String(url).includes('securetoken.googleapis.com')?new Promise(r=>resolve=r):orig(url,opts);
  const p=auth.token();await tick();await tick();switchSession(w,'b');assert.equal(auth.user().id,'b');
  resolve(status===200?response(fbToken('a')):response({error:{message:'TOKEN_EXPIRED'}},400));await p;
  assert.equal(auth.user().id,'b',`late ${status} must not replace B`);assert.equal(JSON.parse(w.localStorage.getItem(LS)).user.id,'b');}
 // تجديد ناجح عادي يحدّث الجلسة؛ ورفض 400 بلا تبدّل يمسحها.
 {const {w,auth}=setup(makeSession('a',true));const orig=w.fetch;w.fetch=async(url,opts)=>String(url).includes('securetoken.googleapis.com')?response(fbToken('a')):orig(url,opts);
  assert.equal(await auth.token(),'new-a');assert.equal(JSON.parse(w.localStorage.getItem(LS)).refresh_token,'next-a');}
 {const {w,auth}=setup(makeSession('a',true));const orig=w.fetch;w.fetch=async(url,opts)=>String(url).includes('securetoken.googleapis.com')?response({},400):orig(url,opts);
  assert.equal(await auth.token(),null);assert.equal(auth.user(),null);assert.equal(w.localStorage.getItem(LS),null);}
 console.log('ALL OK: Firebase auth refresh dedupe, immediate logout, late responses cannot resurrect/overwrite');
})().catch(e=>{console.error(e);process.exitCode=1});
