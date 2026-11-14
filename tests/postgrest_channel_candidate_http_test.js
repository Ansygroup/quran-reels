/* Throwaway CI PostgREST ONLY; fixed local address cannot target production. */
const assert=require('node:assert/strict'),crypto=require('node:crypto');
const BASE='http://127.0.0.1:3102', SECRET='LOCAL-ONLY-channel-fixture-secret-0123456789-abcdef';
const U='11111111-1111-4111-8111-111111111111',V='22222222-2222-4222-8222-222222222222';
const A='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',B='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',C='cccccccc-cccc-4ccc-8ccc-cccccccccccc',Q='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const phase=process.argv[2];if(!['foundation','guarded'].includes(phase))throw Error('expected foundation or guarded');
const b64=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
function jwt(role,sub=U){const m=b64({alg:'HS256',typ:'JWT'})+'.'+b64({role,sub,exp:Math.floor(Date.now()/1000)+3600});return m+'.'+crypto.createHmac('sha256',SECRET).update(m).digest('base64url')}
async function request(role,path,{method='GET',body,sub=U,prefer}={}){
 const headers={Authorization:'Bearer '+jwt(role,sub),'Content-Type':'application/json'};if(prefer)headers.Prefer=prefer;
 const r=await fetch(BASE+path,{method,headers,...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(12000)});const text=await r.text();let data;try{data=JSON.parse(text)}catch{data=text}return {status:r.status,data};
}
const denied=r=>assert(r.status>=400&&r.status<500,`expected 4xx, got ${r.status}: ${JSON.stringify(r.data)}`);
const ok=r=>{assert(r.status>=200&&r.status<300,`${r.status}: ${JSON.stringify(r.data)}`);return r.data};
async function ready(){for(let i=0;i<40;i++){try{if((await request('service_role','/')).status===200)return}catch{}await new Promise(r=>setTimeout(r,500))}throw Error('local PostgREST did not start')}
(async()=>{await ready();
 if(phase==='foundation'){
  const rows=ok(await request('authenticated','/social_connections?select=id,access_token&order=id'));assert.equal(rows.length,2);assert.deepEqual(rows.map(x=>x.id),[A,B]);assert(rows.every(x=>x.access_token==='fixture-ciphertext'));
  const other=ok(await request('authenticated','/social_connections?select=id',{sub:V}));assert.deepEqual(other.map(x=>x.id),[C]);
  const changed=ok(await request('authenticated',`/social_connections?id=eq.${C}&select=id`,{method:'PATCH',body:{is_default:false},prefer:'return=representation'}));assert.deepEqual(changed,[]);
  // The disposable fixture's broad grants + owner RLS allow a direct owner
  // transition from failed to scheduled, independent of the app retry guard.
  // This shows a conditional capability, not the state of production ACLs.
  try {
   const created=ok(await request('service_role','/publish_queue?select=id,status',{method:'POST',prefer:'return=representation',body:{id:Q,user_id:U,platform:'youtube',status:'failed',connection_id:A}}));assert.equal(created.length,1);
   const foreign=ok(await request('authenticated',`/publish_queue?id=eq.${Q}&select=id,status`,{sub:V,method:'PATCH',body:{status:'scheduled'},prefer:'return=representation'}));assert.deepEqual(foreign,[]);
   const owner=ok(await request('authenticated',`/publish_queue?id=eq.${Q}&select=id,status`,{method:'PATCH',body:{status:'scheduled'},prefer:'return=representation'}));assert.deepEqual(owner,[{id:Q,status:'scheduled'}]);
  } finally { ok(await request('service_role',`/publish_queue?id=eq.${Q}`,{method:'DELETE'})); }
  denied(await request('authenticated','/rpc/account_set_default_candidate',{method:'POST',body:{p_user_id:U,p_connection_id:B,p_expected_default:A}}));
  denied(await request('authenticated','/rpc/account_disconnect_candidate',{method:'POST',body:{p_user_id:U,p_connection_id:A}}));
 }else{
  for(const table of ['social_connections','publish_queue']){
   denied(await request('authenticated',`/${table}?select=*`));denied(await request('anon',`/${table}?select=*`));
   denied(await request('authenticated',`/${table}?id=eq.${A}`,{method:'PATCH',body:{status:'scheduled'}}));
   denied(await request('authenticated',`/${table}?id=eq.${A}`,{method:'DELETE'}));
  }
  denied(await request('authenticated','/rpc/account_set_default_candidate',{method:'POST',body:{p_user_id:U,p_connection_id:B,p_expected_default:A}}));
  const change=ok(await request('service_role','/rpc/account_set_default_candidate',{method:'POST',body:{p_user_id:U,p_connection_id:B,p_expected_default:A}}));assert.equal(change.outcome,'updated');
  const other=ok(await request('service_role','/rpc/account_set_default_candidate',{method:'POST',body:{p_user_id:U,p_connection_id:C,p_expected_default:B}}));assert.equal(other.outcome,'not_found');
  const rows=ok(await request('service_role','/publish_queue?select=id,connection_id',{method:'POST',prefer:'return=representation',body:{id:Q,user_id:U,platform:'youtube',status:'scheduled',connection_id:null}}));assert.equal(rows.length,1);assert.equal(rows[0].connection_id,B);
  denied(await request('service_role',`/social_connections?id=eq.${B}`,{method:'DELETE'}));
  const remaining=ok(await request('service_role',`/social_connections?id=eq.${B}&select=id`));assert.equal(remaining.length,1);
  denied(await request('authenticated','/rpc/account_disconnect_candidate',{method:'POST',body:{p_user_id:U,p_connection_id:A}}));
  const disconnect=async(id)=>ok(await request('service_role','/rpc/account_disconnect_candidate',{method:'POST',body:{p_user_id:U,p_connection_id:id}}));
  assert.equal((await disconnect(C)).outcome,'not_found');
  assert.equal((await disconnect(B)).outcome,'dependent_tasks');
  assert.equal((await disconnect(A)).outcome,'deleted');
  assert.equal((await disconnect(A)).outcome,'not_found');
  denied(await request('service_role','/publish_queue',{method:'POST',body:{id:'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',user_id:U,platform:'youtube',status:'scheduled',connection_id:A}}));
 }
 console.log(`ALL OK: ${phase} account-channel HTTP access against disposable PostgREST`);
})().catch(e=>{console.error(e);process.exitCode=1});
