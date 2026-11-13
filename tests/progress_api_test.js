#!/usr/bin/env node
/* مسارات حقيقية مع قاعدة محاكاة: التقدم لا يتجاوز صاحب التشغيل. */
const assert = require('node:assert/strict');
const dbPath = require.resolve('../lib/db');
const seen = []; let mode = 'ok', writes = [];
const run = { id: 'r1', user_id: 'u1', status: 'queued', title: 'سورة', video_path: 'u1/autopilot/file.mp4', started_at: '2026-11-12T00:00:00Z' };
const rest = async (path, opts = {}) => {
  seen.push(path);
  if (opts.method === 'POST') { writes.push(JSON.parse(opts.body)); if (mode === 'write-down') throw Error('db down'); return []; }
  if (path.includes('/autopilot_runs')) return mode === 'wrong-owner' ? [{ ...run, user_id: 'u2' }] : [run];
  if (path.includes('/system_checks')) {
    if (mode === 'events-down') throw Error('down');
    return [
      { detail: { user_id: 'u1', run_id: 'r1', stage: 'audio' }, created_at: '2026-11-12T00:01:00Z' },
      { detail: { user_id: 'u1', run_id: 'r1', stage: 'export' }, created_at: '2026-11-12T00:02:00Z' },
      { detail: { user_id: 'u2', run_id: 'r1', stage: 'publishing' }, created_at: '2026-11-12T00:02:00Z' },
      { detail: { user_id: 'u1', run_id: 'r1', stage: 'queue' }, created_at: '2026-11-11T23:59:00Z' },
      { detail: { user_id: 'u1', run_id: 'other', stage: 'queue' }, created_at: '2026-11-12T00:02:00Z' },
    ];
  }
  if (path.includes('/publish_queue')) return [
    { user_id:'u1', platform:'youtube', connection_id:'c1', status:'published', external_url:'https://youtu.be/a' },
    { user_id:'u1', platform:'youtube', connection_id:'c2', status:'failed', error:'invalid_grant' },
    { user_id:'u2', platform:'youtube', connection_id:'c3', status:'published', external_url:'https://secret' },
  ];
  if (path.includes('/social_connections')) return [{ id:'c1', user_id:'u1', platform:'youtube', account_name:'قناة أ' }, { id:'c2', user_id:'u1', platform:'youtube', account_name:'قناة ب' }, { id:'c3', user_id:'u2', platform:'youtube', account_name:'غيره' }];
  throw Error('unexpected ' + path);
};
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded:true, exports:{ rest, q:async()=>[], q1:async()=>null } };
const sessPath = require.resolve('../lib/sess');
require.cache[sessPath] = { id:sessPath, filename:sessPath, loaded:true, exports:{ getUserId:async req => req.headers.authorization ? 'u1' : null } };
const api = require('../api/autopilot'); const auto = require('../lib/autopilot');
(async () => {
  const out = await api.__test.latestProgress('u1');
  assert.deepEqual(out.events.map(e=>e.stage), ['audio','export']);
  assert.deepEqual(out.targets.map(t=>t.channel), ['قناة أ','قناة ب']);
  assert.equal(out.targets[0].status,'published'); assert.equal(out.targets[1].status,'failed');
  assert(!JSON.stringify(out).includes('secret')); assert(!JSON.stringify(out).includes('video_path'));
  assert(seen.every(p => p.includes('user_id=eq.u1') || p.includes('detail->>user_id=eq.u1')));
  assert(seen.some(p => p.includes('created_at=gte.')));
  mode='wrong-owner'; await assert.rejects(() => api.__test.latestProgress('u1'), /صاحب/);
  mode='events-down'; const degraded = await api.__test.latestProgress('u1'); assert.equal(degraded.events_available,false); assert.equal(degraded.targets.length,2);
  mode='write-down'; await auto.__test.recordProgress('u1','r1','audio'); assert.equal(writes.length,1);
  await auto.__test.recordProgress('u1','r1','invented'); assert.equal(writes.length,1);
  mode='ok'; const res = { headers:{}, setHeader(k,v){this.headers[k]=v}, end(v){this.body=v} };
  await api({ method:'GET', url:'/api/autopilot?progress=1', headers:{ authorization:'Bearer test' } }, res);
  assert.equal(res.statusCode,200); assert.equal(res.headers['Cache-Control'],'no-store'); assert.equal(JSON.parse(res.body).run.id,'r1');
  const noAuth = { headers:{}, setHeader(){}, end(v){this.body=v} };
  await api({ method:'GET', url:'/api/autopilot?progress=1', headers:{} }, noAuth); assert.equal(noAuth.statusCode,401);
  console.log('ALL OK: owner-scoped progress, target statuses, failed telemetry, and auth (mock database)');
})().catch(e=>{console.error(e); process.exitCode=1});
