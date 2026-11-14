/* Publish engine + fake database and provider; no network or real videos. */
'use strict';
const assert=require('node:assert/strict');
process.env.SUPABASE_URL='https://fixture.invalid';
let status,mode,calls,privacy,uploads;
const db=require.resolve('../lib/db');
require.cache[db]={id:db,filename:db,loaded:true,exports:{
 q:async(sql,params)=>{
  if(/set status='publishing'/.test(sql)){status='publishing';return [{id:'job',user_id:'owner',platform:'tiktok',connection_id:null,status,video_path:'video.mp4'}]}
  if(/from social_connections/.test(sql))return [{id:'channel',user_id:'owner',platform:'tiktok',access_token:'fixture-token',expires_at:Date.now()+3600000}];
  if(/set status='published'/.test(sql)){status='published';return [{id:'job',user_id:'owner',status,external_url:params[1]}]}
  if(/set status='failed'/.test(sql)){status='failed';return [{id:'job',user_id:'owner',status}]}
  throw Error('unexpected database query');
 },q1:async()=>{throw Error('unexpected database query')}
}};
const crypt=require.resolve('../lib/crypt');
require.cache[crypt]={id:crypt,filename:crypt,loaded:true,exports:{open:x=>x,seal:x=>x}};
global.fetch=async(url,opts={})=>{
 const u=new URL(url);
 if(u.origin==='https://fixture.invalid')return {arrayBuffer:async()=>new Uint8Array([1,2,3,4]).buffer};
 if(u.origin==='https://open.tiktokapis.com'&&u.pathname==='/v2/post/publish/video/init/'){
  calls++;privacy.push(JSON.parse(opts.body).post_info.privacy_level);
  if(mode==='network')throw Error('simulated lost response');
  if(mode==='malformed')return {ok:true,json:async()=>{throw Error('invalid json')}};
  if(mode==='empty')return {ok:true,json:async()=>({data:{}})};
  if(mode==='null')return {ok:true,json:async()=>null};
  if(mode==='wrongtype')return {ok:true,json:async()=>({data:{upload_url:12}})};
  if(mode==='error-url')return {ok:false,json:async()=>({data:{upload_url:'https://upload.invalid/session'}})};
  if(mode==='rejection')return {ok:false,json:async()=>({error:{message:'sensitive-fixture'},data:{}})};
  return {ok:true,json:async()=>({data:{upload_url:'https://upload.invalid/session',publish_id:'fixture'}})};
 }
 if(u.origin==='https://upload.invalid'){uploads++;return {ok:mode!=='put-fail',status:mode==='put-fail'?500:200}}
 throw Error('unexpected network request');
};
const {publishRow}=require('../lib/publish');
async function run(testMode){mode=testMode;status='scheduled';calls=0;privacy=[];uploads=0;const out=await publishRow({id:'job',user_id:'owner',platform:'tiktok',connection_id:null,status:'scheduled',video_path:'video.mp4'});return out}
(async()=>{
 for(const testMode of ['network','malformed','empty','null','wrongtype','error-url','rejection']){
  const out=await run(testMode);assert.equal(out.ok,false,testMode);assert.equal(status,'failed',testMode);assert.equal(calls,1,testMode);assert.equal(uploads,0,testMode);assert.deepEqual(privacy,['SELF_ONLY_DISABLE']);assert.match(out.error,/راجع المنصة/);assert(!out.error.includes('sensitive-fixture'));
 }
 let out=await run('success');assert.equal(out.ok,true);assert.equal(status,'published');assert.equal(calls,1);assert.equal(uploads,1);assert.deepEqual(privacy,['SELF_ONLY_DISABLE']);
 out=await run('put-fail');assert.equal(out.ok,false);assert.equal(status,'failed');assert.equal(calls,1);assert.equal(uploads,1);
 console.log('PASS TikTok initialisation: no public fallback or upload on ambiguous/error reply; one simulated upload on success (mock only)');
})().catch(e=>{console.error(e);process.exitCode=1});
