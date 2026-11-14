/* Disposable PostgreSQL only: candidate disconnect + queue trigger, not app/provider. */
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawn,spawnSync}=require('node:child_process');const {Client}=require('pg');
const bin=process.env.PG_BIN_DIR,lib=process.env.PG_LIB_DIR||'';
if(!bin){console.error('PG_BIN_DIR required');process.exit(1)}
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'qr-disconnect-pg-')),data=path.join(tmp,'data');
const env={...process.env,LD_LIBRARY_PATH:[lib,process.env.LD_LIBRARY_PATH].filter(Boolean).join(':')};
const init=spawnSync(path.join(bin,'initdb'),['-D',data,'--no-sync','--no-locale','--encoding=UTF8','--auth=trust'],{env,encoding:'utf8'});
if(init.status!==0){console.error(init.stderr||init.stdout);fs.rmSync(tmp,{recursive:true,force:true});process.exit(1)}
const server=spawn(path.join(bin,'postgres'),['-D',data,'-k',tmp,'-h','','-p','5437','-F'],{env,stdio:['ignore','ignore','pipe']});let logs='';server.stderr.on('data',c=>logs+=c);
const ready=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('PostgreSQL timeout: '+logs)),20000);server.stderr.on('data',()=>{if(logs.includes('database system is ready to accept connections')){clearTimeout(timer);resolve()}});server.once('exit',code=>{clearTimeout(timer);reject(Error('PostgreSQL exited '+code+': '+logs))})});
const U='11111111-1111-4111-8111-111111111111',V='22222222-2222-4222-8222-222222222222',A='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',B='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',C='cccccccc-cccc-4ccc-8ccc-cccccccccccc',Q='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const rpc=async(c,u,id)=>(await c.query('select public.account_disconnect_candidate($1,$2) result',[u,id])).rows[0].result;
const pending=async p=>assert.equal(await Promise.race([p.then(()=>false,()=>false),new Promise(r=>setTimeout(()=>r(true),150))]),true,'second transaction must wait');
(async()=>{const clients=[];try{
 await ready;for(let i=0;i<3;i++){const c=new Client({host:tmp,port:5437,user:os.userInfo().username,database:'postgres'});await c.connect();clients.push(c)}const [a,b,admin]=clients;
 await admin.query(`create role anon; create role authenticated; create role service_role bypassrls;
 create table public.social_connections(id uuid primary key,user_id uuid not null,platform text not null,is_default boolean not null default false,access_token text not null default 'fixture-only');
 create unique index one_default on public.social_connections(user_id,platform) where is_default;
 create table public.publish_queue(id uuid primary key,user_id uuid not null,platform text not null,connection_id uuid references public.social_connections(id) on delete set null,status text);
 grant select,insert,update,delete on public.publish_queue to service_role;
 insert into public.social_connections(id,user_id,platform,is_default) values ('${A}','${U}','youtube',true),('${B}','${U}','youtube',false),('${C}','${V}','youtube',true);`);
 await admin.query(fs.readFileSync('sql/operations/candidate_account_queue_target.sql','utf8'));
 await admin.query(fs.readFileSync('sql/operations/candidate_account_disconnect.sql','utf8'));
 await a.query('set role service_role');await b.query('set role service_role');
 assert.equal((await rpc(a,null,A)).outcome,'invalid');
 assert.equal((await rpc(a,U,C)).outcome,'not_found');
 assert.equal((await rpc(a,U,Q)).outcome,'not_found');
 await admin.query('set role authenticated');await assert.rejects(rpc(admin,U,A),/permission denied/);await admin.query('reset role');
 // Legacy NULL is ambiguous even if it says published; it blocks any same-platform disconnect.
 await admin.query('alter table public.publish_queue disable trigger account_queue_target_candidate_insert');
 await admin.query("insert into public.publish_queue values ($1,$2,'youtube',null,'published')",[Q,U]);
 await admin.query('alter table public.publish_queue enable trigger account_queue_target_candidate_insert');
 assert.equal((await rpc(a,U,A)).outcome,'legacy_unknown');
 assert.equal((await rpc(a,U,B)).outcome,'legacy_unknown');
 assert.equal((await admin.query('select count(*)::int n from public.social_connections where user_id=$1',[U])).rows[0].n,2);
 await admin.query('delete from public.publish_queue where id=$1',[Q]);
 // Every referenced status blocks deletion, including history and cancelled jobs.
 for(const status of ['scheduled','publishing','failed','published','cancelled']){
  await a.query("insert into public.publish_queue values ($1,$2,'youtube',$3,$4)",[Q,U,A,status]);
  assert.equal((await rpc(a,U,A)).outcome,'dependent_tasks',status);
  assert.equal((await admin.query('select access_token from public.social_connections where id=$1',[A])).rows[0].access_token,'fixture-only');
  await admin.query('delete from public.publish_queue where id=$1',[Q]);
 }
 // Insert first: disconnect waits, then rejects rather than nulling a target.
 await a.query('begin');await b.query('begin');
 assert.equal((await a.query("insert into public.publish_queue values ($1,$2,'youtube',null,'scheduled') returning connection_id",[Q,U])).rows[0].connection_id,A);
 const blockedDelete=rpc(b,U,A);await pending(blockedDelete);await a.query('commit');assert.equal((await blockedDelete).outcome,'dependent_tasks');await b.query('commit');
 assert.equal((await admin.query('select connection_id from public.publish_queue where id=$1',[Q])).rows[0].connection_id,A);
 await admin.query('delete from public.publish_queue where id=$1',[Q]);
 // Disconnect first: a concurrent explicit insert waits, then fails instead of
 // falling back to another channel after the original target is removed.
 await a.query('begin');await b.query('begin');assert.equal((await rpc(a,U,B)).outcome,'deleted');
 const delayedInsert=b.query("insert into public.publish_queue values ($1,$2,'youtube',$3,'scheduled')",[Q,U,B]);
 await pending(delayedInsert);await a.query('commit');await assert.rejects(delayedInsert,/queue target not found/);await b.query('rollback');
 assert.equal((await rpc(a,U,B)).outcome,'not_found','repeat is ambiguous, not a false deletion confirmation');
 assert.equal((await admin.query('select count(*)::int n from public.publish_queue')).rows[0].n,0);
 // No row dependencies: successful transaction remains reversible until commit.
 await a.query('begin');assert.equal((await rpc(a,U,A)).outcome,'deleted');await a.query('rollback');
 assert.equal((await admin.query('select count(*)::int n from public.social_connections where id=$1',[A])).rows[0].n,1);
 assert.equal((await rpc(a,U,A)).outcome,'deleted');
 assert.equal((await admin.query('select count(*)::int n from public.social_connections where id=$1',[C])).rows[0].n,1,'other user unaffected');
 // Demonstrate why the RPC alone must never be deployed: an unguarded NULL
 // insert can race its check. This is a throwaway fixture, not a workaround.
 await admin.query("insert into public.social_connections(id,user_id,platform,is_default) values ($1,$2,'youtube',true)",[A,U]);
 await admin.query('alter table public.publish_queue disable trigger account_queue_target_candidate_insert');
 await a.query('begin');assert.equal((await rpc(a,U,A)).outcome,'deleted');
 await admin.query("insert into public.publish_queue values ($1,$2,'youtube',null,'scheduled')",[Q,U]);
 await a.query('commit');
 assert.equal((await admin.query('select count(*)::int n from public.publish_queue where id=$1 and connection_id is null',[Q])).rows[0].n,1,'unguarded insert races disconnect');
 await admin.query('delete from public.publish_queue where id=$1',[Q]);await admin.query('alter table public.publish_queue enable trigger account_queue_target_candidate_insert');
 console.log('ALL OK: isolated disconnect ownership, legacy NULL, historical blockers, rollback, guarded races and unguarded race demonstration');
}finally{for(const c of clients)await c.end().catch(()=>{});server.kill('SIGTERM');await new Promise(resolve=>{if(server.exitCode!==null)return resolve();server.once('exit',resolve);setTimeout(()=>{server.kill('SIGKILL');resolve()},5000).unref()});fs.rmSync(tmp,{recursive:true,force:true})}})().catch(e=>{console.error(e);process.exitCode=1});
