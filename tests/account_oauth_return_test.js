'use strict';
// The callback hash is untrusted display input, not evidence about account state.
const assert=require('node:assert/strict');
const fs=require('node:fs');const {JSDOM}=require('jsdom');
const src=fs.readFileSync('public/js/publish.js','utf8');
const dom=new JSDOM('<!doctype html><div id="acctNotice" hidden></div>',{url:'https://app.test/?source=kept#/account',runScripts:'outside-only'});
const w=dom.window;let toasts=[];w.toast=x=>toasts.push(x);w.eval(src);
const notice=w.document.querySelector('#acctNotice');
function report(hash){w.history.replaceState(null,'','/?source=kept'+hash);notice.textContent='';toasts=[];w.PublishApp.reportLinkedFlag();return notice.textContent;}
for(const platform of ['youtube','meta','tiktok','x']){
 const text=report(`#/account?linked=${platform}`);assert.match(text,/يشير رابط العودة/);assert.match(text,/لا يؤكد نجاحه أو الحساب/);assert.doesNotMatch(text,/تم ربط/);assert.match(text,/القنوات المرتبطة/);assert.equal(w.location.hash,'#/account');assert.equal(w.location.search,'?source=kept');assert.equal(toasts.length,1);
}
let text=report('#/account?linked=meta_err&w=store');assert.match(text,/قد تكون بعض القنوات حُفظت بالفعل/);assert.match(text,/حالة الأتمتة/);
for(const provider of ['x','tiktok','meta']){text=report(`#/account?linked=${provider}_err&w=identity`);assert.match(text,/تعذّر التحقق من هوية الحساب/);assert.match(text,/راجع الحساب والصلاحيات/);assert.doesNotMatch(text,/تم ربط/);}
text=report('#/account?linked=meta_err&w=pages');assert.match(text,/لا يدعم الربط اختيار صفحة من عدة صفحات/);assert.match(text,/قائمة غير مكتملة/);assert.doesNotMatch(text,/تم ربط/);
text=report('#/account?setup=meta');assert.match(text,/غير مهيأ/);assert.match(text,/لا يؤكد الإعداد الحالي/);assert.doesNotMatch(text,/الربط متاح الآن/);
text=report('#/account?linked=youtube&auto_error=1&auto_resume=published&channel=nondefault&keep=hello');assert.match(text,/قد تكون الأتمتة لم تُفعّل/);assert.match(text,/رابط عودة قديم/);assert.match(text,/قد تكون القناة دي مش الافتراضية/);assert.equal(w.location.hash,'#/account?keep=hello');
for(const hash of ['#/account?linked=youtube&linked=meta','#/account?linked=youtube&setup=meta']){text=report(hash);assert.match(text,/غير واضح/);assert.doesNotMatch(text,/تم ربط/);}
for(const hash of ['#/account?linked=constructor','#/account?linked=__proto__','#/account?linked=%3Cimg%20src=x%20onerror=alert(1)%3E','#/account?linked=meta_err&w=constructor']){text=report(hash);assert.match(text,/المنصة|راجع القنوات/);assert(!notice.querySelector('img,script'));assert.doesNotMatch(text,/function Object/);}
text=report('#/account?linked=youtube&other_auto_resume=published&not_auto_error=1');assert.doesNotMatch(text,/رابط عودة قديم|قد تكون الأتمتة لم/);
assert.equal(report('#/not-account?linked=youtube'),'');assert.equal(w.location.hash,'#/not-account?linked=youtube');assert.equal(toasts.length,0);
dom.window.close();console.log('ALL OK: untrusted OAuth return flags do not assert account or channel success (mock DOM)');
