/* Actual routed handler and REST translator, synthetic auth/database only. */
'use strict';
const assert = require('node:assert/strict');
const {Readable} = require('node:stream');
process.env.SUPABASE_URL='https://fixture.invalid';
process.env.SUPABASE_SERVICE_KEY='fixture-service';
const sess=require.resolve('../lib/sess'); let currentUser='11111111-1111-4111-8111-111111111111';
require.cache[sess]={id:sess,filename:sess,loaded:true,exports:{getUserId:async()=>currentUser}};
const handler=require('../api/_social');
const id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', other='22222222-2222-4222-8222-222222222222';
let records=[], requests=[], afterDeleteError=false, resultOverride, noRepresentation=false;
const originalFetch=global.fetch;
global.fetch=async(url,opts)=>{
  requests.push({url:String(url),opts});
  const u=new URL(url);assert.equal(u.origin,'https://fixture.invalid');assert.equal(u.pathname,'/rest/v1/social_connections');
  assert.equal(opts.method,'DELETE');assert.equal(opts.headers.Prefer,'return=representation');
  assert.equal(u.searchParams.get('select'),'id,user_id');
  const target=u.searchParams.get('id').slice(3), owner=u.searchParams.get('user_id').slice(3);
  const deleted=records.filter(r=>r.id===target&&r.user_id===owner);
  records=records.filter(r=>!(r.id===target&&r.user_id===owner));
  if(afterDeleteError)throw Error('fixture lost response');
  if(noRepresentation)return new Response(null,{status:204});
  return new Response(JSON.stringify(resultOverride===undefined?deleted.map(r=>({id:r.id,user_id:r.user_id})):resultOverride),{status:200,headers:{'content-type':'application/json'}});
};
function response(){return {statusCode:200,headers:{},setHeader(k,v){this.headers[k]=v},end(s){this.data=JSON.parse(s)}}}
async function call(body,{method='POST',stream=false,headers={},raw}={}){
 const req=stream?Readable.from([raw===undefined?JSON.stringify(body):raw]):{body:raw===undefined?body:raw};
 req.method=method;req.url='/api/gw?op=disconnect';req.headers=headers;
 const res=response();await handler(req,res);return res;
}
(async()=>{
 records=[{id,user_id:currentUser,access_token:'never-return'}];let r=await call({id});assert.equal(r.statusCode,200);assert.deepEqual(r.data,{ok:true,deleted:true});assert.equal(records.length,0);assert(!JSON.stringify(r.data).includes('never-return'));assert.equal(requests.length,1);
 r=await call({id});assert.equal(r.statusCode,404);assert.equal(r.data.ok,undefined);
 records=[{id,user_id:other}];r=await call({id});assert.equal(r.statusCode,404);assert.equal(records.length,1);
 records=[{id,user_id:currentUser}];r=await call({id},{stream:true});assert.equal(r.statusCode,200);assert.equal(records.length,0);
 records=[{id,user_id:currentUser}];r=await call({id},{raw:Buffer.from(JSON.stringify({id}))});assert.equal(r.statusCode,200);
 const before=requests.length;
 for(const body of [{id:'abc'}, {id:3}, {id:id+',x'}, [], null]) {r=await call(body);assert.equal(r.statusCode,400);}
 for(const raw of ['{bad','x'.repeat(4097)]) {r=await call(null,{raw});assert([400,413].includes(r.statusCode));}
 r=await call(null,{stream:true,raw:'x'.repeat(4097)});assert.equal(r.statusCode,413);
 r=await call({id},{headers:{'content-length':'4097'}});assert.equal(r.statusCode,413);
 r=await call({id},{method:'GET'});assert.equal(r.statusCode,405);
 currentUser=null;r=await call({id});assert.equal(r.statusCode,401);currentUser='11111111-1111-4111-8111-111111111111';assert.equal(requests.length,before);
 // A delete may commit before the transport fails: no success or automatic retry.
 records=[{id,user_id:currentUser}];afterDeleteError=true;r=await call({id});assert.equal(r.statusCode,503);assert.equal(records.length,0);afterDeleteError=false;r=await call({id});assert.equal(r.statusCode,404);
 records=[{id,user_id:currentUser}];resultOverride={unexpected:true};r=await call({id});assert.equal(r.statusCode,503);
 for (const bad of [[{id,user_id:other}],[{id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',user_id:currentUser}],[{id,user_id:currentUser},{id,user_id:currentUser}]]) {records=[{id,user_id:currentUser}];resultOverride=bad;r=await call({id});assert.equal(r.statusCode,503);}
 resultOverride=undefined;records=[{id,user_id:currentUser}];noRepresentation=true;r=await call({id});assert.equal(r.statusCode,503);assert.equal(records.length,0);noRepresentation=false;
 currentUser='bad,filter';r=await call({id});assert.equal(r.statusCode,401);
 console.log('ALL OK: routed disconnect body, owner filter, explicit deletion evidence and lost response (mock PostgREST; no production)');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>{global.fetch=originalFetch});
