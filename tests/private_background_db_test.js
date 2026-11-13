/* Isolated PostgreSQL-compatible test. No production DB or network. */
const assert=require('node:assert/strict'), fs=require('node:fs');
const { PGlite }=require('@electric-sql/pglite');
const uid='31767a76-47ae-4487-9026-852ee258c808', other='ff4f75a2-cadc-4459-af2a-6e2e4fde3006';
const id='e6babd90-5848-4327-a948-b282b87dad08', next='d45549f4-3f04-43fa-a7ab-232387bf864f';
(async()=>{const db=new PGlite();try{
await db.exec(`create role anon; create role authenticated; create role service_role; create schema auth; create table auth.users(id uuid primary key); insert into auth.users values ('${uid}'),('${other}');
create table public.autopilot(user_id uuid primary key, enabled boolean not null default false, at_utc time not null default '04:15', platforms text[] not null default '{youtube}', template jsonb not null default '{}', all_channels boolean not null default false, updated_at timestamptz not null default now());`);
await db.exec(fs.readFileSync('sql/migrations/20261107_private_backgrounds.sql','utf8'));
const cfg=(u,i)=>({user_id:u,enabled:true,at_utc:'04:15',platforms:['youtube'],template:{background:'custom',background_image_id:i},all_channels:true,updated_at:new Date().toISOString()});
const save=(u,i,img)=>db.query('select * from public.save_custom_reel($1::jsonb,$2::uuid,$3::text)',[JSON.stringify(cfg(u,i)),i,img]);
await save(uid,id,'aaaaaaaa');
let r=await db.query('select * from public.private_autopilot_backgrounds'); assert.equal(r.rows.length,1);assert.equal(r.rows[0].image_id,id);
await assert.rejects(save(uid,next,null),/background not found/);
r=await db.query('select template from public.autopilot where user_id=$1',[uid]);assert.equal(r.rows[0].template.background_image_id,id);
await save(uid,id,null);await save(uid,next,'bbbbbbbb');
r=await db.query('select image_id,jpeg_base64 from public.private_autopilot_backgrounds where user_id=$1',[uid]);assert.deepEqual(r.rows,[{image_id:next,jpeg_base64:'bbbbbbbb'}]);
await assert.rejects(db.query('select * from public.save_custom_reel($1::jsonb,$2::uuid,$3::text)',[JSON.stringify(cfg(other,id)),id,null]),/background not found/);
await db.exec('set role authenticated'); await assert.rejects(db.query('select * from public.private_autopilot_backgrounds'),/permission denied/); await assert.rejects(save(uid,id,null),/permission denied/); await db.exec('reset role');
await db.query(`update public.autopilot set template = '{"background":"rotate"}' where user_id=$1`,[uid]);
r=await db.query('select * from public.private_autopilot_backgrounds');assert.equal(r.rows.length,0);
await save(uid,id,'cccccccc');await db.query('delete from public.autopilot where user_id=$1',[uid]);r=await db.query('select * from public.private_autopilot_backgrounds');assert.equal(r.rows.length,0);
await save(uid,id,'dddddddd');await db.query('delete from auth.users where id=$1',[uid]);r=await db.query('select * from public.private_autopilot_backgrounds');assert.equal(r.rows.length,0);
console.log('private background transaction, rollback, permissions and deletion: OK (isolated PGlite)');
}finally{await db.close()}})().catch(e=>{console.error(e);process.exitCode=1});
