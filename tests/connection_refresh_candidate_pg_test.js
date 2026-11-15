/* Candidate CAS on disposable PostgreSQL over a Unix socket only; not PostgREST or production. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawn,spawnSync}=require('node:child_process'),{Client}=require('pg');
const bin=process.env.PG_BIN_DIR,lib=process.env.PG_LIB_DIR||'';if(!bin){console.error('PG_BIN_DIR required');process.exit(1)}
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'qr-refresh-candidate-pg-')),data=path.join(tmp,'data');
const env={...process.env,LD_LIBRARY_PATH:[lib,process.env.LD_LIBRARY_PATH].filter(Boolean).join(':')};
const init=spawnSync(path.join(bin,'initdb'),['-D',data,'--no-sync','--no-locale','--encoding=UTF8','--auth=trust'],{env,encoding:'utf8'});
if(init.status!==0){console.error(init.stderr||init.stdout);fs.rmSync(tmp,{recursive:true,force:true});process.exit(1)}
const server=spawn(path.join(bin,'postgres'),['-D',data,'-k',tmp,'-h','','-p','5439','-F'],{env,stdio:['ignore','ignore','pipe']});let logs='';server.stderr.on('data',c=>logs+=c);
const ready=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('PostgreSQL timeout: '+logs)),20000);server.stderr.on('data',()=>{if(logs.includes('database system is ready to accept connections')){clearTimeout(timer);resolve()}});server.once('exit',code=>{clearTimeout(timer);reject(Error('PostgreSQL exited '+code+': '+logs))})});
const U='11111111-1111-4111-8111-111111111111',V='22222222-2222-4222-8222-222222222222',A='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',B='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const rpc=async(c,a)=>(await c.query('select public.connection_refresh_commit_candidate($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) result',a)).rows[0].result;
const blocked=async p=>assert.equal(await Promise.race([p.then(()=>false,()=>false),new Promise(r=>setTimeout(()=>r(true),150))]),true,'competing transaction should wait for the row');
(async()=>{const clients=[];try{
 await ready;for(let i=0;i<3;i++){const c=new Client({host:tmp,port:5439,user:os.userInfo().username,database:'postgres'});await c.connect();clients.push(c)}const [admin,a,b]=clients;
 await admin.query(`create role anon; create role authenticated; create role service_role bypassrls;
 create table public.social_connections(id uuid primary key,user_id uuid not null,platform text not null,account_id text not null,access_token text not null,refresh_token text not null,expires_at bigint,updated_at timestamptz not null);
 insert into public.social_connections values ('${A}','${U}','youtube','fixture-id','old-access','old-refresh',100,'2026-01-01 00:00:00.123456+00'),('${B}','${V}','youtube','fixture-id','other-access','other-refresh',100,'2026-01-01 00:00:00.123456+00');`);
 await admin.query(fs.readFileSync('sql/operations/candidate_connection_refresh_commit.sql','utf8'));
 await a.query('set role service_role');await b.query('set role service_role');
 const snapshot=async()=>{const r=(await admin.query('select access_token,refresh_token,expires_at::text,updated_at::text from public.social_connections where id=$1',[A])).rows[0];return [U,A,'youtube','fixture-id',r.access_token,r.refresh_token,r.expires_at,r.updated_at,'new-access',null,'200']};
 let args=await snapshot();
 for(const [index,val] of [[0,V],[1,B],[2,'x'],[3,'other-id'],[4,'other-access'],[5,'other-refresh'],[6,'999'],[7,'2026-01-01 00:00:00.123455+00']]){const copy=[...args];copy[index]=val;assert.deepEqual(await rpc(a,copy),{outcome:'conflict'})}
 for(const [index,val] of [[0,null],[2,'facebook'],[3,''],[4,''],[5,null],[7,null],[8,''],[8,args[4]],[9,''],[10,'0'],[8,'x'.repeat(16385)]]){const copy=[...args];copy[index]=val;assert.deepEqual(await rpc(a,copy),{outcome:'invalid'})}
 for(const role of ['anon','authenticated']){await admin.query(`set role ${role}`);await assert.rejects(rpc(admin,args),/permission denied/);await admin.query('reset role')}
 // New access with omitted refresh preserves the current encrypted refresh.
 assert.deepEqual(await rpc(a,args),{outcome:'updated'});let row=(await admin.query('select * from public.social_connections where id=$1',[A])).rows[0];assert.equal(row.access_token,'new-access');assert.equal(row.refresh_token,'old-refresh');
 assert.deepEqual(await rpc(a,args),{outcome:'conflict'},'replaying a lost successful response is ambiguous, not a second update');
 args=await snapshot();args[8]='rotated-access';args[9]='rotated-refresh';assert.deepEqual(await rpc(a,args),{outcome:'updated'});row=(await admin.query('select * from public.social_connections where id=$1',[A])).rows[0];assert.equal(row.refresh_token,'rotated-refresh');
 await admin.query('update public.social_connections set expires_at=null where id=$1',[A]);args=await snapshot();assert.equal(args[6],null);args[8]='null-expiry-access';assert.deepEqual(await rpc(a,args),{outcome:'updated'});
 // Two cooperating workers read the same version: only one may commit.
 args=await snapshot();const second=[...args];args[8]='worker-a';args[9]='refresh-a';second[8]='worker-b';second[9]='refresh-b';
 await a.query('begin');await b.query('begin');assert.deepEqual(await rpc(a,args),{outcome:'updated'});const competing=rpc(b,second);await blocked(competing);await a.query('commit');assert.deepEqual(await competing,{outcome:'conflict'});await b.query('commit');
 row=(await admin.query('select * from public.social_connections where id=$1',[A])).rows[0];assert.equal(row.access_token,'worker-a');assert.equal(row.refresh_token,'refresh-a');
 // Even without an updated_at change, a legacy relink before the CAS is detected.
 args=await snapshot();await admin.query("update public.social_connections set access_token='legacy-relink' where id=$1",[A]);assert.deepEqual(await rpc(a,args),{outcome:'conflict'});
 // A legacy writer AFTER the CAS is not guarded: deliberately demonstrate it.
 args=await snapshot();args[8]='guarded-access';assert.deepEqual(await rpc(a,args),{outcome:'updated'});await admin.query("update public.social_connections set refresh_token='legacy-stale' where id=$1",[A]);assert.equal((await admin.query('select refresh_token from public.social_connections where id=$1',[A])).rows[0].refresh_token,'legacy-stale');
 // Deletion is a conflict, but delete/recreate with an identical snapshot is
 // indistinguishable (ABA): a server-owned generation is still needed.
 args=await snapshot();const original=(await admin.query('select id,user_id,platform,account_id,access_token,refresh_token,expires_at::text,updated_at::text from public.social_connections where id=$1',[A])).rows[0];await admin.query('delete from public.social_connections where id=$1',[A]);assert.deepEqual(await rpc(a,args),{outcome:'conflict'});
 await admin.query('insert into public.social_connections(id,user_id,platform,account_id,access_token,refresh_token,expires_at,updated_at) values($1,$2,$3,$4,$5,$6,$7,$8)',Object.values(original));assert.deepEqual(await rpc(a,args),{outcome:'updated'},'identical replacement is not distinguishable');
 assert.equal((await admin.query('select access_token from public.social_connections where id=$1',[B])).rows[0].access_token,'other-access');
 console.log('ALL OK: candidate refresh CAS, role restrictions and concurrent conflict on isolated PostgreSQL; legacy-writer and ABA limits demonstrated');
}finally{
 for(const c of clients)await c.end().catch(()=>{});server.kill('SIGTERM');await new Promise(resolve=>{if(server.exitCode!==null)return resolve();server.once('exit',resolve);setTimeout(()=>{server.kill('SIGKILL');resolve()},5000).unref()});fs.rmSync(tmp,{recursive:true,force:true});
}})().catch(e=>{console.error(e);process.exitCode=1});
