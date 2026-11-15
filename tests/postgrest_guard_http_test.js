/* Real PostgREST HTTP, local throwaway CI containers ONLY. No Supabase access. */
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const BASE = 'http://127.0.0.1:3101'; // Deliberately not configurable: never target production.
const SECRET = 'LOCAL-ONLY-postgrest-fixture-secret-0123456789-abcdef';
const A='11111111-1111-4111-8111-111111111111';
const B='22222222-2222-4222-8222-222222222222';
const C='33333333-3333-4333-8333-333333333333';
const IMG='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const MISSING='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const phase=process.argv[2];
if (!['foundation','guarded'].includes(phase)) throw Error('Expected foundation or guarded');
const b64=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
function jwt(role,sub) {
  const body=b64({alg:'HS256',typ:'JWT'})+'.'+b64({role,sub,exp:Math.floor(Date.now()/1000)+3600});
  return body+'.'+crypto.createHmac('sha256',SECRET).update(body).digest('base64url');
}
async function request(role,path,{method='GET',body,sub=A,prefer}={}) {
  const headers={Authorization:'Bearer '+jwt(role,sub),'Content-Type':'application/json'};
  if (prefer) headers.Prefer=prefer;
  const response=await fetch(BASE+path,{method,headers,...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(12000)});
  const text=await response.text(); let data;
  try {data=JSON.parse(text)} catch {data=text}
  return {status:response.status,data};
}
const rpc=(name,body,role='service_role',sub=A)=>request(role,'/rpc/'+name,{method:'POST',body,sub});
const assertOk=(r,label)=>{assert(r.status>=200&&r.status<300,`${label}: HTTP ${r.status} ${JSON.stringify(r.data)}`);return r.data;};
const assertDenied=(r,label)=>assert(r.status>=400&&r.status<500,`${label}: expected 4xx, got ${r.status} ${JSON.stringify(r.data)}`);
function cfg(user,enabled=true,background='rotate',image=null) {
  return {user_id:user,enabled,at_utc:'04:15:00',platforms:['youtube'],all_channels:false,
    template:{content_mode:'mix',background,...(image?{background_image_id:image}:{})}};
}
const save=(config,revision,image=null,bytes=null)=>rpc('save_autopilot_guarded',{p_config:config,p_expected_revision:revision,p_image_id:image,p_jpeg_base64:bytes});
async function row(user) {
  const rows=assertOk(await request('service_role','/autopilot?user_id=eq.'+user+'&select=*'),'service read');
  assert.equal(rows.length,1); return rows[0];
}
async function waitReady() {
  let last;
  for(let i=0;i<40;i++) {
    try {const r=await request('service_role','/'); if(r.status===200) return;} catch(e) {last=e;}
    await new Promise(resolve=>setTimeout(resolve,500));
  }
  throw Error('PostgREST did not start: '+String(last||'invalid status'));
}
(async()=>{
  await waitReady();
  if(phase==='foundation') {
    const created=assertOk(await save(cfg(A,true,'custom',IMG),null,IMG,'aaaaaaaa'),'first save');
    assert.equal(created.length,1); const initial=created[0].settings_revision;
    assert.match(initial,/^[0-9a-f-]{36}$/);
    assert.deepEqual(assertOk(await save(cfg(A,false),null),'stale create'),[]);
    const mine=assertOk(await request('authenticated','/autopilot?select=user_id,settings_revision',{sub:A}),'owner read');
    assert.equal(mine.length,1); assert.equal(mine[0].user_id,A);
    assert.deepEqual(assertOk(await request('authenticated','/autopilot?select=user_id',{sub:B}),'other owner read'),[]);
    assertDenied(await rpc('save_autopilot_guarded',{p_config:cfg(B),p_expected_revision:null},'authenticated',B),'authenticated RPC');
    assertDenied(await request('authenticated','/private_autopilot_backgrounds?select=*',{sub:A}),'private image read');
    const missing=await save(cfg(A,false,'custom',MISSING),initial,MISSING,null);
    assert(missing.status>=400,`missing image must reject: ${JSON.stringify(missing)}`);
    assert.equal((await row(A)).settings_revision,initial);
    const photos=assertOk(await request('service_role','/private_autopilot_backgrounds?user_id=eq.'+A+'&select=image_id'),'service image');
    assert.equal(photos[0].image_id,IMG);
    console.log('PASS foundation: real HTTP RPC shapes, stale first-create, RLS and atomic image rollback');
    return;
  }
  const before=await row(A);
  assertDenied(await request('authenticated','/autopilot?user_id=eq.'+A,{method:'PATCH',sub:A,body:{enabled:false},prefer:'return=representation'}),'authenticated direct update');
  assertDenied(await request('service_role','/autopilot?user_id=eq.'+A,{method:'PATCH',body:{enabled:true},prefer:'return=representation'}),'legacy direct enable');
  assertDenied(await request('service_role','/private_autopilot_backgrounds?user_id=eq.'+A,{method:'PATCH',body:{jpeg_base64:'bbbbbbbb'}}),'direct image change');
  assertDenied(await rpc('save_custom_reel',{p_config:cfg(A,true,'custom',IMG),p_image_id:IMG,p_jpeg_base64:null}),'legacy image RPC');
  const bookkeeping=assertOk(await request('service_role','/autopilot?user_id=eq.'+A,{method:'PATCH',body:{updated_at:new Date().toISOString()},prefer:'return=representation'}),'bookkeeping');
  assert.equal(bookkeeping[0].settings_revision,before.settings_revision);
  const pause=assertOk(await request('service_role','/autopilot?user_id=eq.'+A,{method:'PATCH',body:{enabled:false},prefer:'return=representation'}),'legacy pause');
  assert.equal(pause[0].enabled,false); assert.notEqual(pause[0].settings_revision,before.settings_revision);
  assert.deepEqual(pause[0].template,before.template);
  const pauseAgain=assertOk(await request('service_role','/autopilot?user_id=eq.'+A,{method:'PATCH',body:{enabled:false},prefer:'return=representation'}),'repeat legacy pause');
  assert.notEqual(pauseAgain[0].settings_revision,pause[0].settings_revision);
  assert.deepEqual(assertOk(await save(cfg(A,true,'custom',IMG),before.settings_revision,IMG,null),'stale after pause'),[]);
  const rev=pauseAgain[0].settings_revision;
  const c1=cfg(A,false,'custom',IMG),c2=cfg(A,false,'custom',IMG);
  c1.template.marker='one'; c2.template.marker='two';
  const pair=await Promise.all([save(c1,rev,IMG,null),save(c2,rev,IMG,null)]);
  const results=pair.map((r,i)=>assertOk(r,'concurrent save '+i));
  assert.deepEqual(results.map(x=>x.length).sort(),[0,1]);
  const winner=results.find(x=>x.length===1)[0]; assert.equal((await row(A)).settings_revision,winner.settings_revision);
  const firstPause=assertOk(await rpc('set_autopilot_enabled_guarded',{p_user_id:B,p_enabled:false,p_expected_revision:null}),'pause missing row');
  assert.equal(firstPause.outcome,'updated'); assert.equal(firstPause.config.enabled,false);
  assert.equal(assertOk(await rpc('link_autopilot_platform_guarded',{p_user_id:B,p_platform:'tiktok',p_template:{background:'rotate'}}),'OAuth link'),'extended');
  assert.equal((await row(B)).enabled,false);
  assert.deepEqual(assertOk(await save(cfg(B,true),null),'stale first create after pause'),[]);
  const firstCreates=await Promise.all([save(cfg(C,false),null),save(cfg(C,true),null)]);
  assert.deepEqual(firstCreates.map((r,i)=>assertOk(r,'racing insert '+i).length).sort(),[0,1]);
  const image=assertOk(await request('service_role','/private_autopilot_backgrounds?user_id=eq.'+A+'&select=image_id'),'image after concurrency');
  assert.equal(image[0].image_id,IMG);
  console.log('PASS guarded: direct ACLs, old RPC denied, old pause, true HTTP CAS races, OAuth and image isolation');
})().catch(e=>{console.error(e);process.exitCode=1});
