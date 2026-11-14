/* Actual PGlite candidate SQL + candidate worker + Bot API adapter; no network.
 * The REST layer is an in-process adapter, not PostgREST or Supabase.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {PGlite} = require('@electric-sql/pglite');
const {seal,open} = require('../lib/crypt');
const {sendVideo} = require('../lib/telegram_candidate');
const {createTelegramDelivery} = require('../lib/telegram_delivery_candidate');
process.env.TOKEN_ENC_KEY='fixture-only';
const user='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222',conn='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const token='123456789:abcdefghijklmnopqrstuvwxyzABC123456';
const mp4=Buffer.concat([Buffer.from([0,0,0,12]),Buffer.from('ftypisom')]);
(async()=>{
 const db=new PGlite();let sends=0,mode='success',loseClaim=false,loseFinish=false;
 try {
  await db.exec('create role anon; create role authenticated; create role service_role; create table public.social_connections(id uuid primary key,user_id uuid not null,platform text not null,account_id text not null,access_token text not null); grant select on public.social_connections to service_role;');
  await db.query('insert into public.social_connections values ($1,$2,$3,$4,$5)',[conn,user,'telegram','-10012345',seal(token)]);
  await db.exec(fs.readFileSync('sql/operations/candidate_telegram_outbox.sql','utf8'));await db.exec('set role service_role');
  const database=async (path,opts={})=>{
    if(path.startsWith('/rest/v1/rpc/')){
      const name=path.split('/').pop(),args=JSON.parse(opts.body), param={
       telegram_prepare_candidate:[args.p_user_id,args.p_connection_id,args.p_video_path],
       telegram_claim_candidate:[args.p_user_id,args.p_id],
       telegram_finish_candidate:[args.p_user_id,args.p_id,args.p_state,args.p_message_id],
      }[name];
      assert(param,'unexpected RPC');
      const result=await db.query(`select * from public.${name}(${param.map((_,i)=>'$'+(i+1)).join(',')})`,param);
      if(name==='telegram_claim_candidate' && loseClaim){loseClaim=false;throw Error('lost claim response')}
      if(name==='telegram_finish_candidate' && loseFinish){loseFinish=false;throw Error('lost finish response')}
      return result.rows;
    }
    const u=new URL('http://local'+path); assert.equal(u.pathname,'/rest/v1/social_connections');
    const value=k=>{const s=u.searchParams.get(k);assert(s?.startsWith('eq.'));return s.slice(3)};
    assert.equal(value('platform'),'telegram');
    return (await db.query('select account_id,access_token from public.social_connections where user_id=$1 and id=$2 and platform=$3 and account_id=$4',[value('user_id'),value('id'),value('platform'),value('account_id')])).rows;
  };
  const mockedFetch=async(url,{body})=>{sends++;assert(url.endsWith('/sendVideo'));assert.equal(body.get('chat_id'),'-10012345');
    if(mode==='lost')throw Error(`lost ${token}`);
    if(mode==='rejected')return {ok:false,status:403,json:async()=>({ok:false,description:'rejected'})};
    return {ok:true,status:200,json:async()=>({ok:true,result:{message_id:sends,chat:{id:-10012345}}})};
  };
  let invalidVideo=false, validations=0;
  const worker=createTelegramDelivery({database,decrypt:open,readVideo:async()=>mp4,validateVideo:async b=>{validations++;assert.deepEqual(b,mp4);if(invalidVideo)throw Error('invalid media')},sendVideo:args=>sendVideo({...args,fetchImpl:mockedFetch})});
  const make=video=>({userId:user,connectionId:conn,videoPath:`${user}/${video}.mp4`,caption:'تلاوة'});
  const [a,b]=await Promise.all([worker(make('race')),worker(make('race'))]);
  assert.equal(sends,1);assert.equal([a,b].filter(x=>x.status==='sent').length,1);assert.equal([a,b].filter(x=>x.status==='review_required').length,1);
  assert.equal((await worker(make('race'))).status,'review_required');assert.equal(sends,1);
  mode='lost';assert.equal((await worker(make('lost'))).status,'review_required');assert.equal(sends,2);
  assert.equal((await worker(make('lost'))).status,'review_required');assert.equal(sends,2);
  mode='success';loseClaim=true;assert.equal((await worker(make('claim-lost'))).status,'review_required');assert.equal(sends,2);
  assert.equal((await worker(make('claim-lost'))).status,'review_required');assert.equal(sends,2);
  loseFinish=true;assert.equal((await worker(make('finish-lost'))).status,'review_required');assert.equal(sends,3);
  assert.equal((await worker(make('finish-lost'))).status,'review_required');assert.equal(sends,3);
  mode='rejected';assert.equal((await worker(make('rejected'))).status,'rejected');assert.equal(sends,4);
  assert.equal((await worker(make('rejected'))).status,'review_required');assert.equal(sends,4);
  assert.equal((await worker({...make('wrong'),userId:other})).status,'invalid');
  invalidVideo=true;assert.equal((await worker(make('invalid-media'))).status,'rejected');assert.equal(sends,4,'invalid media must never reach Telegram');assert(validations>=1);
  assert.throws(()=>createTelegramDelivery({database,decrypt:open,readVideo:async()=>mp4,sendVideo}),/dependency/);
  assert.equal(sends,4);
  console.log('ALL OK: candidate worker with actual PGlite outbox, concurrent claim and lost claim/send/finish; mocked transport only');
 } finally {await db.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
