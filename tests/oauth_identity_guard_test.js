'use strict';
/* Provider identity guards; all OAuth, provider and database traffic mocked. */
const assert=require('node:assert/strict');
process.env.TOKEN_ENC_KEY='fixture-identity-key';process.env.SITE_ORIGIN='https://app.test';
for(const [k,v] of Object.entries({X_CLIENT_ID:'id',X_CLIENT_SECRET:'secret',TIKTOK_CLIENT_KEY:'id',TIKTOK_CLIENT_SECRET:'secret'}))process.env[k]=v;
const registry=new Map(), writes=[], defaults=[], automations=[];let failStore=false;
const db=require.resolve('../lib/db');require.cache[db]={id:db,filename:db,loaded:true,exports:{q:async(sql,params)=>{
 writes.push({sql,params});if(failStore)throw Error('fixture-store-failure');
 const platform=sql.includes("'tiktok'")?'tiktok':sql.includes("'x'")?'x':null;assert(platform);registry.set(`${params[0]}:${platform}:${params[1]}`,params);return [];
}}};
const def=require.resolve('../lib/soc_default');const defaultStub=()=>{};defaultStub.ensureDefault=async(...args)=>{defaults.push(args);return true};require.cache[def]={id:def,filename:def,loaded:true,exports:defaultStub};
const auto=require.resolve('../lib/autopilot');require.cache[auto]={id:auto,filename:auto,loaded:true,exports:{enableDefaultAutomation:async(...args)=>{automations.push(args);return 'created'}}};
const {setStCookie,validProviderId}=require('../lib/oauth'),{open}=require('../lib/crypt');
const callbacks={x:require('../lib/cb_x'),tiktok:require('../lib/cb_tiktok')};
const resp=(data,ok=true)=>({ok,json:async()=>data});
let tokenResponse,profileResponse,calls;
function reset(){writes.length=0;defaults.length=0;automations.length=0;calls=[];failStore=false;tokenResponse=resp({access_token:'access-fixture',refresh_token:'refresh-fixture',open_id:'open-A'});profileResponse=resp({data:{user:{open_id:'open-A',display_name:'Fixture'},id:'123',username:'alice'}})}
global.fetch=async(url)=>{calls.push(String(url));const r=calls.length===1?tokenResponse:profileResponse;if(r instanceof Error)throw r;return r};
const mkRes=()=>({headers:{},setHeader(k,v){this.headers[k.toLowerCase()]=v},end(){this.ended=true}});
async function run(provider){const state=provider+'.state';const cookie=setStCookie(null,provider,'owner-1',state,{v:'fixture-verifier'}).split(';')[0];const result=mkRes();await callbacks[provider]({url:`/api/oauth/callback?code=fixture-code&state=${state}`,headers:{cookie}},result);return result.headers.location}
async function rejected(provider,expected){const result=await run(provider);assert.equal(result,`/#/account?linked=${provider}_err&w=${expected}`);assert.equal(writes.length,0);assert.equal(defaults.length,0);assert.equal(automations.length,0)}
(async()=>{
 for(const bad of ['', ' ', ' abc','abc ', 'me','a\nb', 123, {},null,'x'.repeat(513)])assert.equal(validProviderId(bad),false);
 for(const good of ['123456789','open_ID-abc','非拉丁字符'])assert.equal(validProviderId(good),true);
 for(const provider of ['x','tiktok']){
  reset();tokenResponse=resp({access_token:'fixture'},false);await rejected(provider,'token');assert.equal(calls.length,1);
  reset();tokenResponse=resp(null);await rejected(provider,'token');
  reset();tokenResponse=resp({access_token:'   '});await rejected(provider,'token');
  for(const profile of [resp({}),resp(null),resp({data:{id:'me',user:{open_id:'me'}}}),resp({data:{id:'123',user:{open_id:'open-A'}}},false),new Error('profile offline'),{ok:true,json:async()=>{throw Error('bad JSON')}}]){
   reset();profileResponse=profile;await rejected(provider,'identity');
  }
  reset();profileResponse=provider==='x'?resp({data:{id:' 123 '}}):resp({data:{user:{open_id:123}}});await rejected(provider,'identity');
 }
 reset();profileResponse=resp({data:{user:{open_id:'open-B'}}});await rejected('tiktok','identity');
 reset();profileResponse=resp({data:{user:{open_id:'open-A'}},error:{code:'access_token_invalid'}});await rejected('tiktok','identity');
 // A verified profile can supply the ID even when the token response omits it.
 reset();tokenResponse=resp({access_token:'access-fixture'});assert.equal(await run('tiktok'),'/#/account?linked=tiktok');assert.equal(writes[0].params[1],'open-A');
 for(const provider of ['x','tiktok']){
  reset();registry.set(`owner-1:${provider}:me`,['legacy-untouched']);
  const result=await run(provider);assert.equal(result,`/#/account?linked=${provider}`);assert.equal(writes.length,1);const p=writes[0].params;
  assert.equal(p[0],'owner-1');assert.equal(p[1],provider==='x'?'123':'open-A');assert.equal(open(p[4]),'access-fixture');assert.equal(open(p[5]),'refresh-fixture');
  assert.deepEqual(defaults,[['owner-1',provider]]);assert.deepEqual(automations,[['owner-1',provider]]);assert.deepEqual(registry.get(`owner-1:${provider}:me`),['legacy-untouched']);
  reset();failStore=true;const prev=console.error;console.error=()=>{};try{assert.match(await run(provider),/w=store/)}finally{console.error=prev};assert.equal(defaults.length,0);assert.equal(automations.length,0);
 }
 // Distinct account identities stay distinct; a malformed response cannot overwrite either.
 reset();await run('x');reset();profileResponse=resp({data:{id:'456',username:'bob'}});await run('x');assert(registry.has('owner-1:x:123'));assert(registry.has('owner-1:x:456'));const before=registry.size;
 reset();profileResponse=resp({});await rejected('x','identity');assert.equal(registry.size,before);
 console.log('ALL OK: X/TikTok require provider identity before writes or automation (mocked provider/database)');
})().catch(e=>{console.error(e);process.exitCode=1});
