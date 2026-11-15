'use strict';
// Actual callback + db.js with disposable CI PostgREST. JWTs/identities are
// synthetic; fixed loopback upstream, all external requests blocked or mocked.
const assert=require('node:assert/strict'),crypto=require('node:crypto'),http=require('node:http');
const UPSTREAM='http://127.0.0.1:3101',SECRET='LOCAL-ONLY-postgrest-fixture-secret-0123456789-abcdef';
const USER='44444444-4444-4444-8444-444444444444',YOUTUBE_ACCOUNT='UC-fixture',X_ACCOUNT='123';
const b64=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
const claims=b64({alg:'HS256',typ:'JWT'})+'.'+b64({role:'service_role',sub:USER,exp:Math.floor(Date.now()/1000)+3600});
const jwt=claims+'.'+crypto.createHmac('sha256',SECRET).update(claims).digest('base64url');
let pause=null,dropPatch=false,defaults=0,automations=0,patches=0;
const nativeFetch=global.fetch;
const gateway=http.createServer(async(req,res)=>{
 try{
  const u=new URL(req.url,'http://127.0.0.1');if(u.pathname!=='/rest/v1/social_connections')return res.writeHead(403).end();
  const chunks=[];for await(const c of req)chunks.push(c);
  const body=Buffer.concat(chunks),headers={authorization:req.headers.authorization||'',prefer:req.headers.prefer||'', 'content-type':'application/json'};
  const r=await nativeFetch(UPSTREAM+'/social_connections'+u.search,{method:req.method,headers,...(['GET','HEAD'].includes(req.method)?{}:{body}),redirect:'error',signal:AbortSignal.timeout(10000)});
  const bytes=Buffer.from(await r.arrayBuffer());
  if(req.method==='GET'&&pause&&u.searchParams.get('select')==='*') {const p=pause;pause=null;p.notify();await p.wait}
  if(req.method==='PATCH'){patches++;if(dropPatch){dropPatch=false;req.socket.destroy();return}}
  res.writeHead(r.status,{'content-type':r.headers.get('content-type')||'application/json'}).end(bytes);
 }catch{if(!res.headersSent)res.writeHead(502).end()}
});
function stub(rel,exports){const id=require.resolve(rel);require.cache[id]={id,filename:id,loaded:true,exports}}
function pauseNextRead(){let notify,release;const entered=new Promise(r=>notify=r),wait=new Promise(r=>release=r);pause={notify,wait};return {entered,release}}
(async()=>{
 await new Promise(r=>gateway.listen(0,'127.0.0.1',r));
 const origin=`http://127.0.0.1:${gateway.address().port}`;
 Object.assign(process.env,{SUPABASE_URL:origin,SUPABASE_SERVICE_KEY:jwt,TOKEN_ENC_KEY:'local-fixture',SITE_ORIGIN:'https://fixture.invalid',GOOGLE_CLIENT_ID:'fixture',GOOGLE_CLIENT_SECRET:'fixture',X_CLIENT_ID:'fixture',X_CLIENT_SECRET:'fixture'});
 const def=()=>{};def.ensureDefault=async()=>{defaults++};stub('../lib/soc_default',def);
 stub('../lib/autopilot',{enableDefaultAutomation:async()=>{automations++;return 'ok'}});
 global.fetch=async(url,opts={})=>{
  const u=new URL(url);
  if(u.hostname==='oauth2.googleapis.com'||(u.hostname==='api.x.com'&&u.pathname==='/2/oauth2/token'))return {ok:true,json:async()=>({access_token:'fixture-access',refresh_token:'fixture-refresh'})};
  if(u.hostname==='www.googleapis.com'&&u.pathname==='/youtube/v3/channels')return {ok:true,json:async()=>({items:[{id:YOUTUBE_ACCOUNT,snippet:{title:'fixture'}}]})};
  if(u.hostname==='api.x.com'&&u.pathname==='/2/users/me')return {ok:true,json:async()=>({data:{id:X_ACCOUNT,username:'fixture'}})};
  if(u.origin===origin||u.origin===UPSTREAM)return nativeFetch(url,opts);
  throw Error('external network blocked');
 };
 const oauth=require('../lib/oauth'),{open}=require('../lib/crypt'),callback=require('../api/oauth/callback');
 async function fixture(method,path,body){const r=await nativeFetch(UPSTREAM+path,{method,headers:{authorization:'Bearer '+jwt,prefer:'return=representation','content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),redirect:'error'});const d=await r.json();assert(r.ok,JSON.stringify(d));return d}
 async function link(provider){const state=provider+'.fixture',cookie=oauth.setStCookie(null,provider,USER,state,{v:'fixture-verifier'}).split(';')[0],out={headers:{},setHeader(k,v){this.headers[k.toLowerCase()]=v},end(){}};await callback({url:`/api/oauth/callback?code=fixture-code&state=${state}`,headers:{cookie}},out);return out.headers.location}
 try{
  for(const [provider,account] of [['youtube',YOUTUBE_ACCOUNT],['x',X_ACCOUNT]]){
   const query='?user_id=eq.'+USER+'&platform=eq.'+provider+'&account_id=eq.'+account;
   defaults=automations=patches=0;
   assert.equal(await link(provider),'/#/account?linked='+provider);let [row]=await fixture('GET','/social_connections'+query);assert.equal(row.user_id,USER);assert.equal(open(row.refresh_token),'fixture-refresh');assert.equal(defaults,1);assert.equal(automations,1);
   defaults=automations=patches=0;const gate=pauseNextRead(),attempt=link(provider);await gate.entered;await fixture('DELETE','/social_connections'+query);gate.release();assert.match(await attempt,/w=store/);assert.equal(patches,1);assert.equal(defaults+automations,0);assert.deepEqual(await fixture('GET','/social_connections'+query),[]);
   assert.equal(await link(provider),'/#/account?linked='+provider);defaults=automations=patches=0;dropPatch=true;
   const old=console.error;console.error=()=>{};try{assert.match(await link(provider),/w=store/)}finally{console.error=old}
   assert.equal(patches,1);assert.equal(defaults+automations,0);[row]=await fixture('GET','/social_connections'+query);assert.equal(open(row.access_token),'fixture-access','write committed despite lost response');
  }
  console.log('PASS YouTube and X callbacks and translator reject zero-row and lost replies (disposable PostgREST, providers mocked)');
 } finally {
  global.fetch=nativeFetch;await new Promise(r=>gateway.close(r));
 }
})().catch(e=>{console.error(e);process.exitCode=1});
