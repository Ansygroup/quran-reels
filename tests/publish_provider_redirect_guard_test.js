'use strict';
// Publisher and native fetch with two loopback servers only; all data and tokens are synthetic.
const assert=require('node:assert/strict'),http=require('node:http');
const nativeFetch=global.fetch;
process.env.SUPABASE_URL='https://storage.fixture';
process.env.GOOGLE_CLIENT_ID='fixture-client';process.env.GOOGLE_CLIENT_SECRET='fixture-client-secret';
let row,platform,stage,calls,forwarded,refreshWrites;
const db=require.resolve('../lib/db');
require.cache[db]={id:db,filename:db,loaded:true,exports:{q:async(sql,args)=>{
 if(/set status='publishing'/i.test(sql)){row.status='publishing';return [{...row}]}
 if(/from social_connections/i.test(sql))return [{id:'channel',user_id:'owner',platform,access_token:'fixture-token',refresh_token:'fixture-refresh',expires_at:stage==='refresh'?0:Date.now()+3600000}];
 if(/update social_connections/i.test(sql)){refreshWrites++;return []}
 if(/set status='failed'/i.test(sql)){row.status='failed';row.error=args[1];return [{...row}]}
 if(/set status='published'/i.test(sql)){row.status='published';row.external_url=args[1];return [{...row}]}
 throw Error('unexpected DB query');
},q1:async()=>null}};
const crypt=require.resolve('../lib/crypt');require.cache[crypt]={id:crypt,filename:crypt,loaded:true,exports:{open:x=>x,seal:x=>x}};
const listen=s=>new Promise(r=>s.listen(0,'127.0.0.1',r)),close=s=>new Promise(r=>s.close(r));
(async()=>{
 const dest=http.createServer(async(req,res)=>{const b=[];for await(const c of req)b.push(c);forwarded.push({headers:req.headers,body:Buffer.concat(b).toString()});res.writeHead(200,{'content-type':'application/json'}).end(JSON.stringify({access_token:'redirected',data:{id:'media_1',processing_info:{state:'succeeded'}}}))});
 await listen(dest);
 const source=http.createServer(async(req,res)=>{for await(const _ of req){} res.writeHead(307,{location:`http://127.0.0.1:${dest.address().port}/redirected`}).end()});
 await listen(source);
 try {
  const {publishRow}=require('../lib/publish');
  global.fetch=async(url,opts={})=>{
   const u=new URL(url),method=opts.method||'GET';
   let current=u.origin==='https://storage.fixture'?'storage':u.hostname==='oauth2.googleapis.com'?'refresh':u.hostname==='www.googleapis.com'?'yt_start':u.pathname==='/2/tweets'?'x_post':method==='POST'?'x_upload':'x_poll';
   calls.push(current);
   if(current===stage)return nativeFetch(`http://127.0.0.1:${source.address().port}/fixture`,opts);
   if(current==='storage')return {ok:true,status:200,arrayBuffer:async()=>new Uint8Array([1,2,3]).buffer};
   if(current==='x_upload')return {ok:true,json:async()=>({data:{id:'media_1',...(stage==='x_poll'?{processing_info:{state:'pending',check_after_secs:0}}:{})}})};
   if(current==='x_post')return {ok:true,json:async()=>({data:{id:'post_1'}})};
   throw Error('unexpected fixture request blocked');
  };
  for(const test of ['refresh','yt_start','x_upload','x_poll','x_post']){
   stage=test;platform=['refresh','yt_start'].includes(test)?'youtube':'x';calls=[];forwarded=[];refreshWrites=0;
   row={id:'job',user_id:'owner',platform,connection_id:null,status:'scheduled',video_path:'owner/fixture.mp4'};
   const result=await publishRow({...row});
   assert.equal(result.ok,false,test);assert.equal(row.status,'failed',test);assert.match(result.error,/راجع المنصة/,test);
   assert.deepEqual(forwarded,[],test+' must not send credentials or video to redirect target');
   assert.equal(calls.filter(x=>x===test).length,1,test+' must not be retried');assert.equal(refreshWrites,0);
   assert(!String(row.error).includes('fixture-token')&&!String(row.error).includes('fixture-refresh'));
   const n=calls.length;assert.equal((await publishRow({...row})).skipped,'review-required');assert.equal(calls.length,n);
  }
  console.log('PASS publisher refresh, YouTube start and X requests reject redirects (synthetic loopback only)');
 } finally {global.fetch=nativeFetch;await close(source);await close(dest)}
})().catch(e=>{console.error(e);process.exitCode=1});
