/* Isolated OAuth start: header authentication + cookie; no provider or network. */
const assert=require('node:assert/strict');
process.env.GOOGLE_CLIENT_ID='fixture-id';process.env.GOOGLE_CLIENT_SECRET='fixture-secret';
process.env.SITE_ORIGIN='https://example.test';process.env.TOKEN_ENC_KEY='fixture-only-key';
const sess=require.resolve('../lib/sess');require.cache[sess]={id:sess,filename:sess,loaded:true,exports:{getUserId:async req=>req.headers.authorization==='Bearer fixture-session'?'fixture-user':null}};
const handler=require('../api/_oauth_start');
async function invoke(method,url,headers={}){const res={headers:{},setHeader(k,v){this.headers[k.toLowerCase()]=v},end(s){this.body=s}};await handler({method,url,headers},res);return res}
(async()=>{
 let r=await invoke('POST','/api/gw?op=start&p=youtube',{authorization:'Bearer fixture-session'});
 assert.equal(r.statusCode,200);assert.equal(r.headers['cache-control'],'no-store');assert.match(r.headers['set-cookie'],/HttpOnly; Secure; SameSite=Lax/);
 const u=new URL(JSON.parse(r.body).url);assert.equal(u.hostname,'accounts.google.com');assert.equal(u.searchParams.get('redirect_uri'),'https://example.test/api/oauth/callback');assert(u.searchParams.get('state'));assert(!r.body.includes('fixture-session'));assert(!r.headers['set-cookie'].includes('fixture-session'));
 assert.equal((await invoke('POST','/api/gw?op=start&p=youtube?t=fixture-session')).statusCode,401);
 assert.equal((await invoke('POST','/api/gw?op=start&p=youtube&t=fixture-session',{authorization:'Bearer fixture-session'})).statusCode,401);
 assert.equal((await invoke('PUT','/api/gw?op=start&p=youtube',{authorization:'Bearer fixture-session'})).statusCode,405);
 delete process.env.GOOGLE_CLIENT_ID;
 r=await invoke('POST','/api/gw?op=start&p=youtube',{authorization:'Bearer fixture-session'});assert.equal(r.statusCode,503);assert(!r.headers.location);
 console.log('ALL OK: authenticated OAuth start uses header, no session in URL, signed cookie and configured provider (mock auth)');
})().catch(e=>{console.error(e);process.exitCode=1});
