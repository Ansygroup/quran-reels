/* Chromium محلي: حفظ المعاينة وتطبيقها على الصانع دون حساب أو شبكة أو نشر. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const {chromium} = require('playwright-core');
const chrome = require('@sparticuz/chromium').default;
const {__test} = require('../lib/autopilot');
const root=path.resolve(__dirname,'../public');
// تلاوة اصطناعية قصيرة لاختبار التسجيل المحلي فقط، وليست صوت قرآن.
function toneWav() { const hz=24000, count=hz*2, out=Buffer.alloc(44+count*2);out.write('RIFF',0);out.writeUInt32LE(out.length-8,4);out.write('WAVEfmt ',8);out.writeUInt32LE(16,16);out.writeUInt16LE(1,20);out.writeUInt16LE(1,22);out.writeUInt32LE(hz,24);out.writeUInt32LE(hz*2,28);out.writeUInt16LE(2,32);out.writeUInt16LE(16,34);out.write('data',36);out.writeUInt32LE(count*2,40);for(let i=0;i<count;i++)out.writeInt16LE(Math.round(5000*Math.sin(i*2*Math.PI*440/hz)),44+i*2);return out; }
const server=http.createServer((req,res)=>{const u=new URL(req.url,'http://localhost');if(u.pathname==='/proxy')return res.writeHead(200,{'Content-Type':'audio/wav','Access-Control-Allow-Origin':'*'}).end(toneWav());if(u.pathname.startsWith('/api/'))return res.writeHead(200,{'Content-Type':'application/json'}).end('{}');const file=path.resolve(root,'.'+(u.pathname==='/'?'/index.html':u.pathname));if(!file.startsWith(root+path.sep))return res.writeHead(403).end();fs.readFile(file,(err,data)=>{if(err)return res.writeHead(404).end();const type={'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml'}[path.extname(file)]||'application/octet-stream';res.writeHead(200,{'Content-Type':type}).end(data)})});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r)); const origin=`http://127.0.0.1:${server.address().port}`;const browser=await chromium.launch({executablePath:await chrome.executablePath(),args:chrome.args,headless:true});
try{const context=await browser.newContext({viewport:{width:Number(process.env.REEL_TEST_WIDTH||390),height:844},serviceWorkers:'block'});await context.route('**/*',r=>r.request().url().startsWith(origin+'/')?r.continue():r.abort());const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(origin,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>typeof Creator!=='undefined'&&Creator.ready&&Quran.surahs.length===114);
// إغلاق شريط الخصوصية لا يخفي نافذة الدخول معه.
await page.locator('#cookieOk').click();await page.evaluate(()=>QRAuthUI.open());
assert.equal(await page.locator('#loginOverlay').isVisible(),true,'نافذة الدخول تظهر بعد إغلاق الشريط');
await page.evaluate(()=>QRAuthUI.close());
await page.evaluate(()=>{document.getElementById('view-home').hidden=true;document.getElementById('view-account').hidden=false;const app=window.PublishApp;app.available=[{key:'youtube',name:'يوتيوب',publish:true}];app.connections=[{platform:'youtube'},{platform:'youtube'}];app.data={config:{enabled:true,platforms:['youtube'],all_channels:true,template:{content_mode:'mix',reciter_mode:'rotate',background:'rotate'}},options:{content_modes:['mix','famous','sequential','article','fixed'],reciters:[{id:'Alafasy_128kbps',name:'مشاري العفاسي'}],backgrounds:['rotate','grad-gold']}};app.renderStatus(app.data);app.renderAutoPanel(app.data);app.api=async(action,body)=>{window.__saved={action,body};return {ok:true,config:body}}});
await page.waitForFunction(()=>document.querySelector('#acctSurah')?.options.length===114);const before=await page.evaluate(()=>JSON.stringify({s:Selection.surah,from:Selection.from,to:Selection.to,reciter:Selection.reciter}));
await page.selectOption('#selContentMode','fixed');await page.selectOption('#acctSurah','2');await page.fill('#acctFrom','255');await page.fill('#acctTo','256');await page.selectOption('#acctReciter','Alafasy_128kbps');await page.selectOption('#selBackground','grad-gold');await page.selectOption('#acctStyle','banner');await page.selectOption('#acctTranslation','en.sahih');await page.selectOption('#acctRatio','1:1');await page.selectOption('#acctQuality','720');await page.selectOption('#acctAccent','rose');await page.locator('#acctFont').fill('120');await page.locator('#acctWatermark').uncheck();await page.locator('#acctMotion').uncheck();await page.fill('#acctDed','صدقة جارية');
// تحديث الحساب والتنقل لا يمسّان حقولًا أو ملفًا لم يُحفظا؛ لا طلب نشر فعلي.
await page.setInputFiles('#acctBackgroundFile',{name:'private.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a0pQAAAAASUVORK5CYII=','base64')});
await page.evaluate(()=>{
  const app=PublishApp; app._accountOwner='test-user';
  window.__origAuth=window.AuthApp; window.__origFetch=window.fetch; window.__origPoll=app.startProgressPolling;
  window.AuthApp={getUserId:async()=> 'test-user',getToken:async()=> 'test-token'};
  app.startProgressPolling=()=>{};
  window.fetch=async(url,opts)=>String(url)==='/api/autopilot' ? {ok:true,status:200,json:async()=>({...app.data})} : window.__origFetch(url,opts);
});
assert.match(await page.locator('#acctEditState').innerText(),/غير محفوظة/);
await page.evaluate(()=>PublishApp.init());
assert.equal(await page.locator('#acctDed').inputValue(),'صدقة جارية');
assert.equal(await page.locator('#acctBackgroundFile').evaluate(el=>el.files[0]?.name),'private.png');
await page.evaluate(()=>{window.location.hash='#/tools'});await page.waitForTimeout(100);
await page.evaluate(()=>{window.location.hash='#/account'});await page.waitForTimeout(300);
assert.equal(await page.locator('#acctDed').inputValue(),'صدقة جارية');
assert.equal(await page.locator('#acctBackgroundFile').evaluate(el=>el.files[0]?.name),'private.png');
await page.evaluate(async()=>{window.fetch=async()=>{throw Error('offline')};await PublishApp.init()});
assert.match(await page.locator('#acctNotice').innerText(),/تعذّر الاتصال/);
assert.equal(await page.locator('#acctDed').inputValue(),'صدقة جارية');
await page.evaluate(()=>{window.fetch=window.__origFetch;window.AuthApp=window.__origAuth;PublishApp.startProgressPolling=window.__origPoll});
await page.setInputFiles('#acctBackgroundFile',[]);await page.selectOption('#selBackground','grad-gold');
await page.waitForFunction(()=>document.querySelector('#acctPreviewNote')?.textContent.includes('معاينة تقريبية'));assert(await page.locator('#acctAudio').getAttribute('src'));await page.evaluate(()=>PublishApp.renderConnections('mock'));assert.equal(await page.locator('#acctDed').inputValue(),'صدقة جارية');assert.equal(await page.locator('#acctFrom').inputValue(),'255');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'mobile overflow');assert.equal(await page.evaluate(()=>JSON.stringify({s:Selection.surah,from:Selection.from,to:Selection.to,reciter:Selection.reciter})),before,'معاينة الحساب لا تعدّل صانع الرئيسية');
await page.evaluate(()=>PublishApp.saveSettings()); const body=await page.evaluate(()=>window.__saved.body);assert.equal(body.enabled,true);assert.equal(body.all_channels,true);assert.deepEqual(body.platforms,['youtube']);assert.deepEqual([body.template.surah,body.template.from,body.template.to],[2,255,256]);assert.equal(body.template.design.style,'banner');assert.equal(body.template.design.translation,'en.sahih');assert.equal(body.template.design.dedText,'صدقة جارية');assert.equal(body.template.design.showWatermark,false);
// تعديل أحدث أثناء الحفظ يجب أن يبقى غير محفوظ، ولا يضيع مع تحديث القنوات.
await page.evaluate(()=>{PublishApp.api=(action,body)=>new Promise(resolve=>{window.__pendingBody=body;window.__resolveSave=resolve});window.__pendingSave=PublishApp.saveSettings()});
await page.fill('#acctDed','تعديل بعد بدء الحفظ');
await page.evaluate(async()=>{window.__resolveSave({ok:true,config:window.__pendingBody});await window.__pendingSave;await PublishApp.renderConnections('mock')});
assert.equal(await page.locator('#acctDed').inputValue(),'تعديل بعد بدء الحفظ');assert.equal(await page.evaluate(()=>PublishApp._autoDirty),true);assert.match(await page.locator('#acctEditState').innerText(),/غير محفوظة/);
await page.evaluate(()=>PublishApp.renderAccount(PublishApp.data));assert.equal(await page.locator('#acctDed').inputValue(),'تعديل بعد بدء الحفظ');
// طلب قراءة بدأ قبل الحفظ لا يعيد رسم الإعدادات القديمة عند وصوله متأخرًا.
await page.evaluate(async()=>{
 const app=PublishApp;app._accountOwner='race-user';window.__raceAuth=window.AuthApp;window.__raceFetch=window.fetch;window.__racePoll=app.startProgressPolling;
 window.AuthApp={getUserId:async()=> 'race-user',getToken:async()=> 'mock'};app.startProgressPolling=()=>{};
 window.fetch=url=>String(url)==='/api/autopilot'?new Promise(resolve=>window.__resolveRead=resolve):window.__raceFetch(url);
 window.__raceRead=app.init();await new Promise(r=>setTimeout(r,0));
 app.api=async(action,body)=>({ok:true,config:body});await app.saveSettings();
 window.__resolveRead({ok:true,json:async()=>({config:{enabled:false,platforms:[],template:{content_mode:'mix',background:'rotate'}},runs:[]})});await window.__raceRead;
 window.fetch=window.__raceFetch;window.AuthApp=window.__raceAuth;app.startProgressPolling=window.__racePoll;
});
assert.equal(await page.locator('#acctDed').inputValue(),'تعديل بعد بدء الحفظ');
assert.equal(await page.evaluate(()=>PublishApp.data.config.template.design.dedText),'تعديل بعد بدء الحفظ');
assert.match(await page.locator('#acctEditState').innerText(),/لا توجد تعديلات/);
// استجابة حساب قديمة لا تستبدل حالة حساب أحدث، ولا يبقى ملف الحساب الأول ظاهرًا.
await page.evaluate(async()=>{
  const app=PublishApp; window.__origFetch2=window.fetch; window.__origAuth2=window.AuthApp;
  window.__origPoll2=app.startProgressPolling; window.__origConnections=app.renderConnections;
  app.startProgressPolling=()=>{}; app.renderConnections=async()=>{};
  window.__uid='user-a'; window.AuthApp={getUserId:async()=>window.__uid,getToken:async()=>window.__uid};
  window.__requests=[]; window.fetch=(url)=>String(url)==='/api/autopilot' ? new Promise(resolve=>window.__requests.push(resolve)) : window.__origFetch2(url);
  window.__first=app.init(); await new Promise(r=>setTimeout(r,0));
  window.__uid='user-b'; window.__second=app.init(); await new Promise(r=>setTimeout(r,0));
});
assert.equal(await page.evaluate(()=>window.__requests.length),2);
assert.equal(await page.locator('#acctDed').count(),0,'تُزال حقول الحساب السابق قبل تحميل الجديد');
await page.evaluate(async()=>{const cfg={enabled:false,platforms:[],template:{content_mode:'mix',background:'rotate'}};window.__requests[1]({ok:true,json:async()=>({config:cfg,runs:[]})});await window.__second;window.__requests[0]({ok:true,json:async()=>({config:{...cfg,enabled:true},runs:[]})});await window.__first});
assert.equal(await page.evaluate(()=>PublishApp._accountOwner),'user-b');assert.equal(await page.locator('#acctEnabled').isChecked(),false);
await page.evaluate(()=>{window.fetch=window.__origFetch2;window.AuthApp=window.__origAuth2;PublishApp.startProgressPolling=window.__origPoll2;PublishApp.renderConnections=window.__origConnections});
// تطبيق نفس الإعدادات داخل نسخة الصانع التي يستخدمها الرندر.
await page.evaluate(__test.applyAutomatedSelection,{s:2,from:255,to:256,r:'Alafasy_128kbps',bg:'grad-gold',style:'card',trans:'none',runIndex:0,design:body.template.design});const state=await page.evaluate(()=>({selection:{...Selection},render:{...Creator.renderer.state},canvas:[document.querySelector('#reelCanvas').width,document.querySelector('#reelCanvas').height],bg:Creator.renderer.bgUrl}));for(const k of ['translation','showTrans','style','ratio','quality','accent','fontSize','showWatermark','motion'])assert.equal(state.selection[k],body.template.design[k],k);assert.deepEqual([state.selection.surah,state.selection.from,state.selection.to],[2,255,256]);assert.equal(state.selection.dedText,'صدقة جارية');assert.equal(state.render.style,'banner');assert.equal(state.render.verses[0].a,255);assert.equal(state.render.customTrans.length>0,true);assert.equal(state.bg,'grad:grad-gold');assert.deepEqual(state.canvas,[560,560]);assert.deepEqual(errors,[]);
if(process.env.REEL_TEST_EXPORT==='1') {
  await page.evaluate(()=>{document.getElementById('view-account').hidden=true;document.getElementById('view-home').hidden=false});
  await page.locator('#btnCreate').click();
  await page.waitForFunction(()=>!document.getElementById('expResult').hidden,{timeout:90000});
  const sound=await __test.assertCompleteAudio(page);assert.equal(sound.total,2);assert.deepEqual(sound.missing,[]);
  const downloadPromise=page.waitForEvent('download');await page.locator('#btnDownload').click();const download=await downloadPromise;const file=await download.path();assert(fs.statSync(file).size>20000);
  console.log('ALL OK: actual local video export with synthetic audio for both selected verses; bytes='+fs.statSync(file).size);
}
await page.evaluate(()=>localStorage.clear());await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(()=>typeof Creator!=='undefined'&&Creator.ready);
await page.evaluate(__test.applyLegacySelection,{s:108,from:1,to:3,r:'Abdurrahmaan_As-Sudais_192kbps',bg:'rotate',style:'word',trans:'none',runIndex:0});
const legacy=await page.evaluate(()=>({style:Creator.renderer.state.style,ratio:Selection.ratio,verses:Creator.renderer.state.verses.length,showTrans:Selection.showTrans}));
assert.deepEqual(legacy,{style:'word',ratio:'9:16',verses:3,showTrans:false});
// فشل الترجمة أو الخلفية لا يتحول إلى فيديو بإعدادات مختلفة بصمت.
await page.evaluate(()=>{window.__oldTr=Quran.trText;Quran.trText=()=>''});
await assert.rejects(page.evaluate(__test.applyAutomatedSelection,{s:2,from:255,to:256,r:'Alafasy_128kbps',bg:'grad-gold',style:'card',trans:'none',runIndex:0,design:body.template.design}),/الترجمة غير متاحة/);
await page.evaluate(()=>{Quran.trText=window.__oldTr;Creator.renderer._load=async()=>null});
await assert.rejects(page.evaluate(__test.applyAutomatedSelection,{s:108,from:1,to:3,r:'Alafasy_128kbps',bg:'bg-starry-desert',style:'card',trans:'none',runIndex:0}),/تعذّر تحميل الخلفية/);
console.log('ALL OK: Chromium account preview, manual verses, template save and real creator application; no publishing');await context.close();}finally{await browser.close();server.close()}})().catch(e=>{console.error(e);server.close();process.exitCode=1});
