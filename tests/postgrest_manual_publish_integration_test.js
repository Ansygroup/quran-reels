/* Actual manual endpoint and cron query via disposable PostgREST; provider stubbed. */
'use strict';
const assert=require('node:assert/strict'),crypto=require('node:crypto'),http=require('node:http'),{Readable}=require('node:stream');
const UPSTREAM='http://127.0.0.1:3101',SECRET='LOCAL-ONLY-postgrest-fixture-secret-0123456789-abcdef',U='44444444-4444-4444-8444-444444444444',OTHER='11111111-1111-4111-8111-111111111111';
const FB='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',IG='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',FOREIGN='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const b64=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
const payload=b64({alg:'HS256',typ:'JWT'})+'.'+b64({role:'service_role',sub:U,exp:Math.floor(Date.now()/1000)+3600});
const jwt=payload+'.'+crypto.createHmac('sha256',SECRET).update(payload).digest('base64url');
let mode='ok',posts=0,dispatched=[];
const gateway=http.createServer(async(req,res)=>{
 try{
  const u=new URL(req.url,'http://127.0.0.1');
  const queue=u.pathname==='/rest/v1/publish_queue'&&['GET','POST'].includes(req.method);
  const lookup=u.pathname==='/rest/v1/social_connections'&&req.method==='GET';
  if(!queue&&!lookup)return res.writeHead(403).end();
  if(req.method==='POST')posts++;
  const chunks=[];for await(const c of req)chunks.push(c);
  const r=await fetch(UPSTREAM+u.pathname.slice('/rest/v1'.length)+u.search,{method:req.method,headers:{authorization:req.headers.authorization||'',prefer:req.headers.prefer||'','content-type':'application/json'},...(req.method==='POST'?{body:Buffer.concat(chunks)}:{}),signal:AbortSignal.timeout(10000)});
  let bytes=Buffer.from(await r.arrayBuffer());
  if(req.method==='POST'&&mode==='lost'){req.socket.destroy();return}
  if(req.method==='POST'&&mode==='tamper'){const data=JSON.parse(bytes.toString());data[0].platform='tiktok';bytes=Buffer.from(JSON.stringify(data))}
  res.writeHead(r.status,{'content-type':r.headers.get('content-type')||'application/json'}).end(bytes);
 }catch{if(!res.headersSent)res.writeHead(502).end()}
});
function stub(rel,exports){const id=require.resolve(rel);require.cache[id]={id,filename:id,loaded:true,exports}}
(async()=>{
 await new Promise(r=>gateway.listen(0,'127.0.0.1',r));
 async function fixture(method,path,body){const r=await fetch(UPSTREAM+path,{method,headers:{authorization:'Bearer '+jwt,'content-type':'application/json',prefer:'return=representation'},...(body?{body:JSON.stringify(body)}:{})});const data=await r.json();assert(r.ok,JSON.stringify(data));return data}
 const paths=['manual-ok.mp4','manual-lost.mp4','manual-tamper.mp4','schedule-lost.mp4','manual-target.mp4'].map(name=>`${U}/${name}`);
 try{
  process.env.SUPABASE_URL='http://127.0.0.1:'+gateway.address().port;process.env.SUPABASE_SERVICE_KEY=jwt;process.env.CRON_SECRET='fixture';
  stub('../lib/sess',{getUserId:async()=>U});stub('../lib/publish',{publishRow:async row=>{dispatched.push(row);return {ok:true,url:'https://example.test'}}});stub('../lib/autopilot',{runDailyAutopilots:async()=>[],reclaimStalePublishing:async()=>0});
  const endpoint=require('../api/_publish'),cron=require('../api/cron/publish');
  async function call(body){const req=Readable.from([JSON.stringify(body)]);req.method='POST';req.headers={};const res={setHeader(){},end(s){this.body=JSON.parse(s)}};await endpoint(req,res);return res}
  async function runCron(){const res={setHeader(){},end(s){this.body=JSON.parse(s)}};await cron({headers:{authorization:'Bearer fixture'}},res);return res.body}
  for(let i=0;i<4;i++){
   mode=['ok','lost','tamper','lost'][i];let before=posts;
   const result=await call({platform:'youtube',video_path:paths[i],...(i===3?{publish_at:new Date(Date.now()+86400000).toISOString()}:{now:true}),title:'عنوان',hashtags:'#قرآن'});
   assert.equal(posts,before+1);assert.equal(result.statusCode,i===0?200:503);assert.equal(dispatched.length,1);
   const rows=await fixture('GET','/publish_queue?video_path=eq.'+encodeURIComponent(paths[i])+'&select=id,status,platform');
   assert.equal(rows.length,1);assert.equal(rows[0].platform,'youtube');assert.equal(rows[0].status,i===3?'scheduled':'draft');
   if(i===3)assert.match(result.body.error,/قد تكون المهمة مجدولة وستُنشر/);
  }
  mode='ok';
  const beforeBadPaths=posts;
  for(const video_path of [`${U}/../other.mp4`,`${U}/%2e%2e/other.mp4`,`${U}//other.mp4`,`${U}\\other.mp4`,`${OTHER}/video.mp4`,`${U}extra/video.mp4`]) {
   const rejected=await call({platform:'youtube',video_path,now:true});
   assert.equal(rejected.statusCode,400);assert.equal(posts,beforeBadPaths);assert.equal(dispatched.length,1);
  }
  for(const row of [{id:FB,user_id:U,platform:'x'},{id:IG,user_id:U,platform:'youtube'},{id:FOREIGN,user_id:OTHER,platform:'youtube'}])await fixture('POST','/social_connections',row);
  const request={platform:'youtube',video_path:paths[4],publish_at:new Date(Date.now()+86400000).toISOString()};
  const before=posts;
  assert.equal((await call({...request,connection_id:FB})).statusCode,400);
  assert.equal((await call({...request,connection_id:FOREIGN})).statusCode,400);
  assert.equal(posts,before);
  assert.equal((await call({...request,connection_id:IG.toUpperCase()})).statusCode,200);assert.equal(posts,before+1);
  const [target]=await fixture('GET','/publish_queue?video_path=eq.'+encodeURIComponent(paths[4])+'&select=connection_id,platform,status');
  assert.equal(target.connection_id,IG);assert.equal(target.platform,'youtube');assert.equal(target.status,'scheduled');
  const cronResult=await runCron();assert.equal(cronResult.ran,0);assert.equal(dispatched.length,1);
  console.log('PASS manual API with disposable PostgREST: lost draft and schedule replies; exact owned platform target; provider blocked');
 }finally{
  for(const path of paths)await fixture('DELETE','/publish_queue?video_path=eq.'+encodeURIComponent(path)).catch(()=>{});
  for(const id of [FB,IG,FOREIGN])await fixture('DELETE','/social_connections?id=eq.'+id).catch(()=>{});
  await new Promise(r=>gateway.close(r));
 }
})().catch(e=>{console.error(e);if(process.env.GITHUB_ACTIONS==='true')console.error('::error title=Manual publish integration::'+String(e?.stack||e).slice(0,3000).replace(/%/g,'%25').replace(/\r/g,'%0D').replace(/\n/g,'%0A'));process.exitCode=1});
