'use strict';
// Real YouTube callback + SQL-to-REST translator, synthetic provider and in-memory REST.
const assert=require('node:assert/strict');
Object.assign(process.env,{SUPABASE_URL:'https://db.fixture',SUPABASE_SERVICE_KEY:'fixture',TOKEN_ENC_KEY:'fixture',SITE_ORIGIN:'https://app.fixture',GOOGLE_CLIENT_ID:'id',GOOGLE_CLIENT_SECRET:'secret'});
let defaults,automations,rows,requests,gate,failLookup,patchReply;
function stub(rel,exports){const id=require.resolve(rel);require.cache[id]={id,filename:id,loaded:true,exports}}
const def=()=>{};def.ensureDefault=async()=>{defaults++};stub('../lib/soc_default',def);
stub('../lib/autopilot',{enableDefaultAutomation:async()=>{automations++;return 'ok'}});
const oauth=require('../lib/oauth'),{seal,open}=require('../lib/crypt'),callback=require('../lib/cb_youtube');
const response=(value,status=200)=>({ok:status>=200&&status<300,status,headers:{get:()=> 'application/json'},json:async()=>value,text:async()=>JSON.stringify(value)});
function pauseNextRead(){let notify,release;const entered=new Promise(r=>notify=r),wait=new Promise(r=>release=r);gate={notify,wait};return {entered,release}}
global.fetch=async(url,opts={})=>{
 const u=new URL(url),method=opts.method||'GET';
 if(u.hostname==='oauth2.googleapis.com')return response(opts.body.get('code')==='new'?{access_token:'new-access',refresh_token:'new-refresh'}:{access_token:'old-access'});
 if(u.hostname==='www.googleapis.com')return response({items:[{id:'UC-fixture',snippet:{title:'fixture'}}]});
 assert.equal(u.origin,'https://db.fixture');assert.equal(u.pathname,'/rest/v1/social_connections');requests.push({method,query:u.search,body:opts.body?JSON.parse(opts.body):null});
 const get=name=>(u.searchParams.get(name)||'').replace(/^eq\./,'');
 const key=(owner,account)=>owner+'/'+account;
 const body=opts.body?JSON.parse(opts.body):null;
 const k=method==='POST'?key(body.user_id,body.account_id):key(get('user_id'),get('account_id'));
 if(method==='GET'){
  if(failLookup)return response({error:'fixture error'},500);
  const snapshot=rows.has(k)?[{...rows.get(k)}]:[];
  if(gate){const p=gate;gate=null;p.notify();await p.wait}
  return response(snapshot);
 }
 if(method==='PATCH'){
  const found=rows.get(k);if(!found)return response([]);Object.assign(found,body);
  if(patchReply==='lost')throw Error('synthetic lost response after commit');
  if(patchReply==='empty')return response([]);
  if(patchReply==='malformed')return response({message:'not a row array'});
  const returned={...found};
  if(patchReply==='owner')returned.user_id='other';
  if(patchReply==='platform')returned.platform='x';
  if(patchReply==='account')returned.account_id='other';
  if(patchReply==='id')returned.id='';
  if(patchReply==='access')returned.access_token='wrong';
  if(patchReply==='refresh')returned.refresh_token='wrong';
  if(patchReply==='multiple')return response([returned,returned]);
  return response([returned]);
 }
 if(method==='POST'){if(rows.has(k))return response({error:'unique'},409);const created={id:'generated-fixture',...body};rows.set(k,created);return response([{...created}])}
 throw Error('unexpected network');
};
function reset(){rows=new Map();requests=[];defaults=automations=0;gate=null;failLookup=false;patchReply=null}
async function link(code,owner='owner'){
 const state='youtube.state',cookie=oauth.setStCookie(null,'youtube',owner,state).split(';')[0],out={headers:{},setHeader(k,v){this.headers[k.toLowerCase()]=v},end(){}};
 await callback({url:`/api/oauth/callback?code=${code}&state=${state}`,headers:{cookie}},out);return out.headers.location;
}
const quiet=async f=>{const old=console.error;console.error=()=>{};try{return await f()}finally{console.error=old}};
(async()=>{
 reset();rows.set('owner/UC-fixture',{id:'channel',user_id:'owner',platform:'youtube',account_id:'UC-fixture',refresh_token:seal('original')});
 rows.set('other/UC-fixture',{id:'other-channel',user_id:'other',platform:'youtube',account_id:'UC-fixture',refresh_token:seal('other')});
 const pause=pauseNextRead(),older=link('old');await pause.entered;assert.equal(await link('new'),'/#/account?linked=youtube');pause.release();assert.equal(await older,'/#/account?linked=youtube');
 assert.equal(open(rows.get('owner/UC-fixture').refresh_token),'new-refresh','an old no-refresh callback must not overwrite a newer refresh token');
 assert.equal(open(rows.get('other/UC-fixture').refresh_token),'other');
 assert.equal(open(rows.get('owner/UC-fixture').access_token),'old-access','access token remains a separate unresolved race');
 const patch=requests.filter(x=>x.method==='PATCH').at(-1);assert(!Object.hasOwn(patch.body,'refresh_token'));
 reset();assert.equal(await link('old'),'/#/account?linked=youtube');assert.equal(rows.get('owner/UC-fixture').refresh_token,'');
 reset();rows.set('owner/UC-fixture',{id:'channel',user_id:'owner',platform:'youtube',account_id:'UC-fixture',refresh_token:seal('original')});
 const deleting=pauseNextRead(),attempt=link('old');await deleting.entered;rows.delete('owner/UC-fixture');deleting.release();assert.match(await attempt,/w=store/);assert.equal(defaults+automations,0);assert.equal(rows.size,0);
 for(const reply of ['lost','empty','malformed','owner','platform','account','id','access','refresh','multiple']){
  reset();rows.set('owner/UC-fixture',{id:'channel',user_id:'owner',platform:'youtube',account_id:'UC-fixture',refresh_token:seal('original')});patchReply=reply;
  assert.match(await quiet(()=>link('new')),/w=store/,reply);assert.equal(defaults+automations,0,reply);
  assert.equal(requests.filter(r=>r.method==='PATCH').length,1,reply+' is not retried');
  assert.equal(open(rows.get('owner/UC-fixture').refresh_token),'new-refresh',reply+' simulates a commit before uncertain evidence');
 }
 reset();failLookup=true;assert.match(await quiet(()=>link('old')),/w=store/);assert.equal(defaults+automations,0);assert.equal(rows.size,0);
 reset();const p=pauseNextRead(),first=quiet(()=>link('old'));await p.entered;assert.equal(await link('new'),'/#/account?linked=youtube');p.release();assert.match(await first,/w=store/);assert.equal(open(rows.get('owner/UC-fixture').refresh_token),'new-refresh');
 console.log('PASS YouTube relink preserves newer refresh token in mock REST race; access-token race remains');
})().catch(e=>{console.error(e);process.exitCode=1});
