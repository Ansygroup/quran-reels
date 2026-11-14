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
    await read.query(`create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create table auth.users(id uuid primary key);
      insert into auth.users values ('${U1}'),('${U2}'),('${U3}');
      create table public.autopilot(user_id uuid primary key, enabled boolean not null default false, at_utc time not null default '04:15', platforms text[] not null default '{youtube}', template jsonb not null default '{}', all_channels boolean not null default false, updated_at timestamptz not null default now(), daily_count smallint not null default 1, youtube_connection_ids uuid[] not null default '{}');`);
    await read.query(fs.readFileSync('sql/migrations/20261107_private_backgrounds.sql','utf8'));
    await read.query(fs.readFileSync('sql/migrations/20261113_guarded_autopilot_settings.sql','utf8'));
    await read.query(fs.readFileSync('sql/migrations/20261114_guarded_autopilot_actions.sql','utf8'));
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
    // An old enable is rejected, while a pause from a stale tab always succeeds.
    const toggle=(c,user,on,rev)=>c.query('select public.set_autopilot_enabled_guarded($1,$2,$3) as result',[user,on,rev]);
    let t=(await toggle(read,U1,true,initial.settings_revision)).rows[0].result;
    assert.equal(t.outcome,'conflict');
    t=(await toggle(read,U1,false,initial.settings_revision)).rows[0].result;
    assert.equal(t.outcome,'updated'); assert.equal(t.stale,true); assert.equal(t.config.enabled,false);
    const pausedRevision=t.config.settings_revision;
    t=(await toggle(read,U1,false,pausedRevision)).rows[0].result;
    assert.notEqual(t.config.settings_revision,pausedRevision);
    assert.equal((await save(read,cfg(U1,true,'custom',I1),pausedRevision,I1,null)).rows.length,0);
    // Concurrent OAuth append does not overwrite settings or re-enable a paused account.
    const link=(c,user,platform)=>c.query('select public.link_autopilot_platform_guarded($1,$2,$3::jsonb) as result',[user,platform,JSON.stringify({background:'rotate'})]);
    const beforeLink=(await read.query('select * from public.autopilot where user_id=$1',[U1])).rows[0];
    await a.query('begin'); await b.query('begin');
    const guarded=await save(a,{...cfg(U1,false,'custom',I1),platforms:['youtube','facebook']},beforeLink.settings_revision,I1,null);
    const linkPending=link(b,U1,'tiktok'); await waiting(linkPending); await a.query('commit');
    assert.equal((await linkPending).rows[0].result,'extended'); await b.query('commit');
    const linked=(await read.query('select * from public.autopilot where user_id=$1',[U1])).rows[0];
    assert.equal(linked.enabled,false); assert.deepEqual(linked.platforms,['youtube','facebook','tiktok']); assert.notEqual(linked.settings_revision,guarded.rows[0].settings_revision);
    assert.equal((await link(read,U1,'tiktok')).rows[0].result,'unchanged');
    // Pause on an absent row races first OAuth creation: OAuth must not enable it.
    await read.query('delete from public.autopilot where user_id=$1',[U2]);
    await a.query('begin'); await b.query('begin');
    const firstPause=await toggle(a,U2,false,null); assert.equal(firstPause.rows[0].result.config.enabled,false);
    const concurrentLink=link(b,U2,'youtube'); await waiting(concurrentLink); await a.query('commit');
    assert(['extended','unchanged'].includes((await concurrentLink).rows[0].result)); await b.query('commit');
    assert.equal((await read.query('select enabled from public.autopilot where user_id=$1',[U2])).rows[0].enabled,false);
    assert.equal((await save(read,cfg(U2,true),null)).rows.length,0);
    // Production-only extra columns survive all guarded settings operations.
    await read.query('update public.autopilot set daily_count=7, youtube_connection_ids=$2::uuid[] where user_id=$1',[U1,[I2]]);
    let extra=(await read.query('select * from public.autopilot where user_id=$1',[U1])).rows[0];
    const extraRev=extra.settings_revision;
    const extraSaved=(await save(read,cfg(U1,false,'custom',I1),extraRev,I1,null)).rows[0];
    assert.equal(extraSaved.daily_count,7); assert.deepEqual(extraSaved.youtube_connection_ids,[I2]);
    const extraPaused=(await toggle(read,U1,false,extraSaved.settings_revision)).rows[0].result.config;
    assert.equal(extraPaused.daily_count,7); assert.deepEqual(extraPaused.youtube_connection_ids,[I2]);
    await link(read,U1,'x');
    extra=(await read.query('select * from public.autopilot where user_id=$1',[U1])).rows[0];
    assert.equal(extra.daily_count,7); assert.deepEqual(extra.youtube_connection_ids,[I2]);
    // A concurrent bookkeeping update leaves the revision unchanged and does not reject a draft.
    const ver=first.rows[0].settings_revision;
    await read.query('update public.autopilot set updated_at=clock_timestamp() where user_id=$1',[U3]);
    assert.equal((await save(read,cfg(U3,true),ver)).rows.length,1);

    // Candidate staged revocation removes both table and separate column grants,
    // keeps SELECT and the guarded service role, and does not touch rows/images.
    await read.query('grant select, insert, update, delete, truncate, references, trigger, maintain on public.autopilot to authenticated');
    await read.query('grant update (template), insert (enabled), references (user_id) on public.autopilot to authenticated');
    await read.query('grant select, insert, update, delete on public.autopilot to service_role');
    const beforeAcl=(await read.query('select * from public.autopilot where user_id=$1',[U1])).rows[0];
    const revokeSql=fs.readFileSync('sql/operations/candidate_autopilot_client_write_revoke.sql','utf8');
    await read.query('create role inherited_writes; grant inherited_writes to authenticated; grant update on public.autopilot to inherited_writes');
    await assert.rejects(read.query(revokeSql),/retains table privilege UPDATE/);
    await read.query('rollback');
    assert.equal((await read.query("select has_table_privilege('authenticated','public.autopilot','TRUNCATE') as allowed")).rows[0].allowed,true);
    await read.query('revoke inherited_writes from authenticated; revoke update on public.autopilot from inherited_writes');
    await read.query(revokeSql);
    assert.equal((await read.query("select has_table_privilege('authenticated','public.autopilot','SELECT') as allowed")).rows[0].allowed,true);
    await read.query('set role authenticated');
    assert.equal((await read.query('select user_id from public.autopilot where user_id=$1',[U1])).rows.length,1);
    await assert.rejects(read.query('update public.autopilot set enabled=true where user_id=$1',[U1]),/permission denied/);
    await assert.rejects(read.query('delete from public.autopilot where user_id=$1',[U1]),/permission denied/);
    await assert.rejects(read.query('truncate public.autopilot'),/permission denied/);
    await assert.rejects(toggle(read,U1,false,null),/permission denied/);
    await read.query('reset role');
    assert.deepEqual((await read.query('select * from public.autopilot where user_id=$1',[U1])).rows[0],beforeAcl);
    assert.equal((await read.query('select image_id from public.private_autopilot_backgrounds where user_id=$1',[U1])).rows[0].image_id,I1);
    await read.query('set role service_role');
    const servicePause=(await toggle(read,U1,false,null)).rows[0].result;
    assert.equal(servicePause.outcome,'updated');
    await read.query('update public.autopilot set updated_at=clock_timestamp() where user_id=$1',[U1]);
    await read.query('reset role');

    // Candidate service guard: inherited write grants abort atomically, then
    // old direct saves/enables and the old image RPC fail; explicit pause and
    // bookkeeping still work. The new SECURITY DEFINER functions still work.
    const serviceGuard=fs.readFileSync('sql/operations/candidate_autopilot_service_guard.sql','utf8');
    await read.query('alter table public.autopilot disable trigger autopilot_settings_revision');
    await assert.rejects(read.query(serviceGuard),/revision trigger is missing or disabled/); await read.query('rollback');
    await read.query('alter table public.autopilot enable trigger autopilot_settings_revision');
    await read.query("create function public.unexpected_before_update() returns trigger language plpgsql as $$ begin return new; end $$; create trigger unexpected_before_update before update on public.autopilot for each row execute function public.unexpected_before_update()");
    await assert.rejects(read.query(serviceGuard),/unexpected before-update trigger/); await read.query('rollback');
    await read.query('drop trigger unexpected_before_update on public.autopilot; drop function public.unexpected_before_update()');
    await read.query('grant inherited_writes to service_role; grant update (template) on public.autopilot to inherited_writes');
    await assert.rejects(read.query(serviceGuard),/retains update privilege/); await read.query('rollback');
    assert.equal((await read.query("select has_function_privilege('service_role','public.save_custom_reel(jsonb,uuid,text)','EXECUTE') as ok")).rows[0].ok,true);
    await read.query('revoke inherited_writes from service_role; revoke update(template) on public.autopilot from inherited_writes');
    // A legacy statement already in a transaction must finish before the gate
    // DDL completes; once installed, subsequent direct enables must fail.
    await a.query('set role service_role'); await a.query('begin');
    await a.query('update public.autopilot set enabled=true where user_id=$1',[U1]);
    const installGuard=b.query(serviceGuard); await waiting(installGuard);
    await a.query('commit'); await installGuard; await a.query('reset role');
    const baseline=(await read.query('select * from public.autopilot where user_id=$1',[U1])).rows[0];
    await read.query('set role service_role');
    await assert.rejects(read.query('insert into public.autopilot(user_id) values ($1)',[U3]),/permission denied/);
    await assert.rejects(read.query('delete from public.autopilot where user_id=$1',[U1]),/permission denied/);
    await assert.rejects(read.query('update public.autopilot set template=$2::jsonb where user_id=$1',[U1,'{}']),/permission denied/);
    await assert.rejects(read.query('update public.autopilot set enabled=false, template=template where user_id=$1',[U1]),/permission denied/);
    const u2before=(await read.query('select * from public.autopilot where user_id=$1',[U2])).rows[0];
    await assert.rejects(read.query('update public.autopilot set enabled=case when user_id=$1 then false else true end where user_id=any($2::uuid[])',[U1,[U1,U2]]),/direct settings update is not allowed/);
    assert.deepEqual((await read.query('select * from public.autopilot where user_id=$1',[U1])).rows[0],baseline);
    assert.deepEqual((await read.query('select * from public.autopilot where user_id=$1',[U2])).rows[0],u2before);
    await assert.rejects(read.query('update public.private_autopilot_backgrounds set jpeg_base64=$2 where user_id=$1',[U1,'bbbbbbbb']),/permission denied/);
    await assert.rejects(read.query('delete from public.private_autopilot_backgrounds where user_id=$1',[U1]),/permission denied/);
    await assert.rejects(read.query('select * from public.save_custom_reel($1::jsonb,$2::uuid,$3::text)',[JSON.stringify(cfg(U1,true,'custom',I1)),I1,null]),/permission denied/);
    await assert.rejects(read.query('update public.autopilot set enabled=true where user_id=$1',[U1]),/direct settings update is not allowed/);
    await read.query('update public.autopilot set updated_at=clock_timestamp() where user_id=$1',[U1]);
    assert.equal((await read.query('select settings_revision from public.autopilot where user_id=$1',[U1])).rows[0].settings_revision,baseline.settings_revision);
    const legacyPause=(await read.query('update public.autopilot set enabled=false,updated_at=clock_timestamp() where user_id=$1 returning *',[U1])).rows[0];
    assert.equal(legacyPause.enabled,false); assert.notEqual(legacyPause.settings_revision,baseline.settings_revision);
    assert.deepEqual(legacyPause.platforms,baseline.platforms); assert.deepEqual(legacyPause.template,baseline.template);
    const repeatedPause=(await read.query('update public.autopilot set enabled=false where user_id=$1 returning *',[U1])).rows[0];
    assert.notEqual(repeatedPause.settings_revision,legacyPause.settings_revision);
    assert.equal((await read.query('select image_id from public.private_autopilot_backgrounds where user_id=$1',[U1])).rows[0].image_id,I1);
    const newSave=(await save(read,cfg(U1,false,'custom',I1),repeatedPause.settings_revision,I1,null)).rows[0];
    assert(newSave.settings_revision);
    await assert.rejects(save(read,cfg(U1,false,'custom',I2),newSave.settings_revision,I2,null),/background not found/);
    assert.equal((await read.query('select settings_revision from public.autopilot where user_id=$1',[U1])).rows[0].settings_revision,newSave.settings_revision);
    // The restricted service role can still upload and remove through the
    // trusted RPC and cleanup trigger, but not by direct image-table writes.
    const u2rev=(await read.query('select settings_revision from public.autopilot where user_id=$1',[U2])).rows[0].settings_revision;
    const withPhoto=(await save(read,cfg(U2,false,'custom',I2),u2rev,I2,'cccccccc')).rows[0];
    assert.equal((await read.query('select image_id from public.private_autopilot_backgrounds where user_id=$1',[U2])).rows[0].image_id,I2);
    assert.equal((await save(read,cfg(U2,false),withPhoto.settings_revision)).rows.length,1);
    assert.equal((await read.query('select image_id from public.private_autopilot_backgrounds where user_id=$1',[U2])).rows.length,0);
    const newEnable=(await toggle(read,U1,true,newSave.settings_revision)).rows[0].result;
    assert.equal(newEnable.config.enabled,true);
    assert.equal((await link(read,U1,'facebook')).rows[0].result,'extended');
    await read.query('reset role');

    // A direct legacy pause invalidates a concurrent old snapshot at commit.
    const oldSnapshot=(await read.query('select settings_revision from public.autopilot where user_id=$1',[U1])).rows[0].settings_revision;
    await a.query('set role service_role'); await b.query('set role service_role');
    await a.query('begin'); await b.query('begin');
    await a.query('update public.autopilot set enabled=false where user_id=$1',[U1]);
    const oldWrite=save(b,cfg(U1,true,'custom',I1),oldSnapshot,I1,null); await waiting(oldWrite);
    await a.query('commit'); assert.equal((await oldWrite).rows.length,0); await b.query('commit');
    await a.query('reset role'); await b.query('reset role');
    assert.equal((await read.query('select enabled from public.autopilot where user_id=$1',[U1])).rows[0].enabled,false);

    // Exercise the real API handler against PostgreSQL RPCs through a small
    // in-process adapter. This does NOT simulate or test PostgREST itself.
    const dbPath=require.resolve('../lib/db'), sessPath=require.resolve('../lib/sess');
    let loseCommittedResponse=false;
    require.cache[dbPath]={id:dbPath,filename:dbPath,loaded:true,exports:{
      q:async()=>[], q1:async(_query,args)=>(await read.query('select * from public.autopilot where user_id=$1',[args[0]])).rows[0] || null,
      rest:async(endpoint,opts={})=>{
        if(endpoint.includes('/social_connections')) return [{platform:'youtube'}];
        const p=JSON.parse(opts.body);
        if(endpoint.endsWith('/rpc/save_autopilot_guarded')) {
          const rows=(await save(read,p.p_config,p.p_expected_revision,p.p_image_id,p.p_jpeg_base64)).rows;
          if(loseCommittedResponse){loseCommittedResponse=false;throw Error('simulated lost response after commit');}
          return rows;
        }
        if(endpoint.endsWith('/rpc/set_autopilot_enabled_guarded')) return (await toggle(read,p.p_user_id,p.p_enabled,p.p_expected_revision)).rows[0].result;
        throw Error('unexpected adapter request '+endpoint);
      }
    }};
    require.cache[sessPath]={id:sessPath,filename:sessPath,loaded:true,exports:{getUserId:async()=>U3}};
    const api=require('../api/autopilot'), {Readable}=require('node:stream');
    async function request(body) {
      const req=Readable.from([JSON.stringify(body)]); Object.assign(req,{method:'POST',url:'/api/autopilot',headers:{authorization:'Bearer local-test'}});
      const res={setHeader(){},end(value){this.body=JSON.parse(value)}}; await api(req,res); return res;
    }
    const snapshot=(await read.query('select * from public.autopilot where user_id=$1',[U3])).rows[0];
    const apiDraft={action:'save',user_id:U1,enabled:false,platforms:['youtube'],all_channels:false,template:{background:'rotate',content_mode:'mix'}};
    assert.equal((await request(apiDraft)).statusCode,409); // old client must not save
    loseCommittedResponse=true;
    const uncertain=await request({...apiDraft,expected_revision:snapshot.settings_revision});
    assert.equal(uncertain.statusCode,503);
    const committed=(await read.query('select * from public.autopilot where user_id=$1',[U3])).rows[0];
    assert.equal(committed.enabled,false); assert.notEqual(committed.settings_revision,snapshot.settings_revision);
    assert.equal((await request({...apiDraft,expected_revision:snapshot.settings_revision})).statusCode,409);
    const oldPause=await request({action:'set_enabled',enabled:false}); // old tab can still pause
    assert.equal(oldPause.statusCode,200); assert.equal(oldPause.body.config.user_id,U3);
    assert.notEqual(oldPause.body.config.settings_revision,committed.settings_revision);
    assert.equal((await request({...apiDraft,expected_revision:committed.settings_revision})).statusCode,409);
    completed=true;
    console.log('ALL OK: PostgreSQL concurrency, paused first-create, staged ACL, extra columns and API adapter (local DB; no PostgREST)');
  } finally {
    if (!completed) clients.forEach(c => { c.on('error', () => {}); c.connection.stream.destroy(); });
    await Promise.all(clients.map(c=>c.end().catch(()=>{})));
    if (server.exitCode === null && server.signalCode === null) {
      const exited=new Promise(r=>server.once('exit',r)); server.kill('SIGTERM'); await exited;
    }
    fs.rmSync(temp,{recursive:true,force:true});
  }
})().catch(e=>{console.error(e);process.exitCode=1});
