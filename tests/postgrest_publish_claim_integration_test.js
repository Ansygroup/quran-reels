/* Actual publishRow + lib/db and disposable PostgREST; no provider traffic. */
'use strict';
const assert=require('node:assert/strict'),crypto=require('node:crypto'),http=require('node:http');
const UPSTREAM='http://127.0.0.1:3102',SECRET='LOCAL-ONLY-channel-fixture-secret-0123456789-abcdef';
const U='11111111-1111-4111-8111-111111111111',A='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',B='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',Q='ffffffff-ffff-4fff-8fff-ffffffffffff',Q2='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',Q3='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const b64=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
const p=b64({alg:'HS256',typ:'JWT'})+'.'+b64({role:'service_role',sub:U,exp:Math.floor(Date.now()/1000)+3600});
const jwt=p+'.'+crypto.createHmac('sha256',SECRET).update(p).digest('base64url');
const observed=[];let dropFailedReply=false;
const gateway=http.createServer(async(req,res)=>{
 try{
  const u=new URL(req.url,'http://127.0.0.1');
  if(u.pathname==='/rest/v1/social_connections'&&req.method==='GET')return res.writeHead(200,{'content-type':'application/json'}).end('[]');
  if(u.pathname!=='/rest/v1/publish_queue'||req.method!=='PATCH')return res.writeHead(403).end();
  observed.push(u.searchParams);
  const chunks=[];for await(const c of req)chunks.push(c);
  const body=Buffer.concat(chunks);
  const r=await fetch(UPSTREAM+'/publish_queue'+u.search,{method:'PATCH',headers:{authorization:req.headers.authorization||'',prefer:req.headers.prefer||'', 'content-type':'application/json'},body,signal:AbortSignal.timeout(10000)});
  const response=Buffer.from(await r.arrayBuffer());
  if(dropFailedReply&&JSON.parse(body.toString()).status==='failed'){dropFailedReply=false;req.socket.destroy();return;}
  res.writeHead(r.status,{'content-type':r.headers.get('content-type')||'application/json'}).end(response);
 }catch{if(!res.headersSent)res.writeHead(502).end()}
});
(async()=>{
 await new Promise(r=>gateway.listen(0,'127.0.0.1',r));
 async function fixture(method,path,body){const r=await fetch(UPSTREAM+path,{method,headers:{authorization:'Bearer '+jwt,'content-type':'application/json',prefer:'return=representation'},...(body?{body:JSON.stringify(body)}:{})});const d=await r.json();assert(r.ok,JSON.stringify(d));return d}
 try{
  const [row]=await fixture('POST','/publish_queue',{id:Q,user_id:U,platform:'youtube',connection_id:B,status:'scheduled'});
  process.env.SUPABASE_URL='http://127.0.0.1:'+gateway.address().port;process.env.SUPABASE_SERVICE_KEY=jwt;
  const {publishRow}=require('../lib/publish');
  assert.equal((await publishRow({...row,connection_id:A})).skipped,'already-claimed');
  assert.equal((await publishRow({...row,connection_id:null})).skipped,'already-claimed');
  assert.equal((await publishRow({...row,platform:'tiktok'})).skipped,'already-claimed');
  let [unchanged]=await fixture('GET','/publish_queue?id=eq.'+Q);assert.equal(unchanged.status,'scheduled');assert.equal(unchanged.connection_id,B);
  const outcome=await publishRow(row);assert.equal(outcome.ok,false);assert.match(outcome.error,/لا يوجد ربط/);
  let [failed]=await fixture('GET','/publish_queue?id=eq.'+Q);assert.equal(failed.status,'failed');
  const [row2]=await fixture('POST','/publish_queue',{id:Q2,user_id:U,platform:'youtube',connection_id:B,status:'scheduled'});
  const before=observed.length;dropFailedReply=true;
  const lost=await publishRow(row2);assert.equal(lost.skipped,'result-unconfirmed');assert.equal(observed.length-before,2);
  const [committed]=await fixture('GET','/publish_queue?id=eq.'+Q2);assert.equal(committed.status,'failed');
  const [draft]=await fixture('POST','/publish_queue',{id:Q3,user_id:U,platform:'youtube',connection_id:B,status:'draft'});
  const draftOutcome=await publishRow(draft);assert.match(draftOutcome.error,/لا يوجد ربط/);
  assert.equal((await fixture('GET','/publish_queue?id=eq.'+Q3))[0].status,'failed');
  assert(observed.some(s=>s.get('status')==='eq.draft'&&s.get('connection_id')==='eq.'+B));
  assert(observed.some(s=>s.get('platform')==='eq.youtube'&&s.get('connection_id')==='eq.'+A));
  assert(observed.some(s=>s.get('platform')==='eq.youtube'&&s.get('connection_id')==='is.null'));
  assert(observed.some(s=>s.get('platform')==='eq.youtube'&&s.get('connection_id')==='eq.'+B));
  console.log('PASS publish claim filters and actual PostgREST: stale platform/target rejected, matching target claimed; provider requests blocked');
 }finally{
  await fixture('DELETE','/publish_queue?id=eq.'+Q).catch(()=>{});
  await fixture('DELETE','/publish_queue?id=eq.'+Q2).catch(()=>{});
  await fixture('DELETE','/publish_queue?id=eq.'+Q3).catch(()=>{});
  await new Promise(r=>gateway.close(r));
 }
})().catch(e=>{console.error(e);if(process.env.GITHUB_ACTIONS==='true')console.error('::error title=Publish claim integration::'+String(e?.stack||e).slice(0,3000).replace(/%/g,'%25').replace(/\r/g,'%0D').replace(/\n/g,'%0A'));process.exitCode=1});
