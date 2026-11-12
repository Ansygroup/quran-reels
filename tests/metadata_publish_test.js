#!/usr/bin/env node
/* صفوف النشر الفعلية وطلب YouTube الكامل، مع شبكة محاكاة وتشفير حقيقي. */
const assert = require('node:assert/strict');
process.env.SUPABASE_URL='https://db.example'; process.env.SUPABASE_SERVICE_KEY='test'; process.env.TOKEN_ENC_KEY='metadata-test';
const {seal} = require('../lib/crypt');
const conns = ['c1','c2'].map((id,i) => ({ id, user_id:'u1', platform:'youtube', access_token:seal('token'+i), refresh_token:seal('refresh'), expires_at:Date.now()+3600000 }));
const rows=[]; const uploads=[];
function json(data) { return {ok:true,status:200,headers:{get:()=> 'application/json'},json:async()=>data,text:async()=>''}; }
global.fetch = async (url,opts={}) => {
 const u=new URL(url), method=opts.method||'GET';
 if(u.hostname==='db.example') {
  if(u.pathname==='/rest/v1/autopilot_runs' && method==='PATCH') return json([]);
  if(u.pathname==='/rest/v1/publish_queue' && method==='POST') { rows.push(...JSON.parse(opts.body)); return json(rows.map(r=>({...r}))); }
  if(u.pathname==='/rest/v1/publish_queue' && method==='PATCH') {
    const id=(u.searchParams.get('id')||'').slice(3), r=rows.find(x=>x.id===id), expected=u.searchParams.get('status');
    if(!r || (expected && expected!==`eq.${r.status}`)) return json([]);
    Object.assign(r,JSON.parse(opts.body)); return json([{...r}]);
  }
  if(u.pathname==='/rest/v1/social_connections') return json(conns);
  if(u.pathname.startsWith('/storage/')) return method==='HEAD' ? {ok:true,headers:{get:()=> '4'}} : {ok:true,arrayBuffer:async()=>new Uint8Array([1,2,3,4]).buffer};
 }
 if(u.hostname==='www.googleapis.com') {
   const snippet=JSON.parse(opts.body).snippet; uploads.push({ auth:opts.headers.Authorization, snippet });
   return {ok:true,headers:{get:()=>`https://upload.example/${uploads.length}`}};
 }
 if(u.hostname==='upload.example') return json({id:'video'+u.pathname.slice(1)});
 throw Error(`unexpected ${method} ${url}`);
};
(async()=>{
 const {__test:T}=require('../lib/autopilot'), {publishRow}=require('../lib/publish');
 const queued=await T.queueTargets('r1','u1','u1/autopilot/2026-11-12-run1.mp4','video.mp4', [{platform:'youtube',connection_id:'c1'},{platform:'youtube',connection_id:'c2'}], {s:111,from:1,to:5}, {name:'ماهر المعيقلي'});
 const results=await Promise.all(queued.map(x=>publishRow(x.row))); assert(results.every(r=>r.ok)); assert.equal(uploads.length,2);
 for(const u of uploads){
  assert.equal(u.snippet.title,'سورة المسد | تلاوة ماهر المعيقلي');
  assert.match(u.snippet.description,/تلاوة من سورة المسد/); assert.match(u.snippet.description,/ماهر المعيقلي/);
  assert.equal((u.snippet.description.match(/#القرآن_الكريم/g)||[]).length,1);
  assert.equal((u.snippet.description.match(/#سورة_المسد/g)||[]).length,1);
  assert.equal((u.snippet.description.match(/#Shorts/g)||[]).length,1);
  assert(u.snippet.tags.includes('سورة_المسد')); assert(!u.snippet.description.includes('الآيات 1-5'));
 }
 assert.deepEqual(uploads.map(u=>u.auth).sort(), ['Bearer token0','Bearer token1']);
 console.log('ALL OK: قناتان وصفّان وطلبا يوتيوب بوصف واحد ووسوم سليمة (شبكة محاكاة)');
})().catch(e=>{console.error(e);process.exitCode=1});
