/* Synthetic file + real local media tools; REST, Storage and Telegram are mocked. */
const assert=require('node:assert/strict');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {spawnSync}=require('node:child_process');
const {makeStorageReader}=require('../lib/telegram_media_candidate');
const {makeVideoValidator}=require('../lib/telegram_video_validation_candidate');
const {createTelegramDelivery}=require('../lib/telegram_delivery_candidate');
const {sendVideo}=require('../lib/telegram_candidate');
const {seal,open}=require('../lib/crypt');
const ffmpeg=process.env.FFMPEG_BIN,ffprobe=process.env.FFPROBE_BIN;
if(!ffmpeg||!ffprobe){console.error('FFMPEG_BIN and FFPROBE_BIN required');process.exit(1)}
process.env.TOKEN_ENC_KEY='fixture-only';
const uid='11111111-1111-4111-8111-111111111111',conn='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',delivery='dddddddd-dddd-4ddd-8ddd-dddddddddddd',token='123456789:abcdefghijklmnopqrstuvwxyzABC123456';
(async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'qr-tg-e2e-'));
 try{
  const file=path.join(dir,'valid.mp4');
  const made=spawnSync(ffmpeg,['-hide_banner','-v','error','-f','lavfi','-i','color=blue:s=160x240:r=10:d=2','-f','lavfi','-i','sine=frequency=440:duration=2','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac','-shortest','-movflags','+faststart','-y',file],{encoding:'utf8',timeout:30000});assert.equal(made.status,0,made.stderr);
  const valid=await fs.readFile(file), records=new Map(); let sends=0;
  const database=async (p,o={})=>{
    if(p.includes('telegram_prepare_candidate')){const v=JSON.parse(o.body);let row=records.get(v.p_video_path);if(!row){row={id:delivery,state:'ready',path:v.p_video_path};records.set(v.p_video_path,row)}return [{id:row.id,state:row.state}]}
    if(p.includes('telegram_claim_candidate')){const row=[...records.values()].find(r=>r.id===JSON.parse(o.body).p_id&&r.state==='ready');if(!row)return [];row.state='sending';return [{id:row.id,connection_id:conn,destination_id:'-10012345',video_path:row.path}]}
    if(p.includes('telegram_finish_candidate')){const b=JSON.parse(o.body),row=[...records.values()].find(r=>r.id===b.p_id&&r.state==='sending');if(!row)return [];row.state=b.p_state;return [{id:row.id,state:row.state}]}
    assert(p.startsWith('/rest/v1/social_connections?'));return [{account_id:'-10012345',access_token:seal(token)}];
  };
  const readVideo=makeStorageReader({supabaseUrl:'https://fixture.example',serviceKey:'fixture-service',fetchImpl:async url=>new Response(url.includes('bad.mp4')?valid.subarray(0,Math.floor(valid.length*0.7)):valid)});
  const validateVideo=makeVideoValidator({ffmpeg,ffprobe});
  const worker=createTelegramDelivery({database,decrypt:open,readVideo,validateVideo,sendVideo:args=>sendVideo({...args,fetchImpl:async(url,req)=>{sends++;assert(url.endsWith('/sendVideo'));assert.equal(req.body.get('chat_id'),'-10012345');return {ok:true,status:200,json:async()=>({ok:true,result:{message_id:1,chat:{id:-10012345}}})}}})});
  const good={userId:uid,connectionId:conn,videoPath:`${uid}/good.mp4`};
  assert.equal((await worker(good)).status,'sent');assert.equal(sends,1);assert.equal((await worker(good)).status,'review_required');assert.equal(sends,1);
  const bad={...good,videoPath:`${uid}/bad.mp4`};assert.equal((await worker(bad)).status,'rejected');assert.equal(sends,1,'truncated video must never be sent');
  console.log('ALL OK: candidate media retrieval, real synthetic decode and mock Telegram send; invalid video rejected');
 }finally{await fs.rm(dir,{recursive:true,force:true})}
})().catch(e=>{console.error(e);process.exitCode=1});
