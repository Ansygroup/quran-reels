'use strict';
// Real callback, synthetic provider responses and mocked database only.
const assert=require('node:assert/strict');
Object.assign(process.env,{TOKEN_ENC_KEY:'fixture-key',SITE_ORIGIN:'https://fixture.invalid',GOOGLE_CLIENT_ID:'fixture-id',GOOGLE_CLIENT_SECRET:'fixture-secret'});
let writes,defaults,automations,calls,token,profile;
function stub(rel,exports){const id=require.resolve(rel);require.cache[id]={id,filename:id,loaded:true,exports}}
stub('../lib/db',{q:async()=>{writes++;return []},q1:async()=>null});
const def=()=>{};def.ensureDefault=async()=>{defaults++};stub('../lib/soc_default',def);
stub('../lib/autopilot',{enableDefaultAutomation:async()=>{automations++;return 'ok'}});
const oauth=require('../lib/oauth'),callback=require('../api/oauth/callback');
const response=(body,ok=true)=>({ok,json:async()=>body});
global.fetch=async()=>{calls++;return calls===1?token:profile};
function reset(){writes=defaults=automations=calls=0;token=response({access_token:'fixture',refresh_token:'fixture-refresh'});profile=response({items:[{id:'UC-fixture',snippet:{title:'fixture'}}]})}
async function run(){const state='youtube.fixture',cookie=oauth.setStCookie(null,'youtube','owner',state).split(';')[0],res={headers:{},setHeader(k,v){this.headers[k.toLowerCase()]=v},end(){}};await callback({url:`/api/oauth/callback?code=fixture&state=${state}`,headers:{cookie}},res);return res.headers.location}
(async()=>{
 for(const value of [null,{}, {access_token:{}},{access_token:'   '},{access_token:'fixture',error:'invalid_grant'},{access_token:'fixture',refresh_token:{}},{access_token:'fixture',refresh_token:' spaced '}]){
  reset();token=response(value);assert.match(await run(),/youtube_err&w=token/);assert.equal(calls,1);assert.equal(writes+defaults+automations,0);
 }
 for(const result of [response({items:[{id:'UC-fixture'}]},false),response({items:[{id:'UC-fixture'}],error:{message:'error'}}),response({items:[{id:'me'}]}),response({items:[{id:123}]}),response({items:{}}),response(null),{ok:true,json:async()=>{throw Error('bad JSON')}}]){
  reset();profile=result;assert.match(await run(),/youtube_err&w=channel/);assert.equal(calls,2);assert.equal(writes+defaults+automations,0);
 }
 reset();assert.equal(await run(),'/#/account?linked=youtube');assert.equal(writes,1);assert.equal(defaults,1);assert.equal(automations,1);
 console.log('PASS YouTube token and identity evidence required before linking (mocked only)');
})().catch(e=>{console.error(e);process.exitCode=1});
