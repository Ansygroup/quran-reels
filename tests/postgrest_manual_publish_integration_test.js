/* Actual manual endpoint and cron query via disposable PostgREST; provider stubbed. */
'use strict';
const assert=require('node:assert/strict'),crypto=require('node:crypto'),http=require('node:http'),{Readable}=require('node:stream');
const UPSTREAM='http://127.0.0.1:3101',SECRET='LOCAL-ONLY-postgrest-fixture-secret-0123456789-abcdef',U='44444444-4444-4444-8444-444444444444';
const b64=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
const payload=b64({alg:'HS256',typ:'JWT'})+'.'+b64({role:'service_role',sub:U,exp:Math.floor(Date.now()/1000)+3600});
const jwt=payload+'.'+crypto.createHmac('sha256',SECRET).update(payload).digest('base64url');
let mode='ok',posts=0,dispatched=[];
const gateway=http.createServer(async(req,res)=>{
 try{
  const u=new URL(req.url,'http://127.0.0.1');
  if(u.pathname!=='/rest/v1/publish_queue'||!['GET','POST'].includes(req.method))return res.writeHead(403).end();
  if(req.method==='POST')posts++;
  const chunks=[];for await(const c of req)chunks.push(c);
  const r=await fetch(UPSTREAM+'/publish_queue'+u.search,{method:req.method,headers:{authorization:req.headers.authorization||'',prefer:req.headers.prefer||'','content-type':'application/json'},...(req.method==='POST'?{body:Buffer.concat(chunks)}:{}),signal:AbortSignal.timeout(10000)});
  let bytes=Buffer.from(await r.arrayBuffer());
  if(req.method==='POST'&&mode==='lost'){req.socket.destroy();return}
  if(req.method==='POST'&&mode==='tamper'){const data=JSON.parse(bytes.toString());data[0].platform='tiktok';bytes=Buffer.from(JSON.stringify(data))}
  res.writeHead(r.status,{'content-type':r.headers.get('content-type')||'application/json'}).end(bytes);
 }catch{if(!res.headersSent)res.writeHead(502).end()}
});
function stub(rel,exports){const id=require.resolve(rel);require.cache[id]={id,filename:id,loaded:true,exports}}
(async()=>{
 await new Promise(r=>gateway.listen(0,'127.0.0.1',r));
 async function fixture(method,path){const r=await fetch(UPSTREAM+path,{method,headers:{authorization:'Bearer '+jwt,'content-type':'application/json',prefer:'return=representation'}});const data=await r.json();assert(r.ok,JSON.stringify(data));return data}
 const paths=['fixture/manual-ok.mp4','fixture/manual-lost.mp4','fixture/manual-tamper.mp4','fixture/schedule-lost.mp4'];
 try{
  process.env.SUPABASE_URL='http://127.0.0.1:'+gateway.address().port;process.env.SUPABASE_SERVICE_KEY=jwt;process.env.CRON_SECRET='fixture';
  stub('../lib/sess',{getUserId:async()=>U});stub('../lib/publish',{publishRow:async row=>{dispatched.push(row);return {ok:true,url:'https://example.test'}}});stub('../lib/autopilot',{runDailyAutopilots:async()=>[],reclaimStalePublishing:async()=>0});
  const endpoint=require('../api/_publish'),cron=require('../api/cron/publish');
  async function call(body){const req=Readable.from([JSON.stringify(body)]);req.method='POST';req.headers={};const res={setHeader(){},end(s){this.body=JSON.parse(s)}};await endpoint(req,res);return res}
  async function runCron(){const res={setHeader(){},end(s){this.body=JSON.parse(s)}};await cron({headers:{authorization:'Bearer fixture'}},res);return res.body}
  for(let i=0;i<paths.length;i++){
   mode=['ok','lost','tamper','lost'][i];let before=posts;
   const result=await call({platform:'youtube',video_path:paths[i],...(i===3?{publish_at:new Date(Date.now()+86400000).toISOString()}:{now:true}),title:'عنوان',hashtags:'#قرآن'});
   assert.equal(posts,before+1);assert.equal(result.statusCode,i===0?200:503);assert.equal(dispatched.length,1);
   const rows=await fixture('GET','/publish_queue?video_path=eq.'+encodeURIComponent(paths[i])+'&select=id,status,platform');
   assert.equal(rows.length,1);assert.equal(rows[0].platform,'youtube');assert.equal(rows[0].status,i===3?'scheduled':'draft');
   if(i===3)assert.match(result.body.error,/قد تكون المهمة مجدولة وستُنشر/);
  }
  const cronResult=await runCron();assert.equal(cronResult.ran,0);assert.equal(dispatched.length,1);
  console.log('PASS manual API with disposable PostgREST: draft commit/lost reply ignored by real cron query; future lost schedule persists (provider blocked)');
 }finally{
  for(const path of paths)await fixture('DELETE','/publish_queue?video_path=eq.'+encodeURIComponent(path)).catch(()=>{});
  await new Promise(r=>gateway.close(r));
 }
})().catch(e=>{console.error(e);if(process.env.GITHUB_ACTIONS==='true')console.error('::error title=Manual publish integration::'+String(e?.stack||e).slice(0,3000).replace(/%/g,'%25').replace(/\r/g,'%0D').replace(/\n/g,'%0A'));process.exitCode=1});
