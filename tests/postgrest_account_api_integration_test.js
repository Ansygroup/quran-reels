/* Real account API + db.js + actual local PostgREST. Authentication is mocked.
 * Run only after postgrest_guard_http_test.js guarded on a disposable CI DB. */
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const http=require('node:http');
const {Readable}=require('node:stream');
const UPSTREAM='http://127.0.0.1:3101'; // Deliberately cannot be configured to a real service.
const SECRET='LOCAL-ONLY-postgrest-fixture-secret-0123456789-abcdef';
const D='44444444-4444-4444-8444-444444444444';
const A='11111111-1111-4111-8111-111111111111';
const base64=v=>Buffer.from(JSON.stringify(v)).toString('base64url');
const unsigned=base64({alg:'HS256',typ:'JWT'})+'.'+base64({role:'service_role',sub:D,exp:Math.floor(Date.now()/1000)+3600});
const serviceJwt=unsigned+'.'+crypto.createHmac('sha256',SECRET).update(unsigned).digest('base64url');
let dropNextSave=false;
const permitted=new Set(['/autopilot','/social_connections','/rpc/save_autopilot_guarded','/rpc/set_autopilot_enabled_guarded']);
// Simulate only the Supabase /rest/v1 prefix, and deliberately refuse anything
// outside the four allowed endpoints. Upstream and fixture token are hardcoded.
const gateway=http.createServer(async(req,res)=>{
  try {
    const incoming=new URL(req.url,'http://127.0.0.1');
    if(!incoming.pathname.startsWith('/rest/v1/')) return res.writeHead(404).end();
    const pathname=incoming.pathname.slice('/rest/v1'.length);
    if(!permitted.has(pathname)) return res.writeHead(403).end();
    const chunks=[]; for await(const chunk of req)chunks.push(chunk);
    const bytes=Buffer.concat(chunks);
    const headers={authorization:req.headers.authorization||'', 'content-type':req.headers['content-type']||'application/json'};
    if(req.headers.prefer) headers.prefer=req.headers.prefer;
    const result=await fetch(UPSTREAM+pathname+incoming.search,{method:req.method,headers,
      ...(['GET','HEAD'].includes(req.method)?{}:{body:bytes}),signal:AbortSignal.timeout(10000)});
    const body=Buffer.from(await result.arrayBuffer());
    if(pathname==='/rpc/save_autopilot_guarded' && dropNextSave) {
      // PostgREST has returned after committing; discard the reply at the gateway.
      dropNextSave=false; req.socket.destroy(); return;
    }
    res.writeHead(result.status,{'content-type':result.headers.get('content-type')||'application/json'}).end(body);
  } catch(err) { if(!res.headersSent)res.writeHead(502).end(JSON.stringify({error:err.message})); }
});
(async()=>{
  await new Promise(resolve=>gateway.listen(0,'127.0.0.1',resolve));
  try {
    process.env.SUPABASE_URL='http://127.0.0.1:'+gateway.address().port;
    process.env.SUPABASE_SERVICE_KEY=serviceJwt;
    const sess=require.resolve('../lib/sess');
    require.cache[sess]={id:sess,filename:sess,loaded:true,exports:{getUserId:async req=>req.headers.authorization==='Bearer local-test'?D:null}};
    const api=require('../api/autopilot');
    const {rest}=require('../lib/db');
    // The probe uses GET only; remap its fixed-shaped requests to this
    // hardcoded disposable PostgREST, never to a production service.
    const {probe,RPCS}=require('../scripts/probe_account_schema_readonly');
    const evidence=await probe({base:'http://fixture.invalid',key:serviceJwt,fetchImpl:(url,options)=>{
      const path=new URL(url).pathname, search=new URL(url).search;
      assert(path.startsWith('/rest/v1/'));assert.equal(options.method,'GET');
      return fetch(UPSTREAM+path.slice('/rest/v1'.length)+search,options);
    }});
    assert.equal(evidence.columns,'visible',JSON.stringify(evidence));
    assert(RPCS.every(n=>evidence.rpcs[n]==='listed'),JSON.stringify(evidence));
    async function call(body,auth=true) {
      const req=Readable.from([JSON.stringify(body)]);
      Object.assign(req,{method:'POST',url:'/api/autopilot',headers:auth?{authorization:'Bearer local-test'}:{}});
      const res={setHeader(){},end(v){this.body=JSON.parse(v)}}; await api(req,res); return res;
    }
    async function row(user=D) {
      const rows=await rest('/rest/v1/autopilot?user_id=eq.'+user+'&select=*');
      assert.equal(rows.length,1); return rows[0];
    }
    const originalA=await row(A);
    const draft={action:'save',user_id:A,enabled:false,platforms:['youtube'],all_channels:false,template:{content_mode:'mix',background:'rotate'}};
    assert.equal((await call(draft,false)).statusCode,401);
    assert.equal((await call(draft)).statusCode,409); // no expected revision
    const created=await call({...draft,expected_revision:null});
    assert.equal(created.statusCode,200,JSON.stringify(created.body));
    assert.equal(created.body.config.user_id,D); assert.equal(created.body.config.enabled,false);
    assert.deepEqual(await row(A),originalA); // forged body user ID is ignored
    const enabled=await call({action:'set_enabled',enabled:true,expected_revision:created.body.config.settings_revision});
    assert.equal(enabled.statusCode,200,JSON.stringify(enabled.body)); assert.equal(enabled.body.enabled,true);
    const revision=enabled.body.config.settings_revision;
    // Both drafts must actually change the saved content. A genuine no-op is
    // allowed to keep its revision and does not represent a conflicting write.
    const one={...draft,enabled:true,expected_revision:revision,template:{content_mode:'sequential',background:'rotate'}};
    const two={...one,template:{content_mode:'famous',background:'rotate'}};
    const concurrent=await Promise.all([call(one),call(two)]);
    assert.deepEqual(concurrent.map(r=>r.statusCode).sort(),[200,409]);
    const winner=concurrent.find(r=>r.statusCode===200).body.config;
    assert.equal((await row()).settings_revision,winner.settings_revision);
    dropNextSave=true;
    const uncertain=await call({...draft,enabled:false,expected_revision:winner.settings_revision});
    assert.equal(uncertain.statusCode,503,JSON.stringify(uncertain.body));
    const committed=await row();
    assert.equal(committed.enabled,false); assert.notEqual(committed.settings_revision,winner.settings_revision);
    assert.equal((await call({...draft,expected_revision:winner.settings_revision})).statusCode,409);
    const oldPause=await call({action:'set_enabled',enabled:false});
    assert.equal(oldPause.statusCode,200); assert.equal(oldPause.body.enabled,false);
    assert.notEqual(oldPause.body.config.settings_revision,committed.settings_revision);
    assert.equal((await call({action:'set_enabled',enabled:true})).statusCode,409);
    assert.equal((await call({action:'set_enabled',enabled:true,expected_revision:committed.settings_revision})).statusCode,409);
    assert.deepEqual(await row(A),originalA);
    console.log('PASS real account API + real db.js + real PostgREST: owner scoping, CAS, old clients and committed/lost reply (mock auth)');
  } finally { await new Promise(resolve=>gateway.close(resolve)); }
})().catch(e=>{
  console.error(e);
  // Expose fixture-only failures as check annotations even if CI log download
  // is blocked; escape workflow-command metacharacters and avoid any tokens.
  if(process.env.GITHUB_ACTIONS==='true') {
    const message=String(e?.stack||e).slice(0,3000).replace(/%/g,'%25').replace(/\r/g,'%0D').replace(/\n/g,'%0A');
    console.error('::error title=Account API integration::'+message);
  }
  process.exitCode=1;
});
