/* تحقق من عقد التخصيص ونطاق الآيات بلا اتصال أو تشغيل نشر. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {catalog,validateTemplate}=require('../lib/reel_settings');
const {parseTemplate,chooseRecipe,RECITERS}=require('../lib/autopilot');
const source=fs.readFileSync('public/js/data.js','utf8');
const browserCatalog=vm.runInNewContext(source+';({reciters:RECITERS.map(r=>r.folder), translations:TRANSLATIONS.map(t=>t.id), backgrounds:BACKGROUNDS.map(b=>b.id)})');
for (const key of ['translations','backgrounds']) assert.deepEqual(catalog[key],Array.from(browserCatalog[key]));
assert.deepEqual(catalog.reciters.map(r=>r.id),Array.from(browserCatalog.reciters));
assert.equal(RECITERS.length,47);
const design={translation:'en.sahih',showTrans:true,style:'minimal',ratio:'1:1',quality:720,accent:'rose',fontSize:120,showWatermark:false,motion:false,dedText:'صدقة جارية'};
const input={content_mode:'fixed',surah:2,from:255,to:256,reciter_mode:'fixed',reciter:RECITERS[0].id,background:'grad-gold',design};
assert.equal(validateTemplate(input),null);
const template=parseTemplate(input);assert.deepEqual(template.design,design);assert.deepEqual([template.surah,template.from,template.to],[2,255,256]);
const recipe=chooseRecipe(template,9);assert.deepEqual([recipe.s,recipe.from,recipe.to],[2,255,256]);
assert.notEqual(chooseRecipe(template,0).r, chooseRecipe(template,1).r, 'القارئ التلقائي يدور حتى مع تثبيت الآيات');
for(const patch of [{surah:115},{surah:1,from:1,to:8},{from:0},{from:9,to:8},{surah:2,from:1,to:41},{from:1.5}]) assert(validateTemplate({...input,...patch}));
for(const patch of [{style:'bogus'},{quality:5},{fontSize:71},{showWatermark:'false'},{translation:'bad'},{dedText:'x'.repeat(181)}]) assert(validateTemplate({...input,design:{...design,...patch}}));
assert.equal(validateTemplate(parseTemplate({content_mode:'mix'})),null);
console.log('ALL OK: creator catalog, 47 reciters, manual ranges, design validation and recipe selection');
(async()=>{
  const check=require('../lib/autopilot').__test.assertCompleteAudio;
  await assert.rejects(check({evaluate:async()=>({total:2,missing:[256]})}),/لم يُنشر/);
  await assert.rejects(check({evaluate:async()=>{throw Error('disconnected')}}),/تعذّر التأكد/);
  assert.deepEqual(await check({evaluate:async()=>({total:2,missing:[]})}),{total:2,missing:[]});
  console.log('ALL OK: fixed range requires every verse audio before publish');
})().catch(e=>{console.error(e);process.exitCode=1});
