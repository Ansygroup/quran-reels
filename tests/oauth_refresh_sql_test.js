'use strict';
/* Execute callback-generated conflict SQL in disposable PGlite; no network/database. */
const assert=require('node:assert/strict');const {PGlite}=require('@electric-sql/pglite');
process.env.TOKEN_ENC_KEY='fixture-only';process.env.SITE_ORIGIN='https://example.test';Object.assign(process.env,{X_CLIENT_ID:'id',X_CLIENT_SECRET:'secret',TIKTOK_CLIENT_KEY:'id',TIKTOK_CLIENT_SECRET:'secret'});
let pg;const sqlLog=[];
const db=require.resolve('../lib/db');require.cache[db]={id:db,filename:db,loaded:true,exports:{q:async(sql,args)=>{sqlLog.push(sql);const params=[...args];params[3]=JSON.stringify(params[3]);return (await pg.query(sql,params)).rows}}};
const def=require.resolve('../lib/soc_default');const d=()=>{};d.ensureDefault=async()=>true;require.cache[def]={id:def,filename:def,loaded:true,exports:d};
const auto=require.resolve('../lib/autopilot');require.cache[auto]={id:auto,filename:auto,loaded:true,exports:{enableDefaultAutomation:async()=> 'created'}};
const oauth=require('../lib/oauth'),{seal,open}=require('../lib/crypt');const callbacks={x:require('../lib/cb_x'),tiktok:require('../lib/cb_tiktok')};
const response=j=>({ok:true,json:async()=>j});
global.fetch=async(url,opts={})=>{const u=new URL(String(url));if(/\/token\/?$/.test(u.pathname)){const code=opts.body.get('code');return response({access_token:'access-'+code,...(code==='new'?{refresh_token:'new-refresh'}:{}),open_id:'open-A'})}if(u.hostname==='api.x.com')return response({data:{id:'123',username:'fixture'}});if(u.hostname==='open.tiktokapis.com')return response({data:{user:{open_id:'open-A'}}});throw Error('unexpected network')};
async function run(provider,code,owner='owner-1'){const st=provider+'.state',cookie=oauth.setStCookie(null,provider,owner,st,{}).split(';')[0],out={headers:{},setHeader(k,v){this.headers[k.toLowerCase()]=v},end(){}};await callbacks[provider]({url:`/api/oauth/callback?code=${code}&state=${st}`,headers:{cookie}},out);assert.equal(out.headers.location,`/#/account?linked=${provider}`)}
(async()=>{pg=new PGlite();try{
 await pg.exec(`create table social_connections (user_id text not null, platform text not null, account_id text not null, account_name text, meta jsonb, access_token text, refresh_token text not null default '', expires_at bigint, scopes text, updated_at timestamptz, unique(user_id,platform,account_id));`);
 for(const provider of ['x','tiktok']){
  const id=provider==='x'?'123':'open-A',old=seal('old-refresh');await pg.query('insert into social_connections(user_id,platform,account_id,refresh_token) values($1,$2,$3,$4)',['owner-1',provider,id,old]);
  await run(provider,'missing');let row=(await pg.query('select * from social_connections where user_id=$1 and platform=$2',['owner-1',provider])).rows[0];assert.equal(row.refresh_token,old);assert.equal(open(row.access_token),'access-missing');
  await run(provider,'new');row=(await pg.query('select * from social_connections where user_id=$1 and platform=$2',['owner-1',provider])).rows[0];assert.equal(open(row.refresh_token),'new-refresh');
  await run(provider,'missing');row=(await pg.query('select * from social_connections where user_id=$1 and platform=$2',['owner-1',provider])).rows[0];assert.equal(open(row.refresh_token),'new-refresh');
  await run(provider,'missing','owner-2');const other=(await pg.query('select refresh_token from social_connections where user_id=$1 and platform=$2',['owner-2',provider])).rows[0];assert(other);
 }
 assert(sqlLog.some(sql=>!sql.includes('refresh_token=excluded.refresh_token')));assert(sqlLog.some(sql=>sql.includes('refresh_token=excluded.refresh_token')));
 console.log('ALL OK: callback-generated SQL conflict updates preserve omitted refresh credentials in isolated PGlite');
}finally{await pg.close()}})().catch(e=>{console.error(e);process.exitCode=1});
