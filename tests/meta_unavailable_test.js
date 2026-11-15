'use strict';
// Real entry points, including the publisher and cron, with fake DB/session and blocked network.
const assert=require('node:assert/strict'),{Readable}=require('node:stream');
process.env.CRON_SECRET='fixture';
let row,writes,reads,requests,loseFinal;
function stub(rel,exports){const id=require.resolve(rel);require.cache[id]={id,filename:id,loaded:true,exports};}
stub('../lib/sess',{getUserId:async()=> 'owner'});
stub('../lib/autopilot',{reclaimStalePublishing:async()=>0,runDailyAutopilots:async()=>[]});
stub('../lib/db',{
 q1:async(_sql,args)=>row&&args[0]===row.id&&args[1]===row.user_id?{...row}:null,
 rest:async()=>{throw Error('unexpected DB request')},
 q:async(sql,args)=>{
  if(/^\s*select.+from publish_queue/i.test(sql))return row&&row.status==='scheduled'?[{...row}]:[];
  if(/set status='publishing'/i.test(sql)){
   if(!row||row.id!==args[0]||row.user_id!==args[1]||row.status!==args[2]||row.platform!==args[3]||row.connection_id!==(args[4]||null))return [];
   row.status='publishing';writes.push('claim');return [{...row}];
  }
  if(/set status='failed'/i.test(sql)){row.status='failed';row.error=args[1];writes.push('failed');if(loseFinal)throw Error('lost response after commit');return [{...row}];}
  if(/social_connections/i.test(sql)){reads++;throw Error('must not read credentials')}
  throw Error('unexpected SQL');
 }
});
global.fetch=async()=>{requests++;throw Error('external network blocked')};
const {publishRow}=require('../lib/publish');const manual=require('../api/_publish'),cron=require('../api/cron/publish'),start=require('../api/_oauth_start'),callback=require('../api/oauth/callback');
const {canPublish,validatePlatforms,LIST}=require('../lib/platforms');
function response(){return {headers:{},setHeader(k,v){this.headers[k.toLowerCase()]=v},end(body){this.body=body?JSON.parse(body):undefined}}}
async function post(body){const req=Readable.from([JSON.stringify(body)]);Object.assign(req,{method:'POST',url:'/api/gw?op=publish',headers:{}});const r=response();await manual(req,r);return r}
function reset(platform,status='scheduled'){row={id:'job',user_id:'owner',platform,status,connection_id:null,video_path:'owner/test.mp4'};writes=[];reads=0;requests=0;loseFinal=false}
(async()=>{
 for(const [platform,name] of [['facebook','فيسبوك'],['instagram','إنستغرام']]){
  assert.equal(canPublish(platform),false);assert.equal(LIST.find(p=>p.key===platform).publish,false);assert.match(validatePlatforms(['youtube',platform]),new RegExp(name));
  for(const now of [true,false]){reset(platform);const r=await post({platform,video_path:'owner/test.mp4',now,publish_at:'2099-01-01T00:00:00Z'});assert.equal(r.statusCode,400);assert.match(r.body.error,/قريبًا/);assert.deepEqual(writes,[]);assert.equal(requests,0)}
  for(const entry of ['manual','cron','direct'])for(const status of entry==='cron'?['scheduled']:['scheduled','draft']){
   reset(platform,status);let result;
   if(entry==='manual')result=(await post({queue_id:'job'})).body;
   else if(entry==='cron'){const r=response();await cron({headers:{authorization:'Bearer fixture'}},r);assert.equal(r.body.fail,1);result={ok:false}}
   else result=await publishRow({...row});
   assert.equal(result.ok,false);assert.equal(row.status,'failed');assert.match(row.error,new RegExp(name+'.*قريبًا'));assert.deepEqual(writes,['claim','failed']);assert.equal(reads,0);assert.equal(requests,0);
   assert.equal((await publishRow({...row})).skipped,'review-required');assert.deepEqual(writes,['claim','failed']);
  }
  reset(platform);loseFinal=true;const uncertain=await post({queue_id:'job'});assert.equal(uncertain.body.skipped,'result-unconfirmed');assert.equal(row.status,'failed');assert.equal(reads,0);assert.equal(requests,0);
  reset(platform);const stale={...row};row.platform='youtube';const out=await publishRow(stale);assert.equal(out.skipped,'already-claimed');assert.deepEqual(writes,[]);
 }
 assert.match(validatePlatforms(['youtube','facebook','instagram','tiktok']),/فيسبوك.*إنستغرام.*تيك توك/);
 for(const alias of ['facebook','instagram','meta'])for(const method of ['GET','POST']){
  reset('facebook');const r=response();await start({method,url:'/api/gw?op=start&p='+alias,headers:{authorization:'Bearer fake'}},r);assert.equal(r.statusCode,403);assert.match(r.body.error,/قريبًا/);assert.equal(requests,0);assert.deepEqual(writes,[]);
 }
 reset('facebook');const cb=response();await callback({url:'/api/oauth/callback?code=fake&state=meta.fixture',headers:{}},cb);assert.equal(cb.statusCode,302);assert.match(cb.headers.location,/linked=meta_err&w=unavailable/);assert.equal(requests,0);assert.deepEqual(writes,[]);
 console.log('PASS Facebook/Instagram unavailable: OAuth aliases, new jobs, old manual and cron jobs blocked (mock only)');
})().catch(e=>{console.error(e);process.exitCode=1});
