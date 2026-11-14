/* Candidate media validation; NOT wired into production or Vercel builds.
 * Caller must provide trusted, maintained ffmpeg/ffprobe executables running in
 * a sandbox suitable for untrusted media. Checks decoding, not Quran content.
 */
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {spawn}=require('node:child_process');
const {MAX_VIDEO_BYTES}=require('./telegram_candidate');
function run(exe,args,timeoutMs) {
  return new Promise((resolve,reject)=>{
    const child=spawn(exe,args,{stdio:['ignore','pipe','ignore'],env:{PATH:'/usr/bin:/bin'}});
    let out='',failed=false;
    const timer=setTimeout(()=>{failed=true;child.kill('SIGKILL')},timeoutMs);
    child.stdout.on('data',c=>{out+=c.toString('utf8');if(out.length>65536){failed=true;child.kill('SIGKILL')}});
    child.on('error',()=>{clearTimeout(timer);reject(new Error('Media validation unavailable'))});
    child.on('close',code=>{clearTimeout(timer);if(failed||code!==0)reject(new Error('Media validation failed'));else resolve(out)});
  });
}
function makeVideoValidator({ffmpeg,ffprobe,timeoutMs=60000}) {
  if (typeof ffmpeg!=='string'||!path.isAbsolute(ffmpeg)||typeof ffprobe!=='string'||!path.isAbsolute(ffprobe)||!Number.isInteger(timeoutMs)||timeoutMs<100||timeoutMs>120000)throw new Error('Media validator not configured');
  return async buffer=>{
    if(!Buffer.isBuffer(buffer)||buffer.length<12||buffer.length>MAX_VIDEO_BYTES||buffer.toString('ascii',4,8)!=='ftyp')throw new Error('Unsupported or invalid video');
    const dir=await fs.mkdtemp(path.join(os.tmpdir(),'qr-media-'));
    try {
      const file=path.join(dir,'input.mp4');await fs.writeFile(file,buffer,{mode:0o600,flag:'wx'});
      const raw=await run(ffprobe,['-v','error','-protocol_whitelist','file,pipe','-f','mov','-show_entries','format=format_name,duration:stream=codec_type,codec_name,width,height','-of','json',file],timeoutMs);
      let data;try{data=JSON.parse(raw)}catch{throw new Error('Invalid media metadata')}
      const streams=Array.isArray(data.streams)?data.streams:[],videos=streams.filter(s=>s.codec_type==='video'),audios=streams.filter(s=>s.codec_type==='audio');
      const v=videos[0],duration=Number(data.format?.duration);
      if(videos.length!==1||audios.length!==1||v.codec_name!=='h264'||audios[0].codec_name!=='aac'||!Number.isInteger(v.width)||!Number.isInteger(v.height)||v.width<1||v.height<1||v.width>1920||v.height>1920||!Number.isFinite(duration)||duration<=0||duration>300)throw new Error('Unsupported or invalid video');
      // Decode both complete tracks, fail on reported errors. This checks neither
      // audible volume nor correctness/completeness of the Quran recitation.
      await run(ffmpeg,['-nostdin','-v','error','-xerror','-threads','1','-protocol_whitelist','file,pipe','-f','mov','-i',file,'-map','0:v:0','-map','0:a:0','-f','null','-'],timeoutMs);
      return {duration,width:v.width,height:v.height};
    } finally { await fs.rm(dir,{recursive:true,force:true}); }
  };
}
module.exports={makeVideoValidator};
