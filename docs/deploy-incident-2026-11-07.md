# حادثة النشر — 5 و7 نوفمبر 2026 (خطة Vercel Hobby)

سجل مختصر لسببين مختلفين أوقفا النشر على `main`، والإصلاح والحواجز التي تمنع تكرارهما.

## 1) 7 نوفمبر — تجاوز عدد دوال الخادم (السبب الرئيسي)

**العَرَض:** أربع عمليات نشر فاشلة (production ×2 وpreview ×2) بين 07:10 و07:16 UTC:

```
Build error
No more than 12 Serverless Functions can be added to a Deployment on the Hobby plan.
```

البناء ينجح ويُرفض **الرفع**، فتظل النسخة القديمة مخدومة على الموقع — فشل صامت.

**السبب:** `main` كان فيه 12 ملفًا في `api/` + `middleware.js` (يُحسب ضمن الحد) = **13**.
الملف الذي بلغ بالعدّاد الحد: `api/app-config.js` — مكرر لوظيفة `/api/ip?mode=config`.
الكوميت `c0715f3` حذفه واستبدله بـrewrite، لكن حل تعارضات PR #2/#3 أعاده.

**الإصلاح:** المسارات الرقيقة صارت وحدات تبدأ بـ`_` (Vercel لا يحسبها دوالًا) تُخدَم من دالة توزيع واحدة `api/gw.js`:

| قبل | بعد |
|-----|-----|
| `api/oauth.js` | `api/_oauth_start.js` — `/api/gw?op=start` |
| `api/social.js` | `api/_social.js` — `/api/gw?op=list\|disconnect` |
| `api/publish.js` | `api/_publish.js` — `/api/gw?op=publish` |
| `api/contact.js` | `api/_contact.js` — `/api/gw?op=contact` |
| 12 + middleware = **13** ❌ | 8 + middleware = **9** ✅ |

`api/oauth/callback.js` بقي ملفًا حقيقيًا: رابطه مسجّل عند المزوّدين الأربعة ولا يجوز تغييره.
الروابط القديمة تبقى عاملة عبر `rewrites` في `vercel.json` — والوجهات التي تحتاج تمرير `?op=`/`?t=` بلا أي بارامتر في الـdestination حتى لا تُفقد.

## 2) 5 نوفمبر — جدول cron متعدد يوميًا

```
Configuration error
Hobby accounts are limited to daily cron jobs.
This cron expression (0 0,8,16 * * *) would run more than once per day.
```

الجدول الحالي سليم (`15 4 * * *` يوميًا · `30 6 * * 1` أسبوعيًا) — ولا يُعاد لأكثر من مرة يوميًا على Hobby.

## الحواجز المضافة

- **`tests/functions_limit.js`** (يعمل مع `npm test` و`npm run test:limits`):
  - عدد الدوال (api بدون `_` + middleware) ≤ 12، وتنبيه عند بلوغ 12 (بلا هامش).
  - رفض عودة `api/app-config.js`.
  - المجدولات: ≤ 2، ولكل منها جدول **يومي كحد أقصى** (دقيقة وساعة ثابتتان؛ رفض `*` والقوائم والنطاقات والخطوات).
  - كل `rewrite` / `cron` / `functions` يشير إلى دالة موجودة، وكل مسار عام مخدوم.
- **كاناري النشرة:** `GET /api/gw?op=version` يكشف كوميت النشرة، و`npm run verify:deploy`
  (`scripts/check_deploy.js`) يقارنه بآخر كوميت على `main` ويخرج بـ1 عند التباعد — لكشف أي فشل رفع صامت.
- توثيق: `GATES.md` G8 (عدد الدوال والمجدولات) وG9 (الإنتاج يخدم آخر كوميت).

## ملاحظة منفصلة لم تُعالج هنا

`public/js/publish.js` على `main` يحتوي **كود خادم** (يبدأ بـ`require("../lib/sess")` و`module.exports`)
داخل مجلد يُخدَم للمتصفح، ويُحمَّل من `public/index.html` كـ`js/publish.js?v=9`.
في المتصفح سيظهر `ReferenceError: require is not defined` وتتعطّل واجهة النشر/الحساب.
يبدو أنه أثر حل تعارضات PR #2/#3: منطق الخادم الجديد (v9) حطّ في مسار العميل، بينما بقي
`api/publish.js` على النسخة القديمة. يحتاج قرارًا: نقل المنطق إلى `api/` وإعادة نسخة عميل صالحة
(أو استرجاع `public/js/publish.js` من `c0715f3`). هذا الإصلاح **لم** يُضمَّن هنا حتى لا تُلغى تعديلات PR #2/#3.
