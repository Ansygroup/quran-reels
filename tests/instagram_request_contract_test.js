'use strict';
// Actual publisher + fake DB/Meta. Never sends a network request or real video.
const assert=require('node:assert/strict');
process.env.SUPABASE_URL='https://storage.fixture';
let row,mode,requests,writes,igId='ig123';
function stub(rel,exports){const id=require.resolve(rel);require.cache[id]={id,filename:id,loaded:true,exports};}
stub('../lib/crypt',{open:x=>x,seal:x=>x});
stub('../lib/db',{q1:async()=>null,q:async(sql,args)=>{
 if(/set status='publishing'/i.test(sql)){row.status='publishing';writes.push('claim');return [{...row}];}
 if(/from social_connections/i.test(sql))return [{id:'channel',user_id:'owner',platform:'instagram',access_token:'fixture-token',expires_at:Date.now()+3600000,meta:JSON.stringify({ig_id:igId})}];
 if(/set status='failed'/i.test(sql)){row.status='failed';row.error=args[1];writes.push('failed');return [{...row}];}
 if(/set status='published'/i.test(sql)){row.status='published';row.external_url=args[1];writes.push('published');return [{...row}];}
 throw Error('unexpected query');
}});
const json=data=>({ok:true,status:200,json:async()=>data});
global.fetch=async(url,opts={})=>{
 const u=new URL(url);requests.push({url:u,opts});assert.equal(u.origin,'https://graph.facebook.com');assert.equal(opts.redirect,'error');
 assert.equal(opts.headers.Authorization,'Bearer fixture-token');
 if(u.pathname==='/v21.0/ig123/media'){
  assert.equal(opts.method,'POST','Instagram container creation must be POST');
  assert.equal(u.searchParams.get('media_type'),'REELS');assert.equal(u.searchParams.get('share_to_feed'),'true');
  assert.equal(u.searchParams.get('video_url'),'https://storage.fixture/storage/v1/object/public/reels/owner/video.mp4');
  assert.equal(u.searchParams.get('caption'),'وصف تجريبي\n#fixture');
  if(mode==='lost-create')throw Error('lost response with sensitive-fixture');
  return json({id:'container_1'});
 }
 if(u.pathname==='/v21.0/container_1'){
  assert.equal(opts.method||'GET','GET');assert.equal(u.searchParams.get('fields'),'status_code');
  return json({status_code:'FINISHED'});
 }
 if(u.pathname==='/v21.0/ig123/media_publish'){
  assert.equal(opts.method,'POST');assert.equal(u.searchParams.get('creation_id'),'container_1');
  if(mode==='lost-publish')throw Error('lost response with sensitive-fixture');
  return json({id:'published_1'});
 }
 throw Error('unexpected Meta request');
};
// Fixture-only policy override to exercise retained, disabled Meta implementations.
// No production path uses this override; all network here is mocked.
const platformFixture = require("../lib/platforms");
const actualCanPublish = platformFixture.canPublish;
platformFixture.canPublish = p => ["facebook", "instagram"].includes(p) || actualCanPublish(p);
const {publishRow}=require('../lib/publish');
const realTimer=global.setTimeout;global.setTimeout=fn=>{fn();return 0};
async function run(m){mode=m;requests=[];writes=[];row={id:'job',user_id:'owner',platform:'instagram',connection_id:null,status:'scheduled',video_path:'owner/video.mp4',caption:'وصف تجريبي',hashtags:'#fixture'};const out=await publishRow({...row});return {out,saved:{...row},requests:[...requests],writes:[...writes]};}
(async()=>{
 let r=await run('success');assert.equal(r.out.ok,true);assert.equal(r.saved.status,'published');assert.deepEqual(r.requests.map(x=>x.url.pathname),['/v21.0/ig123/media','/v21.0/container_1','/v21.0/ig123/media_publish']);
 for(const m of ['lost-create','lost-publish']){
  r=await run(m);assert.equal(r.out.ok,false);assert.equal(r.saved.status,'failed');assert.match(r.saved.error,/راجع المنصة/);assert(!r.saved.error.includes('sensitive-fixture'));assert.deepEqual(r.writes,['claim','failed']);
  assert.equal(r.requests.filter(x=>x.url.pathname.endsWith('/media')).length,1);
  assert.equal(r.requests.filter(x=>x.url.pathname.endsWith('/media_publish')).length,m==='lost-publish'?1:0);
  const count=requests.length;assert.equal((await publishRow({...r.saved})).skipped,'review-required');assert.equal(requests.length,count);
 }
 for(const invalid of ['',null,{},123,'ig/path','ig?caption=evil','ig#fragment','x'.repeat(257)]){
  igId=invalid;r=await run('success');assert.equal(r.out.ok,false);assert.equal(r.saved.status,'failed');assert.match(r.saved.error,/معرّف حساب إنستغرام غير صالح/);assert.equal(r.requests.length,0);
 }
 console.log('PASS Instagram create POST, status GET, publish POST, account ID guard and no retries (mock only)');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>{global.setTimeout=realTimer});
