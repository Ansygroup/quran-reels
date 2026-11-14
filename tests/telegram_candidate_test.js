/* All requests are mocked; never contacts Telegram or publishes. */
const assert = require('node:assert/strict');
const { inspectTarget, sendVideo, MAX_VIDEO_BYTES } = require('../lib/telegram_candidate');
const token = '123456789:abcdefghijklmnopqrstuvwxyzABC123456';
const mp4 = Buffer.concat([Buffer.from([0, 0, 0, 12]), Buffer.from('ftyp'), Buffer.from('isom')]);
const ok = result => ({ok: true, status: 200, json: async () => ({ok: true, result})});
const mock = (handlers, seen = []) => async (url, opts) => {
  const method = url.split('/').pop();
  seen.push({method, body:opts.body, url});
  assert.equal(opts.method, 'POST');
  assert(opts.signal);
  assert(handlers[method], 'unexpected method');
  return handlers[method](opts.body);
};
(async () => {
  const seen = [];
  const api = mock({
    getMe: () => ok({id: 123456789, is_bot: true}),
    getChat: body => { assert.equal(body.get('chat_id'), '@test_channel'); return ok({id:-10012345, type:'channel', title:'Channel'}); },
    getChatMember: body => { assert.equal(body.get('user_id'), '123456789'); return ok({status:'administrator', can_post_messages:true}); },
  }, seen);
  assert.deepEqual(await inspectTarget({token, chatId:'@test_channel', fetchImpl:api}), {id:'-10012345',type:'channel',name:'Channel',botId:'123456789'});
  assert.deepEqual(seen.map(x => x.method), ['getMe','getChat','getChatMember']);
  const denied = mock({getMe:()=>ok({id:1,is_bot:true}), getChat:()=>ok({id:-1001,type:'channel'}), getChatMember:()=>ok({status:'administrator',can_post_messages:false})});
  await assert.rejects(inspectTarget({token,chatId:'-1001',fetchImpl:denied}), /permission/);
  const group = mock({getMe:()=>ok({id:1,is_bot:true}), getChat:()=>ok({id:-101,type:'supergroup',title:'Group'}), getChatMember:()=>ok({status:'restricted',is_member:true,can_send_messages:false})});
  await assert.rejects(inspectTarget({token,chatId:'-101',fetchImpl:group}), /cannot send/);
  const textOnly = mock({getMe:()=>ok({id:1,is_bot:true}), getChat:()=>ok({id:-101,type:'supergroup',permissions:{can_send_messages:true,can_send_videos:false}}), getChatMember:()=>ok({status:'member'})});
  await assert.rejects(inspectTarget({token,chatId:'-101',fetchImpl:textOnly}), /cannot send video/);
  const videoAllowed = mock({getMe:()=>ok({id:1,is_bot:true}), getChat:()=>ok({id:-101,type:'supergroup',permissions:{can_send_videos:true}}), getChatMember:()=>ok({status:'member'})});
  assert.equal((await inspectTarget({token,chatId:'-101',fetchImpl:videoAllowed})).type,'supergroup');
  const restrictedVideo = mock({getMe:()=>ok({id:1,is_bot:true}), getChat:()=>ok({id:-101,type:'supergroup'}), getChatMember:()=>ok({status:'restricted',is_member:true,can_send_messages:true,can_send_videos:false})});
  await assert.rejects(inspectTarget({token,chatId:'-101',fetchImpl:restrictedVideo}), /cannot send video/);
  let called = false;
  const never = async()=>{called = true; throw Error('must not call')};
  await assert.rejects(inspectTarget({token,chatId:'https://example.org',fetchImpl:never}), /destination/);
  await assert.rejects(inspectTarget({token,chatId:9007199254740993,fetchImpl:never}), /destination/);
  await assert.rejects(sendVideo({token:'x',chatId:'1',buffer:mp4,fetchImpl:never}), /token/);
  await assert.rejects(sendVideo({token,chatId:'1',buffer:Buffer.from('not mp4'),fetchImpl:never}), /MP4/);
  await assert.rejects(sendVideo({token,chatId:'1',buffer:mp4,caption:'a'.repeat(1025),fetchImpl:never}), /caption/);
  assert.equal(MAX_VIDEO_BYTES, 50000000);
  assert.equal(called, false);
  let sends=0;
  const sent = await sendVideo({token,chatId:'-10012345',buffer:mp4,caption:'تلاوة',fetchImpl:mock({sendVideo:body=>{sends++; assert.equal(body.get('chat_id'),'-10012345'); assert.equal(body.get('caption'),'تلاوة'); assert.equal(body.get('video').type,'video/mp4'); return ok({message_id:42,chat:{id:-10012345}});}})});
  assert.deepEqual(sent,{messageId:42,chatId:'-10012345'}); assert.equal(sends,1);
  const lost=async()=>{sends++;throw Error('secret token '+token)};
  await assert.rejects(sendVideo({token,chatId:'1',buffer:mp4,fetchImpl:lost}), e=>e.outcome==='unknown' && !e.message.includes(token));
  assert.equal(sends,2,'lost response was not retried');
  await assert.rejects(sendVideo({token,chatId:'1',buffer:mp4,fetchImpl:async()=>({ok:false,status:403,json:async()=>({ok:false,description:token})})}),e=>e.outcome==='rejected'&&!e.message.includes(token));
  await assert.rejects(sendVideo({token,chatId:'1',buffer:mp4,fetchImpl:async()=>({ok:false,status:500,json:async()=>({ok:false})})}),e=>e.outcome==='unknown');
  await assert.rejects(sendVideo({token,chatId:'1',buffer:mp4,fetchImpl:async()=>ok({message_id:2,chat:{id:2}})}),e=>e.outcome==='unknown');
  await assert.rejects(sendVideo({token,chatId:'1',buffer:mp4,fetchImpl:async()=>({ok:true,status:200,json:async()=>{throw Error('invalid json')}})}),e=>e.outcome==='unknown');
  console.log('ALL OK: candidate Telegram destination checks and safe mocked send; no network or publishing');
})().catch(e=>{console.error(e);process.exitCode=1});
