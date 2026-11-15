#!/usr/bin/env node
/* محاكاة PostgREST ووقت تعطل الشبكة، بلا أي مزود نشر حقيقي. */
const assert = require('node:assert/strict');
process.env.SUPABASE_URL = 'https://db.example';
process.env.SUPABASE_SERVICE_KEY = 'test';
const initialRun = () => ({ id: 'run1', user_id: 'u1', status: 'rendering', video_path: null, external_url: null });
let calls = [], run = initialRun(), rows = [], mode = 'normal';
const respond = data => ({ ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => data, text: async () => '' });
global.fetch = async (url, opts = {}) => {
  const u = new URL(url), method = opts.method || 'GET', body = opts.body && JSON.parse(opts.body);
  calls.push({ path: u.pathname, method, body });
  if (u.pathname.endsWith('/autopilot_runs') && method === 'PATCH') {
    assert.equal(u.searchParams.get('id'),'eq.run1');assert.equal(u.searchParams.get('user_id'),'eq.u1');assert.equal(u.searchParams.get('status'),'eq.rendering');assert.equal(opts.headers.Prefer,'return=representation');
    if (run.status !== 'rendering' || mode === 'marker-zero') return respond([]);
    Object.assign(run, body);
    if (mode === 'marker-lost') throw Error('lost marker response after commit');
    if (mode === 'marker-malformed') return respond([{...run, user_id:'other'}]);
    return respond([{...run}]);
  }
  if (u.pathname.endsWith('/autopilot_runs') && method === 'GET') return respond([{ ...run }]);
  if (u.pathname.endsWith('/publish_queue') && method === 'POST') {
    assert(Array.isArray(body));
    if (mode === 'reject') return { ok: false, status: 400, text: async () => 'rejected atomically' };
    rows.push(...body.map(r=>({...r})));
    if (mode === 'lost') throw new Error('connection lost after commit');
    if (mode === 'partial_response') return respond(body.slice(0, 1));
    if (mode === 'reverse') return respond(body.slice().reverse());
    if (mode.startsWith('alter:')) {
      const field=mode.slice(6), copy=body.map(r=>({...r}));
      if(field==='missing')delete copy[0].connection_id;
      else if(field==='duplicate')copy[1]={...copy[0]};
      else copy[0][field]='different';
      return respond(copy);
    }
    return respond(body);
  }
  throw new Error(`unexpected ${method} ${url}`);
};
const { __test: T } = require('../lib/autopilot');
const targets = [{ platform: 'youtube', connection_id: 'c1' }, { platform: 'youtube', connection_id: 'c2' }];
const queue = () => T.queueTargets('run1', 'u1', 'u1/autopilot/2026-11-12-run1.mp4', 'r.mp4', targets, { s: 1, from: 1, to: 2 }, { name: 'قارئ' });
(async () => {
  const out = await queue();
  assert.equal(out.length, 2); assert.equal(rows.length, 2);
  assert.deepEqual(rows.map(r => r.connection_id), ['c1', 'c2']);
  assert(rows.every(r=>r.status==='draft'),'cron must not see newly created batch as scheduled');
  assert.equal(calls.filter(c => c.path.endsWith('publish_queue') && c.method === 'POST').length, 1);
  assert.equal(calls[0].body.status, 'queued'); assert.equal(calls[0].body.video_path, rows[0].video_path);
  assert.equal(new Set(rows.map(r => r.id)).size, 2);
  assert.equal(T.shouldCatchUp([{ status: 'queued' }]), 'running');
  rows = []; calls = []; run = initialRun(); mode = 'reject';
  await assert.rejects(queue, /راجع المسودات/); assert.equal(rows.length, 0); assert.equal(run.status, 'queued');
  rows = []; calls = []; run = initialRun(); mode = 'lost';
  await assert.rejects(queue, /راجع المسودات/); assert.equal(rows.length, 2); assert(rows.every(r=>r.status==='draft')); assert.equal(run.status, 'queued');
  run.status = 'failed';
  const resumed = await T.createRun('u1', 'daily', '2026-11-12', null, '', true);
  assert.equal(resumed.existing, true); assert.equal(calls.filter(c => c.path.endsWith('publish_queue') && c.method === 'POST').length, 1);
  mode = 'partial_response'; rows = []; calls = []; run = initialRun();
  await assert.rejects(queue, /تأكيد/); assert.equal(rows.length, 2);
  for (const field of ['id','user_id','platform','connection_id','video_path','video_name','title','caption','hashtags','status','publish_at','missing','duplicate']) {
    rows=[];calls=[];run=initialRun();mode='alter:'+field;
    await assert.rejects(queue, /راجع المسودات/,field);assert.equal(rows.length,2);assert(rows.every(r=>r.status==='draft'));
    assert.equal(calls.filter(c=>c.path.endsWith('publish_queue')&&c.method==='POST').length,1);
  }
  rows=[];calls=[];run=initialRun();mode='reverse';const reordered=await queue();assert.deepEqual(reordered.map(x=>x.connection_id),['c1','c2']);
  for (const m of ['marker-zero','marker-lost','marker-malformed']) {
    rows=[];calls=[];run=initialRun();mode=m;
    await assert.rejects(queue, e=>e.code==='RUN_STATE_UNCONFIRMED');
    assert.equal(rows.length,0);assert.equal(calls.filter(c=>c.path.endsWith('publish_queue')).length,0);
    if(m!=='marker-zero')assert.equal(run.status,'queued');
  }
  for (const invalid of [[], [{platform:'youtube'}], [{platform:'youtube',connection_id:'c1'},{platform:'youtube',connection_id:'c1'}], [{platform:'unsupported',connection_id:null}]]) {
    rows=[];calls=[];run=initialRun();mode='normal';
    await assert.rejects(T.queueTargets('run1','u1','file','r.mp4',invalid,{s:1,from:1,to:2},{name:'قارئ'}));assert.equal(calls.length,0);
  }
  let attempts = 0; const result = await T.runWithRetry(async () => { attempts++; return { ok: false, stage: 'publish' }; });
  assert.equal(result.attempts, 1); assert.equal(attempts, 1);
  console.log('ALL OK: atomic batch, lost response and durable no-rerender guard (mock PostgREST)');
})().catch(e => { console.error(e); process.exitCode = 1; });
