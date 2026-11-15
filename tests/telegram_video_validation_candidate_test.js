/* Optional local integration using explicit trusted FFmpeg executables.
 * Generates synthetic video and sine tone; no user's media or network.
 */
const assert=require('node:assert/strict');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {spawnSync}=require('node:child_process');
const {makeVideoValidator}=require('../lib/telegram_video_validation_candidate');
const ffmpeg=process.env.FFMPEG_BIN,ffprobe=process.env.FFPROBE_BIN;
if(!ffmpeg||!ffprobe){console.error('FFMPEG_BIN and FFPROBE_BIN required');process.exit(1)}
(async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'qr-media-test-'));
 try{
  const valid=path.join(dir,'valid.mp4'),silent=path.join(dir,'silent.mp4');
  const common=['-hide_banner','-v','error','-f','lavfi','-i','color=c=blue:s=160x240:r=10:d=2'];
  const make=(args)=>{const r=spawnSync(ffmpeg,args,{timeout:30000,encoding:'utf8'});assert.equal(r.status,0,r.stderr)};
  make([...common,'-f','lavfi','-i','sine=frequency=440:sample_rate=44100:duration=2','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac','-shortest','-movflags','+faststart','-y',valid]);
  make([...common,'-c:v','libx264','-pix_fmt','yuv420p','-movflags','+faststart','-y',silent]);
  const check=makeVideoValidator({ffmpeg,ffprobe});const data=await fs.readFile(valid);
  const metadata=await check(data);assert.equal(metadata.width,160);assert.equal(metadata.height,240);assert(metadata.duration>1);
  await assert.rejects(check(await fs.readFile(silent)),/invalid video/);
  await assert.rejects(check(data.subarray(0,Math.floor(data.length*0.7))),/validation failed/);
  await assert.rejects(check(Buffer.from('invalid data')),/invalid video/);
  assert.throws(()=>makeVideoValidator({ffmpeg:'relative',ffprobe}),/configured/);
  console.log('ALL OK: candidate full MP4 decode, valid audio/video and corrupt/silent-container rejection (synthetic only)');
 }finally{await fs.rm(dir,{recursive:true,force:true})}
})().catch(e=>{console.error(e);process.exitCode=1});
