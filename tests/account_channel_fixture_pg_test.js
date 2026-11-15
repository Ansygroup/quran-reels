/* Exact PostgREST channel fixture on disposable local PostgreSQL, using SQL only.
   This is NOT an HTTP/PostgREST or production test. */
'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const {spawn, spawnSync} = require('node:child_process'), {Client} = require('pg');
const bin = process.env.PG_BIN_DIR, lib = process.env.PG_LIB_DIR || '';
if (!bin) { console.error('PG_BIN_DIR required'); process.exit(1); }
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'qr-channel-fixture-pg-'));
const data = path.join(tmp, 'data');
const env = {...process.env, LD_LIBRARY_PATH:[lib,process.env.LD_LIBRARY_PATH].filter(Boolean).join(':')};
const init = spawnSync(path.join(bin, 'initdb'), ['-D',data,'--no-sync','--no-locale','--encoding=UTF8','--auth=trust'], {env, encoding:'utf8'});
if (init.status !== 0) { console.error(init.stderr || init.stdout); fs.rmSync(tmp,{recursive:true,force:true}); process.exit(1); }
// Unix socket only: never connect to a network database.
const server = spawn(path.join(bin,'postgres'), ['-D',data,'-k',tmp,'-h','','-p','5438','-F'], {env,stdio:['ignore','ignore','pipe']});
let logs=''; server.stderr.on('data', c => { logs += c; });
const ready = new Promise((resolve,reject) => {
  const timer=setTimeout(()=>reject(Error('PostgreSQL timeout: '+logs)),20000);
  server.stderr.on('data',()=>{if(logs.includes('database system is ready to accept connections')) {clearTimeout(timer);resolve();}});
  server.once('exit', code=>{clearTimeout(timer);reject(Error('PostgreSQL exited '+code+': '+logs));});
});
const U='11111111-1111-4111-8111-111111111111', V='22222222-2222-4222-8222-222222222222';
const A='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', B='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', C='cccccccc-cccc-4ccc-8ccc-cccccccccccc', Q='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
(async()=>{const clients=[];try{
  await ready;
  for (let i=0;i<4;i++) {const c=new Client({host:tmp,port:5438,user:os.userInfo().username,database:'postgres'});await c.connect();clients.push(c);}
  const [admin,user,service,otherService]=clients;
  for (const file of ['tests/postgrest_channel_fixture.sql','sql/operations/candidate_account_default.sql','sql/operations/candidate_account_queue_target.sql','sql/operations/candidate_account_disconnect.sql']) await admin.query(fs.readFileSync(file,'utf8'));
  // Follow the same role and synthetic JWT claim model as the HTTP fixture.
  await user.query('set role authenticated');
  await user.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:U,role:'authenticated'})]);
  let rows=(await user.query('select id, access_token from public.social_connections order by id')).rows;
  assert.deepEqual(rows.map(r=>r.id),[A,B]); assert(rows.every(r=>r.access_token==='fixture-ciphertext'));
  assert.equal((await user.query('update public.social_connections set is_default=false where id=$1 returning id',[C])).rowCount,0);
  await assert.rejects(user.query('select public.account_set_default_candidate($1,$2,$3)',[U,B,A]),/permission denied/);
  await assert.rejects(user.query('select public.account_disconnect_candidate($1,$2)',[U,A]),/permission denied/);
  await user.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:V,role:'authenticated'})]);
  assert.deepEqual((await user.query('select id from public.social_connections order by id')).rows.map(r=>r.id),[C]);
  // Apply ACL in this throwaway cluster only; not a production migration.
  await admin.query(fs.readFileSync('sql/operations/candidate_account_table_acl.sql','utf8'));
  for (const sql of ['select * from public.social_connections','select access_token from public.social_connections','select * from public.publish_queue','delete from public.social_connections','truncate public.social_connections, public.publish_queue']) await assert.rejects(user.query(sql),/permission denied/);
  await user.query('set role anon');
  for (const sql of ['select * from public.social_connections','select * from public.publish_queue']) await assert.rejects(user.query(sql),/permission denied/);
  await service.query('set role service_role');
  const def=async(userId,id,expected)=>(await service.query('select public.account_set_default_candidate($1,$2,$3) result',[userId,id,expected])).rows[0].result;
  const disconnect=async(userId,id)=>(await service.query('select public.account_disconnect_candidate($1,$2) result',[userId,id])).rows[0].result;
  assert.equal((await def(U,B,A)).outcome,'updated');
  assert.equal((await def(U,C,B)).outcome,'not_found');
  assert.equal((await service.query("insert into public.publish_queue(id,user_id,platform,status,connection_id) values ($1,$2,'youtube','scheduled',null) returning connection_id",[Q,U])).rows[0].connection_id,B);
  await assert.rejects(service.query('delete from public.social_connections where id=$1',[B]),/queue target is immutable/);
  assert.equal((await disconnect(U,C)).outcome,'not_found');
  assert.equal((await disconnect(U,B)).outcome,'dependent_tasks');
  assert.equal((await disconnect(U,A)).outcome,'deleted');
  assert.equal((await disconnect(U,A)).outcome,'not_found');
  await assert.rejects(service.query("insert into public.publish_queue(id,user_id,platform,status,connection_id) values ($1,$2,'youtube','scheduled',$3)",['eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',U,A]),/queue target not found/);
  assert.equal((await admin.query('select connection_id from public.publish_queue where id=$1',[Q])).rows[0].connection_id,B);
  assert.equal((await admin.query('select count(*)::int n from public.social_connections where id=$1',[C])).rows[0].n,1);
  // Concurrent operations in the same fixture: both transaction orderings.
  await admin.query("insert into public.social_connections(id,user_id,platform,is_default) values ($1,$2,'youtube',false)",[A,U]);
  await otherService.query('set role service_role');
  const blocked = async p => assert.equal(await Promise.race([p.then(()=>false,()=>false),new Promise(r=>setTimeout(()=>r(true),150))]),true,'second transaction should wait');
  const q2='ffffffff-ffff-4fff-8fff-ffffffffffff';
  await service.query('begin'); await otherService.query('begin');
  await service.query("insert into public.publish_queue(id,user_id,platform,status,connection_id) values ($1,$2,'youtube','scheduled',$3)",[q2,U,A]);
  const waitDelete=otherService.query('select public.account_disconnect_candidate($1,$2) result',[U,A]);
  await blocked(waitDelete); await service.query('commit');
  assert.equal((await waitDelete).rows[0].result.outcome,'dependent_tasks'); await otherService.query('commit');
  assert.equal((await admin.query('select connection_id from public.publish_queue where id=$1',[q2])).rows[0].connection_id,A);
  await admin.query('delete from public.publish_queue where id=$1',[q2]);
  await service.query('begin'); await otherService.query('begin');
  assert.equal((await disconnect(U,A)).outcome,'deleted');
  const waitInsert=otherService.query("insert into public.publish_queue(id,user_id,platform,status,connection_id) values ($1,$2,'youtube','scheduled',$3)",[q2,U,A]);
  await blocked(waitInsert); await service.query('commit');
  await assert.rejects(waitInsert,/queue target not found/); await otherService.query('rollback');
  assert.equal((await admin.query('select count(*)::int n from public.publish_queue where id=$1',[q2])).rows[0].n,0);
  console.log('ALL OK: exact candidate channel fixture/ACLs and disconnect races on isolated PostgreSQL via SQL only; no PostgREST, provider or production access');
} finally {
  for (const c of clients) await c.end().catch(()=>{});
  server.kill('SIGTERM');await new Promise(resolve=>{if(server.exitCode!==null)return resolve();server.once('exit',resolve);setTimeout(()=>{server.kill('SIGKILL');resolve();},5000).unref();});
  fs.rmSync(tmp,{recursive:true,force:true});
}})().catch(e=>{console.error(e);process.exitCode=1;});
