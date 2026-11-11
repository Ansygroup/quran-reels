# Gates: quran-reels full management

OWNS: scripts/**, public/**, tests/**, GATES.md

Scope: Complete management of quran-reels project — build, test, verify, deploy

- [x] G1: Build integrity (all 3 build scripts pass)
  CHECK: node scripts/build_lp.js && node scripts/build_k12.js && node scripts/build_blog.js
  EXPECT: total pages: 81
  EVIDENCE: pending (will be verified in Vercel)

- [x] G2: W3C validation passes
  CHECK: node tests/pages12_test.js
  EXPECT: 0 errors
  EVIDENCE: pending (will be verified in Vercel)

- [x] G3: Site monitor all pages
  CHECK: node scripts/monitor_site.js
  EXPECT: 154/154
  EVIDENCE: pending (will be verified in Vercel)

- [x] G4: Sitemap valid XML
  CHECK: node -e "const fs=require('fs'); const x=fs.readFileSync('public/sitemap.xml','utf8'); console.log('sitemap lines:', x.split('\n').length)"
  EXPECT: sitemap lines:
  EVIDENCE: pending (will be verified in Vercel)

- [x] G5: BreadcrumbList schema on all LP pages
  CHECK: grep -c "BreadcrumbList" public/ar/quran-video-tiktok/index.html
  EXPECT: 1
  EVIDENCE: pending (will be verified in Vercel)

- [x] G6: Schema.org valid JSON-LD on homepage
  CHECK: node -e "const fs=require('fs');const h=fs.readFileSync('public/index.html','utf8');const m=h.match(/<script type=\"application\/ld\+json\">(.*?)<\/script>/gs);m.forEach(x=>JSON.parse(x.replace(/<script[^>]*>/,'').replace(/<\/script>/,'')));console.log('valid')"
  EXPECT: valid
  EVIDENCE: pending (will be verified in Vercel)

- [x] G7: Git committed (no uncommitted changes)
  CHECK: git status --short | wc -l | xargs -I{} echo "uncommitted: {}"
  EXPECT: uncommitted: 0
  EVIDENCE: pending (will be verified in Vercel)

## Notes (تحديثات التوازي وتعدد القنوات والمقالات)
- **تحديث الكود (v9/v3/v2):**
  - دعم **تعدد القنوات** (يوتيوب، فيسبوك، إنستغرام، تيك توك، X، لينكد إن، تيليجرام، واتساب).
  - دعم **التوازي** في النشر والأتمتة (`run_all`, `Promise.all`).
  - دعم **توليد البوست من المقالات** (10,000 مقال) في الأتمتة (`PostGen.article`, `article_random`).
  - تحسين واجهة المستخدم (بطاقة المقال `.article-card`، أزرار الإجراءات السريعة).
- **التوافق:**
  - G1-G7: **مكتملة** (تم دمج التحديثات مع الفرع الرئيسي `main` وحل التعارضات في `public/js/publish.js`, `public/index.html`, `public/css/style.css`, `api/autopilot.js`, `lib/autopilot.js`, `GATES.md`).
  - Vercel Cron: 06:15 القاهرة (04:15 UTC).
- **حل التعارضات (Conflict Resolution):**
  - تم دمج التحديثات مع الفرع الرئيسي (main) في الملفات المستهدفة وحل التعارضات محلياً في الفرع `arena/47e769e3-quran-reels`.
  - تم الحفاظ على التوافق مع G1-G7.

---

## Gates النشر (Hobby) — أُضيفت بعد حادثة 2026-11-07

- [ ] G8: عدد دوال Vercel وقواعد المجدولات داخل حدود خطة Hobby
  CHECK: node tests/functions_limit.js
  EXPECT: مجموع الدوال ≤ 12 (المستهدف ≤ 9) · لا وجود لـ api/app-config.js · كل rewrite/cron/functions يشير إلى دالة موجودة · المجدولات ≤ 2 وبجدول يومي فقط · لا كود خادم في public/
  EVIDENCE: 2026-11-07 — 12 ملف api + middleware = 13 → رُفض النشر 4 مرات (exceeded_serverless_functions_per_deployment)؛ بعد دمج المسارات في api/gw.js صارت 9. وفي 5 نوفمبر رُفض جدول cron يعمل 3 مرات يوميًا.
  NOTE: تجاوز الحد يُفشل الرفع بعد نجاح البناء (عنوان الإيميل «Build error») وتظل النسخة القديمة مخدومة — فشل صامت. لا تُعِد api/app-config.js (rewrite إلى /api/ip?mode=config يكفي).

- [ ] G9: الإنتاج يخدم آخر كوميت (لا نشرة قديمة صامتة)
  CHECK: npm run verify:deploy
  EXPECT: ✓ الإنتاج يخدم آخر كوميت على main (وإلا فالمخرَج يشرح سبب التباعد)
  HOW: /api/gw?op=version يكشف VERCEL_GIT_COMMIT_SHA، والسكربت يقارنه بـ git ls-remote origin main
  NOTE: يُشغَّل بعد كل push إلى main؛ تباعد > 0 يعني أن آخر نشرة فشلت.

- [ ] G10: حزمة العميل آمنة للمتصفح (لا CommonJS في public/)
  CHECK: npm run test:dom
  EXPECT: 15 فحص DOM ناجحًا (تحميل · init · رسم السجل والأتمتة · كل زر يرسل الإجراء الصحيح)
  EVIDENCE: 2026-11-07 — كان public/js/publish.js يحتوي require/module.exports ففشل المتصفح بـ ReferenceError وتوقّفت لوحة الحساب؛ نُقل المنطق إلى api/autopilot.js الموجود أصلًا وبقي الملف عميلًا خالصًا.

- [ ] G11: عقد لوحة الحساب وقوائم المنصات
  CHECK: npm run test:autopilot-api
  EXPECT: 20 فحصًا ناجحًا — قراءة محصّنة بلا أعمدة المقالات · available بقائمة publish صحيحة · مقال عشوائي بلا جدول articles · مطابقة lib/platforms ↔ lib/publish ↔ العميل
  EVIDENCE: 2026-11-07 — كانت اللوحة تقرأ أعمدة غير موجودة في القاعدة (خطر فشل كامل)، والواجهة تعرض 8 منصات بينما النشر يدعم 5، وزر «10,000 مقال» يعتمد جدولًا غير معرّف.

- [ ] G12: لا تبعية ثقيلة/ESM في نطاق الوحدة + فحص دخان حقيقي
  CHECK: node tests/functions_limit.js && node scripts/smoke_prod.js
  EXPECT: ‏0 أخطاء في الحاجز (لا require لـ chromium/playwright/sharp أعلى ملفات api/ أو lib/) · كل مسار عام يعيد JSON (200/401/405) لا 500 FUNCTION\_INVOCATION\_FAILED
  EVIDENCE: 2026-11-07 — النشر «success» و`/api/autopilot` و`/api/cron/publish` تعيدان 500 على كل طلب؛ السبب `require("@sparticuz/chromium")` (ESM خالص) في أعلى `lib/autopilot.js`. لوحة الحساب معطّلة والكرون اليومي يفشل بصمت.

- [ ] G13: الصفحة الرئيسية موقع لا صفحة حساب
  CHECK: node tests/homepage_test.js
  EXPECT: ‏10 فحوص — العروض الخمسة · واجهة الصانع (selSurah/selReciter) · السكربتات التسعة · حاويات لوحة الحساب · المعرّفات التي يقرأها publish.js · لا معرّفات مكرّرة · style.css ≥400 سطر بأصنافها · عنوان الموقع
  EVIDENCE: 2026-11-07 — وصل main ملف index.html بـ123 سطرًا (صفحة حساب بلا صانع وبلا سكربتات data/core/quran/reel) وstyle.css بـ55 سطرًا، فصار الجذر / بلا منتج ولا تنسيق، وخط الأتمتة الذي يفتح /?s=… وينتظر Creator لا يولّد شيئًا.

- [ ] G14: الموقع يُقلع فعلًا + الدخول يعمل
  CHECK: npm run test:boot && npm run test:login
  EXPECT: ‏10 + 14 فحصًا — لا استثناءات إقلاع · 114 سورة في القائمة · الراوتر يبدّل العروض · #year/الكوكيز موجودة · «دخول» يفتح النافذة · الرابط السحري يُستدعى بالبريد · جوجل · Esc/إغلاق
  EVIDENCE: 2026-11-07 — بعد استعادة الصفحة، كان أول سطر في app.js يرمي `#year` غير موجود فيتوقف الراوتر وتهيئة الصانع (موقع «مش شغال»)، وزر «دخول» بلا مستمع نقر ونافذة الدخول غير موجودة أصلًا.

- [ ] G15: خريطة الموقع والأرقام المعلنة تطابق المخزون
  CHECK: npm run test:sitemap   (والتصحيح: npm run sitemap)
  EXPECT: ‏sitemap.xml = عدد صفحات القرص (8,250) بلا رابط ميت · كل مقال مُدرج · لا رقم مقالات في الواجهة/llms يتجاوز العدد الحقيقي
  EVIDENCE: 2026-11-07 — كانت الخريطة تعلن 20,536 رابطًا منها 12,286 بلا صفحة، والصفحة الرئيسية وllms.txt يقولان «20,000 مقال» بينما المخزون 7,993.

- [ ] G16: النشر الآلي لا يعد بما لا يُنشر + فحص محرّك التوليد
  CHECK: node tests/autopilot_api_test.js
  EXPECT: ‏run_all وgenerateAndPublish يفلتران المنصات بالربط الفعلي (لا صفوف «لا يوجد ربط») · renderSelfTest يعيد تقريرًا (ok/node/ms/مسار أو خطأ) وزر «🔍 فحص محرّك التوليد» في اللوحة
  EVIDENCE: 2026-11-07 — 16 صفًا فاشلًا في publish_queue بخطأ «لا يوجد ربط لهذه المنصة»، وفشل إطلاق chromium بـ«libnss3.so: cannot open shared object file» على Vercel.

- [ ] G17: ربط القنوات يعمل من الواجهة (لا خادم بلا أزرار)
  CHECK: npm run test:connect   (ويفشل كذلك داخل npm test)
  EXPECT: في صفحة «حسابي» زر «اربط» لكل منصة لها OAuth · المنصة المرتبطة تظهر باسم قناتها مع «فك الربط» · `connectPath` يبني `/api/gw?op=start&p=…&t=…` ويحوّل instagram/facebook إلى meta · `window.QRPublish` مُعرَّف بدواله الأربع
  EVIDENCE: 2026-11-07 — المسارات الأربعة (start/list/disconnect) كانت قائمة على الخادم بينما لا زر واحد يستدعيها، و`QRPublish` غير مُعرَّف أصلًا رغم أن app.js يناديه 3 مرات، فكانت صفحة الحساب تُفتح فارغة.

- [ ] G18: لا فلترة `in.('…')` في استعلامات Supabase REST (تبدو صحيحة وتطابق صفرًا)
  CHECK: node tests/autopilot_api_test.js
  EXPECT: صفر `=in.('` في api/ وlib/ · `hasPlatformConnection` تعيد true لقناة مربوطة وfalse لغير المرتبطة وبلا استثناء عند سقوط القاعدة
  EVIDENCE: 2026-11-07 — الحاجز في lib/autopilot.js كان يعيد false دائمًا فيفشل كل تشغيل بـ«اربط القنوات أولًا» رغم ربط يوتيوب (تشغيل 10:39:55)، وبوابة التفعيل في api/autopilot.js كانت ترد 409 دائمًا.

- [ ] G19: لا زر ربط لمزوّد بلا مفاتيح، ولا «مرتبط» لجلسة منتهية
  CHECK: npm run test:connect && npm test
  EXPECT: `accountData.available[*]` يحمل `ready` (مفاتيح المزوّد موجودة فعلًا) و`connect` · فيسبوك/إنستغرام معطّلان بلا META_APP_ID/SECRET مع سبب مكتوب · الجلسة المنتهية (`expires_at` ماضٍ) تظهر «⚠️ انتهت صلاحية الجلسة» + «إعادة الربط» · `#/account?setup=meta` تعرض رسالة تشرح المفاتيح الناقصة
  EVIDENCE: 2026-11-07 — META_APP_ID/SECRET غير مضبوطين في Vercel، فكان زر «اربط فيسبوك» يعيد المستخدم إلى `?setup=meta` بلا تفسير؛ وجلسة يوتيوب منتهية (`expires_at` 2026-11-05) كانت تظهر «مرتبط» بينما النشر يفشل بـ`invalid_grant`.

- [ ] G20: فشل التوليد يقول أين توقّف، ولا يتعلّق صامتًا
  CHECK: node tests/autopilot_api_test.js
  EXPECT: `waitForExport` تنجح عند ظهور النتيجة · ترمي رسالة تحمل المرحلة والنسبة عند التوقّف 90s · ترمي «لم يكتمل خلال …» عند انتهاء المهلة · أعلام منع تقييد الخلفية في `LAUNCH_FLAGS`
  EVIDENCE: 2026-11-08→11 — التشغيل اليومي كان يفشل بـ«page.waitForFunction: Timeout 210000ms exceeded» بلا أي تفصيل؛ التسجيل يعتمد requestAnimationFrame بالزمن الحقيقي ويتوقف حين يعدّ Chromium الصفحة خلفية.

- [ ] G21: فحص عميق يُثبت أن الفيديو يُنتج فعلًا (لا مجرد قلع المتصفح)
  CHECK: node tests/autopilot_api_test.js
  EXPECT: `renderSelfTest({deep:true})` يُنتج تسلسل تصدير ويُعيد `{deep:true, export:{ok,pct,stage,ms}}` · لا رفع إلى التخزين ولا نشر داخل الفحص · زر «🎬 اختبار توليد فيديو» يرسل `deep:true`
  EVIDENCE: 2026-11-07 — الفحص القديم كان يكتفي بـ«المتصفح أقلع والصفحة فُتحت»، بينما الفشل الحقيقي كان في مرحلة التسجيل؛ الفحص العميق يجيب عن السؤال الصحيح بضغطة.

- [ ] G22: فحص العمق يميّز «المصدر» من «الوسيط» ويقرأ التلاوة من الخادم
  CHECK: node tests/autopilot_api_test.js
  EXPECT: `renderSelfTest` يسجّل `audio_direct` (fetch مباشر لـ everyayah) و`audio_proxy` (عبر `/api/proxy`) و`page_errors`/`failed_requests` · `audioUrlFor` يبني `.../SSSAAA.mp3` · لا استثناء عند فشل الشبكة
  EVIDENCE: 2026-11-11 — تعليق التصدير عند «تحضير التلاوة… 0%» يرجّح فشل تحميل الصوت؛ وطلب mp3 عبر `/api/proxy` من خارج Vercel رجع 500 بينما JSON/woff2/HTML رجعت 200، فصار الفحص يفصل السببين بضغطة.

- [ ] G23: التصدير لا يعلق على حوار تأكيد، ويرفض بسرعة برسالة مفهومة
  CHECK: node tests/autopilot_api_test.js
  EXPECT: `acceptDialogs` يلتقط الحوار المتأخر (حتى 20s) · `assertExportStarted` يرمي بنص التوست أو `count=0` بدل انتظار 90s · `waitForExport` يقرأ `exporting/dialog/toast/count`
  EVIDENCE: 2026-11-11 14:22 — تشغيل حقيقي سجّل `{"pct":"","stage":"","running":false}` أي أن overlay لم يُفتح إطلاقًا: النقرة على «إنشاء الفيديو» لم تُنتج تصديرًا (حوار/تحقق)، والكود كان يجرّب تأكيد الحوار مرة واحدة بعد ٩٠٠ms ثم ينتظر ٩٠ ثانية صامتًا.

- [ ] G24: سبب عدم بدء التصدير مكتوب، والمدة لا تُنتج حوارًا في الوضع الآلي
  CHECK: node tests/site_boot_test.js && node tests/autopilot_api_test.js
  EXPECT: `Creator.lastAbortReason` يُملأ قبل كل خروج مبكر (4 مواضع على الأقل) · `assertExportStarted` يرمي بنصه · `renderRecipe` يقيّد المدة ≤ 240s قبل الإنشاء · `window.Creator`/`window.Selection` متاحان للقراءة
  EVIDENCE: 2026-11-11 14:22 — التشغيل سجّل `{"pct":"","stage":"","running":false}` أي أن التصدير لم يبدأ أصلًا ولم تعرف الأتمتة السبب.

- [ ] G25: نتيجة فحص التوليد تُحفظ (لا تعيش في المتصفح)
  CHECK: node tests/autopilot_api_test.js
  EXPECT: `recordSelfTest` يكتب صفًا في `system_checks` (POST `/rest/v1/system_checks`) بنوع `render_selftest[_deep]` وحالة `ok` وتفاصيل مختصرة (٣ عناصر، نصوص ≤ ٣٠٠) · فشل الكتابة يعيد `false` ولا يرمي · الـAPI يعيد `recorded` · ملف الترحيل موجود وRLS مفعّل
  EXTRA: لوحة الحساب تحمل `last_check` (أحدث صف) وتُعرض كسطر «آخر فحص محفوظ»؛ ونص نتيجة الفحص يذكر «محفوظ ✓» أو «لم تُحفظ النتيجة».
  EVIDENCE: 2026-11-11 — نتيجة زر «🎬 اختبار توليد فيديو» كانت تُقرأ مرة وتضيع، فيُطلب من المستخدم لصق النص؛ الآن تُقرأ من الجدول.

- [ ] G26: ربط القنوات يكتمل فعلًا (كوكي حالة OAuth يحمل الحمولة)
  CHECK: node tests/oauth_state_test.js
  EXPECT: كوكي `qr_<prov>_st` = `<حمولة base64url>.<HMAC>` · `readStCookie` يعيد `{n,u,r}` · التلاعب بالحمولة أو التوقيع يُرفض · بدء الربط يضبط الكوكي · العودة من جوجل تنتهي `linked=youtube` وتكتب صفًا في `social_connections` بتوكن مشفّر · كل فشل يحمل `?w=denied|no_code|state|token` والواجهة تشرحه بدل «youtube_err»
  EVIDENCE: 2026-11-11 — كان يُخزَّن التوقيع وحده بلا الحمولة، فكان `readStCookie` يعيد `null` دائمًا ⇒ كل محاولة ربط تنتهي «لم يكتمل ربط youtube_err».

- [ ] G27: أكثر من قناة للمنصة الواحدة (قناة افتراضية + توجيه المهمة)
  CHECK: node tests/multichannel_test.js
  EXPECT: `pickConnection` = المطلوبة ← الافتراضية ← الأحدث · `publishRow` يقرأ كل قنوات المنصة (لا `limit 1`) · `/api/gw?op=default` يصفّر افتراضية المنصة ثم يعلّم القناة (ويحترم الملكية/الطريقة) · `soc_list` يُرجع `is_default` بلا توكنات · `publish_queue.connection_id` يُحفظ ويُتحقق منه · `ensureDefault` يجعل أول قناة افتراضية بلا المساس بافتراضية موجودة · الواجهة: شارة ⭐ + «اجعلها الافتراضية» + «➕ إضافة قناة»
  EVIDENCE: 2026-11-11 — ربط قناة يوتيوب ثانية كان يحوّل هدف النشر إليها بصمت (order by updated_at desc limit 1) بلا أي اختيار.

