#!/usr/bin/env node
/* فحص API من غير اتصال: تغيير حالة المالك وحدها مع حفظ باقي الحقول. */
const assert = require('node:assert/strict');
const { Readable } = require('node:stream');
const dbPath = require.resolve('../lib/db'), sessPath = require.resolve('../lib/sess');
const revision='11111111-1111-4111-8111-111111111111';
const initial = {settings_revision:revision,user_id:'u1',enabled:true,platforms:['youtube'],all_channels:true,template:{content_mode:'famous',background:'grad-gold',reciter_mode:'fixed',reciter:'x'},at_utc:'04:15:00',updated_at:'2026-11-12T01:02:03.000Z'};
let row, writes, queries, connections, race = false, down = false;
require.cache[dbPath] = {id:dbPath,filename:dbPath,loaded:true,exports:{
  q:async()=>[], q1:async(_sql,params)=>{ assert.equal(params[0],'u1'); return row && {...row}; },
  rest:async(path,opts={})=>{
    queries.push(path);
    if(path.includes('/social_connections')) { if(down) throw Error('offline'); return connections; }
    if(path.includes('/rpc/set_autopilot_enabled_guarded')) {
      const input=JSON.parse(opts.body); writes.push(input); assert.equal(input.p_user_id,'u1');
      if(!row) return {outcome:'missing'};
      if(input.p_enabled && (race || row.settings_revision!==input.p_expected_revision)) return {outcome:'conflict'};
      const stale=row.settings_revision!==input.p_expected_revision;
      row={...row,enabled:input.p_enabled}; return {outcome:'updated',stale,config:row};
    }
    throw Error('unexpected '+path);
  }
}};
require.cache[sessPath] = {id:sessPath,filename:sessPath,loaded:true,exports:{getUserId:async req=>req.headers.authorization?'u1':null}};
const api = require('../api/autopilot');
async function request(body, auth=true) {
  const req=Readable.from([JSON.stringify({action:'set_enabled',expected_revision:revision,...body})]);
  Object.assign(req,{method:'POST',url:'/api/autopilot',headers:auth?{authorization:'Bearer test'}:{}});
  const res={setHeader(){},end(v){this.body=JSON.parse(v)}}; await api(req,res); return res;
}
function setup() { row=structuredClone(initial); writes=[]; queries=[]; connections=[{platform:'youtube'}]; race=false; down=false; }
(async()=>{
  setup(); let out=await request({enabled:false,platforms:['tiktok'],all_channels:false,template:{content_mode:'mix'}});
  assert.equal(out.statusCode,200); assert.equal(out.body.enabled,false);
  assert.deepEqual({...row,enabled:true,updated_at:initial.updated_at},initial); assert.equal(queries.length,1); assert.equal(writes.length,1);
  setup(); row.platforms=['youtube','telegram']; out=await request({enabled:false}); assert.equal(out.statusCode,200); assert.equal(row.enabled,false); assert.deepEqual(row.platforms,['youtube','telegram']);
  setup(); row.enabled=false; out=await request({enabled:true}); assert.equal(out.statusCode,200); assert.equal(row.enabled,true); assert.equal(row.all_channels,true); assert.deepEqual(row.platforms,['youtube']); assert(queries.some(q=>q.includes('/rpc/set_autopilot_enabled_guarded')));
  setup(); row.enabled=false; row.platforms=['youtube','tiktok']; out=await request({enabled:true}); assert.equal(out.statusCode,400); assert.match(out.body.error,/تيك توك/); assert.equal(writes.length,0);
  for(const platforms of [[],['telegram'],['youtube','youtube'],null]) {setup(); row.platforms=platforms; out=await request({enabled:true}); assert.equal(out.statusCode,400); assert.equal(writes.length,0);}
  setup(); row=null; out=await request({enabled:true}); assert.equal(out.statusCode,409); assert.equal(writes.length,0);
  setup(); row.settings_revision=null; out=await request({enabled:true}); assert.equal(out.statusCode,409); assert.equal(writes.length,0);
  setup(); race=true; out=await request({enabled:true}); assert.equal(out.statusCode,409); assert.equal(writes.length,1); assert.equal(row.enabled,true);
  setup(); down=true; out=await request({enabled:true}); assert.equal(out.statusCode,500); assert.equal(writes.length,0);
  setup(); connections=null; out=await request({enabled:true}); assert.equal(out.statusCode,500); assert.equal(writes.length,0);
  setup(); out=await request({enabled:'false'}); assert.equal(out.statusCode,400); assert.equal(writes.length,0);
  setup(); out=await request({enabled:false},false); assert.equal(out.statusCode,401); assert.equal(writes.length,0);
  console.log('ALL OK: owner-only toggle, preserved settings, validation and optimistic guard (mock database)');
})().catch(e=>{console.error(e);process.exitCode=1});
