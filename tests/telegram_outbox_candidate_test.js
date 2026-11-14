/* PGlite fixture only; no production access or network. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {PGlite} = require('@electric-sql/pglite');
const user='11111111-1111-4111-8111-111111111111', other='22222222-2222-4222-8222-222222222222';
const conn='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', replacement='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const path=`${user}/autopilot/video.mp4`;
(async()=>{
  const db=new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role; create table public.social_connections (id uuid primary key,user_id uuid not null,platform text not null,account_id text not null);`);
    await db.query('insert into public.social_connections values ($1,$2,$3,$4)',[conn,user,'telegram','-10012345']);
    await db.exec(fs.readFileSync('sql/operations/candidate_telegram_outbox.sql','utf8'));
    await db.exec('set role service_role');
    await assert.rejects(db.query('select * from public.telegram_delivery_candidate'),/permission denied/);
    const prepare=(u,c,p)=>db.query('select * from public.telegram_prepare_candidate($1,$2,$3)',[u,c,p]);
    const claim=(u,id)=>db.query('select * from public.telegram_claim_candidate($1,$2)',[u,id]);
    const finish=(u,id,state,msg=null)=>db.query('select * from public.telegram_finish_candidate($1,$2,$3,$4)',[u,id,state,msg]);
    await assert.rejects(prepare(other,conn,`${other}/video.mp4`),/destination unavailable/);
    await assert.rejects(prepare(user,conn,`${other}/video.mp4`),/invalid delivery/);
    await assert.rejects(prepare(user,conn,`${user}/../video.mp4`),/invalid delivery/);
    const first=(await prepare(user,conn,path)).rows[0]; assert.equal(first.state,'ready');
    assert.equal((await prepare(user,conn,path)).rows[0].id,first.id);
    assert.equal((await claim(other,first.id)).rows.length,0);
    const claimed=(await claim(user,first.id)).rows; assert.equal(claimed.length,1);assert.equal(claimed[0].destination_id,'-10012345');
    assert.equal((await claim(user,first.id)).rows.length,0,'no second worker claim');
    assert.equal((await prepare(user,conn,path)).rows[0].state,'sending','lost response cannot prepare again');
    assert.equal((await finish(other,first.id,'sent',123)).rows.length,0);
    await assert.rejects(finish(user,first.id,'sent',null),/invalid result/);
    assert.equal((await finish(user,first.id,'uncertain')).rows[0].state,'uncertain');
    assert.equal((await claim(user,first.id)).rows.length,0);assert.equal((await finish(user,first.id,'sent',123)).rows.length,0);
    await db.exec('reset role');
    await db.query('delete from public.social_connections where id=$1',[conn]);
    await db.query('insert into public.social_connections values ($1,$2,$3,$4)',[replacement,user,'telegram','-10012345']);
    await db.exec('set role service_role');
    const again=(await prepare(user,replacement,path)).rows[0];assert.equal(again.id,first.id);assert.equal(again.state,'uncertain','re-link cannot bypass duplicate guard');
    const second=(await prepare(user,replacement,`${user}/other.mp4`)).rows[0];
    assert.equal((await claim(user,second.id)).rows.length,1);assert.equal((await finish(user,second.id,'sent',42)).rows[0].state,'sent');
    await db.exec('reset role; set role authenticated');
    await assert.rejects(prepare(user,replacement,path),/permission denied/);
    console.log('ALL OK: candidate Telegram durable states, identity and duplicate guards (isolated PGlite only)');
  } finally {await db.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
