'use strict';
// Routed X callback with mocked provider/DB; no external calls or real data.
const assert=require('node:assert/strict');
Object.assign(process.env,{TOKEN_ENC_KEY:'fixture',SITE_ORIGIN:'https://fixture.invalid',X_CLIENT_ID:'fixture',X_CLIENT_SECRET:'fixture'});
let mode,writes,defaults,automations,params;
function stub(rel,exports){const id=require.resolve(rel);require.cache[id]={id,filename:id,loaded:true,exports}}
stub('../lib/db',{q:async(_sql,p)=>{
 writes++;params=p;if(mode==='lost')throw Error('synthetic lost response after commit');
 const row={id:'channel',user_id:p[0],platform:'x',account_id:p[1],access_token:p[4],refresh_token:p[5]};
 if(mode==='empty')return [];if(mode==='malformed')return {};if(mode==='multiple')return [row,row];
 if(mode==='owner')row.user_id='other';if(mode==='platform')row.platform='youtube';if(mode==='account')row.account_id='other';if(mode==='id')row.id='';if(mode==='access')row.access_token='wrong';if(mode==='refresh')row.refresh_token='wrong';
 return [row];
},q1:async()=>null});
const def=()=>{};def.ensureDefault=async()=>{defaults++};stub('../lib/soc_default',def);
stub('../lib/autopilot',{enableDefaultAutomation:async()=>{automations++;return 'ok'}});
const oauth=require('../lib/oauth'),callback=require('../api/oauth/callback');
global.fetch=async(url)=>{const u=new URL(url);if(u.pathname==='/2/oauth2/token')return {ok:true,json:async()=>({access_token:'fixture-access',refresh_token:'fixture-refresh'})};if(u.pathname==='/2/users/me')return {ok:true,json:async()=>({data:{id:'123',username:'fixture'}})};throw Error('unexpected network blocked')};
async function link(){const state='x.fixture',cookie=oauth.setStCookie(null,'x','owner',state,{v:'verifier'}).split(';')[0],r={headers:{},setHeader(k,v){this.headers[k.toLowerCase()]=v},end(){}};await callback({url:`/api/oauth/callback?code=fixture&state=${state}`,headers:{cookie}},r);return r.headers.location}
(async()=>{
 for(const state of ['empty','malformed','multiple','owner','platform','account','id','access','refresh','lost']){
  mode=state;writes=defaults=automations=0;const old=console.error;console.error=()=>{};try{assert.match(await link(),/x_err&w=store/,state)}finally{console.error=old}
  assert.equal(writes,1,state+' is not retried');assert.equal(defaults+automations,0,state);
 }
 mode='valid';writes=defaults=automations=0;assert.equal(await link(),'/#/account?linked=x');assert.equal(writes,1);assert.equal(defaults,1);assert.equal(automations,1);assert.equal(params[0],'owner');
 console.log('PASS X OAuth requires confirmed connection representation before automation (mock only)');
})().catch(e=>{console.error(e);process.exitCode=1});
