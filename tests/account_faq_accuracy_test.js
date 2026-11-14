/* Home FAQ: displayed copy must agree with structured data and current limits. */
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const data=fs.readFileSync('public/js/data.js','utf8'),html=fs.readFileSync('public/index.html','utf8'),sw=fs.readFileSync('public/sw.js','utf8');
const ctx=vm.createContext({});vm.runInContext(data,ctx);const pairs=vm.runInContext('FAQ',ctx);
const scripts=[...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(m=>JSON.parse(m[1]));
const ld=scripts.find(x=>x['@type']==='FAQPage');assert(ld);const visible=new Map(pairs);
for(const q of ld.mainEntity){assert(visible.has(q.name),`structured FAQ is absent from displayed FAQ: ${q.name}`);assert.equal(q.acceptedAnswer.text,visible.get(q.name),`FAQ text differs for ${q.name}`)}
const get=q=>{assert(visible.has(q),q);return visible.get(q)};
assert.match(get('هل أحتاج تسجيل حساب أو تثبيت برنامج؟'),/جدولة.*غير متاحة/);
assert.match(get('على أي منصات أنشر الفيديو؟'),/تيليجرام وواتساب غير متاح/);
assert.match(get('هل يمكن للموقع أن ينشر فيديوهاتي تلقائيًا؟'),/04:15 UTC/);
assert.match(get('هل يمكن للموقع أن ينشر فيديوهاتي تلقائيًا؟'),/النشر غير مضمون/);
assert.match(get('كيف أربط قناتي بيوتيوب أو المنصات؟'),/قد يؤدي الربط إلى تفعيل الأتمتة/);
assert.match(get('هل ربط حساباتي آمن؟'),/لا ينبغي افتراض نجاح حذفها/);
for(const q of ['هل بياناتي محفوظة عندكم؟','هل ربط حساباتي آمن؟'])assert.doesNotMatch(get(q),/الخادم فقط|ولا تظهر في أي استجابة|تُحذف فورًا|تُحذف بضغطة/);
const ver=(html.match(/js\/data\.js\?v=(\d+)/)||[])[1];assert(ver&&sw.includes(`/js/data.js?v=${ver}`),'service worker must cache the same data version');
console.log('ALL OK: displayed and structured FAQ agree on account, scheduling, connection and direct messaging limitations');
