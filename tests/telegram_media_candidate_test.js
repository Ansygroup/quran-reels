/* Bounded Storage retrieval; no network or real credentials. */
const assert=require('node:assert/strict');
const {makeStorageReader}=require('../lib/telegram_media_candidate');
const uid='11111111-1111-4111-8111-111111111111',key='fixture-only-secret',videoPath=`${uid}/autopilot/video.mp4`;
const bytes=Buffer.concat([Buffer.from([0,0,0,12]),Buffer.from('ftypisom')]);
const response=(chunks,{length,status=200}={})=>new Response(new ReadableStream({start(c){for(const x of chunks)c.enqueue(new Uint8Array(x));c.close()}}),{status,headers:length===undefined?{}:{'content-length':String(length)}});
(async()=>{
 let calls=0, captured;
 const reader=makeStorageReader({supabaseUrl:'https://fixture.example',serviceKey:key,maxBytes:20,fetchImpl:async(url,opts)=>{calls++;captured={url,opts};return response([bytes.slice(0,4),bytes.slice(4)],{length:bytes.length})}});
 assert.deepEqual(await reader({userId:uid,videoPath}),bytes);assert.equal(calls,1);
 assert.equal(captured.url,`https://fixture.example/storage/v1/object/authenticated/reels/${videoPath}`);assert(!captured.url.includes(key));assert.equal(captured.opts.headers.Authorization,'Bearer '+key);assert.equal(captured.opts.redirect,'error');assert(captured.opts.signal);
 for(const p of [`${uid}/../x`,`${uid}/./x`,`${uid}//x`,`${uid}/%2e%2e/x`,`${uid}/x?x=1`,`other/video.mp4`])await assert.rejects(reader({userId:uid,videoPath:p}),/path/);
 assert.equal(calls,1,'invalid paths must not fetch');
 await assert.rejects(async()=>makeStorageReader({supabaseUrl:'http://fixture.example',serviceKey:key}),/configuration/);
 await assert.rejects(async()=>makeStorageReader({supabaseUrl:'https://user:secret@fixture.example',serviceKey:key}),/configuration/);
 const test=(r)=>makeStorageReader({supabaseUrl:'https://fixture.example/',serviceKey:key,maxBytes:20,fetchImpl:async()=>r})({userId:uid,videoPath});
 await assert.rejects(test(response([bytes],{length:21})),/size/);
 await assert.rejects(test(response([Buffer.alloc(21)])),/complete/);
 await assert.rejects(test(response([bytes],{length:13})),/complete/);
 await assert.rejects(test(response([bytes],{status:404})),/read/);
 await assert.rejects(test(response([Buffer.alloc(2)])),/complete/);
 const network=makeStorageReader({supabaseUrl:'https://fixture.example',serviceKey:key,fetchImpl:async()=>{throw Error('network '+key)}});
 await assert.rejects(network({userId:uid,videoPath}),e=>!e.message.includes(key));
 console.log('ALL OK: candidate Storage reader scopes paths and bounds bytes (mock streams only)');
})().catch(e=>{console.error(e);process.exitCode=1});
