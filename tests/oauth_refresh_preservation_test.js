'use strict';
/* Real callback + lib/db REST translator; provider and PostgREST are in-memory fakes. */
const assert=require('node:assert/strict');
process.env.SUPABASE_URL='https://db.example.test';process.env.SUPABASE_SERVICE_KEY='fixture-service';process.env.TOKEN_ENC_KEY='fixture-refresh-key';process.env.SITE_ORIGIN='https://app.example.test';
Object.assign(process.env,{X_CLIENT_ID:'id',X_CLIENT_SECRET:'secret',TIKTOK_CLIENT_KEY:'id',TIKTOK_CLIENT_SECRET:'secret'});
let defaults=[],automations=[];const def=require.resolve('../lib/soc_default');const d=()=>{};d.ensureDefault=async(...a)=>{defaults.push(a);return true};require.cache[def]={id:def,filename:def,loaded:true,exports:d};
const auto=require.resolve('../lib/autopilot');require.cache[auto]={id:auto,filename:auto,loaded:true,exports:{enableDefaultAutomation:async(...a)=>{automations.push(a);return 'created'}}};
const {seal,open}=require('../lib/crypt'),{readRefreshToken}=require('../lib/refresh_token'),oauth=require('../lib/oauth');
const callbacks={x:require('../lib/cb_x'),tiktok:require('../lib/cb_tiktok')};
const table=new Map(),dbRequests=[];let pauseGet=null,failRead=false;
const key=(uid,p,id)=>`${uid}/${p}/${id}`;const result=(value,status=200)=>({ok:status>=200&&status<300,status,headers:{get:()=> 'application/json'},json:async()=>value,text:async()=>JSON.stringify(value)});
function pauseNextRead(){let notify,release;const entered=new Promise(r=>notify=r),wait=new Promise(r=>release=r);pauseGet={notify,wait};return {entered,release}}
const tokens={fresh:{access_token:'new-access',refresh_token:'new-refresh',open_id:'open-A'},absent:{access_token:'old-access',open_id:'open-A'},empty:{access_token:'old-access',refresh_token:'',open_id:'open-A'},null:{access_token:'old-access',refresh_token:null,open_id:'open-A'},bad:{access_token:'old-access',refresh_token:{invalid:true},open_id:'open-A'},blank:{access_token:'old-access',refresh_token:'  ',open_id:'open-A'}};
global.fetch=async(url,opts={})=>{
 const u=new URL(String(url)),method=opts.method||'GET';
 if((u.hostname==='api.x.com'||u.hostname==='open.tiktokapis.com')&&/\/token\/?$/.test(u.pathname)){const code=opts.body.get('code');assert(tokens[code]);return result(tokens[code])}
 if(u.hostname==='api.x.com'&&u.pathname==='/2/users/me')return result({data:{id:'123',username:'alice'}});
 if(u.hostname==='open.tiktokapis.com'&&u.pathname.startsWith('/v2/user/info'))return result({data:{user:{open_id:'open-A',display_name:'fixture'}},error:{code:'ok'}});
 assert.equal(u.origin,'https://db.example.test');assert.equal(u.pathname,'/rest/v1/social_connections');
 const body=opts.body?JSON.parse(opts.body):null;dbRequests.push({method,body});
 const val=k=>(u.searchParams.get(k)||'').replace(/^eq\./,'');
 const rowkey=method==='POST'?key(body.user_id,body.platform,body.account_id):key(val('user_id'),val('platform'),val('account_id'));
 if(method==='GET'){
  if(failRead)return result({error:'fixture read failed'},500);
  const row=table.get(rowkey),snapshot=row?[{...row}]:[];
  if(pauseGet){const pause=pauseGet;pauseGet=null;pause.notify();await pause.wait}
  return result(snapshot);
 }
 if(method==='PATCH'){const row=table.get(rowkey);if(!row)return result([]);Object.assign(row,body);return result([{...row}])}
 if(method==='POST'){if(table.has(rowkey))return result({error:'unique fixture'},409);table.set(rowkey,{...body});return result([body])}
 throw Error('unexpected method');
};
function response(){return {headers:{},setHeader(k,v){this.headers[k.toLowerCase()]=v},end(){}}}
async function run(provider,code,owner='owner-1'){
 const state=provider+'.state';const cookie=oauth.setStCookie(null,provider,owner,state,{v:'verifier'}).split(';')[0],out=response();
 await callbacks[provider]({url:`/api/oauth/callback?code=${code}&state=${state}`,headers:{cookie}},out);return out.headers.location;
}
function reset(){table.clear();dbRequests.length=0;defaults=[];automations=[];pauseGet=null;failRead=false}
const suppress=async fn=>{const old=console.error;console.error=()=>{};try{return await fn()}finally{console.error=old}};
(async()=>{
 for(const provider of ['x','tiktok']){
  const id=provider==='x'?'123':'open-A',k=key('owner-1',provider,id),other=key('owner-2',provider,id);
  for(const code of ['absent','empty','null']){
   reset();const old=seal('old-refresh'),otherToken=seal('other-refresh');table.set(k,{user_id:'owner-1',platform:provider,account_id:id,refresh_token:old});table.set(other,{user_id:'owner-2',platform:provider,account_id:id,refresh_token:otherToken});
   assert.equal(await run(provider,code),`/#/account?linked=${provider}`);assert.equal(table.get(k).refresh_token,old);assert.equal(table.get(other).refresh_token,otherToken);
   const patch=dbRequests.find(x=>x.method==='PATCH');assert(patch);assert(!Object.hasOwn(patch.body,'refresh_token'));assert.equal(open(table.get(k).access_token),'old-access');
  }
  reset();table.set(k,{user_id:'owner-1',platform:provider,account_id:id,refresh_token:seal('old-refresh')});await run(provider,'fresh');assert.equal(open(table.get(k).refresh_token),'new-refresh');assert(Object.hasOwn(dbRequests.find(x=>x.method==='PATCH').body,'refresh_token'));
  reset();assert.equal(await run(provider,'absent'),`/#/account?linked=${provider}`);assert.equal(readRefreshToken(table.get(k).refresh_token),null);assert.equal(dbRequests.find(x=>x.method==='POST').body.user_id,'owner-1');
  for(const code of ['bad','blank']){reset();assert.match(await run(provider,code),/w=token/);assert.equal(dbRequests.length,0);assert.equal(automations.length,0)}
  // Hold an older no-refresh request after its existence read. A newer token
  // arrives first; the old PATCH must not write its previously observed token.
  reset();table.set(k,{user_id:'owner-1',platform:provider,account_id:id,refresh_token:seal('old-refresh')});const gate=pauseNextRead();const older=run(provider,'absent');await gate.entered;
  assert.equal(await run(provider,'fresh'),`/#/account?linked=${provider}`);gate.release();assert.equal(await older,`/#/account?linked=${provider}`);assert.equal(open(table.get(k).refresh_token),'new-refresh');
  // This does not serialize the access token: explicitly expose the remaining race.
  assert.equal(open(table.get(k).access_token),'old-access');
  // An absent-row insert racing a successful insert must fail on uniqueness,
  // not overwrite the refresh token; the shim does not implement atomic upsert.
  reset();const gate2=pauseNextRead();const insertOld=suppress(()=>run(provider,'absent'));await gate2.entered;assert.equal(await run(provider,'fresh'),`/#/account?linked=${provider}`);gate2.release();assert.match(await insertOld,/w=store/);assert.equal(open(table.get(k).refresh_token),'new-refresh');
  reset();failRead=true;const failed=await suppress(()=>run(provider,'absent'));assert.match(failed,/w=store/);assert.equal(automations.length,0);assert.equal(table.size,0);
 }
 console.log('ALL OK: omitted refresh token preserved in real REST-translator PATCH; concurrency limits demonstrated (mock providers/PostgREST)');
})().catch(e=>{console.error(e);process.exitCode=1});
