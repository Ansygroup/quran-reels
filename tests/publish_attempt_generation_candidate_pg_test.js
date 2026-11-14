'use strict';
// Disposable local PostgreSQL only. This exercises a candidate trigger and
// hypothetical cooperating SQL, not the actual publisher or PostgREST.
const assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { spawn, spawnSync } = require('node:child_process'), { Client } = require('pg');
const bin = process.env.PG_BIN_DIR, lib = process.env.PG_LIB_DIR || '';
if (!bin) throw Error('PG_BIN_DIR required');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'qr-attempt-pg-')), data = path.join(tmp, 'data');
const env = { ...process.env, LD_LIBRARY_PATH: [lib, process.env.LD_LIBRARY_PATH].filter(Boolean).join(':') };
const init = spawnSync(path.join(bin, 'initdb'), ['-D', data, '--no-sync', '--no-locale', '--encoding=UTF8', '--auth=trust'], { env, encoding: 'utf8' });
if (init.status !== 0) { fs.rmSync(tmp, { recursive: true, force: true }); throw Error(init.stderr || init.stdout); }
const server = spawn(path.join(bin, 'postgres'), ['-D', data, '-k', tmp, '-h', '', '-p', '5439', '-F'], { env, stdio: ['ignore', 'ignore', 'pipe'] });
let logs = ''; server.stderr.on('data', c => logs += c);
const ready = new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(Error('PostgreSQL timeout: ' + logs)), 20000);
  server.stderr.on('data', () => { if (logs.includes('database system is ready to accept connections')) { clearTimeout(timer); resolve(); } });
  server.once('exit', code => { clearTimeout(timer); reject(Error('PostgreSQL exited ' + code + ': ' + logs)); });
});
(async () => { const clients = []; try {
  await ready;
  for (let i = 0; i < 3; i++) { const c = new Client({ host: tmp, port: 5439, user: os.userInfo().username, database: 'postgres' }); await c.connect(); clients.push(c); }
  const [admin, a, b] = clients;
  await admin.query("create table public.publish_queue(id int primary key, user_id text not null, status text not null, updated_at timestamptz not null default now()); insert into public.publish_queue values (1,'owner','publishing',now()),(2,'other','scheduled',now());");
  await admin.query(fs.readFileSync('sql/operations/candidate_publish_attempt_generation.sql', 'utf8'));
  let legacy = (await admin.query('select publish_attempt_id from public.publish_queue where id=1')).rows[0];
  assert.equal(legacy.publish_attempt_id, null, 'preexisting publishing rows have no claim token');
  const claim = async c => (await c.query("update public.publish_queue set status='publishing' where id=1 and user_id='owner' and status='scheduled' returning publish_attempt_id")).rows[0]?.publish_attempt_id;
  const finish = async (c, token) => (await c.query("update public.publish_queue set status='published' where id=1 and user_id='owner' and status='publishing' and publish_attempt_id=$1 returning id", [token])).rowCount;
  assert.equal(await finish(a, null), 0, 'a null legacy token must not match');
  await admin.query("update public.publish_queue set status='scheduled' where id=1");
  const old = await claim(a); assert.ok(old);
  await admin.query("update public.publish_queue set publish_attempt_id=gen_random_uuid() where id=1");
  assert.equal((await admin.query('select publish_attempt_id from public.publish_queue where id=1')).rows[0].publish_attempt_id, old);
  // A reclaim and independent reactivation, while the old provider call lives.
  await admin.query("update public.publish_queue set status='failed' where id=1 and status='publishing'");
  assert.equal((await admin.query('select publish_attempt_id from public.publish_queue where id=1')).rows[0].publish_attempt_id, null);
  await admin.query("update public.publish_queue set status='scheduled' where id=1");
  const current = await claim(b); assert.ok(current); assert.notEqual(current, old);
  assert.equal(await finish(a, old), 0, 'old cooperating finalizer cannot write the new attempt');
  assert.equal(await finish(b, current), 1);
  // Reclaim and finalization serialize on the row. Here reclaim holds the lock;
  // after it commits the waiting old finalizer must re-evaluate its predicate.
  await admin.query("update public.publish_queue set status='scheduled' where id=1");
  const beforeReclaim = await claim(a);
  await b.query('begin'); await b.query("update public.publish_queue set status='failed' where id=1 and status='publishing'");
  const waiting = finish(a, beforeReclaim);
  assert.equal(await Promise.race([waiting.then(() => false), new Promise(r => setTimeout(() => r(true), 150))]), true);
  await b.query('commit'); assert.equal(await waiting, 0);
  // Reverse ordering: finalization holds the lock and reclaim must not replace
  // the published result when it re-evaluates its status predicate.
  await admin.query("update public.publish_queue set status='scheduled' where id=1");
  const beforeFinish = await claim(a);
  await a.query('begin'); assert.equal(await finish(a, beforeFinish), 1);
  const reclaim = b.query("update public.publish_queue set status='failed' where id=1 and status='publishing' returning id");
  assert.equal(await Promise.race([reclaim.then(() => false), new Promise(r => setTimeout(() => r(true), 150))]), true);
  await a.query('commit'); assert.equal((await reclaim).rowCount, 0);
  // A non-cooperating old finalizer still writes: trigger cannot fence its WHERE.
  await admin.query("update public.publish_queue set status='scheduled' where id=1");
  const fresh = await claim(b); assert.ok(fresh);
  assert.equal((await admin.query("update public.publish_queue set status='published' where id=1 and user_id='owner' and status='publishing' returning id")).rowCount, 1);
  assert.equal(await finish(b, fresh), 0, 'legacy finalizer remains unfenced');
  assert.equal((await admin.query('select status from public.publish_queue where id=2')).rows[0].status, 'scheduled');
  console.log('PASS isolated candidate generation, concurrent reclaim and explicit legacy-writer limitation');
} finally {
  for (const c of clients) await c.end().catch(() => {});
  server.kill('SIGTERM'); await new Promise(resolve => { if (server.exitCode !== null) return resolve(); server.once('exit', resolve); setTimeout(() => { server.kill('SIGKILL'); resolve(); }, 5000).unref(); });
  fs.rmSync(tmp, { recursive: true, force: true });
} })().catch(e => { console.error(e); process.exitCode = 1; });
