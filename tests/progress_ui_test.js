#!/usr/bin/env node
/* عرض المرحلة من ردود حقيقية الشكل مع شبكة مؤجلة، بلا نشر. */
const assert = require('node:assert/strict'); const fs = require('node:fs');
let JSDOM; try { ({ JSDOM } = require('jsdom')); } catch { console.log('WARN jsdom missing: progress DOM test skipped'); process.exit(0); }
const dom = new JSDOM(fs.readFileSync('public/index.html','utf8'), {url:'https://app.test/',runScripts:'outside-only'});
const w = dom.window; w.eval(fs.readFileSync('public/js/publish.js','utf8'));
w.AuthApp = { getToken: async () => 'user-token' }; const app = w.PublishApp;
w.document.getElementById('view-account').hidden = false;
let timer = null; w.setTimeout = fn => { timer = fn; return 1; }; w.clearTimeout = () => { timer = null; };
let status = { run:{ id:'new', status:'rendering', title:'<img src=x>' }, events:[{stage:'checking'},{stage:'audio'}], events_available:true, targets:[], targets_available:true };
let posts=0, resolvePost; const post = new Promise(r => { resolvePost=r; });
w.fetch = async (url, opts={}) => {
  if (String(url).includes('progress=1')) return { ok:true, json:async()=>status };
  if (opts.method === 'POST') { posts++; return post; }
  throw Error('unexpected '+url);
};
(async () => {
  app.data = { runs:[{id:'old'}] }; const btn = w.document.getElementById('loginSubmit');
  const task = app.runNow('run', btn);
  await new Promise(r => setImmediate(r));
  let html = w.document.getElementById('acctProgress');
  assert.match(html.textContent, /فحص القنوات/); assert.match(html.textContent, /فحص التلاوة/);
  assert.equal(html.querySelector('img'), null); assert.equal(posts,1);
  await app.runNow('run', btn); assert.equal(posts,1);
  status = { run:{id:'new',status:'queued',title:'فيديو'}, events:[{stage:'export'},{stage:'publishing'}], events_available:true, targets:[{platform:'youtube',channel:'أ',status:'published',url:'https://youtu.be/a'},{platform:'youtube',channel:'ب',status:'failed',error:'رفض'}], targets_available:true };
  await app.pollProgress();
  assert.match(html.textContent,/محاولة النشر/); assert.match(html.textContent,/أ: اتنشر/); assert.match(html.textContent,/ب: فشل/); assert.equal(html.querySelectorAll('a').length,1);
  status = { run:{id:'new',status:'published',title:'فيديو'}, events:[], events_available:false, targets:[], targets_available:false };
  await app.pollProgress(); assert.match(html.textContent,/التشغيل مكتمل/); assert.match(html.textContent,/تعذّر قراءة تفاصيل/); assert.match(html.textContent,/تعذّر قراءة حالة القنوات/);
  resolvePost({ok:true,status:200,json:async()=>({ok:true})}); await task; assert.equal(btn.disabled,false); assert.equal(posts,1);
  await new Promise(r => setImmediate(r));
  // النتيجة الجزئية تُعرض فشلًا، ولا تتحول رسالة النجاح لبدء وهمي.
  const messages = []; w.toast = (text, kind) => messages.push({text, kind});
  w.fetch = async (url, opts={}) => String(url).includes('progress=1')
    ? {ok:true, json:async()=>status}
    : {ok:false,status:502,json:async()=>({ok:false,error:'فشل هدف واحد'})};
  await app.runNow('run_all', btn);
  assert.deepEqual(messages.map(m=>m.text), ['فشل هدف واحد']); assert.equal(messages[0].kind,'err');
  messages.length = 0;
  w.fetch = async (url, opts={}) => String(url).includes('progress=1')
    ? {ok:true,json:async()=>status} : {ok:true,status:200,json:async()=>({ok:true})};
  await app.runNow('run_all', btn);
  assert.match(messages[0].text,/اكتمل التشغيل/); assert.doesNotMatch(messages[0].text,/تم بدء/);
  await new Promise(r => setImmediate(r));
  w.fetch = async () => { throw Error('offline'); }; await app.pollProgress(); assert.match(html.textContent,/ده مش معناه إن التشغيل وقف/);
  w.clearTimeout(timer); dom.window.close();
  console.log('ALL OK: live stages, two channel outcomes, pending-run guard, escaped UI and offline warning (mock network)');
})().catch(e=>{ console.error(e); dom.window.close(); process.exitCode=1; });
