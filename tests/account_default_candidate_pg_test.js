/* Disposable PostgreSQL only. Tests candidate default RPC, not app or real PostgREST. */
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawn,spawnSync}=require('node:child_process');const {Client}=require('pg');
const bin=process.env.PG_BIN_DIR,lib=process.env.PG_LIB_DIR||'';
if(!bin){console.error('PG_BIN_DIR required');process.exit(1)}
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'qr-default-pg-')),data=path.join(tmp,'data');
const env={...process.env,LD_LIBRARY_PATH:[lib,process.env.LD_LIBRARY_PATH].filter(Boolean).join(':')};
const init=spawnSync(path.join(bin,'initdb'),['-D',data,'--no-sync','--no-locale','--encoding=UTF8','--auth=trust'],{env,encoding:'utf8'});
if(init.status!==0){console.error(init.stderr||init.stdout);fs.rmSync(tmp,{recursive:true,force:true});process.exit(1)}
const server=spawn(path.join(bin,'postgres'),['-D',data,'-k',tmp,'-h','','-p','5436','-F'],{env,stdio:['ignore','ignore','pipe']});let logs='';server.stderr.on('data',c=>logs+=c);
const ready=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('PostgreSQL timeout: '+logs)),20000);server.stderr.on('data',()=>{if(logs.includes('database system is ready to accept connections')){clearTimeout(timer);resolve()}});server.once('exit',code=>{clearTimeout(timer);reject(Error('PostgreSQL exited '+code+': '+logs))})});
const U='11111111-1111-4111-8111-111111111111',V='22222222-2222-4222-8222-222222222222',A='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',B='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',C='cccccccc-cccc-4ccc-8ccc-cccccccccccc',D='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const rpc=async(c,u,id,expected)=>(await c.query('select public.account_set_default_candidate($1,$2,$3) as result',[u,id,expected])).rows[0].result;
const pending=async p=>assert.equal(await Promise.race([p.then(()=>false),new Promise(r=>setTimeout(()=>r(true),150))]),true,'second transaction must wait');
(async()=>{const clients=[];try{
 await ready;for(let i=0;i<3;i++){const c=new Client({host:tmp,port:5436,user:os.userInfo().username,database:'postgres'});await c.connect();clients.push(c)}const [a,b,admin]=clients;
 await admin.query(`create role anon; create role authenticated; create role service_role bypassrls;
 create table public.social_connections(id uuid primary key,user_id uuid not null,platform text not null,is_default boolean not null default false);
 create unique index one_default on public.social_connections(user_id,platform) where is_default;
 create table public.publish_queue(id uuid primary key,user_id uuid not null,platform text not null,connection_id uuid references public.social_connections(id) on delete set null,status text);
 grant select,insert,update,delete on public.publish_queue to service_role;
 grant select on public.social_connections to service_role;
 insert into public.social_connections values ('${A}','${U}','youtube',true),('${B}','${U}','youtube',false),('${C}','${U}','youtube',false),('${D}','${V}','youtube',true);`);
 await admin.query(fs.readFileSync('sql/operations/candidate_account_default.sql','utf8'));
 await a.query('set role service_role');await b.query('set role service_role');
 assert.equal((await rpc(a,U,D,A)).outcome,'not_found');
 await a.query('begin');await b.query('begin');
 assert.equal((await rpc(a,U,B,A)).outcome,'updated');const race=rpc(b,U,C,A);await pending(race);
 // The uncommitted old default remains visible, not an empty intermediate state.
 assert.equal((await admin.query('select id from public.social_connections where user_id=$1 and is_default',[U])).rows[0].id,A);
 await a.query('commit');const conflict=await race;assert.equal(conflict.outcome,'conflict');assert.equal(conflict.current_id,B);await b.query('commit');
 assert.equal((await rpc(a,U,B,A)).outcome,'unchanged','lost-response repeat does not toggle back');
 await admin.query(`insert into public.publish_queue values ('${D}','${U}','youtube',null,'scheduled')`);
 assert.equal((await rpc(a,U,C,B)).outcome,'pending_implicit');
 await admin.query("update public.publish_queue set status='published'");
 await a.query('begin');assert.equal((await rpc(a,U,C,B)).outcome,'updated');await a.query('rollback');
 assert.equal((await admin.query('select id from public.social_connections where user_id=$1 and is_default',[U])).rows[0].id,B);
 // Deliberately demonstrate the blocker: an uncoordinated legacy writer can
 // insert an implicit pending task while the default transaction is open.
 // Therefore the RPC by itself MUST NOT be deployed or routed.
 await a.query('begin');assert.equal((await rpc(a,U,C,B)).outcome,'updated');
 await admin.query(`insert into public.publish_queue values ('${C}','${U}','youtube',null,'scheduled')`);
 await a.query('commit');
 assert.equal((await admin.query('select id from public.social_connections where user_id=$1 and is_default',[U])).rows[0].id,C);
 assert.equal((await admin.query("select count(*)::int n from public.publish_queue where user_id=$1 and connection_id is null and status='scheduled'",[U])).rows[0].n,1);
 // Add the proposed queue guard only in this throwaway database.
 await admin.query('delete from public.publish_queue');
 await admin.query(fs.readFileSync('sql/operations/candidate_account_queue_target.sql','utf8'));
 await a.query('begin');await b.query('begin');
 assert.equal((await rpc(a,U,B,C)).outcome,'updated');
 const insert=b.query("insert into public.publish_queue values ($1,$2,'youtube',null,'scheduled') returning connection_id",[A,U]);
 await pending(insert);await a.query('commit');assert.equal((await insert).rows[0].connection_id,B);await b.query('commit');
 // If insertion wins instead, the row keeps the old default even after change.
 await a.query('begin');await b.query('begin');
 assert.equal((await b.query("insert into public.publish_queue values ($1,$2,'youtube',null,'scheduled') returning connection_id",[B,U])).rows[0].connection_id,B);
 const change=rpc(a,U,C,B);await pending(change);await b.query('commit');assert.equal((await change).outcome,'updated');await a.query('commit');
 assert.equal((await admin.query('select connection_id from public.publish_queue where id=$1',[B])).rows[0].connection_id,B);
 await assert.rejects(a.query("insert into public.publish_queue values ($1,$2,'youtube',$3,'scheduled')",[D,U,D]),/queue target not found/);
 await assert.rejects(a.query("insert into public.publish_queue values ($1,$2,'tiktok',null,'scheduled')",[D,U]),/default queue target not found/);
 await assert.rejects(admin.query('delete from public.social_connections where id=$1',[B]),/queue target is immutable/);
 await assert.rejects(a.query('update public.publish_queue set connection_id=$1 where id=$2',[C,B]),/queue target is immutable/);
 await assert.rejects(a.query("update public.publish_queue set platform='tiktok' where id=$1",[B]),/queue target is immutable/);
 await assert.rejects(a.query('update public.publish_queue set user_id=$1 where id=$2',[V,B]),/queue target is immutable/);
 // Adding the guard does not resolve historical NULL tasks; refuse to publish one.
 await admin.query('alter table public.publish_queue disable trigger account_queue_target_candidate_insert');
 await admin.query("insert into public.publish_queue values ($1,$2,'youtube',null,'draft')",[C,U]);
 await admin.query('alter table public.publish_queue enable trigger account_queue_target_candidate_insert');
 await assert.rejects(a.query("update public.publish_queue set status='publishing' where id=$1",[C]),/legacy queue target requires review/);
 await admin.query('set role authenticated');await assert.rejects(admin.query('select public.account_set_default_candidate($1,$2,$3)',[U,A,B]),/permission denied/);await admin.query('reset role');
 // Model the observed production RLS/ACLs in the fixture, not actual data.
 await admin.query(`alter table public.social_connections add column access_token text not null default 'ciphertext-fixture';
 create schema auth; create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
 grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;
 alter table public.social_connections enable row level security; alter table public.publish_queue enable row level security;
 create policy sc_own on public.social_connections for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
 create policy pq_own on public.publish_queue for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
 grant select,insert,update,delete,truncate,references,trigger,maintain on public.social_connections,public.publish_queue to authenticated;
 grant select(access_token),update(platform) on public.social_connections to authenticated;
 create role account_test_inherited; grant select on public.social_connections to account_test_inherited; grant account_test_inherited to authenticated;`);
 await b.query('set role authenticated');await b.query("select set_config('test.uid',$1,false)",[U]);
 assert.equal((await b.query('select count(*)::int n from public.social_connections')).rows[0].n,3,'RLS filters other owners');
 assert.equal((await b.query('select access_token from public.social_connections limit 1')).rows[0].access_token,'ciphertext-fixture');
 // SQL TRUNCATE ignores RLS if direct database privileges are usable. PostgREST
 // has no ordinary TRUNCATE endpoint: this is not an HTTP exploit assertion.
 await b.query('begin');await b.query('truncate public.publish_queue,public.social_connections');await b.query('rollback');
 assert.equal((await admin.query('select count(*)::int n from public.social_connections')).rows[0].n,4,'test truncate was rolled back');
 const acl=fs.readFileSync('sql/operations/candidate_account_table_acl.sql','utf8');
 await assert.rejects(admin.query(acl),/retains SELECT/,'inherited grant must abort the proposed restriction');await admin.query('rollback');
 await admin.query('revoke select on public.social_connections from account_test_inherited');await admin.query(acl);
 for(const statement of ['select * from public.social_connections','select * from public.publish_queue',"update public.social_connections set is_default=false","delete from public.publish_queue",'truncate public.publish_queue,public.social_connections'])await assert.rejects(b.query(statement),/permission denied/);
 assert.equal((await a.query('select count(*)::int n from public.social_connections')).rows[0].n,4,'service access preserved');
 console.log('ALL OK: isolated PostgreSQL default/target races, RLS and column grants, inherited-privilege guard, revocation and service access');
}finally{for(const c of clients)await c.end().catch(()=>{});server.kill('SIGTERM');await new Promise(resolve=>{if(server.exitCode!==null)return resolve();server.once('exit',resolve);setTimeout(()=>{server.kill('SIGKILL');resolve()},5000).unref()});fs.rmSync(tmp,{recursive:true,force:true})}})().catch(e=>{console.error(e);process.exitCode=1});
