'use strict';
// Routed callbacks, native fetch and synthetic loopback redirects. No real provider or database.
const assert=require('node:assert/strict'),http=require('node:http');
const nativeFetch=global.fetch;
Object.assign(process.env,{TOKEN_ENC_KEY:'fixture-key',SITE_ORIGIN:'https://fixture.invalid',GOOGLE_CLIENT_ID:'fixture-id',GOOGLE_CLIENT_SECRET:'fixture-secret',X_CLIENT_ID:'fixture-id',X_CLIENT_SECRET:'fixture-secret'});
let writes,defaults,automations,stage,forwarded,calls;
function stub(rel,exports){const id=require.resolve(rel);require.cache[id]={id,filename:id,loaded:true,exports}}
stub('../lib/db',{q:async()=>{writes++;return []},q1:async()=>{writes++;return null}});
const def=()=>{};def.ensureDefault=async()=>{defaults++};stub('../lib/soc_default',def);
stub('../lib/autopilot',{enableDefaultAutomation:async()=>{automations++;return 'ok'}});
const listen=s=>new Promise(r=>s.listen(0,'127.0.0.1',r)),close=s=>new Promise(r=>s.close(r));
(async()=>{
 const dest=http.createServer(async(req,res)=>{const chunks=[];for await(const chunk of req)chunks.push(chunk);forwarded.push({headers:req.headers,body:Buffer.concat(chunks).toString()});res.writeHead(200,{'content-type':'application/json'}).end(JSON.stringify({access_token:'redirected-token',refresh_token:'redirected-refresh',items:[{id:'channel',snippet:{title:'fixture'}}],data:{id:'account'}}))});await listen(dest);
 const source=http.createServer(async(req,res)=>{for await(const _ of req){}res.writeHead(307,{location:`http://127.0.0.1:${dest.address().port}/redirected`}).end()});await listen(source);
 try {
  const oauth=require('../lib/oauth'),callback=require('../api/oauth/callback');
  global.fetch=async(url,opts={})=>{
   const u=new URL(url),token=/\/token$/.test(u.pathname),type=token?'token':'identity';calls.push(type);
   if(type===stage)return nativeFetch(`http://127.0.0.1:${source.address().port}/fixture`,opts);
   if(type==='token')return {ok:true,json:async()=>({access_token:'fixture-access',refresh_token:'fixture-refresh'})};
   throw Error('unexpected network blocked');
  };
  for(const provider of ['youtube','x'])for(const type of ['token','identity']){
   writes=defaults=automations=0;forwarded=[];calls=[];stage=type;
   const state=provider+'.fixture',cookie=oauth.setStCookie(null,provider,'owner',state,{v:'fixture-verifier'}).split(';')[0];
   const res={headers:{},setHeader(k,v){this.headers[k.toLowerCase()]=v},end(){}};
   await callback({url:`/api/oauth/callback?code=fixture-code&state=${state}`,headers:{cookie}},res);
   assert.equal(res.statusCode,302);assert.equal(res.headers.location,`/#/account?linked=${provider}_err&w=${type==='identity'?(provider==='youtube'?'channel':'identity'):'token'}`);
   assert.deepEqual(forwarded,[],`${provider} ${type} must not follow redirect`);assert.equal(writes,0);assert.equal(defaults,0);assert.equal(automations,0);
   assert.equal(calls.filter(c=>c===type).length,1);if(type==='token')assert.deepEqual(calls,['token']);
  }
  console.log('PASS OAuth token and identity redirects fail closed for YouTube and X (synthetic loopback only)');
 } finally {global.fetch=nativeFetch;await close(source);await close(dest)}
})().catch(e=>{console.error(e);process.exitCode=1});
