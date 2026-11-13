/* Optional real PostgreSQL integration: isolated temporary cluster, no production access.
 * Set PG_BIN_DIR and PG_LIB_DIR to a PostgreSQL installation. */
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { Client } = require('pg');
const bin = process.env.PG_BIN_DIR, lib = process.env.PG_LIB_DIR || '';
if (!bin) { console.error('PG_BIN_DIR is required'); process.exit(1); }
const temp = fs.mkdtempSync(path.join(os.tmpdir(),'quran-guard-pg-'));
const datadir = path.join(temp,'data');
const env = {...process.env, LD_LIBRARY_PATH:[lib, process.env.LD_LIBRARY_PATH].filter(Boolean).join(':')};
const init = spawnSync(path.join(bin,'initdb'), ['-D',datadir,'--no-sync','--no-locale','--encoding=UTF8','--auth=trust'],{env,encoding:'utf8'});
if (init.status !== 0) { console.error(init.stderr || init.stdout); fs.rmSync(temp,{recursive:true,force:true}); process.exit(1); }
const server=spawn(path.join(bin,'postgres'),['-D',datadir,'-k',temp,'-h','','-p','5432','-F'],{env,stdio:['ignore','ignore','pipe']});
let logs=''; server.stderr.on('data',b=>logs+=b);
const ready=new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>reject(Error('PostgreSQL startup timeout: '+logs)),20000);
  server.stderr.on('data',()=>{if(logs.includes('database system is ready to accept connections')){clearTimeout(timer);resolve();}});
  server.once('exit',code=>{clearTimeout(timer);reject(Error('PostgreSQL exited '+code+': '+logs));});
});
const U1='11111111-1111-4111-8111-111111111111',U2='22222222-2222-4222-8222-222222222222', U3='33333333-3333-4333-8333-333333333333';
const I1='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', I2='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const cfg=(user,enabled=true,bg='rotate',id=null)=>({user_id:user,enabled,at_utc:'04:15',platforms:['youtube'],template:{background:bg,...(id?{background_image_id:id}:{})},all_channels:true});
const sql='select * from public.save_autopilot_guarded($1::jsonb,$2::uuid,$3::uuid,$4::text)';
const save=(client,c,ver,id=null,img=null)=>client.query(sql,[JSON.stringify(c),ver,id,img]);
const waiting = async promise => assert.equal(await Promise.race([promise.then(()=>false),new Promise(r=>setTimeout(()=>r(true),150))]),true,'second transaction must wait for row lock');
(async()=>{
  const clients=[]; let completed=false;
  try {
    await ready;
    for(let i=0;i<3;i++){const c=new Client({host:temp,port:5432,user:os.userInfo().username,database:'postgres'});await c.connect();clients.push(c);}
    const [a,b,read]=clients;
    await read.query(`create role anon; create role authenticated; create role service_role; create schema auth; create table auth.users(id uuid primary key);
      insert into auth.users values ('${U1}'),('${U2}'),('${U3}');
      create table public.autopilot(user_id uuid primary key, enabled boolean not null default false, at_utc time not null default '04:15', platforms text[] not null default '{youtube}', template jsonb not null default '{}', all_channels boolean not null default false, updated_at timestamptz not null default now());`);
    await read.query(fs.readFileSync('sql/migrations/20261107_private_backgrounds.sql','utf8'));
    await read.query(fs.readFileSync('sql/migrations/20261113_guarded_autopilot_settings.sql','utf8'));
    let initial=(await save(read,cfg(U1,true,'custom',I1),null,I1,'aaaaaaaa')).rows[0];
    await a.query('begin'); await b.query('begin');
    // Pause in A and a stale save in B: B must not undo the pause or replace image.
    const paused=await save(a,cfg(U1,false,'custom',I1),initial.settings_revision,I1,null);
    const stale=save(b,cfg(U1,true,'custom',I2),initial.settings_revision,I2,'bbbbbbbb');
    await waiting(stale);
    // Another owner is not blocked by the first owner's lock.
    assert.equal((await save(read,cfg(U2),null)).rows.length,1);
    await a.query('commit'); assert.equal((await stale).rows.length,0); await b.query('commit');
    const current=(await read.query('select * from public.autopilot where user_id=$1',[U1])).rows[0];
    assert.equal(current.enabled,false); assert.equal(current.settings_revision,paused.rows[0].settings_revision);
    assert.equal((await read.query('select image_id from public.private_autopilot_backgrounds where user_id=$1',[U1])).rows[0].image_id,I1);
    // Two simultaneous first saves: second must not overwrite the winning insert.
    await a.query('begin'); await b.query('begin');
    const first=await save(a,cfg(U3,false),null);
    const second=save(b,cfg(U3,true),null); await waiting(second);
    await a.query('commit'); assert.equal((await second).rows.length,0); await b.query('commit');
    assert.equal((await read.query('select enabled from public.autopilot where user_id=$1',[U3])).rows[0].enabled,false);
    // A concurrent bookkeeping update leaves the revision unchanged and does not reject a draft.
    const ver=first.rows[0].settings_revision;
    await read.query('update public.autopilot set updated_at=clock_timestamp() where user_id=$1',[U3]);
    assert.equal((await save(read,cfg(U3,true),ver)).rows.length,1);
    completed=true;
    console.log('ALL OK: concurrent PostgreSQL transactions, stale save versus pause, first-create race, owner isolation, bookkeeping (local DB)');
  } finally {
    if (!completed) clients.forEach(c => { c.on('error', () => {}); c.connection.stream.destroy(); });
    await Promise.all(clients.map(c=>c.end().catch(()=>{})));
    if (server.exitCode === null && server.signalCode === null) {
      const exited=new Promise(r=>server.once('exit',r)); server.kill('SIGTERM'); await exited;
    }
    fs.rmSync(temp,{recursive:true,force:true});
  }
})().catch(e=>{console.error(e);process.exitCode=1});
