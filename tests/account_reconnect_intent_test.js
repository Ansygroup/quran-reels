'use strict';
/* UI intent warning: all auth and provider traffic are fake. */
const assert=require('node:assert/strict'),fs=require('node:fs'),{JSDOM}=require('jsdom');
const html=fs.readFileSync('public/index.html','utf8'),src=fs.readFileSync('public/js/publish.js','utf8'),tick=()=>new Promise(r=>setImmediate(r));
async function setup(connections=[{id:'a',platform:'youtube',account_name:'القناة أ',has_refresh:true},{id:'b',platform:'youtube',account_name:'القناة ب',has_refresh:true},{id:'fb',platform:'facebook',account_name:'صفحة',has_refresh:null}]){
 const dom=new JSDOM(html,{url:'https://app.test/',runScripts:'outside-only'}),w=dom.window,d=w.document;w.eval(src);const app=w.PublishApp;app._accountOwner='a';app._initSeq=1;app._autoDirty=true;app.data={config:{enabled:true,platforms:['youtube']}};app.available=[{key:'youtube',name:'يوتيوب',connect:'youtube',publish:true,ready:true},{key:'facebook',name:'فيسبوك',connect:'meta',publish:true,ready:true}];
 let tokenCalls=0,starts=[],messages=[],prompts=[];
 w.AuthApp={getToken:async()=>{tokenCalls++;return 'token-a'},getUserId:async()=> 'a'};w.toast=m=>messages.push(m);w.confirm=m=>{prompts.push(m);return false};
 w.fetch=async(url,opts)=>{if(String(url).includes('op=list'))return {ok:true,json:async()=>({connections})};starts.push([url,opts]);return {ok:true,json:async()=>({url:'https://unexpected.example/'})}};
 await app.renderConnections('fixture');app.wireConnections();
 return {dom,w,d,app,starts,messages,prompts,get tokenCalls(){return tokenCalls}};
}
(async()=>{
 {const x=await setup(),group=x.d.querySelector('.chan-group[data-soc="youtube"]'),rel=group.querySelector('[data-channel="a"] [data-connect]'),add=group.querySelector('[data-connect-intent="add"]');
  assert.equal(rel.dataset.connectIntent,'relink');assert.match(rel.textContent,/محاولة إعادة الربط/);assert.match(group.textContent,/لا تضمن تحديث القناة المقصودة/);assert.match(group.textContent,/الإضافة قد تحدّث حسابًا موجودًا/);
  rel.click();add.click();await tick();assert.equal(x.prompts.length,2);for(const msg of x.prompts){assert.match(msg,/اختيار الحساب يتم لدى المنصة/);assert.match(msg,/قد تضيف قناة أو تحدّث قناة أخرى/);assert.match(msg,/أتمتة مفعّلة/)}assert.equal(x.tokenCalls,0);assert.equal(x.starts.length,0);x.dom.window.close();}
 {const x=await setup(),button=x.d.querySelector('[data-channel="fb"] [data-connect]');button.click();await tick();assert.match(x.prompts[0],/فيسبوك وإنستغرام معًا/);assert.equal(x.starts.length,0);x.dom.window.close();}
 for(const mode of ['relink','add']){const x=await setup(),button=x.d.querySelector(`[data-connect-intent="${mode}"]`);x.w.confirm=()=>true;button.click();await tick();await tick();assert.equal(x.tokenCalls,1);assert.equal(x.starts.length,1);assert.equal(x.starts[0][0],'/api/gw?op=start&p=youtube');assert.equal(x.starts[0][1].headers.Authorization,'Bearer token-a');assert.match(x.messages[0],/تعذّر التحقق/);x.dom.window.close();}
 // A changed identity/generation, detached button, concurrent start or failed
 // dialog must never launch the old confirmed request.
 for(const variation of ['switch','switch-back','detached','pending','throws']){const x=await setup(),button=x.d.querySelector('[data-channel="a"] [data-connect]');x.w.confirm=()=>{
  if(variation==='switch'||variation==='switch-back')x.app.authIdentityChanged('b');if(variation==='switch-back')x.app.authIdentityChanged('a');
  if(variation==='detached')button.remove();if(variation==='pending')x.app._connectPending=Symbol('other');if(variation==='throws')throw Error('no dialog');return true};
  button.click();await tick();await tick();assert.equal(x.tokenCalls,0,variation);assert.equal(x.starts.length,0,variation);x.dom.window.close();}
 // Session identity may change before its event is delivered; the later
 // identity lookup must still prevent a request for the old account.
 {const x=await setup(),button=x.d.querySelector('[data-channel="a"] [data-connect]');x.app.init=async()=>{};x.w.confirm=()=>{x.w.AuthApp.getUserId=async()=> 'b';return true};button.click();await tick();await tick();assert.equal(x.starts.length,0);x.dom.window.close();}
 // A first connection is still available and does not invent a reconnect confirmation.
 {const x=await setup([]),button=x.d.querySelector('[data-connect="youtube"]');assert(!button.dataset.connectIntent);x.w.confirm=()=>{throw Error('not expected')};button.click();await tick();await tick();assert.equal(x.starts.length,1);x.dom.window.close();}
 console.log('ALL OK: reconnect/add warn about provider choice and automation; cancel or identity change sends no request (mock network)');
})().catch(e=>{console.error(e);process.exitCode=1});
