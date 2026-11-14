/* Two-connection PostgreSQL concurrency test. Temporary cluster, no network. */
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const {spawn,spawnSync} = require('node:child_process');
const {Client}=require('pg');
const bin=process.env.PG_BIN_DIR,lib=process.env.PG_LIB_DIR||'';
if(!bin){console.error('PG_BIN_DIR is required');process.exit(1)}
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'qr-telegram-pg-')),data=path.join(temp,'data');
const env={...process.env,LD_LIBRARY_PATH:[lib,process.env.LD_LIBRARY_PATH].filter(Boolean).join(':')};
const init=spawnSync(path.join(bin,'initdb'),['-D',data,'--no-sync','--no-locale','--encoding=UTF8','--auth=trust'],{env,encoding:'utf8'});
if(init.status!==0){console.error(init.stderr||init.stdout);fs.rmSync(temp,{recursive:true,force:true});process.exit(1)}
const server=spawn(path.join(bin,'postgres'),['-D',data,'-k',temp,'-h','','-p','5433','-F'],{env,stdio:['ignore','ignore','pipe']});let logs='';server.stderr.on('data',b=>logs+=b);
const ready=new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(Error('PostgreSQL timeout: '+logs)),20000);server.stderr.on('data',()=>{if(logs.includes('database system is ready to accept connections')){clearTimeout(t);resolve()}});server.once('exit',code=>{clearTimeout(t);reject(Error('PostgreSQL exited '+code+': '+logs))})});
const user='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222',c1='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',c2='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const waiting=async promise=>assert.equal(await Promise.race([promise.then(()=>false),new Promise(r=>setTimeout(()=>r(true),150))]),true,'competing transaction must wait');
(async()=>{const clients=[];try{
 await ready;for(let i=0;i<3;i++){const c=new Client({host:temp,port:5433,user:os.userInfo().username,database:'postgres'});await c.connect();clients.push(c)}
 const [a,b,admin]=clients;
 await admin.query('create role anon; create role authenticated; create role service_role bypassrls; create table public.social_connections(id uuid primary key,user_id uuid not null,platform text not null,account_id text not null);');
 await admin.query('insert into public.social_connections values ($1,$2,$3,$4),($5,$2,$3,$4)',[c1,user,'telegram','-10012345',c2]);
 await admin.query(fs.readFileSync('sql/operations/candidate_telegram_outbox.sql','utf8'));
 await a.query('set role service_role');await b.query('set role service_role');
 const prepare=(db,c,p)=>db.query('select * from public.telegram_prepare_candidate($1,$2,$3)',[user,c,p]);
 const claim=(db,id)=>db.query('select * from public.telegram_claim_candidate($1,$2)',[user,id]);
 const file=`${user}/video.mp4`;
 await a.query('begin');await b.query('begin');const first=await prepare(a,c1,file);const competing=prepare(b,c2,file);await waiting(competing);await a.query('commit');const second=await competing;await b.query('commit');
 assert(second.rows.length===0||second.rows[0].id===first.rows[0].id,'race must not create two deliveries');
 assert.equal((await admin.query('select count(*)::int n from public.telegram_delivery_candidate')).rows[0].n,1);
 assert.equal((await prepare(b,c2,file)).rows[0].id,first.rows[0].id);
 const id=first.rows[0].id;
 await a.query('begin');await b.query('begin');assert.equal((await claim(a,id)).rows.length,1);const raced=claim(b,id);await waiting(raced);await a.query('commit');assert.equal((await raced).rows.length,0);await b.query('commit');
 assert.equal((await prepare(b,c2,file)).rows[0].state,'sending');
 assert.equal((await b.query('select * from public.telegram_claim_candidate($1,$2)',[other,id])).rows.length,0);
 assert.equal((await b.query('select * from public.telegram_finish_candidate($1,$2,$3,$4)',[user,id,'uncertain',null])).rows[0].state,'uncertain');
 assert.equal((await claim(a,id)).rows.length,0);
 await assert.rejects(a.query('select * from public.telegram_delivery_candidate'),/permission denied/);
 await admin.query('set role authenticated');await assert.rejects(admin.query('select * from public.telegram_prepare_candidate($1,$2,$3)',[user,c1,file]),/permission denied/);await admin.query('reset role');
 console.log('ALL OK: isolated PostgreSQL concurrent prepare/claim, duplicate guard and ACLs');
}finally{for(const c of clients)await c.end().catch(()=>{});server.kill('SIGTERM');await new Promise(resolve=>{if(server.exitCode!==null)return resolve();server.once('exit',resolve);setTimeout(()=>{server.kill('SIGKILL');resolve()},5000).unref()});fs.rmSync(temp,{recursive:true,force:true})}})().catch(e=>{console.error(e);process.exitCode=1});
