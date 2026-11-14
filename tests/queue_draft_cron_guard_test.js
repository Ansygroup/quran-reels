/* Actual queueTargets and cron handler, with fake PostgREST and publisher. */
'use strict';
const assert=require('node:assert/strict');
process.env.SUPABASE_URL='https://fixture.invalid';process.env.SUPABASE_SERVICE_KEY='fixture';process.env.CRON_SECRET='fixture-cron';
let rows=[],run,mode,dispatches=[];
const fakePublish=require.resolve('../lib/publish');
require.cache[fakePublish]={id:fakePublish,filename:fakePublish,loaded:true,exports:{publishRow:async r=>{dispatches.push({...r});return {ok:true,url:'https://example.test/video'}}}};
const respond=d=>({ok:true,status:200,headers:{get:()=> 'application/json'},json:async()=>d,text:async()=>''});
global.fetch=async(url,opts={})=>{
 const u=new URL(url);assert.equal(u.origin,'https://fixture.invalid');const body=JSON.parse(opts.body||'{}');
 if(u.pathname==='/rest/v1/autopilot_runs'&&opts.method==='PATCH'){Object.assign(run,body);return respond([{...run}])}
 if(u.pathname==='/rest/v1/publish_queue'&&opts.method==='POST'){
  rows.push(...body.map(r=>({...r})));
  if(mode==='lost')throw Error('lost after commit');
  if(mode==='tamper')return respond(body.map((r,i)=>i? r : {...r,connection_id:'wrong'}));
  return respond(body);
 }
 throw Error('unexpected fixture request');
};
const auto=require.resolve('../lib/autopilot');const T=require(auto).__test;
const initial=()=>{rows=[];dispatches=[];run={id:'run',user_id:'u',status:'rendering',external_url:null}};
const queue=()=>T.queueTargets('run','u','u/autopilot/test.mp4','test.mp4',[{platform:'youtube',connection_id:null}],{s:1,from:1,to:2},{name:'fixture'});
const db=require.resolve('../lib/db');
async function cron(){
 require.cache[db]={id:db,filename:db,loaded:true,exports:{q:async sql=>{assert.match(sql,/status='scheduled'/);return rows.filter(r=>r.status==='scheduled')}}};
 require.cache[auto]={id:auto,filename:auto,loaded:true,exports:{runDailyAutopilots:async()=>[],reclaimStalePublishing:async()=>0}};
 const handler=require('../api/cron/publish');const res={setHeader(){},end(v){this.body=JSON.parse(v)}};
 await handler({headers:{authorization:'Bearer fixture-cron'}},res);return res.body;
}
(async()=>{
 for(const m of ['lost','tamper']){initial();mode=m;await assert.rejects(queue,/راجع المسودات/);assert.equal(rows.length,1);assert.equal(rows[0].status,'draft');const out=await cron();assert.equal(out.ran,0);assert.equal(dispatches.length,0)}
 initial();mode='ok';const targets=await queue();assert.equal(targets[0].row.status,'draft');const outcome=await T.publishTargets(targets);assert.equal(outcome.failed,0);assert.equal(dispatches.length,1);assert.equal(dispatches[0].status,'draft');
 console.log('PASS uncertain batch remains draft and is ignored by cron; confirmed draft reaches direct publisher (mocked)');
})().catch(e=>{console.error(e);process.exitCode=1});
