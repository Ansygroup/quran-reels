/* Manual queue endpoint must not retry uncertain failures; all network mocked. */
const assert=require('node:assert/strict');const {Readable}=require('node:stream');
let writes=0,authenticated=true;
const db=require.resolve('../lib/db'),sess=require.resolve('../lib/sess');
require.cache[db]={id:db,filename:db,loaded:true,exports:{q:async()=>{writes++;throw Error('unexpected write')},q1:async(_sql,args)=>({id:args[0],user_id:'u1',platform:'youtube',status:'failed',video_path:'u1/video.mp4'}),rest:async()=>{throw Error('unexpected network')}}};
require.cache[sess]={id:sess,filename:sess,loaded:true,exports:{getUserId:async()=>authenticated?'u1':null}};
const endpoint=require('../api/_publish');
async function call(){const req=Readable.from([JSON.stringify({queue_id:'q1'})]);req.method='POST';req.headers={authorization:'Bearer fixture'};const res={setHeader(){},end(body){this.body=JSON.parse(body)}};await endpoint(req,res);return res}
(async()=>{const result=await call();assert.equal(result.statusCode,409);assert.equal(result.body.skipped,'review-required');assert.match(result.body.error,/راجع القناة/);assert.equal(writes,0);authenticated=false;assert.equal((await call()).statusCode,401);assert.equal(writes,0);console.log('ALL OK: manual endpoint blocks uncertain failed job without a claim or upload (mock DB)')})().catch(e=>{console.error(e);process.exitCode=1});
