'use strict';
/* Real local start and callback handlers; fake auth, clock, provider and DB. */
const assert=require('node:assert/strict');
process.env.TOKEN_ENC_KEY='fixture-oauth-deadline-key';process.env.SITE_ORIGIN='https://app.example.test';
for(const [key,val] of Object.entries({GOOGLE_CLIENT_ID:'id',GOOGLE_CLIENT_SECRET:'secret',META_APP_ID:'id',META_APP_SECRET:'secret',TIKTOK_CLIENT_KEY:'id',TIKTOK_CLIENT_SECRET:'secret',X_CLIENT_ID:'id',X_CLIENT_SECRET:'secret'}))process.env[key]=val;
const sess=require.resolve('../lib/sess');require.cache[sess]={id:sess,filename:sess,loaded:true,exports:{getUserId:async()=> 'fixture-owner'}};
let dbCalls=0;const db=require.resolve('../lib/db');require.cache[db]={id:db,filename:db,loaded:true,exports:{q:async()=>{dbCalls++;throw Error('unexpected DB access')},q1:async()=>{dbCalls++;throw Error('unexpected DB access')}}};
const {sign}=require('../lib/crypt');const oauth=require('../lib/oauth');const start=require('../api/_oauth_start');const callback=require('../api/oauth/callback');
let requests=[];global.fetch=async(url)=>{requests.push(String(url));return {ok:false,json:async()=>({})}};
const realNow=Date.now;let now=1800000000000;Date.now=()=>now;
function response(){return {headers:{},setHeader(k,v){this.headers[k.toLowerCase()]=v},end(body){this.body=body;this.ended=true}}}
function cookie(name,body){const payload=Buffer.from(JSON.stringify(body)).toString('base64url');return `qr_${name}_st=${payload}.${sign(payload)}`}
async function callCallback(state,cookieValue){const r=response();await callback({url:`/api/oauth/callback?code=fixture-code&state=${encodeURIComponent(state)}`,headers:{cookie:cookieValue}},r);return r}
(async()=>{
 for(const name of ['youtube','meta','tiktok','x']){
  const r=response();await start({method:'POST',url:`/api/gw?op=start&p=${name}`,headers:{authorization:'Bearer fixture'}},r);assert.equal(r.statusCode,200);assert.match(r.headers['set-cookie'],/Max-Age=900/);
  const value=JSON.parse(r.body),state=new URL(value.url).searchParams.get('state');const original=r.headers['set-cookie'].split(';')[0];
  const saved=oauth.readStCookie({headers:{cookie:original}},name);assert.equal(saved.t,now);assert.equal(saved.r,state);assert.equal(saved.u,'fixture-owner');
  requests=[];const valid=await callCallback(state,original);assert.equal(valid.statusCode,302);assert.match(valid.headers.location,/w=token/);assert.equal(requests.length,1,'valid state reaches mocked provider');assert.equal(dbCalls,0);
  // This check is not server-side consumption: repeat inside the window still reaches the provider.
  requests=[];const repeated=await callCallback(state,original);assert.match(repeated.headers.location,/w=token/);assert.equal(requests.length,1);
  now+=899999;requests=[];const nearLimit=await callCallback(state,original);assert.match(nearLimit.headers.location,/w=token/);assert.equal(requests.length,1);
  // At the exact limit, the callback must fail before any provider or database call.
  now++;requests=[];const expired=await callCallback(state,original);assert.equal(expired.statusCode,302);assert.match(expired.headers.location,/w=state/);assert.equal(requests.length,0);assert.equal(dbCalls,0);now-=900000;
  for(const val of ['%XX',original.slice(original.indexOf('=')+1).split('.')[0]+'.bad']){
   const malformed=val==='%XX'?`qr_${name}_st=${val}`:`qr_${name}_st=${val}`;requests=[];const invalid=await callCallback(state,malformed);assert.match(invalid.headers.location,/w=state/);assert.equal(requests.length,0);
  }
  requests=[];const wrong=await callCallback(name+'.different',original);assert.match(wrong.headers.location,/w=state/);assert.equal(requests.length,0);
 }
 const name='youtube',state='youtube.fixture';
 function check(t,expected,extra={}){const value=cookie(name,{n:name,u:'fixture-owner',r:state,m:{},t,...extra}),req={headers:{cookie:value}};assert.equal(oauth.stCookieValid(req,name,oauth.readStCookie(req,name)),expected,JSON.stringify({t,extra}));}
 check(now,true);check(now-899999,true);check(now-900000,false);check(now-900001,false);
 check(now+60000,true);check(now+60001,false);check(0,false);check(-1,false);check('1800000000000',false);check(null,false);check(1.5,false);check(Number.MAX_SAFE_INTEGER+1,false);
 check(now,false,{u:''});check(now,false,{u:123});check(now,false,{r:''});check(now,false,{r:123});check(now,false,{n:'meta'});
 // A signed value with no timestamp is legacy malformed state, not a perpetual grant.
 const noTime=cookie(name,{n:name,u:'fixture-owner',r:state,m:{}}),req={headers:{cookie:noTime}};assert.equal(oauth.stCookieValid(req,name,oauth.readStCookie(req,name)),false);
 assert.equal(dbCalls,0);console.log('ALL OK: OAuth signed state age, clock-skew boundaries and callback fail-closed for all providers (mocked)');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>{Date.now=realNow});
