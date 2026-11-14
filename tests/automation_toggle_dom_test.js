#!/usr/bin/env node
/* لا شبكة حقيقية: نتحقق أن المفتاح لا يحفظ التعديلات الأخرى وأن انقطاع الرد صريح. */
const assert=require('node:assert/strict'), fs=require('node:fs');
let JSDOM; try { ({JSDOM}=require('jsdom')); } catch { console.log('WARN jsdom missing: toggle DOM test skipped'); process.exit(0); }
const dom=new JSDOM(fs.readFileSync('public/index.html','utf8'),{url:'https://site.test/',runScripts:'outside-only'});
const w=dom.window, d=w.document; w.eval(fs.readFileSync('public/js/publish.js','utf8'));
w.AuthApp={getToken:async()=> 'token',getUserId:()=> 'u1'};
const messages=[]; w.toast=(text,kind)=>messages.push({text,kind});
const app=w.PublishApp;
app.connections=[{platform:'youtube',id:'a'},{platform:'youtube',id:'b'}];
app.renderAccount({ config:{settings_revision:'11111111-1111-4111-8111-111111111111',enabled:true,platforms:['youtube'],all_channels:true,template:{content_mode:'mix',background:'rotate'}}, runs:[], available:[{key:'youtube',name:'يوتيوب',publish:true},{key:'tiktok',name:'تيك توك',publish:true}] });
app.bindEvents();
let requests=[], mode='pending', resolve;
const pending=new Promise(r=>{resolve=r});
w.fetch=async (url,opts)=>{
  const body=JSON.parse(opts.body); requests.push(body);
  if(mode==='pending') return pending;
  if(mode==='reject') return {ok:false,status:409,json:async()=>({error:'اربط المنصة المختارة'})};
  if(mode==='lost') throw Error('offline');
  throw Error('unexpected');
};
const wait=()=>new Promise(r=>setImmediate(r));
(async()=>{
  const toggle=d.getElementById('acctEnabled'), save=d.getElementById('autoSave');
  d.getElementById('plat-youtube').checked=false;
  d.getElementById('plat-tiktok').checked=true;
  d.getElementById('chkAllChannels').checked=false;
  const modeSelect=d.getElementById('selContentMode'); modeSelect.value='famous'; modeSelect.dispatchEvent(new w.Event('change',{bubbles:true}));
  toggle.checked=false; toggle.dispatchEvent(new w.Event('change',{bubbles:true}));
  await wait(); assert.equal(toggle.disabled,true); assert.equal(save.disabled,true);
  assert.deepEqual(requests,[{action:'set_enabled',enabled:false,expected_revision:'11111111-1111-4111-8111-111111111111'}]);
  resolve({ok:true,status:200,json:async()=>({ok:true,enabled:false,stale:false,config:{...app.data.config,enabled:false,settings_revision:'22222222-2222-4222-8222-222222222222'}})}); await wait();
  assert.equal(toggle.checked,false); assert.equal(toggle.disabled,false); assert.equal(save.disabled,false);
  assert.deepEqual(Array.from(app.data.config.platforms),['youtube']); assert.equal(app.data.config.all_channels,true);
  assert.equal(d.getElementById('plat-tiktok').checked,true); assert.equal(d.getElementById('plat-youtube').checked,false);
  assert.equal(d.getElementById('chkAllChannels').checked,false); assert.equal(modeSelect.value,'famous');
  mode='reject'; toggle.checked=true; toggle.dispatchEvent(new w.Event('change',{bubbles:true})); await wait();
  assert.equal(toggle.checked,false); assert.equal(toggle.disabled,false); assert.match(messages.at(-1).text,/اربط/);
  mode='lost'; toggle.checked=true; toggle.dispatchEvent(new w.Event('change',{bubbles:true})); await wait();
  assert.equal(toggle.disabled,true); assert.equal(save.disabled,true);
  assert.match(d.getElementById('acctStateLabel').textContent,/غير مؤكدة/);
  app.renderStatus(app.data); assert.match(d.getElementById('acctStateLabel').textContent,/غير مؤكدة/);
  app.renderAutoPanel(app.data); assert.equal(d.getElementById('autoSave').disabled,true);
  const before=requests.length; const out=await app.saveSettings({}); assert.equal(out.ok,false); assert.equal(requests.length,before);
  dom.window.close(); console.log('ALL OK: toggle preserves unsaved controls and warns on ambiguous response (mock network)');
})().catch(e=>{console.error(e);dom.window.close();process.exitCode=1});
