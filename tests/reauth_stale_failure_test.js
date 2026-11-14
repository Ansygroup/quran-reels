'use strict';
/* Reproduces current stale invalid_grant attribution; no real auth/network/DB. */
const assert=require('node:assert/strict');process.env.TOKEN_ENC_KEY='fixture-reauth-race';
const realNow=Date.now;let now=Date.parse('2026-11-07T12:00:00Z');Date.now=()=>now;
const {seal}=require('../lib/crypt');let checks=[],queueErrors=[],current;
const db=require.resolve('../lib/db');require.cache[db]={id:db,filename:db,loaded:true,exports:{
 q:async(sql,params)=>{assert.match(sql,/insert into system_checks/);checks.push({detail:JSON.parse(params[0]),created_at:new Date(now).toISOString()});return []},q1:async()=>null,
 rest:async(path)=>{
  if(path.includes('/social_connections?'))return [current];
  if(path.includes('kind=eq.reauth_needed'))return checks;
  if(path.includes('select=platform,connection_id,error,updated_at'))return queueErrors;
  return [];
 }
}};
const pub=require('../lib/publish'),api=require('../api/autopilot');let release;global.fetch=()=>new Promise(r=>release=r);
(async()=>{
 current={id:'c1',user_id:'owner',platform:'youtube',account_name:'fixture',updated_at:new Date(now).toISOString(),access_token:seal('old-access'),refresh_token:seal('old-refresh'),expires_at:0};
 const attempt=pub.__test.refreshIfNeeded({...current});assert.equal(typeof release,'function');
 // New credentials are saved before the response for old credentials arrives.
 now+=1000;current={...current,updated_at:new Date(now).toISOString(),access_token:seal('new-access'),refresh_token:seal('new-refresh')};
 now+=1000;release({ok:false,status:400,json:async()=>({error:'invalid_grant'})});await assert.rejects(attempt,/انتهت صلاحية ربط/);
 assert.equal(checks.length,1);assert.equal(checks[0].detail.connection_id,'c1');assert(Date.parse(checks[0].created_at)>Date.parse(current.updated_at));
 // This deliberately demonstrates the limitation: current API only compares
 // the error's write time, not the credential generation that failed.
 let data=await api.__test.accountData('owner');assert(data.reauth.includes('youtube'));
 checks=[];now+=1000;queueErrors=[{platform:'youtube',connection_id:'c1',error:'invalid_grant',updated_at:new Date(now).toISOString()}];data=await api.__test.accountData('owner');assert(data.reauth.includes('youtube'),'late queue error is another independent source');
 console.log('ALL OK: mocked delayed failure demonstrates platform warning can refer to pre-relink credentials');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>{Date.now=realNow});
