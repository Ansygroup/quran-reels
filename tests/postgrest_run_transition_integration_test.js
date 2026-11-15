/* Actual run transitions through db.js + isolated PostgREST. No provider IO. */
'use strict';
const assert=require('node:assert/strict'),crypto=require('node:crypto'),http=require('node:http');
const UPSTREAM='http://127.0.0.1:3101',SECRET='LOCAL-ONLY-postgrest-fixture-secret-0123456789-abcdef';
const USER='44444444-4444-4444-8444-444444444444', OTHER='11111111-1111-4111-8111-111111111111', ID='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const b64=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
const payload=b64({alg:'HS256',typ:'JWT'})+'.'+b64({role:'service_role',sub:USER,exp:Math.floor(Date.now()/1000)+3600});
const jwt=payload+'.'+crypto.createHmac('sha256',SECRET).update(payload).digest('base64url');
let lost=false,requests=0;
const gateway=http.createServer(async(req,res)=>{
 try{
  const u=new URL(req.url,'http://127.0.0.1');
  if(u.pathname!=='/rest/v1/autopilot_runs'||req.method!=='PATCH')return res.writeHead(403).end();
  requests++;const chunks=[];for await(const chunk of req)chunks.push(chunk);
  const data=Buffer.concat(chunks);
  const r=await fetch(UPSTREAM+'/autopilot_runs'+u.search,{method:'PATCH',headers:{authorization:req.headers.authorization||'',prefer:req.headers.prefer||'', 'content-type':'application/json'},body:data,signal:AbortSignal.timeout(10000)});
  const bytes=Buffer.from(await r.arrayBuffer());
  if(lost){lost=false;req.socket.destroy();return;}
  res.writeHead(r.status,{'content-type':r.headers.get('content-type')||'application/json'}).end(bytes);
 }catch{if(!res.headersSent)res.writeHead(502).end()}
});
(async()=>{
 await new Promise(resolve=>gateway.listen(0,'127.0.0.1',resolve));
 async function fixture(method,path,body){const r=await fetch(UPSTREAM+path,{method,headers:{authorization:'Bearer '+jwt,'content-type':'application/json',prefer:'return=representation'},...(body?{body:JSON.stringify(body)}:{})});const data=await r.json();assert(r.ok,JSON.stringify(data));return data}
 try{
  await fixture('POST','/autopilot_runs',{id:ID,user_id:USER,status:'rendering'});
  process.env.SUPABASE_URL='http://127.0.0.1:'+gateway.address().port;process.env.SUPABASE_SERVICE_KEY=jwt;
  const T=require('../lib/autopilot').__test;
  await assert.rejects(T.transitionRun(OTHER,ID,'rendering',{status:'queued',video_path:'fixture'}),e=>e.code==='RUN_STATE_UNCONFIRMED');
  assert.equal((await fixture('GET','/autopilot_runs?id=eq.'+ID))[0].status,'rendering');
  const marker=await T.transitionRun(USER,ID,'rendering',{status:'queued',video_path:'fixture'});assert.equal(marker.video_path,'fixture');
  await assert.rejects(T.transitionRun(USER,ID,'rendering',{status:'failed',external_url:''}),e=>e.code==='RUN_STATE_UNCONFIRMED');
  lost=true;let error;
  try{await T.transitionRun(USER,ID,'queued',{status:'published',external_url:'https://example.test/video'})}catch(e){error=e}
  assert.equal(error?.code,'RUN_STATE_UNCONFIRMED');const before=requests;
  const result=await T.handleRunFailure(USER,{id:ID},error,true);assert.equal(result.stage,'publish');assert.equal(requests,before);
  const [committed]=await fixture('GET','/autopilot_runs?id=eq.'+ID);assert.equal(committed.status,'published');assert.equal(committed.external_url,'https://example.test/video');
  console.log('PASS run transition with real disposable PostgREST: owner/state checks and committed/lost response without overwrite');
 }finally{await fixture('DELETE','/autopilot_runs?id=eq.'+ID).catch(()=>{});await new Promise(r=>gateway.close(r))}
})().catch(e=>{console.error(e);if(process.env.GITHUB_ACTIONS==='true')console.error('::error title=Run transition integration::'+String(e?.stack||e).slice(0,3000).replace(/%/g,'%25').replace(/\r/g,'%0D').replace(/\n/g,'%0A'));process.exitCode=1});
