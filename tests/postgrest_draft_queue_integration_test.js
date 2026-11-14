/* Real queueTargets over local disposable PostgREST; no publisher/provider. */
'use strict';
const assert=require('node:assert/strict'),crypto=require('node:crypto'),http=require('node:http');
const UPSTREAM='http://127.0.0.1:3101',SECRET='LOCAL-ONLY-postgrest-fixture-secret-0123456789-abcdef';
const U='44444444-4444-4444-8444-444444444444',CHANNEL='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const RUNS=['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','cccccccc-cccc-4ccc-8ccc-cccccccccccc'];
const b64=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
const payload=b64({alg:'HS256',typ:'JWT'})+'.'+b64({role:'service_role',sub:U,exp:Math.floor(Date.now()/1000)+3600});
const jwt=payload+'.'+crypto.createHmac('sha256',SECRET).update(payload).digest('base64url');
let mode='ok',queuePosts=0;
const gateway=http.createServer(async(req,res)=>{
 try{
  const u=new URL(req.url,'http://127.0.0.1');
  const isRun=u.pathname==='/rest/v1/autopilot_runs'&&req.method==='PATCH';
  const isQueue=u.pathname==='/rest/v1/publish_queue'&&req.method==='POST';
  if(!isRun&&!isQueue)return res.writeHead(403).end();
  if(isQueue)queuePosts++;
  const chunks=[];for await(const c of req)chunks.push(c);
  const r=await fetch(UPSTREAM+u.pathname.slice('/rest/v1'.length)+u.search,{method:req.method,headers:{authorization:req.headers.authorization||'',prefer:req.headers.prefer||'', 'content-type':'application/json'},body:Buffer.concat(chunks),signal:AbortSignal.timeout(10000)});
  let bytes=Buffer.from(await r.arrayBuffer());
  if(isQueue&&mode==='lost'){req.socket.destroy();return;}
  if(isQueue&&mode==='tamper'){const out=JSON.parse(bytes.toString());out[0].status='scheduled';bytes=Buffer.from(JSON.stringify(out));}
  res.writeHead(r.status,{'content-type':r.headers.get('content-type')||'application/json'}).end(bytes);
 }catch{if(!res.headersSent)res.writeHead(502).end()}
});
(async()=>{
 await new Promise(r=>gateway.listen(0,'127.0.0.1',r));
 async function fixture(method,path,body){const r=await fetch(UPSTREAM+path,{method,headers:{authorization:'Bearer '+jwt,'content-type':'application/json',prefer:'return=representation'},...(body?{body:JSON.stringify(body)}:{})});const data=await r.json();assert(r.ok,JSON.stringify(data));return data}
 try{
  for(const id of RUNS)await fixture('POST','/autopilot_runs',{id,user_id:U,status:'rendering'});
  process.env.SUPABASE_URL='http://127.0.0.1:'+gateway.address().port;process.env.SUPABASE_SERVICE_KEY=jwt;
  const T=require('../lib/autopilot').__test;
  const targets=[...require('../lib/platforms').PUBLISHABLE.map(platform=>({platform,connection_id:null})),{platform:'youtube',connection_id:CHANNEL}];
  for(let i=0;i<RUNS.length;i++){
   mode=['ok','lost','tamper'][i];const path='fixture/'+RUNS[i]+'.mp4',before=queuePosts;
   const promise=T.queueTargets(RUNS[i],U,path,'test.mp4',targets,{s:1,from:1,to:2},{name:'fixture'});
   if(mode==='ok'){const result=await promise;assert.equal(result.length,targets.length);assert(result.every(x=>x.row.status==='draft'));}
   else await assert.rejects(promise,/راجع المسودات/);
   assert.equal(queuePosts,before+1);
   const rows=await fixture('GET','/publish_queue?video_path=eq.'+encodeURIComponent(path)+'&select=id,status,connection_id');
   assert.equal(rows.length,targets.length);assert(rows.every(r=>r.status==='draft'));
   const scheduled=await fixture('GET','/publish_queue?video_path=eq.'+encodeURIComponent(path)+'&status=eq.scheduled&select=id');assert.equal(scheduled.length,0);
  }
  console.log('PASS real PostgREST draft batches: confirmed, committed/lost and tampered replies; no scheduled rows or provider requests');
 }finally{
  for(const id of RUNS){await fixture('DELETE','/publish_queue?video_path=eq.'+encodeURIComponent('fixture/'+id+'.mp4')).catch(()=>{});await fixture('DELETE','/autopilot_runs?id=eq.'+id).catch(()=>{});}
  await new Promise(r=>gateway.close(r));
 }
})().catch(e=>{console.error(e);if(process.env.GITHUB_ACTIONS==='true')console.error('::error title=Draft batch integration::'+String(e?.stack||e).slice(0,3000).replace(/%/g,'%25').replace(/\r/g,'%0D').replace(/\n/g,'%0A'));process.exitCode=1});
