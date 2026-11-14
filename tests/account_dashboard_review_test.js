/* UI/response review with mocked network, no login or publishing. */
const assert=require('node:assert/strict'),fs=require('node:fs');
const {JSDOM}=require('jsdom');
const dom=new JSDOM(fs.readFileSync('public/index.html','utf8'),{url:'https://app.test/',runScripts:'outside-only'});
const w=dom.window;w.eval(fs.readFileSync('public/js/publish.js','utf8'));const app=w.PublishApp,d=w.document;
(async()=>{
 app.renderHistory([{status:'queued',title:'<img>',external_url:'https://youtu.be/one | https://youtu.be/two | javascript:alert(1)'}]);
 assert.match(d.querySelector('#queueList').textContent,/الطابور/);assert(!d.querySelector('#queueList img'));assert.equal(d.querySelectorAll('#queueList a').length,2);assert.equal(d.querySelectorAll('#queueList a')[1].href,'https://youtu.be/two');
 app.renderHistory([],false);assert.match(d.querySelector('#queueList').textContent,/تعذّر تحميل/);assert.match(d.querySelector('#acctHistorySummary').textContent,/تعذّر تحميل/);assert.doesNotMatch(d.querySelector('#queueList').textContent,/لا يوجد سجل/);
 app.renderKpis({stats:null});assert.match(d.querySelector('#acctKpis').textContent,/تعذّر تحميل/);assert(!d.querySelector('#acctKpis').textContent.includes('0'));
 app.renderPendingReview({available:true,truncated:true,items:[{id:'p1',platform:'youtube',status:'scheduled',title:'<img src=x>',channel:null,target_recorded:false,publish_at:'2026-11-08T04:15:00Z'},{id:'p2',platform:'youtube',status:'publishing',channel:'<script>x</script>',target_recorded:true}]});
 assert.match(d.querySelector('#acctPendingReviewList').textContent,/قد تُختار قناة أخرى/);assert.match(d.querySelector('#acctPendingReviewList').textContent,/قيد النشر/);assert.match(d.querySelector('#acctPendingReviewList').textContent,/أول ٢٠/);assert.equal(d.querySelector('#acctPendingReviewList img, #acctPendingReviewList script'),null);
 assert.match(d.querySelector('#acctPendingSummary').textContent,/2 في اللقطة.*قد توجد أخرى/);
 app.renderPendingReview({available:false,items:[]});assert.match(d.querySelector('#acctPendingReviewList').textContent,/تعذّر تحميل/);assert.match(d.querySelector('#acctPendingSummary').textContent,/تعذّر التحقق/);
 app.renderPendingReview({available:true,items:[]});assert.match(d.querySelector('#acctPendingReviewList').textContent,/لا يثبت ذلك خلو الطابور/);assert.match(d.querySelector('#acctPendingSummary').textContent,/هذه اللقطة/);
 const pendingItem={id:'p1',platform:'youtube',status:'publishing',target_recorded:true,channel:null,publish_at:'04:15:00'};
 app.renderPendingReview({available:true,items:[pendingItem]});assert.match(d.querySelector('#acctPendingReviewList').textContent,/تعذّر معرفة اسم القناة/);assert.match(d.querySelector('#acctPendingReviewList').textContent,/وقت غير متاح/);assert.doesNotMatch(d.querySelector('#acctPendingReviewList').textContent,/UTC.*القاهرة/);
 for (const invalid of [null,{...pendingItem,target_recorded:undefined},{...pendingItem,target_recorded:false,channel:'contradiction'},{...pendingItem,status:'published'},{...pendingItem,id:''}]) {app.renderPendingReview({available:true,items:[invalid]});assert.match(d.querySelector('#acctPendingReviewList').textContent,/تعذّر تحميل/);}
 assert.match(d.querySelector('#acctPendingReview').textContent,/قد لا تشمل كل المهام/);assert.match(d.querySelector('#acctPendingReview').textContent,/اختار وجهته بالفعل/);
 app.renderFailedReview({available:true,truncated:true,items:[{id:'q<1',platform:'youtube',title:'<img src=x>',channel:null,target_recorded:false,created_at:'2026-11-07T00:00:00Z'}]});
 assert.match(d.querySelector('#acctFailedReviewList').textContent,/الوجهة الأصلية غير محددة/);assert.match(d.querySelector('#acctFailedReviewList').textContent,/أحدث ٢٠/);assert.equal(d.querySelector('#acctFailedReviewList img'),null);
 app.renderFailedReview({available:false,items:[]});assert.match(d.querySelector('#acctFailedReviewList').textContent,/تعذّر تحميل/);
 app.renderFailedReview({available:true,items:[]});assert.match(d.querySelector('#acctFailedReviewList').textContent,/لا يثبت ذلك خلو السجل/);
 for (const invalid of [null,{id:'q1',platform:'youtube',channel:null},{id:'q1',platform:'youtube',channel:'x',target_recorded:false}]) {app.renderFailedReview({available:true,items:[invalid]});assert.match(d.querySelector('#acctFailedReviewList').textContent,/تعذّر تحميل/);}
 assert.match(d.querySelector('#acctFailedReview').textContent,/قد لا تشمل كل المحاولات/);
 assert.equal(app.reviewTimestamp('04:15:00'),'وقت غير متاح');assert.equal(app.reviewTimestamp('2026-01-01T04:15:00'),'وقت غير متاح');assert.equal(app.reviewTimestamp('not-a-date'),'وقت غير متاح');assert.match(app.reviewTimestamp('2026-01-01T04:15:00Z'),/القاهرة/);
 assert.equal(app.cairoClockLabel('04:15:00'),'04:15 UTC');assert.equal(app.cairoClockLabel('24:15'),'وقت غير صالح');
 const summer='2026-07-01T04:15:00Z', winter='2026-01-01T04:15:00Z';
 for(const t of [summer,winter]) assert.equal(app.cairoClockLabel(t),new Date(t).toLocaleString('ar-EG',{timeZone:'Africa/Cairo',dateStyle:'short',timeStyle:'short'}));
 assert.match(app.cairoClockLabel(summer),/٧:١٥/);assert.match(app.cairoClockLabel(winter),/٦:١٥/);
 assert.match(app.dailyLine({run_date:'2026-11-07',status:'queued'}),/الطابور/);assert.doesNotMatch(app.dailyLine({run_date:'2026-11-07',status:'queued'}),/فشل/);
 app.data={config:{enabled:true,platforms:['youtube']}};app.connections=[{platform:'youtube'}];app._connectionsState='error';app.renderStatus(app.data);assert.match(d.querySelector('#acctStateLabel').textContent,/غير معروفة/);
 app._connectionsState='loaded';app.connections=[{platform:'tiktok'}];app.renderStatus(app.data);assert.match(d.querySelector('#acctStateLabel').textContent,/تحقق من وجهات/);
 // Historical provider errors are not evidence that a particular present-day channel expired.
 assert.match(app.friendly('invalid_grant'),/المنصة/);assert.doesNotMatch(app.friendly('invalid_grant'),/يوتيوب|انتهت صلاحية/);assert.match(app.friendly('x invalid_grant'),/X/);assert.match(app.friendly('invalid_client'),/فشل تجديد/);assert.doesNotMatch(app.friendly('انتهت صلاحية ربط يوتيوب'),/انتهت صلاحية/);
 app.data={last_daily:{error:'invalid_grant'}};assert.match(app.reauthLineHTML(undefined),/المنصة غير المحددة/);assert.doesNotMatch(app.reauthLineHTML(undefined),/يوتيوب/);
 app._accountOwner='owner';app._initSeq=1;app.available=[{key:'youtube',name:'يوتيوب',publish:true,ready:true}];app.data={config:{enabled:true,platforms:['youtube']}};
 app.reauth=['youtube'];app.connections=[{platform:'youtube'}];app._connectionsState='loaded';app.renderStatus(app.data);assert.match(d.querySelector('#acctStateLabel').textContent,/فشل تجديد سابق/);assert.match(d.querySelector('#acctNextRun').textContent,/لا يؤكد حالة الربط الحالية/);
 w.AuthApp={getToken:async()=> 'fixture-session',getUserId:async()=> 'owner'};w.fetch=async()=>({ok:true,json:async()=>({connections:[{id:'a',platform:'youtube',account_name:'أ',has_refresh:true},{id:'b',platform:'youtube',account_name:'ب',has_refresh:false}]})});await app.renderConnections('x');
 const group=d.querySelector('.chan-group[data-soc="youtube"]');assert.match(group.textContent,/فشل تجديد سابق لهذه المنصة/);assert.match(group.textContent,/لا يحدد القناة/);assert.match(group.querySelector('[data-channel="a"]').textContent,/الصلاحية الحالية غير مؤكدة|صلاحيتها الحالية غير مؤكدة/);assert.match(group.querySelector('[data-channel="b"]').textContent,/تعذّر التحقق من وجود تصريح تجديد صالح/);assert.doesNotMatch(group.textContent,/انتهت صلاحية الربط/);app.reauth=[];
 w.AuthApp={getToken:async()=> 'fixture-session',getUserId:async()=> 'owner'};
 const pending=[];w.fetch=()=>new Promise(resolve=>pending.push(resolve));
 const old=app.renderConnections('x');await new Promise(resolve=>setImmediate(resolve));
 const fresh=app.renderConnections('x');await new Promise(resolve=>setImmediate(resolve));
 pending[1]({ok:true,json:async()=>({connections:[{id:'new',platform:'youtube',account_name:'new',is_default:false}]})});await fresh;
 pending[0]({ok:true,json:async()=>({connections:[{id:'old',platform:'youtube',account_name:'old'}]})});await old;
 assert.equal(app.connections[0].id,'new');assert.equal(d.querySelector('[data-default="new"]').disabled,true);
 let disabledCalls=0;w.fetch=async()=>{disabledCalls++;throw Error('unexpected request')};app.wireConnections();
 d.querySelector('[data-default="new"]').dispatchEvent(new w.MouseEvent('click',{bubbles:true}));await new Promise(resolve=>setImmediate(resolve));assert.equal(disabledCalls,0,'synthetic click cannot activate disabled default control');
 w.fetch=async()=>({ok:true,json:async()=>({})});await app.renderConnections('x');assert.match(d.querySelector('#acctStateLabel').textContent,/غير معروفة/);assert.match(d.querySelector('#acctAccountsList').textContent,/تعذّر تحميل/);
 let request, message='';w.AuthApp={getToken:async()=> 'fixture-session',getUserId:async()=> 'owner'};w.toast=t=>{message=t};
 w.fetch=async(url,opts)=>{request={url,opts};return {ok:true,json:async()=>({url:'https://malicious.example/'})}};
 d.querySelector('#acctAccountsList').innerHTML='<button data-connect="youtube">اربط</button>';app.wireConnections();d.querySelector('[data-connect]').click();
 await new Promise(resolve=>setTimeout(resolve,10));
 assert.equal(request.url,'/api/gw?op=start&p=youtube');assert.equal(request.opts.method,'POST');assert.equal(request.opts.headers.Authorization,'Bearer fixture-session');assert(!request.url.includes('fixture-session'));assert.match(message,/تعذّر التحقق/);assert.equal(d.querySelector('[data-connect]').disabled,false);
 // An unresponsive disconnect must time out and report uncertainty, not success.
 let fireTimeout, unlinkCalls=0;w.confirm=()=>true;const oldTimer=w.setTimeout,oldClear=w.clearTimeout;
 w.setTimeout=fn=>{fireTimeout=fn;return 5};w.clearTimeout=()=>{};
 w.fetch=async(url,opts)=>{unlinkCalls++;assert.match(url,/op=disconnect/);return new Promise((_,reject)=>opts.signal.addEventListener('abort',()=>reject(Error('aborted'))))};
 d.querySelector('#acctAccountsList').innerHTML='<button data-unlink="conn">فك الربط</button>';
 const unlink=d.querySelector('[data-unlink]');unlink.click();await new Promise(resolve=>setImmediate(resolve));assert.equal(unlink.disabled,true);fireTimeout();await new Promise(resolve=>setImmediate(resolve));
 assert.equal(unlink.disabled,false);assert.equal(unlinkCalls,1);assert.match(message,/تعذّر تأكيد فك الربط/);
 w.setTimeout=oldTimer;w.clearTimeout=oldClear;
 console.log('ALL OK: dashboard truthful states, bounded disconnect uncertainty, OAuth header and unsafe-link rejection, stale connections (mock DOM)');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>dom.window.close());
