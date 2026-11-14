'use strict';
// Hypothetical SQL and candidate trigger on disposable PostgreSQL only.
// The real publisher, REST layer, production ACL and providers are NOT tested.
const assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { spawn, spawnSync } = require('node:child_process'), { Client } = require('pg');
const bin = process.env.PG_BIN_DIR, lib = process.env.PG_LIB_DIR || '';
if (!bin) throw Error('PG_BIN_DIR required');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'qr-queue-revision-pg-')), data = path.join(tmp, 'data');
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
const blocked = p => Promise.race([p.then(() => false, () => false), new Promise(r => setTimeout(() => r(true), 150))]);
(async () => { const clients = []; try {
  await ready;
  for (let i = 0; i < 3; i++) { const c = new Client({ host: tmp, port: 5439, user: os.userInfo().username, database: 'postgres' }); await c.connect(); clients.push(c); }
  const [admin, a, b] = clients;
  await admin.query(`create table public.publish_queue(id int primary key, user_id text not null, platform text not null,
    connection_id text, status text not null, video_path text not null, updated_at timestamptz not null default now());
    insert into public.publish_queue values(1,'owner','youtube',null,'scheduled','owner/video.mp4',now()),
      (2,'other','youtube',null,'scheduled','other/video.mp4',now()),
      (3,'owner','youtube',null,'publishing','owner/legacy.mp4',now());`);
  await admin.query(fs.readFileSync('sql/operations/candidate_publish_queue_revision.sql', 'utf8'));
  const read = async () => (await admin.query('select * from public.publish_queue where id=1')).rows[0];
  // Hypothetical cooperating writer: compare the snapshot revision in addition
  // to owner, status and target; use returned revision for the finalizer.
  const claim = async (c, snapshot, owner = 'owner') => (await c.query(`update public.publish_queue
    set status='publishing' where id=1 and user_id=$1 and platform=$2 and connection_id is not distinct from $3
    and status=$4 and queue_revision=$5 returning *`, [owner, snapshot.platform, snapshot.connection_id, snapshot.status, snapshot.queue_revision])).rows[0];
  const finish = async (c, token) => (await c.query(`update public.publish_queue set status='published'
    where id=1 and user_id='owner' and status='publishing' and queue_revision=$1 returning *`, [token])).rows[0];
  const old = await read(); assert.ok(old.queue_revision);
  // Backfilling a revision does NOT identify a preexisting active worker.
  assert.ok((await admin.query('select queue_revision from public.publish_queue where id=3')).rows[0].queue_revision);
  assert.equal(await claim(a, { ...old, queue_revision: null }), undefined);
  assert.equal(await claim(a, old, 'other'), undefined);
  assert.equal(await claim(a, { ...old, platform: 'x' }), undefined);
  assert.equal(await claim(a, { ...old, connection_id: 'changed' }), undefined);
  // Payload change, even followed by a reversal, invalidates the old read.
  await admin.query("update public.publish_queue set video_path='owner/new.mp4' where id=1");
  await admin.query("update public.publish_queue set video_path='owner/video.mp4' where id=1");
  assert.equal(await claim(a, old), undefined);
  let snapshot = await read(); assert.notEqual(snapshot.queue_revision, old.queue_revision);
  const first = await claim(a, snapshot); assert.ok(first); assert.notEqual(first.queue_revision, snapshot.queue_revision);
  // Reclaim plus external reactivation cannot make a stale scheduled snapshot
  // match again; old finalization cannot touch a newer claim either.
  await admin.query("update public.publish_queue set status='failed' where id=1 and status='publishing'");
  await admin.query("update public.publish_queue set status='scheduled' where id=1");
  assert.equal(await claim(a, snapshot), undefined);
  const next = await claim(b, await read()); assert.ok(next); assert.notEqual(next.queue_revision, first.queue_revision);
  assert.equal(await finish(a, first.queue_revision), undefined);
  const published = await finish(b, next.queue_revision); assert.ok(published); assert.notEqual(published.queue_revision, next.queue_revision);
  // A no-op or an attempted token rewrite also rotates the revision and makes
  // a live worker's result uncertain, even if the provider already accepted it.
  await admin.query("update public.publish_queue set status='scheduled' where id=1");
  const live = await claim(a, await read());
  const changed = (await admin.query('update public.publish_queue set queue_revision=$1 where id=1 returning queue_revision', [live.queue_revision])).rows[0];
  assert.notEqual(changed.queue_revision, live.queue_revision); assert.equal(await finish(a, live.queue_revision), undefined);
  // Newer revisions are not permissions: a legacy finalizer ignores the token.
  await admin.query("update public.publish_queue set status='scheduled' where id=1");
  const stillLive = await claim(b, await read());
  assert.equal((await admin.query("update public.publish_queue set status='published' where id=1 and user_id='owner' and status='publishing' returning id")).rowCount, 1);
  assert.equal(await finish(b, stillLive.queue_revision), undefined);
  // Two cooperating claims serialize; after commit the loser sees no match.
  await admin.query("update public.publish_queue set status='scheduled' where id=1"); snapshot = await read();
  await a.query('begin'); await b.query('begin');
  const winner = await claim(a, snapshot); assert.ok(winner);
  const competing = claim(b, snapshot); assert.equal(await blocked(competing), true);
  await a.query('commit'); assert.equal(await competing, undefined); await b.query('commit');
  // Reclaim holds the lock: finalizer must re-evaluate the revision afterwards.
  await b.query('begin'); await b.query("update public.publish_queue set status='failed' where id=1 and status='publishing'");
  const pending = finish(a, winner.queue_revision); assert.equal(await blocked(pending), true);
  await b.query('commit'); assert.equal(await pending, undefined);
  // Delete/recreate with identical business fields still creates a fresh token.
  await admin.query("update public.publish_queue set status='scheduled' where id=1"); snapshot = await read();
  await admin.query('delete from public.publish_queue where id=1');
  await admin.query("insert into public.publish_queue(id,user_id,platform,connection_id,status,video_path,queue_revision) values(1,'owner','youtube',null,'scheduled','owner/video.mp4',$1)", [snapshot.queue_revision]);
  assert.notEqual((await read()).queue_revision, snapshot.queue_revision); assert.equal(await claim(a, snapshot), undefined);
  assert.equal((await admin.query('select status from public.publish_queue where id=2')).rows[0].status, 'scheduled');
  console.log('PASS candidate revision on isolated PostgreSQL; stale claim/finalizer fenced when cooperating; legacy and in-flight limitations remain');
} finally {
  for (const c of clients) await c.end().catch(() => {});
  server.kill('SIGTERM'); await new Promise(resolve => { if (server.exitCode !== null) return resolve(); server.once('exit', resolve); setTimeout(() => { server.kill('SIGKILL'); resolve(); }, 5000).unref(); });
  fs.rmSync(tmp, { recursive: true, force: true });
} })().catch(e => { console.error(e); process.exitCode = 1; });
