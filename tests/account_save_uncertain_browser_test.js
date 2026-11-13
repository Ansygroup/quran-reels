/* Real local browser, entirely mocked account/network; no server writes or publishing. */
const assert = require('node:assert/strict');
const fs = require('node:fs'), http = require('node:http'), path = require('node:path');
const { chromium } = require('playwright-core'), chrome = require('@sparticuz/chromium').default;
const root = path.resolve(__dirname, '../public');
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://localhost');
  if (u.pathname.startsWith('/api/')) return res.writeHead(200, {'Content-Type':'application/json'}).end('{}');
  const file = path.resolve(root, '.' + (u.pathname === '/' ? '/index.html' : u.pathname));
  if (!file.startsWith(root + path.sep)) return res.writeHead(403).end();
  fs.readFile(file, (err, data) => err ? res.writeHead(404).end() : res.writeHead(200, {'Content-Type':({'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json'})[path.extname(file)] || 'application/octet-stream'}).end(data));
});
(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({executablePath:await chrome.executablePath(), args:chrome.args, headless:true});
  try {
    const ctx = await browser.newContext({viewport:{width:Number(process.env.REEL_TEST_WIDTH || 390),height:844},serviceWorkers:'block'});
    await ctx.route('**/*', r => r.request().url().startsWith(origin + '/') ? r.continue() : r.abort());
    const page = await ctx.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(origin); await page.waitForFunction(() => typeof Creator !== 'undefined' && Creator.ready);
    await page.evaluate(() => {
      document.querySelector('#view-home').hidden = true; document.querySelector('#view-account').hidden = false;
      const app = PublishApp; app._accountOwner = 'user-a';
      window.AuthApp = { getUserId:async()=> 'user-a', getToken:async()=> 'mock' };
      app.data = {config:{enabled:true,platforms:['youtube'],all_channels:false,template:{content_mode:'mix',reciter_mode:'rotate',reciter:'',background:'rotate',privacy:'public'}},options:{reciters:[],content_modes:['mix'],backgrounds:['rotate']}};
      app.available=[{key:'youtube',name:'يوتيوب',publish:true}]; app.connections=[{platform:'youtube'}];
      app.renderStatus(app.data); app.renderAutoPanel(app.data); app.bindEvents(); app.startProgressPolling=()=>{};
      app.prepareAccountImage=async()=> 'data:image/jpeg;base64,mocked';
      window.savedConfig=structuredClone(app.data.config); window.posts=[]; window.fetchMode='lost';
      const orig=window.fetch;
      window.fetch=async(url,opts={})=>{
        if (String(url)==='/api/autopilot' && opts.method==='POST') {
          const body=JSON.parse(opts.body); window.posts.push(body);
          if (window.fetchMode==='validation') return {ok:false,status:400,json:async()=>({error:'invalid'})};
          if (body.action==='save') { window.savedConfig={...body,template:{...body.template,background_image_id:'e6babd90-5848-4327-a948-b282b87dad08'}}; }
          if (body.action==='set_enabled') window.savedConfig.enabled=body.enabled;
          if (window.fetchMode==='lost') throw Error('response lost');
          if (window.fetchMode==='server-error') return {ok:false,status:503,json:async()=>({error:'uncertain'})};
          if (window.fetchMode==='bad-success') return {ok:true,status:200,json:async()=>({ok:true})};
          if (window.fetchMode==='mismatch') return {ok:true,status:200,json:async()=>({ok:true,config:{...window.savedConfig,enabled:false}})};
          return {ok:true,status:200,json:async()=>({ok:true,config:window.savedConfig,enabled:body.enabled})};
        }
        if (String(url)==='/api/autopilot') {
          if (window.fetchMode==='offline') throw Error('offline');
          if (window.fetchMode==='bad-read') return {ok:true,status:200,json:async()=>({})};
          return {ok:true,status:200,json:async()=>({config:window.savedConfig,runs:[],available:app.available})};
        }
        return orig(url,opts);
      };
    });
    await page.locator('#acctBackgroundFile').setInputFiles({name:'private.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a0pQAAAAASUVORK5CYII=','base64')});
    await page.fill('#acctDed','مسودة لم تضِع');
    await page.locator('#autoSave').click();
    assert.equal(await page.evaluate(()=>posts.length),1);
    assert.equal(await page.locator('#acctRecovery').isVisible(),true);
    assert.equal(await page.locator('#autoSave').isDisabled(),true); assert.equal(await page.locator('#acctEnabled').isDisabled(),true);
    assert.equal(await page.locator('#acctBackgroundFile').evaluate(e=>e.files[0].name),'private.png');
    assert.equal(await page.locator('#acctDed').inputValue(),'مسودة لم تضِع');
    await page.evaluate(()=>PublishApp.runNow('run')); assert.equal(await page.evaluate(()=>posts.length),1);
    await page.evaluate(()=>{window.fetchMode='offline'}); await page.locator('#acctRecheck').click();
    assert.equal(await page.locator('#acctResume').isHidden(),true); assert.equal(await page.locator('#autoSave').isDisabled(),true);
    await page.evaluate(()=>{window.fetchMode='bad-read'}); await page.locator('#acctRecheck').click();
    assert.equal(await page.locator('#acctResume').isHidden(),true); assert.equal(await page.locator('#autoSave').isDisabled(),true);
    await page.evaluate(()=>{window.fetchMode='success'}); await page.locator('#acctRecheck').click();
    assert.match(await page.locator('#acctSavedReviewText').innerText(),/مسودة لم تضِع/);
    assert.match(await page.locator('#acctSavedReviewText').innerText(),/e6babd90/);
    assert.equal(await page.locator('#autoSave').isDisabled(),true);
    await page.locator('#acctResume').click(); assert.equal(await page.locator('#autoSave').isEnabled(),true);
    assert.equal(await page.locator('#acctDed').inputValue(),'مسودة لم تضِع');
    assert.equal(await page.locator('#acctBackgroundFile').evaluate(e=>e.files[0].name),'private.png');
    // A 200 with missing or conflicting saved config is not success and never clears the file.
    for (const mode of ['bad-success','mismatch','server-error']) {
      await page.evaluate(m=>window.fetchMode=m, mode); await page.locator('#autoSave').click();
      assert.equal(await page.locator('#acctRecovery').isVisible(),true,mode);
      assert.equal(await page.locator('#acctBackgroundFile').evaluate(e=>e.files[0].name),'private.png');
      await page.evaluate(()=>window.fetchMode='success'); await page.locator('#acctRecheck').click(); await page.locator('#acctResume').click();
    }
    await page.evaluate(()=>window.fetchMode='validation'); await page.locator('#autoSave').click();
    assert.equal(await page.locator('#acctRecovery').isHidden(),true); assert.equal(await page.locator('#autoSave').isEnabled(),true);
    // Local image preparation failure never sends a request and is not an ambiguous save.
    const before = await page.evaluate(()=>posts.length);
    await page.evaluate(()=>PublishApp.prepareAccountImage=async()=>{throw Error('bad image')}); await page.locator('#autoSave').click();
    assert.equal(await page.evaluate(()=>posts.length),before); assert.equal(await page.locator('#acctRecovery').isHidden(),true);
    // Switching account while image preparation is pending must not send the old draft or image with the new session.
    await page.evaluate(async()=>{
      window.__currentUid='user-a';window.AuthApp={getUserId:async()=>window.__currentUid,getToken:async()=> 'new-token'};
      PublishApp.prepareAccountImage=()=>new Promise(resolve=>window.__finishImage=resolve);
      window.__pendingSave=PublishApp.saveSettings();await new Promise(r=>setTimeout(r,0));
      window.__currentUid='user-b';window.__finishImage('data:image/jpeg;base64,mocked');window.__raceResult=await window.__pendingSave;
    });
    assert.equal(await page.evaluate(()=>posts.length),before);
    assert.equal(await page.evaluate(()=>window.__raceResult.beforeSend),true);
    assert.equal(await page.locator('#acctRecovery').isHidden(),true);
    await page.evaluate(()=>window.__currentUid='user-a');
    // A valid response confirms the saved configuration, then clears the selected file.
    await page.evaluate(()=>{window.fetchMode='success';PublishApp.prepareAccountImage=async()=> 'data:image/jpeg;base64,mocked'});
    await page.locator('#autoSave').click(); assert.equal(await page.locator('#acctBackgroundFile').evaluate(e=>e.files.length),0);
    assert.equal(await page.locator('#acctRecovery').isHidden(),true);
    // A lost toggle response uses the same explicit review flow without discarding a new draft.
    await page.fill('#acctDed','مسودة بعد الحفظ'); await page.evaluate(()=>window.fetchMode='lost');
    await page.locator('#acctEnabled + i').click(); await page.locator('#acctRecovery').waitFor({state:'visible'});
    assert.equal(await page.locator('#autoSave').isDisabled(),true);
    await page.evaluate(()=>window.fetchMode='success'); await page.locator('#acctRecheck').click();
    assert.match(await page.locator('#acctSavedReviewText').innerText(),/موقوفة/);
    await page.locator('#acctResume').click(); assert.equal(await page.locator('#acctEnabled').isChecked(),false);
    assert.equal(await page.locator('#acctDed').inputValue(),'مسودة بعد الحفظ');
    // A real click on the switch sends the requested state; no setting fields are sent.
    await page.locator('#acctEnabled + i').click();
    await page.waitForFunction(()=>window.posts.at(-1)?.action==='set_enabled' && window.posts.at(-1)?.enabled===true && !PublishApp._settingsPending);
    assert.equal(await page.locator('#acctEnabled').isChecked(),true);
    assert.deepEqual(Object.keys(await page.evaluate(()=>posts.at(-1))).sort(),['action','enabled']);
    assert.equal(await page.locator('#acctDed').inputValue(),'مسودة بعد الحفظ');
    // The article button explicitly says publish and cancellation sends nothing.
    assert.match(await page.locator('#autoGenArticle').textContent(),/نشر/);
    page.once('dialog', d => d.dismiss()); await page.evaluate(()=>PublishApp.randomArticle(document.querySelector('#autoGenArticle')));
    const articleBefore = before + 3; // one successful save and two toggles
    assert.equal(await page.evaluate(()=>posts.length),articleBefore);
    page.once('dialog', d => d.accept()); await page.evaluate(()=>PublishApp.randomArticle(document.querySelector('#autoGenArticle')));
    assert.equal(await page.evaluate(()=>posts.at(-1).action),'article_random');
    assert.equal(await page.evaluate(()=>posts.length),articleBefore+1);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth),true);
    assert.deepEqual(errors,[]); await ctx.close();
    console.log('ALL OK: ambiguous save, failed/malformed reads, explicit review, local errors and article cancel; mocked network, no publishing');
  } finally { await browser.close(); server.close(); }
})().catch(e => { console.error(e); server.close(); process.exitCode=1; });
