/* Isolated DOM/network tests: no production calls and no publication. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { JSDOM } = require('jsdom');
const dom = new JSDOM(fs.readFileSync('public/index.html','utf8'), {url:'https://site.test/',runScripts:'outside-only'});
const w = dom.window, doc = w.document;
w.eval(fs.readFileSync('public/js/publish.js','utf8'));
w.AuthApp = {getToken:async()=> 'test', getUserId:async()=> 'u1'};
w.toast = ()=>{};
const app = w.PublishApp;
const REV1='11111111-1111-4111-8111-111111111111', REV2='22222222-2222-4222-8222-222222222222';
const IMG1='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', IMG2='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const config=(rev,img)=>({settings_revision:rev,enabled:false,all_channels:false,platforms:['youtube'],template:{content_mode:'mix',reciter_mode:'rotate',reciter:'',background:'custom',background_image_id:img,privacy:'public'}});
const data=c=>({config:c,available:[{key:'youtube',name:'يوتيوب',publish:true}],runs:[]});
const response=(body,status=200)=>({ok:status<400,status,json:async()=>body});
(async()=>{
  app._accountOwner='u1'; app.connections=[{platform:'youtube'}];
  const oldConfig=config(REV1,IMG1); oldConfig.all_channels=true;
  app.renderAccount(data(oldConfig)); app.bindEvents();
  assert.equal(doc.querySelector('#chkAllChannels'),null);
  const dedication=doc.querySelector('#acctDed'); dedication.value='مسودة'; dedication.dispatchEvent(new w.Event('input',{bubbles:true}));
  assert.equal(app._autoDirty,true);
  // A background account refresh cannot replace the image that this dirty draft refers to.
  app.renderAccount(data(config(REV2,IMG2)));
  assert.equal(app._draftRevision,REV1); assert.equal(app._draftBackgroundImageId,IMG1);
  let requests=[];
  w.fetch=async (url,opts={})=>{
    if (opts.method==='POST') {const body=JSON.parse(opts.body); requests.push(body); return response({code:'settings_conflict',error:'conflict'},409);}
    return response(data(config(REV2,IMG2)));
  };
  await app.saveSettings();
  assert.equal(requests[0].expected_revision,REV1); assert.equal(requests[0].template.background_image_id,IMG1);
  assert.equal(requests[0].all_channels,true);
  assert.equal(app._settingsUncertain,true); assert.equal(dedication.value,'مسودة');
  await app.reviewSettings(); assert.equal(app._reviewedUncertain,true);
  app.resumeSettings();
  assert.equal(app._draftRevision,REV2); assert.equal(app._draftBackgroundImageId,IMG1);
  await app.saveSettings();
  assert.equal(requests[1].expected_revision,REV2); assert.equal(requests[1].template.background_image_id,IMG1); assert.equal(requests[1].all_channels,true);
  // A failed second review cannot leave the previous review actionable.
  await app.reviewSettings(); assert.equal(app._reviewedUncertain,true);
  let release; const delayed=new Promise(resolve=>{release=resolve});
  w.fetch=async()=>delayed;
  const checking=app.reviewSettings(); await new Promise(r=>setImmediate(r));
  assert.equal(app._reviewedUncertain,false); assert.equal(doc.querySelector('#acctResume').hidden,true);
  app.resumeSettings(); assert.equal(app._settingsUncertain,true);
  release(response({},500)); await checking;
  assert.equal(app._reviewedUncertain,false); assert.equal(app._settingsUncertain,true);
  // Starting a pause invalidates a prior review even while the request is pending or fails.
  w.fetch=async()=>response(data(config(REV2,IMG2)));
  await app.reviewSettings(); assert.equal(app._reviewedUncertain,true);
  let reject; w.fetch=()=>new Promise((_,r)=>{reject=r});
  const pause=app.pauseSafely(doc.querySelector('#acctPauseSafe')); await new Promise(r=>setImmediate(r));
  assert.equal(app._settingsPending,true); assert.equal(app._reviewedUncertain,false);
  app.resumeSettings(); assert.equal(app._settingsUncertain,true);
  reject(Error('network')); await pause;
  assert.equal(app._settingsUncertain,true); assert.equal(app._reviewedUncertain,false);
  // Session may change during the read before the account-change event arrives.
  let uid='u1', finishRead;
  w.AuthApp.getUserId=async()=>uid;
  w.fetch=()=>new Promise(r=>{finishRead=r});
  const switchedReview=app.reviewSettings(); await new Promise(r=>setImmediate(r));
  uid='u2'; finishRead(response(data(config(REV2,IMG2)))); await switchedReview;
  assert.equal(app._settingsUncertain,true); assert.equal(app._reviewedUncertain,false);
  console.log('ALL OK: draft image/channels snapshot, stale reviews, pending pause and session switch (isolated DOM/network)');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>dom.window.close());
