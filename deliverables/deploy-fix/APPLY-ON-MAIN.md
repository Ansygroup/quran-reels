# إصلاح فشل النشر على `main` — حد دوال Vercel Hobby

## المشكلة (مؤكدة من 4 إيميلات Vercel)

كل عمليات النشر بين 07:10 و07:16 UTC يوم 2026‑11‑07 فشلت بنفس الرسالة:

```
Build error
No more than 12 Serverless Functions can be added to a Deployment on the Hobby plan.
```

البناء (build) كان ينجح، والرفع (upload) هو ما يُرفض — لذلك ظل الموقع يخدم نسخة قديمة (فشل صامت).

**العدّ على `main`:** 12 ملفًا في `api/` + `middleware.js` = **13** دالة، وVercel يحسب `middleware.js` ضمن الحد.

الملف الذي بلغ بالعدّاد الحد: `api/app-config.js` — مكرر لوظيفة `/api/ip?mode=config`.
الكوميت `c0715f3` حذفه سابقًا واستبدله بـ rewrite في `vercel.json`، لكن عمليات الـ merge من PR #2/#3 أعادته.

## الحل المطبَّق (على الفرع `arena/3984b3bb-quran-reels`)

| قبل | بعد |
|-----|-----|
| `api/oauth.js` | `api/_oauth_start.js` (وحدة) — عبر `/api/gw?op=start` |
| `api/social.js` | `api/_social.js` — عبر `/api/gw?op=list|disconnect` |
| `api/publish.js` | `api/_publish.js` — عبر `/api/gw?op=publish` |
| `api/contact.js` | `api/_contact.js` — عبر `/api/gw?op=contact` |
| 12 دالة + middleware = **13** ❌ | 8 دوال + middleware = **9** ✅ |

(الرقعة تشمل أيضًا `api/gw.js?op=version` + `scripts/check_deploy.js` + الحاجز `tests/functions_limit.js`.)

- `api/gw.js` = دالة توزيع واحدة تُفرّق بـ`?op=`.
- الملفات المبدوءة بـ`_` **ليست دوالًا** عند Vercel (وحدات فقط).
- `api/oauth/callback.js` بقي ملفًا حقيقيًا لأن رابطه مسجّل عند مزوّدي OAuth (Google/Meta/TikTok/X) ولا يجوز تغييره.
- الروابط القديمة تبقى عاملة عبر `rewrites` في `vercel.json`:
  `/api/oauth` و `/api/social` → `/api/gw` (بلا بارامتر في الوجهة حتى لا تُفقد `?op=`/`?t=`)،
  `/api/publish` → `/api/gw?op=publish`، `/api/contact` → `/api/gw?op=contact`.
- حاجز آلي: `tests/functions_limit.js` (يعمل مع `npm test` و`npm run test:limits`) يفشل إذا:
  تجاوز العدد 12 · أُعيد `api/app-config.js` · أشار rewrite/cron إلى دالة غير موجودة · توقف مسار عام عن الخدمة.

**التحقق:** نشر Vercel لهذا الفرع انتهى بـ`success` بعد الإصلاح (كان يفشل قبله).

## لماذا لا يوجد PR مباشر إلى `main`؟

`main` وفرع الـ arena **تاريخهما غير مشترك** (`main` = كوميت جذر واحد `7f99b1d`، والفرع من جذر آخر `c0715f3`)، و`git merge-base` يرجع لا شيء. أي PR بينهما سيظهر كأنه يستبدل المستودع كله (8463 ملفًا) وقد يمحو تعديلات PR #2/#3 — لذلك لا يُنصح به.

## الطريقة الآمنة لتطبيق الإصلاح على `main`

من نسخة على `main` (أو من جلسة Arena مبنية على `main`):

```bash
bash deliverables/deploy-fix/apply-on-main.sh
node tests/functions_limit.js      # يجب: المجموع 9/12
git add -A && git commit -m "fix(deploy): keep Vercel Hobby function count under 12"
git push
```

السكربت يقوم بـ:
1. `git rm api/app-config.js`
2. `git apply --3way vercel-function-limit-CORE.patch` (يطبّق **نظيفًا** على `main` — تم التحقق)
3. تشغيل حاجز عدد الدوال

### كشف «النسخة القديمة» بعد التطبيق

الرقعة تضيف كاناري بلا دالة إضافية: `GET /api/gw?op=version` يعيد كوميت النشرة الحالية،
و`npm run verify:deploy` (`scripts/check_deploy.js`) يقارنه بآخر كوميت على `main` ويخرج بـ1 عند التباعد
— فيكشف أي فشل رفع صامت في المستقبل بدل أن تكتشفه من إيميلات Vercel.

```bash
npm run verify:deploy
# ◉ فحص النشرة: https://quran-reels-tau.vercel.app ← origin/main
#   الموقع يخدم : 3a18843 · env=production · ref=main
#   آخر main    : 3a18843
# ✓ الإنتاج يخدم آخر كوميت — لا تباعد
```

### تعديل اختياري بعد ذلك (على `main` فقط)

`public/js/publish.js` على `main` أُعيد كتابته في PR #2/#3، فلا تنطبق عليه الرقعة. التعديل المقصود هو 4 أسطر فقط (اختياري تمامًا لأن الـ rewrites تغطي الروابط القديمة):

```js
"/api/social?op=list"        →  "/api/gw?op=list"
`/api/oauth?op=start&p=...`  →  `/api/gw?op=start&p=...`
"/api/social?op=disconnect"  →  "/api/gw?op=disconnect"
"/api/publish"               →  "/api/gw?op=publish"
```

وكذلك رفع نسخة الكاش في `public/sw.js`: `const CACHE = "qr-v7";` → `"qr-v8"` (حتى يحصل العملاء على الـ JS الجديد).

## فشلٌ ثانٍ مختلف (5 نوفمبر) — أُغلق أيضًا

إيميلات 5 نوفمبر (`c8c5aa9`, `a658382`, `0efa8c1`) لم تكن عن عدد الدوال بل:

```
Configuration error
Hobby accounts are limited to daily cron jobs.
This cron expression (0 0,8,16 * * *) would run more than once per day.
```

السبب: جدول cron يعمل 3 مرات يوميًا. الإعداد الحالي في `vercel.json` سليم (`15 4 * * *` يوميًا و`30 6 * * 1` أسبوعيًا)، والحاجز الآن يرفض أي جدول يعمل أكثر من مرة يوميًا أو أكثر من مجدولين — فالخطأان (الدوال + المجدولات) مغطّيان.

## دروس مستفادة

- لا تُعِد `api/app-config.js` أبدًا؛ الـ rewrite إلى `/api/ip?mode=config` يقوم بالمهمة.
- أي endpoint جديد: ضعه داخل `api/gw.js` (`?op=`) أو في ملف يبدأ بـ`_`.
- `npm test` يشغّل الحاجز أولًا — فلا يعود الخطأ إلى الإنتاج.
- فشل الرفع بعد نجاح البناء يعني أن الموقع يخدم نسخة قديمة؛ يُستحسن فحص أن النسخة المنشورة = آخر كوميت بعد كل push.
