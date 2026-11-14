/* Reproduces Vercel Node's consumed-and-restored stream and lazy req.body.
 * Database/auth are mocked; no network or publishing. */
const assert = require('node:assert/strict');
const { Readable, PassThrough } = require('node:stream');
const dbPath = require.resolve('../lib/db'), sessPath = require.resolve('../lib/sess');
const uid = '31767a76-47ae-4487-9026-852ee258c808';
const revision='11111111-1111-4111-8111-111111111111';
let saves = [], updates = [];
require.cache[sessPath] = { id:sessPath,filename:sessPath,loaded:true,exports:{getUserId:async()=>uid} };
require.cache[dbPath] = { id:dbPath,filename:dbPath,loaded:true,exports:{q:async()=>[],q1:async()=>({user_id:uid,enabled:true,platforms:['youtube'],updated_at:'2026-01-01T00:00:00Z'}),rest:async(path,opts={})=>{
  if(path.includes('social_connections'))return [{platform:'youtube'}];
  if(path.includes('/rpc/save_autopilot_guarded')) {const b=JSON.parse(opts.body);saves.push(b.p_config);return [{...b.p_config,settings_revision:revision}];}
  if(path.includes('/rpc/set_autopilot_enabled_guarded')){const b=JSON.parse(opts.body);updates.push({enabled:b.p_enabled});return {outcome:'updated',stale:true,config:{user_id:uid,enabled:b.p_enabled,settings_revision:revision,template:{}}};}
  throw Error('unexpected '+path);
}}};
const api=require('../api/autopilot');
async function invoke(data, mode='vercel') {
  const raw=Buffer.isBuffer(data)?data:Buffer.from(typeof data==='string'?data:JSON.stringify(data));
  const req=Readable.from([raw]);req.method='POST';req.url='/api/autopilot';req.headers={'content-type':'application/json'};
  if(mode==='vercel') {
    const parts=[];for await(const c of req)parts.push(Buffer.from(c));const saved=Buffer.concat(parts);
    const replica=new PassThrough(), on=replica.on.bind(replica), original=req.on.bind(req);
    req.on=req.addListener=(name,cb)=>name==='data'||name==='end'?on(name,cb):original(name,cb);
    replica.end(saved);
    Object.defineProperty(req,'body',{configurable:true,get(){return JSON.parse(saved.toString('utf8')||'{}')}});
  }
  let res={setHeader(){},end(s){this.body=JSON.parse(s)}};await api(req,res);return res;
}
const settings={action:'save',expected_revision:null,enabled:true,platforms:['youtube'],all_channels:true,template:{content_mode:'mix',reciter_mode:'rotate',background:'grad-gold'}};
const jpeg='data:image/jpeg;base64,'+Buffer.from('ffd8ffc00011080002000303011100021101031101ffd9','hex').toString('base64');
(async()=>{
  let res=await invoke(settings);assert.equal(res.statusCode,200);assert.equal(saves.at(-1).template.background,'grad-gold');assert.equal(saves.at(-1).all_channels,true);
  res=await invoke({action:'set_enabled',enabled:false});assert.equal(res.statusCode,200);assert.deepEqual(updates.at(-1).enabled,false);
  res=await invoke({...settings,template:{...settings.template,background:'custom'},custom_image:jpeg});assert.equal(res.statusCode,200);assert.equal(saves.at(-1).template.background,'custom');assert(saves.at(-1).template.background_image_id);
  res=await invoke(settings,'raw');assert.equal(res.statusCode,200);
  const count=saves.length;res=await invoke('{"action":');assert.equal(res.statusCode,400);res=await invoke('[]');assert.equal(res.statusCode,400);res=await invoke({action:'save',padding:'x'.repeat(20001)});assert.equal(res.statusCode,413);res=await invoke({action:'save',custom_image:'x'.repeat(720001)});assert.equal(res.statusCode,413);assert.equal(saves.length,count);
  // Multi-byte JSON split between raw stream chunks must be decoded correctly.
  const text=Buffer.from(JSON.stringify({...settings,template:{...settings.template,design:{dedText:'دعاء'}}}));const pos=text.indexOf(Buffer.from('د'))+1;
  const req=Readable.from([text.subarray(0,pos),text.subarray(pos)]);req.headers={};const parsed=await api.__test.readBody(req);assert.equal(parsed.template.design.dedText,'دعاء');
  console.log('Vercel-consumed body, raw Node, size and malformed guards: OK (mock DB, no publish)');
})().catch(e=>{console.error(e);process.exitCode=1});
