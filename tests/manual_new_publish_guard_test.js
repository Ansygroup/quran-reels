/* Real manual endpoint + cron handler with mocked DB, session and publisher. */
'use strict';
const assert=require('node:assert/strict'),{Readable}=require('node:stream');
process.env.CRON_SECRET='fixture';
let rows=[],calls=[],lookups=[],mode='ok',dispatches=[],channel={id:'c1',platform:'youtube'};
function stub(rel,exports){const id=require.resolve(rel);require.cache[id]={id,filename:id,loaded:true,exports}}
stub('../lib/sess',{getUserId:async()=> 'u1'});
stub('../lib/db',{
 q1:async(sql,args)=>{assert.match(sql,/social_connections/);lookups.push({sql,args});if(mode==='lookup-error')throw Error('fixture unavailable');return channel},
 rest:async(path,opts,options)=>{
  assert.equal(path,'/rest/v1/publish_queue');assert.equal(opts.method,'POST');assert.equal(opts.headers.Prefer,'return=representation');assert.equal(options.requireRepresentation,true);
  const body=JSON.parse(opts.body);calls.push(body);rows.push({...body});
  if(mode==='lost')throw Error('connection lost after commit');
  if(mode==='empty')return [];
  if(mode==='no-content')return null;
  if(mode.startsWith('alter:')){const field=mode.slice(6),row={...body};if(field==='missing')delete row.connection_id;else row[field]='different';return [row]}
  return [{...body}];
 },
 q:async(sql)=>{assert.match(sql,/status='scheduled'/);return rows.filter(r=>r.status==='scheduled'&&Date.parse(r.publish_at)<=Date.now())}
});
stub('../lib/publish',{publishRow:async row=>{dispatches.push({...row});if(mode==='publisher-throws')throw Error('lost claim or provider');return {ok:true,url:'https://example.test/video'}}});
stub('../lib/autopilot',{runDailyAutopilots:async()=>[],reclaimStalePublishing:async()=>0});
const endpoint=require('../api/_publish'),cron=require('../api/cron/publish');
const reset=()=>{rows=[];calls=[];lookups=[];dispatches=[];mode='ok';channel={id:'c1',platform:'youtube'}};
async function call(extra={}){const req=Readable.from([JSON.stringify({platform:'youtube',video_path:'/u1/video.mp4',...extra})]);req.method='POST';req.headers={};const res={setHeader(){},end(s){this.body=JSON.parse(s)}};await endpoint(req,res);return res}
async function runCron(){const res={setHeader(){},end(s){this.body=JSON.parse(s)}};await cron({headers:{authorization:'Bearer fixture'}},res);return res.body}
(async()=>{
 reset();let result=await call({now:true,connection_id:'c1',title:'عنوان',hashtags:'#قرآن'});assert.equal(result.statusCode,200);assert.equal(calls.length,1);assert.equal(rows[0].status,'draft');assert.equal(dispatches.length,1);assert.equal(dispatches[0].connection_id,'c1');assert.equal(dispatches[0].video_path,'u1/video.mp4');
 for(const m of ['lost','empty','no-content',...['id','user_id','platform','video_path','video_name','title','caption','hashtags','status','connection_id','publish_at','missing'].map(f=>'alter:'+f)]){
  reset();mode=m;result=await call({now:true});assert.equal(result.statusCode,503,m);assert.equal(result.body.skipped,'queue-unconfirmed');assert.match(result.body.error,/راجع قائمة النشر والمنصة/);assert.equal(calls.length,1);assert.equal(rows[0].status,'draft');assert.equal(dispatches.length,0);assert.equal((await runCron()).ran,0);assert.equal(dispatches.length,0);
 }
 reset();mode='publisher-throws';result=await call({now:true});assert.equal(result.statusCode,503);assert.equal(result.body.skipped,'publish-unconfirmed');assert.match(result.body.error,/قد يكون الفيديو وصل/);assert.equal(dispatches.length,1);
 reset();result=await call({publish_at:new Date(Date.now()+86400000).toISOString()});assert.equal(result.statusCode,200);assert.equal(result.body.queued,true);assert.equal(rows[0].status,'scheduled');assert.equal(dispatches.length,0);
 reset();mode='lost';result=await call({publish_at:new Date(Date.now()+86400000).toISOString()});assert.equal(result.statusCode,503);assert.match(result.body.error,/قد تكون المهمة مجدولة وستُنشر/);assert.equal(calls.length,1);assert.equal(rows[0].status,'scheduled');assert.equal(dispatches.length,0);
 reset();channel=null;result=await call({now:true,connection_id:'c1'});assert.equal(result.statusCode,400);assert.equal(calls.length,0);assert.deepEqual(lookups[0].args,['c1','u1']);
 reset();channel={id:'different',platform:'youtube'};result=await call({now:true,connection_id:'c1'});assert.equal(result.statusCode,400);assert.equal(calls.length,0);
 reset();channel={id:'c1',platform:'x'};result=await call({platform:'youtube',now:true,connection_id:'c1'});assert.equal(result.statusCode,400);assert.equal(calls.length,0);assert.equal(dispatches.length,0);
 reset();channel={id:'c1',platform:'youtube'};result=await call({platform:'youtube',now:true,connection_id:'c1'});assert.equal(result.statusCode,200);assert.equal(calls[0].connection_id,'c1');assert.equal(dispatches[0].platform,'youtube');
 reset();mode='lookup-error';result=await call({now:true,connection_id:'c1'});assert.equal(result.statusCode,503);assert.match(result.body.error,/لم تُنشأ المهمة/);assert.equal(calls.length,0);
 console.log('PASS manual immediate drafts, unconfirmed responses and preserved future scheduling (mock DB and publisher; no provider)');
})().catch(e=>{console.error(e);process.exitCode=1});
