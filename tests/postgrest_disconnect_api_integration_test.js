/* Actual disconnect handler + real PostgREST, with simulated auth and a
 * disposable fixture only. The gateway cannot reach any non-local address. */
'use strict';
const assert=require('node:assert/strict'),crypto=require('node:crypto'),http=require('node:http');
const {Readable}=require('node:stream');
const UPSTREAM='http://127.0.0.1:3102', SECRET='LOCAL-ONLY-channel-fixture-secret-0123456789-abcdef';
const U='11111111-1111-4111-8111-111111111111', OTHER='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const D='dddddddd-dddd-4ddd-8ddd-dddddddddddd', E='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const b64=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
const payload=b64({alg:'HS256',typ:'JWT'})+'.'+b64({role:'service_role',sub:U,exp:Math.floor(Date.now()/1000)+3600});
const jwt=payload+'.'+crypto.createHmac('sha256',SECRET).update(payload).digest('base64url');
let drop=false;
const gateway=http.createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://127.0.0.1');
  if(url.pathname!=='/rest/v1/social_connections'||req.method!=='DELETE')return res.writeHead(403).end();
  const response=await fetch(UPSTREAM+'/social_connections'+url.search,{method:'DELETE',headers:{authorization:req.headers.authorization||'',prefer:req.headers.prefer||''},signal:AbortSignal.timeout(10000)});
  const bytes=Buffer.from(await response.arrayBuffer());
  if(drop){drop=false;req.socket.destroy();return;}
  res.writeHead(response.status,{'content-type':response.headers.get('content-type')||'application/json'}).end(bytes);
 }catch{if(!res.headersSent)res.writeHead(502).end()}
});
(async()=>{
 await new Promise(r=>gateway.listen(0,'127.0.0.1',r));
 try{
  process.env.SUPABASE_URL='http://127.0.0.1:'+gateway.address().port;process.env.SUPABASE_SERVICE_KEY=jwt;
  const sess=require.resolve('../lib/sess');require.cache[sess]={id:sess,filename:sess,loaded:true,exports:{getUserId:async req=>req.headers.authorization==='Bearer local-test'?U:null}};
  const handler=require('../api/_social');
  async function fixture(method,path,body){const r=await fetch(UPSTREAM+path,{method,headers:{authorization:'Bearer '+jwt,'content-type':'application/json',prefer:'return=representation'},...(body?{body:JSON.stringify(body)}:{})});const data=await r.json();assert(r.ok,JSON.stringify(data));return data;}
  for(const id of [D,E])await fixture('POST','/social_connections',{id,user_id:U,platform:'youtube',is_default:false});
  async function call(id,auth=true,parsed=false){const req=parsed?{body:{id}}:Readable.from([JSON.stringify({id})]);Object.assign(req,{method:'POST',url:'/api/gw?op=disconnect',headers:auth?{authorization:'Bearer local-test'}:{}});const res={setHeader(){},end(v){this.data=JSON.parse(v)}};await handler(req,res);return res;}
  assert.equal((await call(D,false)).statusCode,401);
  assert.equal((await call(OTHER)).statusCode,404);
  assert.equal((await call(D,true,true)).statusCode,200);assert.equal((await call(D)).statusCode,404);
  drop=true;assert.equal((await call(E)).statusCode,503);assert.equal((await call(E)).statusCode,404);
  assert.equal((await fixture('GET','/social_connections?id=eq.'+OTHER+'&select=id')).length,1);
  console.log('PASS routed disconnect + actual PostgREST: parsed body, owner scope, deleted row and lost response; fixture/auth mocked');
 }finally{await new Promise(r=>gateway.close(r))}
})().catch(e=>{console.error(e);if(process.env.GITHUB_ACTIONS==='true')console.error('::error title=Disconnect API integration::'+String(e?.stack||e).slice(0,3000).replace(/%/g,'%25').replace(/\r/g,'%0D').replace(/\n/g,'%0A'));process.exitCode=1});
