/* Owner-scoped, bounded review data; no real database or publishing. */
const assert=require('node:assert/strict');
const db=require.resolve('../lib/db');let rows=[], query='';
require.cache[db]={id:db,filename:db,loaded:true,exports:{q:async()=>[],q1:async()=>null,rest:async(p)=>{query=p;if(rows instanceof Error)throw rows;return rows}}};
const {failedQueueReview,pendingQueueReview}=require('../api/autopilot').__test;
const uid='u1',channel={id:'c1',user_id:uid,platform:'youtube',account_name:'قناتي'},item={id:'q1',user_id:uid,platform:'youtube',connection_id:'c1',status:'failed',title:'عنوان',video_name:'reel.mp4',created_at:'2026-11-07T00:00:00Z',error:'secret',video_path:'secret-path',access_token:'secret-token'};
(async()=>{
 rows=[item];let out=await failedQueueReview(uid,[channel]);assert(out.available);assert.equal(out.items[0].channel,'قناتي');assert.equal(out.items[0].target_recorded,true);assert(!JSON.stringify(out).includes('secret'));assert.match(query,/user_id=eq\.u1/);assert.match(query,/status=eq\.failed/);assert.match(query,/limit=21/);
 rows=[{...item,connection_id:null}];out=await failedQueueReview(uid,[channel]);assert.equal(out.items[0].channel,null);assert.equal(out.items[0].target_recorded,false);
 rows=[item];out=await failedQueueReview(uid,[{...channel,user_id:'u2'}]);assert.equal(out.items[0].channel,null);assert.equal(out.items[0].target_recorded,true);
 rows=[item];out=await failedQueueReview(uid,[null,channel]);assert.equal(out.items[0].channel,'قناتي');
 for (const field of ['connection_id','id','platform']) { const malformed={...item};delete malformed[field];rows=[malformed];assert.equal((await failedQueueReview(uid,[channel])).available,false,`missing ${field}`); }
 for (const value of ['',0,{},undefined]) { rows=[{...item,connection_id:value}];assert.equal((await failedQueueReview(uid,[channel])).available,false,`invalid connection_id`); }
 rows=Array.from({length:21},(_,i)=>({...item,id:'q'+i}));out=await failedQueueReview(uid,[channel]);assert.equal(out.items.length,20);assert.equal(out.truncated,true);
 rows=[{...item,user_id:'u2'}];out=await failedQueueReview(uid,[channel]);assert.equal(out.available,false);assert.equal(out.items.length,0);
 rows=[{...item,status:'published'}];assert.equal((await failedQueueReview(uid,[channel])).available,false);
 rows=new Error('unavailable');assert.equal((await failedQueueReview(uid,[])).available,false);
 rows=[];out=await failedQueueReview(uid,[]);assert.equal(out.available,true);assert.deepEqual(out.items,[]);
 const pending={...item,status:'scheduled',publish_at:'2026-11-08T04:15:00Z'};
 rows=[pending,{...pending,id:'q2',status:'publishing',connection_id:null},{...pending,id:'q3',status:'draft',connection_id:'missing'}];
 out=await pendingQueueReview(uid,[channel]);assert(out.available);assert.equal(out.items.length,3);assert.equal(out.items[0].channel,'قناتي');assert.equal(out.items[1].target_recorded,false);assert.equal(out.items[2].target_recorded,true);assert.equal(out.items[2].channel,null);assert(!JSON.stringify(out).includes('secret'));assert.match(query,/user_id=eq\.u1/);assert.match(query,/status=in\.\(scheduled,publishing,draft\)/);assert.match(query,/limit=21/);
 rows=Array.from({length:21},(_,i)=>({...pending,id:'p'+i}));out=await pendingQueueReview(uid,[channel]);assert.equal(out.items.length,20);assert.equal(out.truncated,true);
 rows=[{...pending,user_id:'u2'}];assert.equal((await pendingQueueReview(uid,[channel])).available,false);
 rows=[{...pending,status:'published'}];assert.equal((await pendingQueueReview(uid,[channel])).available,false);
 for (const field of ['connection_id','id','platform']) { const malformed={...pending};delete malformed[field];rows=[malformed];assert.equal((await pendingQueueReview(uid,[channel])).available,false,`missing ${field}`); }
 for (const value of ['',0,{},undefined]) { rows=[{...pending,connection_id:value}];assert.equal((await pendingQueueReview(uid,[channel])).available,false); }
 rows=[pending];out=await pendingQueueReview(uid,[null,channel]);assert.equal(out.items[0].channel,'قناتي');
 rows=new Error('unavailable');assert.equal((await pendingQueueReview(uid,[])).available,false);
 rows=[];out=await pendingQueueReview(uid,[]);assert.equal(out.available,true);assert.deepEqual(out.items,[]);
 console.log('ALL OK: owner-scoped pending and failed queue reviews, unknown targets, bounded output and safe failure (mock database)');
})().catch(e=>{console.error(e);process.exitCode=1});
