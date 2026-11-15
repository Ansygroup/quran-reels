/* Candidate handler only; fake session, fake Telegram, in-memory database. */
const assert = require('node:assert/strict');
const { Readable } = require('node:stream');
const { makeHandler } = require('../lib/telegram_connect_candidate');
const { open } = require('../lib/crypt');
process.env.TOKEN_ENC_KEY = 'local-fixture-only';
const token='123456789:abcdefghijklmnopqrstuvwxyzABC123456';
const destination={id:'-10012345',type:'channel',name:'My channel',botId:'123456789'};
let calls=[], existing=[];
const db=async(path,opts={})=>{
  calls.push({path,opts});
  if (!opts.method) return existing;
  return [{id:'connection-1'}];
};
const handler=makeHandler({authenticate:async()=> 'user-a',database:db,inspect:async ({token:t,chatId})=>{assert.equal(t,token);assert.equal(chatId,'@mychannel');return destination;}});
async function request(body, extra={}) {
  const req=Readable.from([typeof body==='string'?body:JSON.stringify(body)]);
  Object.assign(req,{method:'POST',headers:{authorization:'Bearer fake-user-session'},...extra});
  const res={headers:{},setHeader(k,v){this.headers[k]=v},end(data){this.data=JSON.parse(data)}};
  await handler(req,res);return res;
}
(async()=>{
  let out=await request({token,chat_id:'@mychannel'});
  assert.equal(out.statusCode,200); assert.equal(out.data.automation_changed,false); assert.equal(calls.length,2);
  assert.equal(calls[1].path,'/rest/v1/social_connections?select=id');
  const insert=JSON.parse(calls[1].opts.body);
  assert.equal(insert.user_id,'user-a'); assert.equal(insert.account_id,'-10012345'); assert.equal(insert.is_default,false);
  assert.equal(open(insert.access_token),token); assert(!calls[1].opts.body.includes(token));
  assert.equal(JSON.parse(open(insert.meta)).type,'channel'); assert(!JSON.stringify(out.data).includes(token));
  assert.equal(out.headers['Cache-Control'],'no-store');
  existing=[{id:'connection-1'}]; calls=[];
  out=await request({token,chat_id:'@mychannel'},{body:{token,chat_id:'@mychannel'}});
  assert.equal(out.statusCode,200); assert.equal(calls[1].opts.method,'PATCH');
  assert.match(calls[1].path,/user_id=eq\.user-a/); assert.match(calls[1].path,/account_id=eq\.-10012345/); assert.match(calls[1].path,/id=eq\.connection-1/); assert.match(calls[1].path,/select=id/);
  assert(!('is_default' in JSON.parse(calls[1].opts.body)));
  calls=[]; out=await request({token,chat_id:'@mychannel',user_id:'user-b'}); assert.equal(out.statusCode,400); assert.equal(calls.length,0);
  calls=[]; out=await request({token,chat_id:'@mychannel'},{headers:{}}); assert.equal(out.statusCode,401); assert.equal(calls.length,0);
  calls=[]; out=await request('x'.repeat(5000)); assert.equal(out.statusCode,400); assert.equal(calls.length,0);
  calls=[]; existing=[{id:'one'},{id:'two'}]; out=await request({token,chat_id:'@mychannel'}); assert.equal(out.statusCode,503); assert.equal(calls.length,1);
  existing=[]; calls=[];
  const fail=makeHandler({authenticate:async()=> 'user-a',database:async()=>{throw Error(token)},inspect:async()=>destination});
  const res={setHeader(){},end(v){this.data=JSON.parse(v)}};
  await fail({method:'POST',headers:{authorization:'Bearer fake'},body:{token,chat_id:'@mychannel'}},res);
  assert.equal(res.statusCode,503);assert(!JSON.stringify(res.data).includes(token));
  console.log('ALL OK: isolated candidate connection, encrypted token, owner scope, parsed body, failures; no network or publishing');
})().catch(e=>{console.error(e);process.exitCode=1});
