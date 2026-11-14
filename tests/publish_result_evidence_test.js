/* Real publishRow/db translator, synthetic provider and database only. */
'use strict';
const assert=require('node:assert/strict');
process.env.SUPABASE_URL='https://db.example';process.env.SUPABASE_SERVICE_KEY='fixture';process.env.TOKEN_ENC_KEY='fixture';
const {seal}=require('../lib/crypt');
const base={id:'job',user_id:'owner',platform:'youtube',connection_id:null,status:'scheduled',video_path:'owner/video.mp4'};
const conn={id:'channel',user_id:'owner',platform:'youtube',access_token:seal('token'),expires_at:Date.now()+3600000};
let row,mode,uploads,finals;
function json(data){return {ok:true,status:200,headers:{get:()=> 'application/json'},json:async()=>data,text:async()=>''}}
global.fetch=async(url,opts={})=>{
 const u=new URL(url),method=opts.method||'GET';
 if(u.origin==='https://db.example'&&u.pathname==='/rest/v1/publish_queue'&&method==='PATCH'){
  const body=JSON.parse(opts.body);
  if(body.status==='publishing'){assert.equal(u.searchParams.get('status'),'eq.scheduled');Object.assign(row,body);return json([{...row}])}
  finals.push({body,filters:u.searchParams});assert.equal(u.searchParams.get('id'),'eq.job');assert.equal(u.searchParams.get('user_id'),'eq.owner');assert.equal(u.searchParams.get('status'),'eq.publishing');
  if(row.status!=='publishing'||mode==='zero')return json([]);
  Object.assign(row,body);
  if(mode==='lost')throw Error('response lost after commit');
  if(mode==='malformed')return json([{...row,user_id:'other'}]);
  return json([{...row}]);
 }
 if(u.origin==='https://db.example'&&u.pathname==='/rest/v1/social_connections')return json([conn]);
 if(u.origin==='https://db.example'&&u.pathname.startsWith('/storage/'))return method==='HEAD'?{ok:true,headers:{get:()=> '4'}}:{ok:true,status:200,arrayBuffer:async()=>new Uint8Array([1,2,3,4]).buffer};
 if(u.origin==='https://www.googleapis.com'&&method==='POST')return {ok:true,headers:{get:()=> 'https://www.googleapis.com/upload/youtube/v3/videos?upload_id=fixture'}};
 if(u.origin==='https://www.googleapis.com'&&method==='PUT'){
  uploads++;if(mode==='provider-lost'||mode==='failed-lost'){if(mode==='failed-lost')mode='lost';throw Error('provider reply lost')}
  if(mode==='reclaimed')row.status='failed';
  return json({id:'video1'});
 }
 throw Error('unexpected network request');
};
const {publishRow}=require('../lib/publish');
async function run(m){mode=m;row={...base};uploads=0;finals=[];return publishRow({...row})}
(async()=>{
 let out=await run('normal');assert.equal(out.ok,true);assert.equal(row.status,'published');assert.equal(uploads,1);assert.equal(finals.length,1);
 for(const m of ['zero','lost','malformed','reclaimed']){
  out=await run(m);assert.equal(out.ok,false,m);assert.equal(out.skipped,'result-unconfirmed',m);assert.match(out.error,/ربما وصل الفيديو/);assert.equal(uploads,1);assert.equal(finals.length,1);assert.equal(finals[0].body.status,'published');
  if(m==='lost'||m==='malformed')assert.equal(row.status,'published');
  if(m==='reclaimed')assert.equal(row.status,'failed');
 }
 out=await run('provider-lost');assert.equal(out.ok,false);assert.match(out.error,/راجع المنصة/);assert.equal(row.status,'failed');assert.equal(uploads,1);assert.equal(finals.length,1);assert.equal(finals[0].body.status,'failed');
 out=await run('failed-lost');assert.equal(out.skipped,'result-unconfirmed');assert.equal(row.status,'failed');assert.equal(finals.length,1);
 console.log('PASS publish finalization: scoped state transition, no false success or second write after lost reply (mock provider/database)');
})().catch(e=>{console.error(e);process.exitCode=1});
