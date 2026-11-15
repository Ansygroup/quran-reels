/* Run marker/final status evidence, using real REST helper and synthetic DB. */
'use strict';
const assert=require('node:assert/strict');
process.env.SUPABASE_URL='https://fixture.invalid';process.env.SUPABASE_SERVICE_KEY='fixture-only';
let row,mode,calls=[];
const respond=data=>({ok:true,status:200,headers:{get:()=> 'application/json'},json:async()=>data,text:async()=>''});
global.fetch=async(url,opts={})=>{
 const u=new URL(url);assert.equal(u.origin,'https://fixture.invalid');assert.equal(u.pathname,'/rest/v1/autopilot_runs');assert.equal(opts.method,'PATCH');
 const body=JSON.parse(opts.body);calls.push({body,url:u});
 if(u.searchParams.get('id')!==`eq.${row.id}`||u.searchParams.get('user_id')!==`eq.${row.user_id}`||u.searchParams.get('status')!==`eq.${row.status}`||mode==='zero')return respond([]);
 assert.equal(opts.headers.Prefer,'return=representation');Object.assign(row,body);
 if(mode==='lost')throw Error('fixture committed then reply lost');
 if(mode==='wrong')return respond([{...row,user_id:'other'}]);
 if(mode==='url')return respond([{...row,external_url:'https://other.invalid/'}]);
 return respond([{...row}]);
};
const T=require('../lib/autopilot').__test;
const initial=()=>({id:'run',user_id:'owner',status:'queued',video_path:'owner/video.mp4',external_url:null});
(async()=>{
 row=initial();mode='ok';calls=[];
 const result=await T.transitionRun('owner','run','queued',{status:'published',external_url:'https://youtu.be/fixture'});
 assert.equal(result.status,'published');assert.equal(calls.length,1);
 for(const m of ['zero','lost','wrong','url']){
  row=initial();mode=m;calls=[];let err;
  try{await T.transitionRun('owner','run','queued',{status:'published',external_url:'https://youtu.be/fixture'})}catch(e){err=e}
  assert.equal(err?.code,'RUN_STATE_UNCONFIRMED',m);assert.equal(calls.length,1);
  const out=await T.handleRunFailure('owner',{id:'run'},err,true);assert.equal(out.ok,false);assert.equal(out.stage,'publish');assert.match(out.error,/راجع المهام والمنصة/);assert.equal(calls.length,1,'must not overwrite a possibly committed transition');
  if(m!=='zero')assert.equal(row.status,'published');
 }
 row=initial();mode='ok';calls=[];
 const failure=await T.transitionRun('owner','run','queued',{status:'failed',external_url:'',error:'fixture'});assert.equal(failure.status,'failed');assert.equal(calls.length,1);
 row=initial();row.user_id='other';calls=[];
 await assert.rejects(T.transitionRun('owner','run','queued',{status:'published',external_url:''}),e=>e.code==='RUN_STATE_UNCONFIRMED');assert.equal(row.status,'queued');
 let attempts=0;const retried=await T.runWithRetry(async()=>{attempts++;return {ok:false,stage:'publish'}},{budgetMs:100});assert.equal(retried.attempts,1);assert.equal(attempts,1);
 console.log('PASS run transition owner/state evidence and lost replies: no false success, overwrite or publishing retry (mock)');
})().catch(e=>{console.error(e);process.exitCode=1});
