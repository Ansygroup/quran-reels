/* Isolated PGlite only. Tests transaction semantics; not concurrent connections or PostgREST. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {PGlite} = require('@electric-sql/pglite');
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const IMAGE1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const IMAGE2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
(async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role; create schema auth; create table auth.users(id uuid primary key);
      insert into auth.users values ('${A}'),('${B}');
      create table public.autopilot(user_id uuid primary key, enabled boolean not null default false,
       at_utc time not null default '04:15', platforms text[] not null default '{youtube}', template jsonb not null default '{}',
       all_channels boolean not null default false, updated_at timestamptz not null default now());`);
    await db.exec(fs.readFileSync('sql/migrations/20261107_private_backgrounds.sql','utf8'));
    await db.exec(fs.readFileSync('sql/migrations/20261113_guarded_autopilot_settings.sql','utf8'));
    await db.exec(fs.readFileSync('sql/migrations/20261114_guarded_autopilot_actions.sql','utf8'));
    const cfg = (user, background='rotate', image=null) => ({user_id:user,enabled:true,at_utc:'04:15',platforms:['youtube'],template:{background,...(image?{background_image_id:image}:{})},all_channels:true});
    const save = (c, version, image=null, bytes=null) => db.query('select * from public.save_autopilot_guarded($1::jsonb,$2::uuid,$3::uuid,$4::text)',[JSON.stringify(c),version,image,bytes]);
    const row = async (user) => (await db.query('select * from public.autopilot where user_id=$1',[user])).rows[0];
    const photo = async (user) => (await db.query('select * from public.private_autopilot_backgrounds where user_id=$1',[user])).rows[0];
    // First-create CAS; a stale "no row" cannot replace either settings or image.
    let result = await save(cfg(A,'custom',IMAGE1),null,IMAGE1,'aaaaaaaa');
    assert.equal(result.rows.length,1); let initial = result.rows[0].settings_revision; assert(initial);
    assert.equal((await save(cfg(A,'custom',IMAGE2),null,IMAGE2,'bbbbbbbb')).rows.length,0);
    assert.equal((await photo(A)).image_id,IMAGE1); assert.equal((await row(A)).settings_revision,initial);
    // Bookkeeping does not invalidate a user draft; a real change does.
    await db.query('update public.autopilot set updated_at=now() where user_id=$1',[A]);
    assert.equal((await row(A)).settings_revision,initial);
    await db.query('update public.autopilot set enabled=false where user_id=$1',[A]);
    let current = await row(A); assert.notEqual(current.settings_revision,initial);
    assert.equal((await save(cfg(A,'custom',IMAGE2),initial,IMAGE2,'bbbbbbbb')).rows.length,0);
    assert.equal((await row(A)).enabled,false); assert.equal((await photo(A)).image_id,IMAGE1);
    // Missing image must roll back both the settings and revision.
    await assert.rejects(save(cfg(A,'custom',IMAGE2),current.settings_revision,IMAGE2,null),/background not found/);
    assert.equal((await row(A)).settings_revision,current.settings_revision); assert.equal((await row(A)).enabled,false);
    // Replacing image bytes under the same ID would bypass a settings revision change.
    await assert.rejects(save(cfg(A,'custom',IMAGE1),current.settings_revision,IMAGE1,'bbbbbbbb'),/background id must be new/);
    assert.equal((await row(A)).settings_revision,current.settings_revision); assert.equal((await photo(A)).jpeg_base64,'aaaaaaaa');
    // A matching revision succeeds; older snapshots cannot revert it or delete an image.
    result=await save(cfg(A,'custom',IMAGE2),current.settings_revision,IMAGE2,'bbbbbbbb'); assert.equal(result.rows.length,1);
    const next=result.rows[0].settings_revision; assert.notEqual(next,current.settings_revision);
    assert.equal((await save(cfg(A),current.settings_revision)).rows.length,0); assert.equal((await photo(A)).image_id,IMAGE2);
    result=await save(cfg(A),next); assert.equal(result.rows.length,1); assert.equal(await photo(A),undefined);
    // Even a caller-supplied token on insert is replaced; deleting/recreating cannot reuse it.
    const forced = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    await db.query('insert into public.autopilot(user_id,settings_revision) values ($1,$2)',[B,forced]);
    assert.notEqual((await row(B)).settings_revision,forced);
    await db.query('delete from public.autopilot where user_id=$1',[B]);
    await db.query('insert into public.autopilot(user_id,settings_revision) values ($1,$2)',[B,forced]);
    assert.notEqual((await row(B)).settings_revision,forced);
    await db.query('delete from public.autopilot where user_id=$1',[B]);
    // Two accounts cannot share revisions/privileges as a substitute for owner-scoped checks.
    assert.equal((await save(cfg(B),result.rows[0].settings_revision)).rows.length,0);
    await assert.rejects(save(cfg(B,'custom',IMAGE1),null,IMAGE1,null),/background not found/);
    assert.equal(await row(B),undefined);
    await assert.rejects(save(cfg(A),result.rows[0].settings_revision,IMAGE1,'aaaaaaaa'),/unexpected background/);
    await db.exec('set role authenticated');
    await assert.rejects(save(cfg(A),null),/permission denied/);
    await assert.rejects(db.query('select public.set_autopilot_enabled_guarded($1,false,null)',[A]),/permission denied/);
    await assert.rejects(db.query('select public.link_autopilot_platform_guarded($1,$2,$3::jsonb)',[A,'tiktok','{}']),/permission denied/);
    await db.exec('reset role');
    console.log('ALL OK: guarded settings, stale create/update, image atomicity, bookkeeping and permissions (isolated PGlite)');
  } finally { await db.close(); }
})().catch(e=>{console.error(e);process.exitCode=1});
