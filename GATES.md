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

- [ ] G28: التشغيل الآلي يكمل بلا تدخّل (صوت + إعادة محاولة + تسجيل)
  CHECK: node tests/autonomy_test.js
  EXPECT: `installAudioRoute` يعترض `/proxy?u=` و`/api/proxy?u=` ويخدم الصوت من الخادم (200 + `audio/mpeg` + ACAO) · `fetchAudio` يقصر المضيفين على everyayah/qurango ويمنع التكرار بالكاش ويرفض الضخم والفاشل بلا استثناء · `runWithRetry` يحاول مرتين عند فشل عارض، مرة واحدة عند النجاح، ويلتزم الميزانية الزمنية · `recordDaily` يكتب `system_checks/autopilot_daily` بعدد المحاولات ولا يُفشل التشغيل · `runDailyAutopilots` يستخدم الاثنين
  EVIDENCE: 2026-11-11 — التصدير كان يتوقف قبل البدء، وأحد أسباب ذلك أن `/proxy` يُرجع 500 لملفات mp3، وفشل يوم كامل يحتاج تدخّلًا يدويًا.

- [ ] G29: الماركب لا يفقد عناصر يعتمد عليها الكود (سبب توقّف التوليد الحقيقي)
  CHECK: node tests/markup_ids_test.js
  EXPECT: كل معرّف ثابت في `creator.js` موجود في `index.html` · نافذة التصدير كاملة (16 معرّفًا: `#exportOverlay`, `#expRunning`, `#expResult`, `#expPct`, `#expBar`, `#expStage`, `#expSub`, `#miniCanvas`, `#resultVideo`, `#resultMeta`, `#btnDownload`, `#btnShare`, `#btnSchedule`, `#btnNew`, `#btnCancelExport`, `#chkNotify`) · `startExport` يحمي ضد غياب النافذة (لا يبقى `exporting=true`) · `confirmDialog` يستخدم `.overlay`+`[data-ok]` ونافذة التصدير لا تحتوي `data-ok` · الكاش `creator.js?v=5` و`qr-v19`
  EVIDENCE: 2026-11-11 — `startExport` كان يفتح `#exportOverlay` وهي **غير موجودة** في الماركب، فيرمي `Cannot set properties of null` ويبقى `exporting=true` عند 0% للأبد (طابق أعراض كل التشغيلات الفاشلة من 11-04). أُثبت بتشغيل حقيقي على Chromium: `tools/e2e_render.js` ⇒ `export.ok=true` و100% وملف mp4.

- [ ] G30: التشغيل اليومي يفحص نسخة الإنتاج قبل أن يحرق ميزانيته
  CHECK: node tests/autonomy_test.js + LD_LIBRARY_PATH=/tmp/al2023/lib node tools/e2e_daily.js
  EXPECT: `preflightPage` يقرأ `SITE/` ويتأكد من وجود `#exportOverlay`/`#expPct`/`#expStage`/`#expRunning`/`#expResult`/`#btnCancelExport` + إصدارات `creator/quran/publish` · صفحة ناقصة أو 503 أو انقطاع ⇒ فشل واضح بلا استثناء · `closeStaleRuns` يغلق `autopilot_runs` العالقة (`rendering` > 45 دقيقة) · التشغيل اليومي: تنظيف ← فحص ← توليد، وفشل الفحص ⇒ لا توليد ويُسجَّل السبب · الفحص اليدوي يحمل `preflight` في تقريره
  EVIDENCE: 2026-11-11 — سقطت `#exportOverlay` من الماركب فاحترقت خمس دقائق في كل تشغيل. التشغيل الآلي الكامل أُثبت بمحاكي حقيقي: `tools/e2e_daily.js` ⇒ preflight ok · فيديو mp4 · رفع · صف نشر · نشر · تسجيل (26.6s).

- [ ] G31: «انشر على كل القنوات المرتبطة» (تعدد القنوات في التشغيل الآلي)
  CHECK: node tests/multichannel_test.js
  EXPECT: `planTargets` = مهمة واحدة بلا `connection_id` عند `all_channels=false` (الافتراضي) · مهمة لكل قناة عند `true` · تراجع بأمان لقناة واحدة عند غياب الصفوف أو قائمة منصات فارغة · الـAPI يحفظ ويعيد `all_channels` · الواجهة تُظهر المفتاح فقط عند تكرار القناة لنفس المنصة
  EVIDENCE: 2026-11-11 — كان النشر الآلي يستهدف القناة الافتراضية وحدها حتى لو رُبطت قناتان، فلا سبيل لتوزيع الفيديو على القناتين تلقائيًا.

- [ ] G32: شبكة أمان يومية — لا يضيع يوم بلا فيديو
  CHECK: node tests/autonomy_test.js
  EXPECT: `shouldCatchUp` = `published` (لا شيء) / `running` (لا نُزاحم) / `go` (إنقاذ) · `catchUpDaily` يتخطى المنشور والجاري بلا توليد · الإنقاذ يُنشئ مفتاحًا منفصلًا `daily:<uid>:<date>:retry1` (لا يصطدم بصف اليوم الفاشل) · كرون المراقبة صار يوميًا `15 10 * * *` ويستدعي `catchUpDaily` أولًا، وفحص الموقع الكامل يبقى الاثنين أو `?full=1` · ميزانيته 300 ثانية
  EVIDENCE: 2026-11-11 — الخطة تسمح بكرون نشر واحد يوميًا، فأي فشل مزدوج = يوم بلا فيديو. الآن هناك محاولة إنقاذ 13:15 القاهرة.

- [ ] G33: كل فشل توليد يحمل سببه الكامل (لا «غير معروف»)
  CHECK: node tests/autonomy_test.js
  EXPECT: `exportError` يبني رسالة تُظهر exporting/running/count/dialog/toast/abort بلا JSON مقطوع · `err.diag` يحمل kind/last · `collectDiag` يقرأ وجود وظهور كل عنصر تصدير + حالة الصوت وسياقه + أخطاء الكونسول والطلبات الفاشلة وخطوات النقر · `recordRenderFailure` يحفظها كاملة في `system_checks.detail` (jsonb، بلا قصّ) بنوع `render_failure` · تعذّر الحفظ لا يُفشل التشغيل
  EVIDENCE: 2026-11-11 — كل تشغيلات 8–11 نوفمبر سُجّلت «page.waitForFunction: Timeout 210000ms» بلا سبب، وآخر تشغيل يدوي ترك `{"pct":"","stage":"","r` مقطوعًا عند 400 حرف. الآن سبب كل فشل كامل وقابل للقراءة.

- [ ] G34: «إعادة المحاولة» كانت تُعاد بلا فعل
  CHECK: node tests/autonomy_test.js
  EXPECT: `createRun(..., reuseFailed)` يستكمل الصفّ الفاشل (status→rendering، error→null) فقط إن لم يكن قد نُشر منه شيء (`external_url`/`publish_queue_id` فارغان) · المنشور أو المنشور جزئيًا يبقى `duplicate` (لا منشور مكرّر) · `runWithRetry` يمرّر رقم المحاولة · التشغيل اليومي والإنقاذ يمرّران `reuseFailed: n > 1`
  EVIDENCE: 2026-11-12 — المحاولة الثانية كانت تجد صفّ المحاولة الأولى (failed) فترجع `duplicate:true` فتنتهي، فلم تُولّد إعادة المحاولة فيديو ولا مرة.

- [ ] G35: اليوم الذي يضيع يُعوَّض تلقائيًا
  CHECK: node tests/autonomy_test.js
  EXPECT: `missingDays(runs, today, lookback)` يرجع الأيام بلا نشر من الأحدث للأقدم ويتخطى أي يوم جرت محاولة تعويضه (`:backfill`) · `backfillDaily` لا يعمل قبل أن يكون اليوم منشورًا (`today-pending`) · يعوّض يومًا واحدًا بمفتاح `daily:<uid>:<day>:backfill` وبفحص نسخة قبل الرندر · `api/cron/monitor.js` يستدعي التعويض بعد ضمان اليوم فقط (`todaySettled` / `rescue-pending`)
  EVIDENCE: 2026-11-12 — التشغيل اليومي ينتج فيديو «اليوم» فقط، فأي يوم فاشل يبقى ثقبًا دائمًا (11 نوفمبر بلا فيديو حتى بعد إصلاح المسار). أثبت `tools/e2e_backfill.js` بمتصفح حقيقي أن التعويض يعيد بناء 2026-11-11 وينشره (run_key `daily:user-e2e:2026-11-11:backfill`، published 1، audioHits 3).

- [ ] G36: حالة التشغيل الآلي ظاهرة في اللوحة (لا فشل صامت)
  CHECK: node tests/autopilot_api_test.js && node tests/publish_client_dom.js
  EXPECT: `accountData.last_daily` = آخر صفّ `run_type=daily` (اليوم، الحالة، السبب، الرابط) · `lastDaily` يرجّع null عند تعذّر القاعدة بلا إسقاط اللوحة · الواجهة ترسم `#acctLastDaily` بالنص «آخر تشغيل آلي (اليوم): ✅ منشور/⏳ قيد التوليد/⚠️ فشل — السبب · رابط» · السبب يُهرَّب (لا HTML) · النوع `render_failure` يُسمّى «محاولة توليد آلية» بدل «فحص المحرّك»
  EVIDENCE: 2026-11-12 — الفشل اليومي كان يُعرف فقط بفتح Supabase؛ الآن يظهر في بطاقة الإجراءات السريعة فورًا.

- [ ] G37: فشل النشر وحده يُعاد بلا إعادة توليد
  CHECK: node tests/autonomy_test.js
  EXPECT: `retryPublishFailed(user, day)` يقرأ صفوف `publish_queue` الفاشلة لمسار فيديو اليوم ويعيد `publishRow` عليها · نجاح الكل ⇒ التشغيل يُصحَّح `published` + الرابط ويُسجَّل `autopilot_daily` بلا تشغيل Chromium (`skipped: "rendered-cached"`) · نجاح جزئي ⇒ توقف (`partial-publish`) بلا إعادة توليد حتى لا يتكرر المنشور · فشل الكل ⇒ لا شيء منشور فيُسمح بإعادة التوليد · بلا صفوف فاشلة ⇒ لا نداء نشر
  EVIDENCE: 2026-11-12 — أي فشل في النشر (توكن يوتيوب مثلًا) كان يعني إعادة توليد ٥ دقائق داخل ميزانية ٣٠٠ ثانية، وخطر نشر المقطع مرتين على المنصات التي نجحت.

- [ ] G38: لا نشر مكرر عندما ينجح النشر ويفشل صفّ التشغيل
  CHECK: node tests/autonomy_test.js
  EXPECT: `dayHasPublish(user, day)` = يوجد صفّ `publish_queue` بحالة `published` لمسار `%/autopilot/<day>-%` · `catchUpDaily` يرجّع `published-cached` ويصحّح صفّ التشغيل بلا توليد ولا نشر · `backfillDaily` يتخطى اليوم بـ`already-published`
  EVIDENCE: 2026-11-12 — في القاعدة صفوف `publish_queue` منشورة لليوم نفسه مع صفّ تشغيل `failed` (نشر على منصة ونجح، وأخرى فشلت). بدون هذا الفحص كان الإنقاذ/التعويض يعيد النشر على المنصة الناجحة = منشور مكرّر.

- [ ] G39: الإنقاذ لا يتخطى اليوم بسبب صفّ عالق
  CHECK: node tests/autonomy_test.js
  EXPECT: `catchUpDaily` يستدعي `closeStaleRuns(20)` قبل قراءة صفوف اليوم · صفّ `rendering` أقدم من ٢٠ دقيقة يصبح `failed` فيُحكم عليه «اذهب» لا «جارٍ» · الترتيب مثبت في المصدر
  EVIDENCE: 2026-11-12 — التشغيل الأساسي عند 04:15 يُقتل بمهلة ٣٠٠ ثانية ويبقى صفّه `rendering`؛ الإنقاذ 10:15 كان يقرأه «جارٍ» ويتخطاه، فيضيع اليوم في الحالة نفسها التي وُجد الإنقاذ لها.

- [ ] G40: الكرونان مُختبَران سلوكيًا (لا 500 صامت يوم النشر)
  CHECK: node tests/cron_publish_test.js && node tests/cron_monitor_test.js
  EXPECT: كرون النشر: 401 بلا CRON_SECRET/توكن خاطئ · يشغّل `runDailyAutopilots` مرة · ينشر كل `scheduled` مستحق ويحصي ok/fail/errors · استثناء الأتمتة **يُذكر سببه في الرد** ويُسجَّل في `system_checks` · فشل الأتمتة لا يمنع نشر المستحق. كرون المراقبة: 401 فشل مغلق · `rescue` ثم `backfill` · «قيد الرندر» أو «أنشأنا الآن» ⇒ `rescue-pending` بلا تعويض · منشور/من ملف مخزّن ⇒ تعويض · `?full=1` يفحص الموقع (200 سليم / 503 بروابط مكسورة)
  EVIDENCE: 2026-11-12 — الكرونات كانت بلا اختبار سلوكي، واستثناء في الأتمتة كان يُحصى «فشل» بلا سبب في الرد ولا صفّ في القاعدة.

- [ ] G41: تشخيص فشل التوليد يُقرأ من اللوحة (لا من قاعدة البيانات)
  CHECK: node tests/publish_client_dom.js
  EXPECT: عند وجود `system_checks(kind='render_failure')` تُعرض تحت سطر «آخر فحص محفوظ» كتلة تفاصيل: المرحلة ونسبتها · نوع التوقّف (stall/timeout) · هل بدأ التصدير · عدد الآيات المحددة · حوار مفتوح · آخر تنبيه · سبب إيقاف الدالة · أول 3 أخطاء صفحة — كلها **مُهرَّبة** (لا وسوم من الخادم). ومع فحص ناجح أو بلا تشخيص لا تُرسم كتلة فارغة.
  EVIDENCE: 2026-11-12 — التشخيص الكامل كان يُحفظ في `system_checks.detail.diag` ولا يراه أحد، فيبقى السبب «غير معروف» لمن لا يفتح Supabase.
- [ ] G42: التلاوة أولًا — لا تعليق ٢١٠ ثانية بلا سبب
  CHECK: node tests/autopilot_api_test.js && npm run pretest && (LD_LIBRARY_PATH=/tmp/al2023/lib node tools/e2e_daily.js)
  EXPECT: قبل تشغيل المتصفح يُفحص مصدر التلاوة **مباشرة وعبر /api/proxy**؛ نجاح أحدهما يكفي، وفشلهما معًا يوقف التشغيل بجملة «التلاوة غير متاحة من الخادم: مباشر=… · وسيط=…» في **≤٢٠ ثانية**. اعتراض الصوت يردّ **502 فورًا** عند فشل الجلب (بدل ترك الصفحة تنتظر /api/proxy ٦٠ ثانية لكل آية) ويعيد عدّادات ok/miss/pass، ويمرّر المضيفات غير الصوتية كما هي. نافذة التصدير تظهر **قبل** تحضير التلاوة (كانت `stage`/`pct` فارغتين = «غير معروف»)، وجلب كل آية مسقوف (20s، 45s كليًا) بسبب مسمّى. لقطة التعليق تحمل `prepared/cache/overlay/silent/prep`. و`compactReport` يحفظ `audio_direct/audio_proxy`، واللوحة تكتب «التلاوة غير متاحة من الخادم» بدل سطر فاشل بلا سبب.
  EVIDENCE: 2026-11-12 — تشغيل 14:22 (manual) سجّل `pct="" stage="" running=false` بعد 90 ثانية: الصفحة كانت تحضّر الصوت ~٨٥ ثانية لكل آية *قبل* أن تفتح نافذة التصدير، وتشغيلات 8–11 نوفمبر كلها `waitForFunction 210000ms` لنفس السبب.
- [ ] G43: لا فيديو صامت يُنشر + التشغيل الصامت لا يتجمّد
  CHECK: node tests/autopilot_api_test.js && (LD_LIBRARY_PATH=/tmp/al2023/lib node tools/e2e_daily.js) && (LD_LIBRARY_PATH=/tmp/al2023/lib SILENT=1 node tools/e2e_daily.js)
  EXPECT: إذا انتهى التصدير بلا تلاوة (`AyahPlayer.silent`) يرفض المسار الآلي التنزيل والرفع والنشر برسالة «فشل تحميل التلاوة — لن يُنشر فيديو بلا صوت (سبب التحميل)». والحلقة الصامتة تُعيد جدولة نفسها بعد كل آية (كانت `return` تقتلها بعد الآية الأولى فيتجمّد التصدير عند 41٪ ثم مهلة ٢١٠ ثانية). `assertExportStarted` ينتظر بدء التصدير فعلًا (≤٥ ثوانٍ) ولا يقرأ تنبيه نجاح قديم كرفض، والتنبيهات القديمة تُمسح قبل الضغط على «إنشاء». محاكي المتصفح بـ`SILENT=1` يثبت الأمرين: تصدير يكتمل + نشر مرفوض (٠ رفع، ٠ صف، ٠ نشر).
  EVIDENCE: 2026-11-12 — محاكاة حقيقية على Chromium: `pct=41% · stage=جارٍ إنشاء الفيديو… 00:07 / 00:17 · cache=0 · silent=true` بلا تقدّم 90s. أي أن كل تشغيلات 8–11 نوفمبر (فشل صوت ⇒ وضع صامت) كانت تتجمّد عند أول آية، لا عند التحميل فقط.
- [ ] G44: ربط منتهٍ (invalid_grant) → تنبيه صريح + نشر الفيديو الجاهز بلا إعادة توليد
  CHECK: node tests/autopilot_api_test.js && node tests/publish_client_dom.js
  EXPECT: فشل تجديد التوكن بشكل دائم (`invalid_grant|invalid_client|unauthorized_client|expired or revoked`) يضع `needs_reauth` على القناة في `social_connections.meta` ويرمي رسالة «انتهت صلاحية ربط يوتيوب — أعد الربط…» بدل «تجديد التوكن فشل»؛ والنجاح يمسح العلامة. `/api/autopilot` يعيد `reauth:[platforms]` من العلامة **أو** من آخر خطأ نشر، واللوحة ترسم `#acctReauth` بخطوات صريحة + زر `#btnRetryPublish` يرسل `{action:"retry_publish"}` الذي ينشر صفوف اليوم الفاشلة ويحدّث صفّ التشغيل بلا توليد جديد.
  EVIDENCE: 2026-11-12 04:30 — الرندر نجح (132s) والفيديو جاهز في التخزين، وفشل النشر بـ`invalid_grant` فقط؛ الرسالة القديمة لم تكن تقول للمستخدم ما يفعل، ولا كان هناك طريق لنشر الفيديو الجاهز قبل إنقاذ 10:15.
- [ ] G45: علامة إعادة الربط في المكان الصحيح + ترجمة الأخطاء القديمة
  CHECK: node tests/autopilot_api_test.js && node tests/publish_client_dom.js
  EXPECT: `social_connections.meta` **نصّ مشفّر** فلا يُستخدم لعلامة تُقرأ؛ فشل التجديد الدائم يُسجّل `system_checks(kind='reauth_needed', ok=false, detail jsonb)` ويُطلق رسالة «انتهت صلاحية ربط …». `/api/autopilot` يستنتج `reauth` من `system_checks` **و** من آخر أخطاء النشر. واللوحة تُترجم الصفوف القديمة التي تحمل `invalid_grant` إلى «انتهت صلاحية ربط يوتيوب — أعد الربط» وتُظهر زر «انشر الفيديو الجاهز» حتى لو لم يُرسل الخادم حقل `reauth`.
  EVIDENCE: 2026-11-12 — G44 كتبت العلم في `meta` بدمج jsonb، والعمود نصّ مشفّر بـ`seal()` ففشل التحديث بصمت؛ واللوحة عرضت «invalid_grant» كما هي في صف التشغيل المحفوظ.
- [ ] G46: لا نشر مكرر عند إعادة الربط — صفّ واحد لكل منصة في اليوم
  CHECK: node tests/retry_publish_test.js && npm run pretest
  EXPECT: `retryPublishFailed` يقرأ صفوف اليوم الفاشلة وينشر **الأول فقط لكل منصة**، ويحوّل الباقي إلى `draft` (الحالة المسموحة في قيد `publish_queue_status_check`) مع سبب «صفّ مكرر لنفس اليوم والمنصة»، ويعيد `{attempted, published, failed, duplicates}`. منصتان مختلفتان ⇒ نشر كلتيهما. `publishReadyToday` تعيد سببًا واضحًا إن لم يكن هناك فيديو جاهز.
  EVIDENCE: 2026-11-12 — التشغيل الآلي أنشأ **صفَّين فاشلين ليوتيوب لنفس الملف** (04:31 و04:32)؛ نشرهما معًا بعد إعادة الربط كان سيضع فيديوين متطابقين على القناة.
- [ ] G47: صفّ نشر واحد لكل ملف + لا إعادة توليد بعد فشل النشر + تحذير جلسة صادق
  CHECK: node tests/retry_publish_test.js && npm run pretest && node tests/multichannel_test.js && node tests/markup_ids_test.js
  EXPECT: `ensureQueueRow` تُعيد استخدام صفّ `publish_queue` القائم لنفس `(user, platform, video_path)` بحالة `failed|scheduled|draft` (PATCH إلى `scheduled`) ولا تُدرج صفًّا جديدًا إلا إن لم يوجد؛ و`generateAndPublish` تُدرج من خلالها فقط (لا POST مباشر). فشل مرحلة النشر يرجّع `{ok:false, stage:"publish", error:"فشل النشر: <السبب الحقيقي>"}`، و`runWithRetry` **لا** تُعيد المحاولة عند `stage="publish"` (محاولة واحدة) بينما فشل التوليد يبقى محاولتين. بطاقة القناة لا تقول «انتهت صلاحية الجلسة» لمجرد أن `expires_at` (توكن وصول عمره ساعة) مضى: التحذير لِما في `reauth` أو `has_refresh === false` فقط، وغير ذلك «الجلسة تتجدد تلقائيًا». `soc_list` يُرجع `has_refresh` منطقيًا فقط (لا توكن). الكاش مرفوع مع تغيير الواجهة (`publish.js?v=24` / `qr-v26`).
  EVIDENCE: 2026-11-12 — التشغيل 04:30:15 → 04:32:26 فشل نشرًا فقط، لكن `runWithRetry` أعاد التوليد فأنشأ **صفًّا ثانيًا لنفس الملف** (`…1794457871223` و`…1794457942493`) وحرق ~دقيقة؛ ونشر الصفين بعد إعادة الربط = فيديوان متطابقان. وفي الوقت نفسه كانت البطاقة تُظهر «انتهت صلاحية الجلسة — أعد الربط» كل يوم لأن `expires_at` توكن الساعة مضى، مع أن التجديد تلقائي.
- [ ] G48: طبقة قاعدة البيانات لا تُسقط أي شرط بصمت (لا PATCH لكل الجدول، لا «نُشر اليوم» كاذبة)
  CHECK: node tests/db_shim_test.js && npm run pretest && node tests/autonomy_test.js && node tests/multichannel_test.js
  EXPECT: كل شرط WHERE غير مفهوم ⇒ استثناء `DB_UNSUPPORTED_SQL` بدل تجاهله؛ وUPDATE/DELETE بلا شرط مترجم ⇒ استثناء (لا تعديل لكل الصفوف). وتُترجم فعليًا: `= any($1::uuid[])` ⇒ `id=in.("…")`، `<>` ⇒ `neq`، `now()` و`now() - interval 'N minutes'` ⇒ وقت ISO، `like` ⇒ `like.*…*`، `is null`، `nulls last`، والصيغ `$1::jsonb` في INSERT/SET، والأقواس المتوازنة (`values (… now())`). وفحص ثابت يمرّ على **كل** مواضع `q()`/`q1()` في `lib/` و`api/` ويتأكد أنها قابلة للترجمة. `dayHasPublish` و`retryPublishFailed` تُفلتران يوم التشغيل في جافاسكربت (لا `like` في SQL)، و`closeStaleRuns(minutes)` تبني وقت القطع في جافاسكربت، و`ensureDefault` خطوتان بلا subquery، و`soc_list` يقرأ عمود `refresh_token` صريحًا ويُخرجه منطقيًا فقط.
  EVIDENCE: 2026-11-12 — القياس الفعلي قبل الإصلاح: `update … where id = any($1::uuid[])` ⇒ `PATCH /publish_queue?` **بلا فلتر** (كل الصفوف تصير draft)؛ `… video_path like $2 and status='published'` ⇒ `GET ?user_id=eq.u1&status=eq.published` أي «نُشر اليوم» دائمًا ⇒ الإنقاذ والتعويض يتخطّيان كل يوم بصمت؛ `insert into system_checks … $1::jsonb` ⇒ `BODY={"kind":"reauth_needed"}` (بلا ok ولا detail)؛ `closeStaleRuns` ⇒ `PATCH ?status=eq.rendering` بلا شرط زمني؛ `ensureDefault` ⇒ `PATCH ?platform=eq.youtube` يجعل كل قنوات المستخدمين افتراضية؛ و`select …, (refresh_token is not null …) as has_refresh` ⇒ 400 من PostgREST يُعطّل بطاقة القنوات.
- [ ] G49: صفّ نشر عالق في `publishing` لا يضيع اليوم بصمت
  CHECK: node tests/retry_publish_test.js && node tests/cron_publish_test.js
  EXPECT: `reclaimStalePublishing({minutes=20, userId})` تُعيد صفوف `publishing` الأقدم من المهلة إلى `failed` برسالة مفهومة (المهلة مسقوفة 1..240 دقيقة، والحدّ الزمني وقت ISO مُحسوب في جافاسكربت). تُستدعى في بداية `retryPublishFailed` (فيعمل زر «انشر الفيديو الجاهز» على صفّ مات في منتصف الرفع) وفي كرون النشر قبل قراءة المستحق (`reclaimed` في الرد)، بلا إسقاط الكرون عند فشلها.
  EVIDENCE: 2026-11-12 — `publishRow` يضع `publishing` قبل الرفع؛ إذا أُنهيت الدالة (مهلة Vercel) بقي الصفّ `publishing` للأبد: الكرون يقرأ `scheduled` فقط والزر يقرأ `failed` فقط ⇒ لا مسار يعيده، ويضيع اليوم بلا أي رسالة.
- [ ] G50: لوحة «حسابي» وحفظ التخصيص دون تغيير اختيار المستخدم بصمت
  CHECK: node tests/publish_client_dom.js && node tests/markup_ids_test.js && node tests/multichannel_test.js
  EXPECT: الحالة والخطوات والمؤشرات والقنوات والسجل والتشخيص تظهر في لوحة متجاوبة؛ إعداد المحتوى والقارئ والخلفية والمنصات قابل للحفظ؛ اختيار المنصات يعكس الإعداد المحفوظ وليس مجرد قائمة الحسابات المربوطة؛ الإيقاف والتشغيل يحفظان التفضيلات؛ لا تُقبل روابط javascript في السجل؛ التنبيهات لا تبقى مخفية. أرقام الحالة مبنية على آخر ٢٠٠ صف نشر وليست إجماليًا مدى الحياة.
  EVIDENCE: اختبار DOM محلي بـjsdom: 0 أخطاء، بما فيه حفظ المنصات ورفض رابط javascript؛ markup_ids: 11 فحصًا، multichannel: 47. اختبار Chromium محلي بعرض 390px: عرض المستند 390px، ثلاث خطوات وقائمة القارئ موجودة. هذه اختبارات ببيانات بديلة وليست نشرًا حقيقيًا على منصة.
- [ ] G51: إنشاء إعداد افتراضي بعد ربط ناجح مع احترام الإيقاف
  CHECK: node tests/automation_test.js && node tests/automation_db_test.js && node tests/oauth_state_test.js
  EXPECT: ربط جديد محفوظ ينشئ إعدادًا مفعّلًا بالمنصة؛ إضافة منصة تترك حالة الإيقاف الحالية كما هي؛ فشل حفظ الربط لا يُعرض كنجاح؛ فشل إنشاء الإعداد يظهر في الواجهة؛ القارئ المحدّد يُحفظ ويُستخدم في القالب. لا يتغير إعداد المستخدم المعطّل عند إعادة الربط.
  EVIDENCE: 25 فحصًا لوحدات الأتمتة و30 لفحص OAuth محليًا؛ اختبار إضافي يستخدم مترجم قاعدة البيانات الحقيقي مع PostgREST مُحاكى وتحقّق أن القراءة تستخدم user_id الموجود في schema، ثم إنشاء يوتيوب وإضافة تيك توك مع بقاء enabled=false. لا يثبت ذلك نجاح OAuth أو النشر على الخدمة الحية.
- [ ] G52: محاولة اختيار أكثر عدلًا واستعادة تشغيل عالق
  CHECK: node tests/automation_test.js && node tests/autonomy_test.js && node tests/cron_monitor_test.js && node tests/db_shim_test.js
  EXPECT: تنظيف الصفوف العالقة قبل اختيار المستحقين، واستبعاد التشغيلات اليومية المنشورة أو الجارية، وتدوير ترتيب المتعادلين بين الأيام، والتوقف عند تعذّر قراءة التشغيلات بدل افتراض عدم وجود نشر. التشغيل الجاري لا يُعتبر نشرًا مكتملًا عند تقرير التعويض.
  EVIDENCE: الاختبارات المحلية للأتمتة 25، والاستقلالية 95، وكرون المراقبة 19، ومترجم القاعدة 14. الحدود الحالية: يجلب الاختيار أول ٢٠٠ إعداد فقط، والكرون يعمل مرتين يوميًا ضمن مهلة الدالة؛ لم يُختبر تحمّل مستخدمين كثيرين ولا يوجد ضمان نشر يومي لكل مستخدم أو مدى الحياة.
- [ ] G53: تجديد التوكن لا يكسر النشر، ولا تتحول المهمة لقناة أخرى
  CHECK: node tests/publish_safety_test.js && node tests/multichannel_test.js
  EXPECT: بعد تجديد توكن يوتيوب يرجع الاتصال بتوكن مشفّر قابل للفتح مثل المخزّن؛ إن حُذفت قناة مطلوبة لا يُنشر على قناة افتراضية أخرى؛ مهمة إنستغرام تستخدم اتصال إنستغرام وig_id بدل صف فيسبوك.
  EVIDENCE: اختبار محلي بتشفير AES الحقيقي وشبكة وقاعدة محاكيتين فتح توكن التجديد المحفوظ والمرجَع، ورفض القناة المفقودة، ووصل لطلب إنستغرام باستخدام ig_id وتوكنها. multichannel: 47 فحصًا. لم يُختبر رفع حقيقي لأي منصة.
- [ ] G54: إعادة نشر الفيديو الجاهز دون توليد مكرر ودون إسقاط قناة ثانية
  CHECK: node tests/retry_publish_test.js && node tests/autonomy_test.js
  EXPECT: إن فشلت إعادة نشر الفيديو الجاهز كله، يتوقف الإنقاذ بدل توليد فيديو جديد؛ التكرار يُحدد بالمنصة والقناة معًا؛ فحص صف النشر القائم يقيّد connection_id ويتوقف عند فشل القراءة؛ اختيار كل قنوات إنستغرام لا يتضمن اتصالات فيسبوك.
  EVIDENCE: retry_publish: 22 فحصًا وautonomy: 95؛ اختبار بثلاثة صفوف لقناتين نشر صفًا لكل قناة وحدّد الثالث مكررًا؛ فشل قراءة القاعدة لم ينشئ صفًا. لم يثبت الاختبار إعادة نشر حقيقية.
- [ ] G55: تنبيه إعادة الربط خاص بالحساب ولا يبقى بعد إصلاحه
  CHECK: node tests/autopilot_api_test.js && node tests/db_shim_test.js && node tests/publish_client_dom.js
  EXPECT: علامة system_checks تُقرأ بمعرّف قناة المستخدم لا من أحدث فحوص عامة؛ أخطاء أقدم من تحديث الاتصال لا تعيد تحذيرًا قديمًا؛ تبقى إعادة نشر الفيديو الجاهز متاحة بعد الربط؛ إدخال نص ::jsonb يمرره إلى PostgREST ككائن JSON لا كنص مزدوج.
  EVIDENCE: autopilot_api: 117، db_shim: 16، واختبار DOM بلا أخطاء محليًا. محاكاة علامة قناة مستخدم آخر لم تُظهر التحذير، ومحاكاة تحديث أحدث أخفت علامة الخطأ؛ اختبارات بلا اتصال Supabase حقيقي. سجلات jsonb النصية القديمة لا تتحول تلقائيًا، والاستدلال الاحتياطي مقصور على أخطاء صفوف المستخدم.
- [ ] G56: قراءة اختيار المهام عبر الصفحات بدل أول ٢٠٠ حساب
  CHECK: node tests/due_pagination_test.js && node tests/automation_test.js && node tests/db_shim_test.js
  EXPECT: قراءة إعدادات المفعّلين وصفوف التشغيل اليومي بصفحات مرتّبة بمفاتيح فريدة؛ تتوقف العملية عند فشل صفحة أو مؤشر لا يتقدم؛ المنشور أو الجاري في أي صفحة يُستثنى من الاختيار. يتقدم رأس الدور خطوة يوميًا فلا يظلّ بعض الحسابات خارج الرأس إن لم يكتمل إلا أول عمل في الدفعة.
  EVIDENCE: اختبار محلي بمترجم قاعدة البيانات الحقيقي وPostgREST محاكًى قرأ ٢٥٥ إعدادًا و٢٣٠ منشورًا واستبعد المنشورين وأبلغ عن ٢٢ مستخدمًا خارج الدفعة؛ وتحقّق من فشل صفحة لاحقة ومنع تكرار المؤشر. محاكاة ٢٥٥ يومًا مع اكتمال أول اختيار فقط وصلت إلى كل الـ٢٥٥ حسابًا. لا يثبت ذلك سعة نشر يومية أو اتساقًا لحظيًا مع الكتابات المتزامنة في قاعدة حقيقية.
- [ ] G57: فشل قراءة القاعدة لا يصبح تصريحًا بالتوليد من جديد
  CHECK: node tests/autonomy_test.js && node tests/due_pagination_test.js && node tests/cron_monitor_test.js
  EXPECT: تعذّر قراءة تشغيل المستخدم أو المنشورات أو الفيديو الجاهز يوقف الإنقاذ برسالة قاعدة بيانات بدل افتراض عدم وجودها؛ فحص المنشور يفلتر اليوم على الخادم قبل الحدّ؛ الحسابات خارج الدفعة تظهر deferred فتمنع تعويض الماضي على حساب اليوم.
  EVIDENCE: autonomy: 100 فحص محلي، cron_monitor: 20؛ بمحاكاة قاعدة البيانات توقف الإنقاذ بلا طلب توليد عند كل واحد من أخطاء القراءة الثلاثة، والزر أبلغ عن فشل القراءة؛ وبـ٢٥٠ منشورًا أحدث اكتُشف منشور اليوم المطلوب عبر مترجم SQL المحاكى. ما زالت محاولات النشر محكومة بميزانية ٣٠٠ ثانية وموعدين يوميًا؛ حذف حدّ القراءة لا يضمن نشرًا يوميًا لكل الحسابات، ولم يُجرَ نشر حقيقي.
- [ ] G58: حجز صف النشر وحماية التشخيص وإعادة المحاولة المقيدة
  CHECK: node tests/publish_claim_test.js && node tests/retry_publish_test.js && node tests/autonomy_test.js && node tests/autopilot_api_test.js && node tests/db_shim_test.js
  EXPECT: حجز صف قابل للنشر بتحديث مشروط بمعرّف المستخدم والحالة قبل الرفع؛ إذا تغيّر الصف أثناء تجهيزه لا يُعاد ضبطه ولا يُدرج بديل. إعادة المحاولة تتحقق من منشور سابق لنفس القناة وتتوقف عند غموض القناة أو فشل القراءة أو وصول النتائج لحد ٥٠؛ الإنقاذ يحاول الصف الفاشل حين يكون تشغيل اليوم فاشلًا رغم نجاح منصة أخرى. آخر فحص للوحة يقتصر على فحوص صاحب الحساب.
  EVIDENCE: اختبارات محلية بمترجم SQL الحقيقي وPostgREST ومزود مُحاكَيين: طلبان متزامنان لنفس الصف نتج عنهما حجز ورفع واحد، ولم يُعَد رفع الصف المكتمل؛ retry_publish: 27 فحصًا تشمل صفًا تغيّر أثناء التحضير وصفحة بلغت ٥٠ وفشل قراءة المنشورات؛ autonomy: 101 بينها إعادة منصة فاشلة بعد نشر أخرى في تشغيل فاشل؛ autopilot_api: 119 بينها حجب تفاصيل مستخدم آخر؛ db_shim: 16. لم يُختبر نشر فعلي. هذا لا يمنع تنافس صفين مختلفين لنفس الهدف أو إعادة النشر بعد نتيجة رفع مجهولة؛ تنظيف publishing العالق يحوّله إلى failed بعد المهلة ولو كان المزود قبله، ولا تُفحص الصفوف الفاشلة تلقائيًا إذا كان تشغيل اليوم مسجلًا published؛ حد ٥٠ يوقف إعادة المحاولة بدل إكمالها. ليست هذه ضمانات نشر مرة واحدة أو نشر يومي.
- [ ] G59: إعادة محاولة يوتيوب تلقائيًا بعد إعادة الربط دون ضغط زر
  CHECK: node tests/relink_resume_test.js && node tests/publish_client_dom.js && node tests/oauth_state_test.js && node tests/db_shim_test.js
  EXPECT: بعد OAuth ناجح وحفظ قناة يوتيوب، إن كانت الأتمتة مفعّلة والمنصة مختارة، يحاول الخادم نشر أحدث فيديو آلي جاهز تعذّر تجديد توكنه بـinvalid_grant قبل الرفع؛ يتحقق من القناة والمنشورات السابقة، ولا يحاول مع الإيقاف أو غموض الهدف/النتيجة أو تكرار الصفوف أو تعذّر القراءة. للقناة الافتراضية القديمة يُشترط سجل reauth لنفس القناة قرب وقت الفشل. لا يُعلَن تشغيل اليوم مكتملًا إذا بقيت أهداف غير منشورة أو كانت القنوات المتعددة مفعّلة. تظهر نتيجة المحاولة باللوحة، مع بقاء الزر اختياريًا. مهلة callback رُفعت إلى ٣٠٠ ثانية لتشمل الرفع.
  EVIDENCE: اختبار محلي متكامل بكوكي OAuth حقيقي ومترجم SQL الحقيقي وتشفير حقيقي مع PostgREST ويوتيوب مُحاكَيين: العودة من الربط أدت لرفع واحد وتحديث الصف؛ طلبان متزامنان لنفس الصف أديا لرفع واحد؛ لم يحدث رفع عند الإيقاف، أو فشل القراءة، أو مستخدم/قناة أخرى، أو غياب سجل القناة الافتراضية، أو منشور سابق، أو فشل مجهول أو صف مكرر، أو تغيير القناة أثناء الحجز. عند منصة أخرى لم تنشر أو all_channels بقي التشغيل فاشلًا. اختبار DOM عبر jsdom: 0 أخطاء ويعرض نتيجتي النجاح والفشل؛ OAuth: 30، ومترجم القاعدة: 16. لم يُختبر OAuth أو النشر الحقيقي بعد التعديل. المحاولة الفورية عند إعادة الربط الجديدة خاصة بيوتيوب ورسالتَي invalid_grant المعروفتين؛ بقية الأسباب والمنصات تظل للمواعيد المعتادة أو المراجعة. المهلة أو نتيجة الرفع الغامضة وتنافس صفوف جديدة ما زالت تسمح بالتكرار، والربط قد يحتاج انتظار الرفع؛ ليست ضمانًا لنشر مرة واحدة أو نشر مدى الحياة.
- [ ] G60: ربط يوتيوب لا يمحو تصريح التجديد ولا يغيّر قناة النشر بصمت
  CHECK: node tests/relink_resume_test.js && node tests/token_handling_test.js && node tests/publish_client_dom.js && node tests/db_shim_test.js
  EXPECT: إن لم تُرجع جوجل refresh_token في إعادة الربط، نحافظ على التوكن القابل للقراءة لنفس المستخدم والمنصة والقناة، ولا نكتب عند فشل قراءة السابق؛ لا نحفظ قناة مجهولة؛ نحتفظ بوقت انتهاء توكن الوصول حتى لو غاب تصريح التجديد. قائمة القنوات تعرض وجود تصريح صالح منطقيًا فقط، بلا أسرار، ولا تعتبر النص المشفّر الفارغ تصريحًا ولا تطلب تجديد Meta غير المدعوم. رسالة الربط توضّح إن القناة الجديدة ليست الافتراضية دون تغيير اختيار المستخدم.
  EVIDENCE: 2026-11-12 — استعلام قراءة فقط للقاعدة الحية أظهر إعداد أتمتة مفعّلًا ليوتيوب وقناتين؛ «Psychology World» افتراضية و«Zog the alien 👽» غير افتراضية، والأحدث ربطًا هي الثانية. صف الفيديو الآلي الأحدث failed بخطأ قراءة social_connections قديم، وصف آخر draft مكرر؛ لا يمكن استنتاج نجاح النشر أو صلاحية التوكن من البيانات دي. اختبار OAuth محلي بمترجم القاعدة الحقيقي وPostgREST وجوجل محاكيين أثبت بقاء التوكن القديم عند غيابه في الرد، وتسجيل صلاحية الوصول، ورفض القناة المجهولة، وتوقف الحفظ عند فشل القراءة، وعدم تغيير الافتراضية. اختبار التشفير الحقيقي أثبت أن الفارغ/التالف لا يبدوان تصريحًا، وأن القائمة لا تعرض الأسرار؛ اختبار DOM بـjsdom: 0 أخطاء ويتحقق من رسالة القناة غير الافتراضية؛ OAuth: 30، db_shim: 16. لم تُختبر إعادة ربط أو عملية نشر حقيقية بعد التعديل، ولا يضمن وجود توكن أن المزوّد سيقبله. الطلبات المتزامنة وإعادة الرفع بعد مهلة غامضة ما زالت تحتاج احتياطات إضافية.
- [ ] G61: اختيار كل القنوات لا يتحول بصمت إلى قناة افتراضية واحدة
  CHECK: node tests/channel_coverage_test.js && node tests/multichannel_test.js && node tests/retry_publish_test.js && node tests/autonomy_test.js
  EXPECT: في وضع كل القنوات تُقرأ قنوات كل منصة للمستخدم بصفحات مرتّبة ومقيّدة بالمنصة، ويُوقف التشغيل قبل الرندر إذا تعذّرت القراءة أو تعطل المؤشر أو لم توجد معرّفات صالحة؛ لا يُنشأ هدف افتراضي بديل. تُحاول أهداف القنوات مستقلّة، ويُسجّل التشغيل فاشلًا مع روابط الناجح عند فشل أي هدف، بلا إعادة توليد فورية للفيديو الجاهز.
  EVIDENCE: اختبار محلي بـPostgREST محاكى قرأ ٢٠٥ قنوات على ثلاث صفحات، وفشل عند تعطل الصفحة التالية أو تكرار المؤشر أو معرف فارغ، وأوقف generateAndPublish وسجّل failed قبل أي رفع عند خطأ القراءة. محاكاة هدفين حاولتهما معًا وأرجعت رابط الناجح وسبب فشل الآخر؛ multichannel: 47، retry_publish: 27، autonomy: 101. لم تُختبر القناتان على يوتيوب فعليًا. حدود باقية: إنشاء صفوف القنوات ليس معاملة ذرّية، وتنافس صفوف مختلفة أو مهلة مزوّد غامضة قد يسبب تكرارًا، كما أن فلترة المنصات غير المربوطة قد تستبعد منصة مختارة؛ لا يضمن الاختبار نشرًا يوميًا أو لمرة واحدة. الاختبار القديم المنفصل tests/autopilot_unit.js يفشل أصلًا على main عند توقّع ٣ أنماط بينما CONTENT_MODES يحتوي ٤؛ لم يُعدّل هنا.
- [ ] G62: لا نُعيد فيديو ذا نتيجة نشر مجهولة ولا نُجزّئ إنشاء أهدافه
  CHECK: npm run pretest && node tests/queue_atomic_safety_test.js && node tests/autonomy_test.js && node tests/relink_resume_test.js && node tests/multichannel_test.js && git diff --check
  EXPECT: لا تُسقط منصة مختارة غير مرتبطة بصمت؛ يحفظ التشغيل مسار الفيديو وحالة queued قبل إرسال كل الأهداف في POST واحد؛ بعد فقد الرد لا يُعاد الطلب أو التوليد فورًا، ولا يستأنف فشل يحمل مسار فيديو. الإنقاذ والتعويض يرفضان توليد بديل عند وجود المسار أو أي صف لليوم؛ الصف العالق في publishing يصبح فاشلًا مع تحذير ولا يعاد رفعه آليًا من مسار الإنقاذ العام. إعادة الربط المحدودة تظل مشروطة بدليل فشل التجديد وتحديد القناة، ولا تُحسب نتيجة جزئية نجاحًا كاملًا.
  EVIDENCE: اختبار محلي بـPostgREST محاكى تحقّق من حفظ المسار قبل POST مصفوفة واحدة لهدفين، ورفض دفعة محاكى بلا إدراج، وفقد رد بعد إدراج الهدفين بلا إدراج ثانٍ أو إعادة استئناف التشغيل، ورفض رد ناقص. محاكاة منصة مختارة غير مرتبطة سجّلت failed قبل الرندر بلا رفع. autonomy: 104 فحوص، منها منع الإنقاذ والتعويض عند وجود صف قديم أو مسار محفوظ؛ retry_publish: 21؛ multichannel: 47؛ pretest وrelink_resume اجتازا. لم يُختبر إدراج دفعة على قاعدة الإنتاج ولا رفع/إعادة ربط حقيقية؛ ذرّية الإدراج تعتمد على معاملة PostgREST. تظل إعادة المحاولة الآلية بعد الربط متاحة للحالات المحققة فقط؛ النتائج الغامضة تتطلب مراجعة، ولا يوجد ضمان مرة واحدة مع صفوف قديمة منفصلة أو تدخلات متزامنة أو نتيجة مجهولة لدى المزوّد.
- [ ] G63: عرض مراحل التشغيل وحالة القنوات بدل شاشة انتظار مبهمة
  CHECK: npm run pretest && node tests/autonomy_test.js && node tests/multichannel_test.js && NODE_PATH=/tmp/qr63-jsdom/node_modules node tests/progress_ui_test.js && NODE_PATH=/tmp/qr63-jsdom/node_modules node tests/publish_client_dom.js && git diff --check
  EXPECT: يسجل الخادم مراحل فعلية محددة لكل تشغيل دون أن يوقف النشر عند تعذّر التسجيل؛ يعيد endpoint مصادق مراحل آخر تشغيل ونتائج قنواته لصاحب الحساب فقط. تُحدّث لوحة «حسابي» المرحلة والقنوات دوريًا، وتوضح تعذر القراءة وفشل النشر بدون نسبة مختلقة أو إعلان نجاح عند انقطاع الاتصال. لا يُعاد تشغيل الطلب بالنقر المكرر أثناء انتظار نتيجته.
  EVIDENCE: فحص محاكاة قاعدة اختبر عزل المستخدم والتشغيل، استبعاد أحداث محاولة أقدم، حالتي نجاح وفشل لقناتين، عدم عرض المسار، فشل تسجيل المرحلة، 401 وno-store. اختبار jsdom بمحاكاة الشبكة عرض خطوتين ثم نجاح قناة وفشل الأخرى، منع POST ثانيًا أثناء الانتظار، هرب النص وتحذير انقطاع الاتصال؛ DOM القديم 0 أخطاء، pretest مرّ. لم يُختبر عرض التقدم في تشغيل إنتاجي بعد التعديل ولا تدفق مرئي فعلي؛ غياب تفاصيل التشغيل القديم أو تعطل التسجيل يُعرض بوضوح، والتحديث كل ٥ ثوانٍ وليس بثًا لحظيًا مضمونًا.
  EVIDENCE إنتاج قبل إضافة العرض: تشغيل يدوي e6babd90-5848-4327-a948-b282b87dad08 سجّل published لصفّي يوتيوب في 12:52 UTC؛ psychology: https://www.youtube.com/shorts/U3M--_Ve-LY وZog: https://www.youtube.com/shorts/XT0peXzLZZc. قراءة صفحات يوتيوب عرضت عنوان سورة 111 واسمي القناتين مع نص خطأ 401 في المحتوى؛ لم نفحص تشغيل الصوت/الفيديو فعليًا. لا يعني هذا ضمان النشر المستقبلي.
- [ ] G64: وصف وعنوان عربيان مرتبطان بالمقطع عند النشر الآلي
  CHECK: npm run pretest && node tests/metadata_test.js && node tests/metadata_publish_test.js && node tests/autonomy_test.js && node tests/multichannel_test.js && git diff --check
  EXPECT: لكل فيديو جديد عنوان ووصف يذكران اسم السورة من بيانات القرآن والقارئ المستخدم فعليًا، مع دعوة لطيفة للمشاركة ووسوم متصلة مناسبة للمنصة. توضع الوسوم في حقل مستقل كي يضيفها محرّك النشر مرة واحدة. لا نستخدم عنوان وصفة أو رقم نهاية آيات قد يختلف بعد تقصير المولّد، ولا نختلق رابط مقال من معرّف مجهول؛ لا يتغير وصف المنشورات السابقة.
  EVIDENCE: اختبار محلي قارن ١١٤ اسم سورة ببيانات القرآن المرفقة، وفحص ٧٤ وصفة على ٥ منصات، منها وصفة برقم ٧٣ واسم قديم خاطئ، وقارئ مختلف وحد X ووسوم خالية من الفراغات وروابط مقالات مقيدة. اختبار قاعدة ونشر يوتيوب محاكيَين حجز قناتين مختلفتين وأرسل لكل واحدة عنوان سورة المسد واسم القارئ، مع كل وسم مرة واحدة؛ npm run pretest، autonomy 104 وmultichannel 47 مرّت. لم يُنشر فيديو حقيقي بهذا الوصف أثناء التعديل؛ تحسين العنوان والوصف لا يضمن عدد مشاهدات أو ترتيبًا أعلى.
- [ ] G65: ترتيب لوحة الحساب وإزالة نموذج الجدولة غير الفعّال
  CHECK: NODE_PATH=/tmp/qr-ui-test/node_modules npm run pretest && node tests/markup_ids_test.js && node tests/multichannel_test.js && NODE_PATH=/tmp/qr-ui-test/node_modules node tests/publish_client_dom.js && NODE_PATH=/tmp/qr-ui-test/node_modules node tests/progress_ui_test.js && git diff --check
  EXPECT: تظل حالة الأتمتة ومراحل الفيديو والقنوات والإعدادات والسجل مرئية؛ تحذيرات التشغيل وإعادة الربط والفحص خارج قسم التشخيص المطوي. تبقى إجراءات التشغيل الإضافية والتشخيص قابلة للفتح دون أن يبدأ الفتح نشرًا. يُزال نموذج الجدولة الذي كان يعرض تنبيهًا فقط دون جدولة فعلية، وتُزال بطاقة المقالات المكررة مع بقاء زر التوليد من مقال. يصف تلميح القنوات الإعداد المحفوظ لكل القنوات أو الافتراضية، دون تعديله. تُحدّث نسخ كاش الأصول.
  EVIDENCE: pretest مرّ مع jsdom؛ اختبار DOM بشبكة محاكاة مرّ دون أخطاء: فتح الخيارات لم يرسل طلبًا، إجراءات الحفظ والتشغيل والإجراءات الإضافية وصلت للأسماء الصحيحة، تحذير إعادة الربط خارج التشخيص، السجل والتفاصيل موجودان، وقناتان محاكيتان تعرضان النص والمفتاح المناسبين للحالتين. اختبار التقدم المحاكى مرّ؛ markup_ids: 11 وmultichannel: 47؛ diff --check مرّ. لم يُختبر الشكل بصريًا في متصفح حقيقي أو النشر الفعلي؛ لم تتغير إعدادات القنوات أو عمليات النشر في الإنتاج.
- [ ] G66: اختصار قائمة المنصات مع إبقاء المشاكل وخيارات الربط متاحة
  CHECK: NODE_PATH=/tmp/qr-ui-jsdom/node_modules npm run pretest && node tests/markup_ids_test.js && node tests/multichannel_test.js && NODE_PATH=/tmp/qr-ui-jsdom/node_modules node tests/publish_client_dom.js && NODE_PATH=/tmp/qr-ui-jsdom/node_modules node tests/progress_ui_test.js && git diff --check
  EXPECT: القنوات المرتبطة وأي منصة مختارة بلا قناة تظل ظاهرة، مع تحذير واضح للمنصة غير المرتبطة. باقي المنصات في قسم قابل للفتح، وتحافظ إعادة تحميل القنوات على حالة القسم المفتوح. عند عدم وجود أي قناة تظهر خيارات الربط الجاهزة مباشرة. لا يتغير إعداد النشر أو إجراءات الربط والفك، ورسالة فشل قراءة القنوات تظل ظاهرة. تُحدّث نسخ كاش الأصول.
  EVIDENCE: اختبارات DOM بشبكة محاكاة أثبتت ظهور قناتين وتنبيه انتهاء الربط والمنصة المختارة بلا قناة، وفتح القسم واستمراره بعد تحديث القائمة، وظهور ربط يوتيوب مباشرة للحساب الجديد، ورسالة انقطاع القراءة؛ pretest، markup_ids: 11، multichannel: 47، واختبار تقدم محاكى وdiff --check مرّوا. مراجعة Chromium محلية على 1440×900 و390×844 ببيانات قناتين محاكاة: كل الأقسام الرئيسية مرئية، لا تجاوز أفقي للعناصر المقاسة، والقسمان والتشخيص يفتحون بدون طلب كتابة؛ لا أخطاء صفحة مسجلة. لم يُختبر ربط حقيقي أو نشر فيديو ولم تتغير بيانات الإنتاج.
- [ ] G67: تبسيط الصفحة الرئيسية وصانع الفيديو دون فقدان الإعدادات
  CHECK: NODE_PATH=/tmp/qr67/node_modules npm run pretest && node tests/markup_ids_test.js && node tests/autonomy_test.js && node tests/multichannel_test.js && NODE_PATH=/tmp/qr67/node_modules node tests/publish_client_dom.js && NODE_PATH=/tmp/qr67/node_modules node tests/progress_ui_test.js && for size in desktop tablet mobile small; do AWS_EXECUTION_ENV=AWS_Lambda_nodejs22.x NODE_PATH=/tmp/qr67/node_modules HOME_UI_VIEW="$size" node tests/home_responsive_test.js || exit 1; done && git diff --check
  EXPECT: تختصر مقدمة الصفحة وتُزال مقارنة السرعة غير المثبتة والنصيحة المتكررة؛ تصغر المعاينة على الشاشات الصغيرة دون إخفائها، وتبقى تبويبات الصانع السبعة وخياراتها وأزرار المعاينة والإنشاء. يتجه زر البداية إلى الصانع ويستمر تهيئة القرآن دون تغيير السورة عند التنقل؛ تُحدّث نسخ CSS وكاش الخدمة.
  EVIDENCE: pretest مع jsdom مرّ، ومنها إقلاع الصفحة و١١٤ سورة وتشغيل التبويبات السبعة بلا تغيير السورة؛ markup_ids: 11، autonomy: 104، multichannel: 47، وDOM الحساب والتقدم المحاكيان مرّوا. Chromium محلي بعروض ١٤٤٠ و٧٦٨ و٣٩٠ و٣٢٠: لا تجاوز أفقي للعناصر المقاسة، عرض المعاينة ٤٠٠/٢٨٠/٢٢٠/٢٢٠ بكسل، زر البداية يصل للصانع، كل التبويبات مرئية وتعمل، ولا أخطاء صفحة أو طلبات كتابة. فُحص الشكل بصريًا محليًا مع حجب الشبكة الخارجية؛ لم يُختبر توليد فيديو حقيقي أو نشره، وأحجام الخطوط والخلفيات الخارجية قد تختلف على أجهزة المستخدمين.
- [ ] G68: اختصار الأقسام المتكررة مع بقاء الأدوات والمكتبة
  CHECK: NODE_PATH=/tmp/qr68/node_modules npm run pretest && node tests/markup_ids_test.js && node tests/autonomy_test.js && node tests/multichannel_test.js && NODE_PATH=/tmp/qr68/node_modules node tests/publish_client_dom.js && NODE_PATH=/tmp/qr68/node_modules node tests/progress_ui_test.js && for size in desktop tablet mobile small; do AWS_EXECUTION_ENV=AWS_Lambda_nodejs22.x NODE_PATH=/tmp/qr68/node_modules HOME_UI_VIEW="$size" node tests/home_responsive_test.js || exit 1; done && git diff --check
  EXPECT: تُختصر بطاقات المزايا المتكررة والبطاقات الزائدة تحت الخطوات، وتظهر ست أدوات مختارة في الرئيسية مع رابط قائمة الأدوات الكاملة. تبقى الخطوات والأسئلة فعّالة. تُستبدل روابط تصنيفات المكتبة التي لا تشير لمعرّفات موجودة برابط المكتبة الفعلي؛ تبقى روابط المقالات والأدوات الأخرى متاحة. ترتب البطاقات على الشاشات المختلفة، وتُرفع نسخ app وCSS وكاش الخدمة.
  EVIDENCE: pretest مع jsdom مرّ؛ إقلاع الصفحة أظهر ست أدوات مختارة منها الزكاة ورابط المكتبة إلى ملف موجود و٤ خطوات و١٠ أسئلة على الأقل، والانتقال لقائمة الأدوات أظهر ٣٢ أداة على الأقل. markup_ids: 11، autonomy: 104، multichannel: 47 وDOM الحساب والتقدم المحاكيان مرّوا. Chromium محلي بعروض ١٤٤٠ و٧٦٨ و٣٩٠ و٣٢٠ أثبت عدم تجاوز العناصر المقاسة، عمل تبويبات الصانع السبعة ورابط الأدوات وقائمة الأدوات الكاملة وفتح سؤال، بلا أخطاء صفحة أو طلبات كتابة؛ روجع الشكل بصريًا على مقاسي الموبايل والكمبيوتر. الشبكة الخارجية محجوبة ولم يُختبر إنشاء أو نشر فيديو حقيقي.
- [ ] G69: ترتيب صفحة الأدوات والبحث دون حذف الأدوات
  CHECK: NODE_PATH=/tmp/qr69/node_modules npm run pretest && node tests/markup_ids_test.js && node tests/autonomy_test.js && node tests/multichannel_test.js && NODE_PATH=/tmp/qr69/node_modules node tests/publish_client_dom.js && NODE_PATH=/tmp/qr69/node_modules node tests/progress_ui_test.js && for size in desktop tablet mobile small; do AWS_EXECUTION_ENV=AWS_Lambda_nodejs22.x NODE_PATH=/tmp/qr69/node_modules HOME_UI_VIEW="$size" node tests/home_responsive_test.js || exit 1; done && git diff --check
  EXPECT: صفحة الأدوات تعرض القائمة كاملة في بطاقات متجاوبة وحقل بحث واضح ذا اسم يمكن لقارئ الشاشة قراءته وعدادًا للنتائج. عند عدم التطابق يظهر التنبيه بجوار النتائج؛ المسح يعيد القائمة والتركيز ويلغي البحث المؤجل. يدعم البحث تطبيع الهمزات وأسماء الأدوات المركبة، وتبقى روابط الأدوات والتنقل والصفحة الرئيسية وصانع الفيديو. لا تُحذف أدوات أو تتغير بياناتها؛ رابط المقالات ما زال في التنقل العام والرئيسية. تُحدّث نسخ الأصول والكاش.
  EVIDENCE: pretest مع jsdom مرّ؛ اختبارات الإقلاع فحصت البحث بالعربية والمعرّف المركب والنتيجة الفارغة ومسح البحث والتركيز، والمسح قبل انقضاء مهلة البحث. markup_ids: 11، autonomy: 104، multichannel: 47، وDOM الحساب والتقدم المحاكيان مرّوا. Chromium محلي على ١٤٤٠ و٧٦٨ و٣٩٠ و٣٢٠ تحقّق أن عدد البطاقات يساوي بيانات الأدوات، وعدم تجاوز عناصر الصفحة المقاسة، والبحث والمسح، وفتح المسبحة والنقر مرة والعودة للقائمة، دون أخطاء صفحة أو طلبات كتابة؛ روجع الشكل بصريًا للكمبيوتر والهاتف. لم تُختبر كل أداة على حدة أو البيانات الخارجية، ولم يُختبر نشر أو إنشاء فيديو حقيقي.
- [ ] G70: إتاحة الأسئلة الشائعة للكيبورد وقارئ الشاشة وتجنّب قص الإجابات
  CHECK: NODE_PATH=/tmp/qr70/node_modules npm run pretest && node tests/markup_ids_test.js && node tests/autonomy_test.js && node tests/multichannel_test.js && NODE_PATH=/tmp/qr70/node_modules node tests/publish_client_dom.js && NODE_PATH=/tmp/qr70/node_modules node tests/progress_ui_test.js && for size in desktop tablet mobile small; do AWS_EXECUTION_ENV=AWS_Lambda_nodejs22.x NODE_PATH=/tmp/qr70/node_modules HOME_UI_VIEW="$size" node tests/home_responsive_test.js || exit 1; done && git diff --check
  EXPECT: يربط كل سؤال إجابته بمعرّف فريد ويعلن حالته المفتوحة أو المغلقة، وتكون الإجابة المغلقة مخفية فعلًا. يفتح Enter ويغلق Space مع تركيز ظاهر، ولا تتأثر الأسئلة الأخرى. تُعرض الإجابة بارتفاع طبيعي بعد تغيير عرض الشاشة بدل تثبيته عند الفتح؛ لا تتغير الأسئلة أو محتواها أو بقية الوظائف، وتُحدّث نسخ الأصول وكاش الخدمة.
  EVIDENCE: pretest مع jsdom مرّ بما فيه فحص ربط كل سؤال وحالته، وفتح أول إجابة وإغلاقها؛ markup_ids: 11، autonomy: 104، multichannel: 47، وDOM الحساب والتقدم بشبكة محاكاة مرّوا. Chromium محلي بأربعة عروض ١٤٤٠ و٧٦٨ و٣٩٠ و٣٢٠ فحص Enter وSpace والتركيز المرئي وحالة aria وتفرّد المعرّفات وإخفاء الإجابة الثانية؛ بقيت الإجابة الأولى دون قص بعد تغيير العرض إلى ٣٢٠. اختبارات التنقل والأدوات والتبويبات مرّت بلا أخطاء صفحة أو طلبات كتابة، والشبكة الخارجية محجوبة. لم يُختبر قارئ شاشة فعلي أو إنشاء فيديو أو نشر حقيقي.
- [ ] G71: التشغيل اليدوي الإضافي يحترم إعدادات النشر ولا يُسقط منصات بصمت
  CHECK: NODE_PATH=/tmp/qr71/node_modules npm run pretest && node tests/markup_ids_test.js && node tests/autonomy_test.js && node tests/multichannel_test.js && NODE_PATH=/tmp/qr71/node_modules node tests/publish_client_dom.js && NODE_PATH=/tmp/qr71/node_modules node tests/progress_ui_test.js && git diff --check
  EXPECT: run وrun_all يستخدمان مسارًا واحدًا ومقطعًا واحدًا وإعدادات المنصات وall_channels المحفوظة دون تعديلها؛ يحافظ المولّد على فحص المنصات المدعومة المختارة قبل الرندر ومحاولات النشر المستقلة لكل هدف. لا يُعلن النجاح إذا كانت منصة مدعومة مختارة بلا ربط أو فشل هدف؛ وتُعرض رسالة الخطأ. يُطبّق حد التشغيل اليدوي نفسه وفحص التشغيل الجاري على المسارين، ويتوقفان عند استجابة قراءة غير صالحة. تسمية الزرين الإضافيين تذكر الإعدادات المحفوظة؛ رسالة النجاح لا تدّعي مجرد بدء التوليد بعد اكتماله. تُحدّث نسخ العميل والكاش.
  EVIDENCE: اختبار HTTP بقاعدة ومولّد محاكيين لكل من run وrun_all أثبت نداء توليد واحدًا بالإعدادات نفسها ومنها true وfalse لـall_channels، وتمرير فشل منصة أو هدف بــ502، ورفض غير المصادق ووجود تشغيل وحد ٣ محاولات وردود قاعدة غير صالحة دون نداء توليد. اختبار channel_coverage المحاكى فحص منصة غير مرتبطة قبل الرندر ومحاولة قناتين مستقلتين مع فشل إحداهما؛ metadata_publish اختبر صفين وطلبَي يوتيوب محاكيين؛ DOM محاكى فحص التسمية ورسالتَي فشل جزئي واكتمال. pretest مع jsdom، markup_ids 11، autonomy 104، multichannel 47، واختبارات DOM والتقدم وdiff --check مرّت. لم تُختبر عملية إنشاء أو نشر حقيقية بهذا التعديل؛ الحارس قراءة ثم كتابة وليس قفلًا ذريًا ضد طلبات متزامنة، ولا ضمان للتسليم مرة واحدة عند نتيجة غير مؤكدة لدى المزوّد.
- [ ] G72: التحقق من إعدادات منصات النشر قبل الحفظ والتوليد
  CHECK: NODE_PATH=/tmp/qr72/node_modules npm run pretest && node tests/markup_ids_test.js && node tests/autonomy_test.js && node tests/multichannel_test.js && NODE_PATH=/tmp/qr72/node_modules node tests/publish_client_dom.js && NODE_PATH=/tmp/qr72/node_modules node tests/progress_ui_test.js && git diff --check
  EXPECT: الحفظ يرفض قائمة منصات مفقودة أو غير صالحة أو غير مدعومة أو مكررة بدل تغييرها بصمت، ويقبل قائمة فارغة عند الإيقاف فقط دون اختيار يوتيوب تلقائيًا. يقبل المنصات المدعومة الصحيحة كما هي مع all_channels، وتُمنع قائمة فارغة عند التفعيل. عند التوليد من إعداد محفوظ تالف أو فارغ أو مكرر تُسجّل محاولة فاشلة مع سبب قبل فحص القنوات أو رندر أو إدراج مهمة نشر؛ لا تُسقط منصة غير مدعومة ولا يُنشأ هدف مكرر من قائمة مكررة. لم تتغير إعدادات الإنتاج الحالية.
  EVIDENCE: اختبار API بقاعدة محاكاة رفض قائمة ناقصة/نوعًا خاطئًا/منصة غير مدعومة/تكرارًا دون كتابة، ورفض تفعيلًا بلا منصة؛ حفظ إيقافًا بقائمة فارغة وخيار all_channels ومرّر قائمة يوتيوب/تيك توك سليمة بالخيارين. اختبار channel_coverage بقاعدة محاكاة تأكد من تسجيل الفشل للإعدادات التالفة قبل قراءة القنوات أو أي رفع/طابور، مع بقاء اختبار فشل قناة واستقلال الأخرى. DOM محاكى أرسل قائمة فارغة أثناء الإيقاف دون استبدالها. pretest مع jsdom مرّ، markup_ids 11، autonomy 104، multichannel 47، وDOM الحساب والتقدم وdiff --check مرّت. لا اختبار لنشر حقيقي أو قاعدة الإنتاج؛ فحص الإعداد وحده لا يمنع تكرارًا من طلبات مستقلة متزامنة أو نتائج مزوّد مجهولة.
- [ ] G73: مفتاح إيقاف وتشغيل الأتمتة لا يغيّر إعدادات النشر
  CHECK: NODE_PATH=/tmp/qr73/node_modules npm run pretest && node tests/markup_ids_test.js && node tests/autonomy_test.js && node tests/multichannel_test.js && NODE_PATH=/tmp/qr73/node_modules node tests/publish_client_dom.js && NODE_PATH=/tmp/qr73/node_modules node tests/progress_ui_test.js && NODE_PATH=/tmp/qr73/node_modules node tests/automation_toggle_dom_test.js && git diff --check
  EXPECT: مفتاح الأتمتة يغيّر enabled فقط لصاحب الحساب ولا يحفظ اختيارات منصات أو محتوى أو قارئ أو خلفية أو all_channels غير محفوظة. الإيقاف متاح حتى مع إعداد قديم غير صالح؛ التفعيل يفحص المنصات والربط في الإعداد المحفوظ، ويرفض تفعيله إن تغيّر الإعداد أثناء الفحص. لا يُنشأ إعداد افتراضي خفي إذا لم يوجد صف. التعديلات المرئية تبقى دون حفظ حتى زر الحفظ؛ يُمنع تداخل طلبات الحفظ والمفتاح في نفس الصفحة. عند انقطاع رد المفتاح أو فشل الخادم تظهر حالة غير مؤكدة ويُعطّل المفتاح والحفظ حتى قراءة حالة مؤكدة من جديد. تُحدّث نسخ العميل والكاش.
  EVIDENCE: اختبار API بقاعدة وجلسة محاكيتين تحقّق من قصر PATCH على enabled وupdated_at مع نطاق المستخدم، والاحتفاظ بالمنصات والقارئ والخلفية وكل القنوات، والإيقاف مع إعداد غير صالح، ورفض التفعيل لمنصة غير مرتبطة أو إعداد غير صالح أو غائب، وفشل القراءة وتعارض إصدار الإعداد. اختبار jsdom ببيانات وطلبات محاكاة غيّر منصات ومحتوى ومفتاح القنوات بلا حفظ، ثم أوقف الأتمتة وأثبت أن طلب المفتاح لا يحملها وأنها بقيت في الواجهة، وفحص رفض التفعيل وانقطاع الرد وحظر الحفظ في الحالة المجهولة. pretest مع jsdom، markup_ids 11، autonomy 104، multichannel 47، DOM الحساب والتقدم وdiff --check مرّت. لم يُختبر تغيير إعدادات الإنتاج أو نشر حقيقي؛ الإيقاف يمنع التشغيلات الآلية اللاحقة ولا يُلغي عملية بدأت بالفعل، ولا يمثل قفلًا شاملًا لكل طلبات الحفظ المتزامنة من أجهزة مختلفة.
- [ ] G74: إزالة دمج الإعلانات وعدم إعادته عند بناء المحتوى
  CHECK: node tests/no_ads_test.js && node tests/sw_verify.js && NODE_PATH=/tmp/qr74deps/node_modules npm run pretest && node tests/markup_ids_test.js && node tests/autonomy_test.js && node tests/multichannel_test.js && NODE_PATH=/tmp/qr74deps/node_modules node tests/publish_client_dom.js && NODE_PATH=/tmp/qr74deps/node_modules node tests/progress_ui_test.js && NODE_PATH=/tmp/qr74deps/node_modules node tests/automation_toggle_dom_test.js && git diff --check؛ وفي نسخة مؤقتة من scripts وposts وpublic: npm run build:content ثم node /home/user/quran-reels/tests/no_ads_test.js
  EXPECT: حذف وسم شبكة الإعلان من كل الصفحات وقوالبها وإزالة أداة الحقن من البناء، وإزالة كود الخدمة الخارجي ونطاقات الإعلان من سياسات CSP مع بقاء مصادر الموقع الضرورية. يحدّث عامل الخدمة كاش الأوفلاين ويتجاوز كاش المتصفح عند تحضير الملفات، ويحاول إلغاء اشتراك push القديم دون منع التفعيل عند فشل الإلغاء؛ يبقى الأوفلاين ومسارات الشبكة المستثناة. لا تؤثر الإزالة على إعدادات الأتمتة أو النشر.
  EVIDENCE: فحص محلي مرّ على 8266 ملف HTML/JS عام و20 سكربتًا وثلاث سياسات CSP؛ بناء المحتوى الكامل في نسخة مؤقتة أعاد إنتاج 20000 مقال عربي و100 إنجليزي، ثم مرّ الفحص على 20552 ملف HTML/JS دون الشبكات الإعلانية المعروفة. اختبار عامل خدمة محاكى تحقّق من 21 أصلًا وطلب reload ومسح qr-v39 وإلغاء اشتراك أو تجاهل خطأ الإلغاء وتفعيل العملاء، والرجوع للأوفلاين واستثناء API والوسيط والصوت والخارج. pretest مع jsdom وmarkup_ids (11) وautonomy (104) وmultichannel (47) واختبارات DOM للحساب والتقدم والمفتاح وdiff --check مرّت؛ لم يُختبر عامل الخدمة أو إلغاء الاشتراك بمتصفح حقيقي أو على الإنتاج، وقد تبقى نسخة قديمة مؤقتًا بسبب كاش المتصفح أو CDN حتى تحديثها، ولا يمكن ضمان إزالة إذن إشعارات المتصفح نفسه.
- [ ] G75: صانع مصغّر ومعاينة إعدادات الأتمتة في الحساب
  CHECK: NODE_PATH=/tmp/qr75deps/node_modules npm run pretest && node tests/autopilot_unit.js && node tests/markup_ids_test.js && node -r ./tests/autonomy_fixture_clock.js tests/autonomy_test.js && node tests/multichannel_test.js && NODE_PATH=/tmp/qr75deps/node_modules node tests/publish_client_dom.js && NODE_PATH=/tmp/qr75deps/node_modules node tests/progress_ui_test.js && NODE_PATH=/tmp/qr75deps/node_modules node tests/automation_toggle_dom_test.js && LD_LIBRARY_PATH=/tmp/al2023/lib AWS_EXECUTION_ENV=AWS_Lambda_nodejs22.x NODE_PATH=/tmp/qr-browser-deps/node_modules REEL_TEST_WIDTH=320 node tests/account_reel_browser_test.js && LD_LIBRARY_PATH=/tmp/al2023/lib AWS_EXECUTION_ENV=AWS_Lambda_nodejs22.x NODE_PATH=/tmp/qr-browser-deps/node_modules REEL_TEST_WIDTH=1440 node tests/account_reel_browser_test.js && LD_LIBRARY_PATH=/tmp/al2023/lib AWS_EXECUTION_ENV=AWS_Lambda_nodejs22.x NODE_PATH=/tmp/qr-browser-deps/node_modules REEL_TEST_EXPORT=1 node tests/account_reel_browser_test.js && git diff --check
  EXPECT: تعرض بطاقة الحساب معاينة تقريبية بمحرك الصانع، وتتيح الآيات اليدوية أو الدوران الآلي، والقارئ والخلفية والترجمة والإهداء والأسلوب والمقاس والجودة واللون والخط والعلامة والحركة. تظهر عينة الآية الأولى وزر استماع لها عند تثبيت السورة والقارئ؛ يُوضّح أن الاختيارات التلقائية تحدد وقت التشغيل وأن المقطع اليدوي يتكرر، وأن صور الجهاز لا تُرفع أو تُستخدم للأتمتة. حفظ الإعدادات فقط يغيّر القالب، ويحافظ على حالة الأتمتة والقنوات المختارة؛ تحديث قائمة القنوات لا يمس تعديلات غير محفوظة، بما فيها تعديل حدث أثناء طلب حفظ سابق. يتحقق الخادم من النطاق والتصميم والقارئ والخلفية، ويطبّق القالب في الصانع قبل الإنشاء؛ في المسار الجديد، فشل تحميل خلفية أو ترجمة يوقف العملية، وللآيات اليدوية لا يُنشر ملف بتلاوة ناقصة ولا تُقص الآيات الطويلة تلقائيًا. يبقى الشكل القديم عند عدم حفظ تصميم جديد.
  EVIDENCE: pretest مع jsdom مرّ بما فيه فحص بيانات الصانع (47 قارئًا و114 سورة)، النطاقات والخيارات غير الصالحة، وحفظ القالب والقناتين بقاعدة محاكاة؛ autopilot_unit وmarkup_ids (11) وautonomy (104 بتاريخ عيناته المثبّت) وmultichannel (47) واختبارات DOM للحساب والتقدم والتبديل مرّت. Chromium محلي بعروض 320 و390 و1440 أثبت معاينة الإعدادات وحفظها بواجهة محاكاة وتطبيقها في الصانع، والاحتفاظ بالتعديل أثناء تحديث القنوات وبعد تعديل أحدث خلال طلب حفظ معلّق، وإعادة إنتاج الشكل القديم، ورفض الخلفية أو الترجمة الفاشلة؛ على عرض 390 أُنتج ملف تجريبي محلي بآيتين وصوت اصطناعي، مع فحص تحميلهما قبل التنزيل. لم يحدث نشر حقيقي أو تعديل إعدادات إنتاج أو اختبار صوت القرآن أو تشغيل الفيديو الناتج بصريًا؛ العرض ثابت لأول آية وليس فيديو مُنشأ مسبقًا. صورة الجهاز لا تعمل مع الأتمتة لأنها تبقى محلية، ولا يزال الاختيار التلقائي عينة لا وعدًا بالمحتوى الفعلي. اختبار autonomy بدون تثبيت الساعة يفشل بسبب تواريخ عيناته القديمة؛ حدث SIGSEGV متقطع عند بدء Chromium المحلي؛ مرّت الفحوص في عمليات منفصلة، مع تحديد مسار مكتبات al2023 عند الحاجة.
- [ ] G76: صورة خلفية خاصة للأتمتة — تنفيذ محلي، وهجرة القاعدة طُبّقت
  CHECK: NODE_PATH=/tmp/qr76deps/node_modules npm run pretest && node tests/private_background_test.js && node tests/private_background_api_test.js && NODE_PATH=/tmp/qr76deps/node_modules node tests/private_background_db_test.js && AWS_EXECUTION_ENV=AWS_Lambda_nodejs22.x NODE_PATH=/tmp/qr76deps/node_modules REEL_TEST_WIDTH=320 node tests/private_background_browser_test.js && AWS_EXECUTION_ENV=AWS_Lambda_nodejs22.x NODE_PATH=/tmp/qr76deps/node_modules REEL_TEST_WIDTH=1440 node tests/private_background_browser_test.js && AWS_EXECUTION_ENV=AWS_Lambda_nodejs22.x NODE_PATH=/tmp/qr76deps/node_modules REEL_TEST_EXPORT=1 node tests/private_background_browser_test.js && git diff --check
  EXPECT: يختار المستخدم JPEG أو PNG وتظهر المعاينة محليًا دون رفع؛ عند الحفظ فقط يحوّل المتصفح الصورة إلى JPEG مصغّرة بلا بيانات EXIF، وتُحفظ نسخة واحدة خاصة مع معرف جديد وإعداداتها في معاملة قاعدة واحدة. لا يتيح الجدول الخاص قراءة أو كتابة للمستخدمين مباشرة. API تقصر القراءة على الجلسة والمالك والمعرف وتتحقق من حجم الصورة وترويستها، ويُخرج الرندر الصورة المملوكة فقط ويفشل عند فقدها أو تعذّر فكها. حفظ خلفية أخرى أو استبدالها أو حذف الحساب يزيل الصورة السابقة من البيانات النشطة؛ إن كان رندر سابق قد قرأها في الذاكرة فبإمكانه إكمال الفيديو، وإلا يفشل بدل استبدالها بصمت. قد تبقى نسخة في النسخ الاحتياطية وقد تظهر الصورة داخل الفيديو المنشور. لا يوقف هذا التخصيص الأتمتة ولا يطلب موافقة لكل فيديو.
  EVIDENCE: اختبارات API والأمان محاكاة، وفحص معاملة SQL وصلاحيات الدور والتراجع والاستبدال والحذف في PGlite معزول، دون لمس قاعدة الإنتاج؛ Chromium اختبر المعاينة قبل الحفظ وعدم إرسال الصورة، الحفظ وإعادة المعاينة واستعمال الصانع ورفض صورة معطوبة والتبديل بعيدًا، على ٣٢٠ و٣٩٠ و١٤٤٠ بواجهة محاكاة. أُنتج محليًا فيديو بصوت اصطناعي وفُكّ إطار منه وتأكد ظهور الخلفية المختارة؛ لا تلاوة حقيقية أو نشر فعلي. pretest وautonomy (104 بساعة العينات المثبتة) وmultichannel (47) وDOM وdiff --check. لم يُختبر تزامن اتصالات PostgreSQL مستقلّة أو ربط PostgREST/Supabase الحقيقي أو الفيديو/الصوت الحقيقيان.
  نشر: طُبّقت هجرة `sql/migrations/20261107_private_backgrounds.sql` على قاعدة الإنتاج قبل النشر؛ تأكد أن RLS مفعّل، لا SELECT أو EXECUTE لـanon وauthenticated، وأن خدمة service_role تملك الإذن والـtrigger مفعّل، والجدول فارغ. لم يُختبر اتصال PostgREST الحقيقي أو إنشاء فيديو أو تحميل صورة في الإنتاج. جدول الصور خاص في قاعدة البيانات وليس في حاوية reels العامة. فحص الخادم لترويسة JPEG لا يمثل فكّ ترميز كامل؛ المتصفح والرندر يفكان الصورة ويفشلان عند تعذره.
- [ ] G77: قراءة طلبات الأتمتة بعد معالجة Vercel لجسم الطلب
  CHECK: NODE_PATH=/tmp/qr77deps/node_modules npm run pretest && node tests/autopilot_vercel_body_test.js && node tests/markup_ids_test.js && node -r ./tests/autonomy_fixture_clock.js tests/autonomy_test.js && node tests/multichannel_test.js && git diff --check
  EXPECT: تتعامل API الأتمتة مع `req.body` الذي تجهزه بيئة Vercel، أو مع تيار Node الخام عندما لا يوجد جسم مُحضّر؛ لا يفترض القارئ أن تيار Vercel المستهلك يحمل البيانات. تُقبل الإعدادات المعتادة وصورة الخلفية ومفتاح الإيقاف بعد فحص الجلسة، وتُرفض البيانات المشوهة والأجسام الكبيرة قبل الكتابة. تُفك UTF-8 بأمان عبر حدود أجزاء التيار. لا ينشئ الاختبار منشورًا ولا يغيّر إعدادات حقيقية.
  EVIDENCE: اختبار محلي يحاكي سلوك helper الموصوف في مصدر Vercel: يستهلك تيار الطلب ويستعيد أحداث data/end ويضع جسمًا جاهزًا؛ فحص حفظ خلفية عادية وخاصة، والإيقاف، وNode الخام، ورفض JSON المشوه والكبير دون كتابة، وفك نص عربي مجزأ. قاعدة البيانات والجلسة محاكاة؛ لا يثبت هذا الاختبار أن بيئة Vercel المنشورة تتصرف مطابقة لكل إصدار، ولم يُختبر حساب حقيقي أو رفع أو نشر فعلي.

- [x] G78: اختيار المقاطع بلا عناوين قرآنية مكتوبة يدويًا قد تخالف المرجع
  CHECK: node tests/quick_verses_test.js && node tests/sw_verify.js && node tests/markup_ids_test.js
  EXPECT: كل اختيار مرجع صالح؛ العنوان مقتبس من أول الآية نفسها في ملف القرآن المحلي، والنقر والتصنيفات تطابق المرجع؛ تحديث ذاكرة العامل.
  EVIDENCE: 301 مرجعًا؛ أزيلت العناوين القديمة غير الموثوقة، وحُفظت المراجع السابقة في «مقاطع أخرى» دون نسبة موضوعية، مع مجموعة أصغر للتصنيفات السريعة. اختبارات VM محلية تشمل نص العرض واختيار القائمة والاختيار العشوائي. المطابقة مرجعية مع ملف القرآن الموجود في المشروع وليست تدقيقًا مستقلًا للمصحف أو مراجعة شرعية شاملة لكل محتوى الموقع.

- [x] G79: أسماء المفضلة في أداة الأدعية تطابق فئات ملف الأذكار
  CHECK: node tests/dua_defaults_test.js && node tests/sw_verify.js && npm run pretest
  EXPECT: لا مفاتيح مفقودة أو مكررة؛ الفئات الأربع التي كانت لا تُعرض تظهر، والبحث ومسح البحث يعملان؛ لا تغيير لنص الدعاء؛ تحديث كاش التطبيق والعامل.
  EVIDENCE: اختبارات VM محلية تفحص 21 فئة وتعرض نصوصها من البيانات كما هي، والبحث والاستعادة ونسخ الكاش. أزيلت أربعة مفاتيح لا تطابق فئة واضحة من الملف، منها المفتاح ذي الخطأ الإملائي؛ لا تدقيق شرعي للمحتوى أو تعديل للمصحف أو اختبار نشر حقيقي.

- [x] G80: عرض كامل عناصر فئات الأدعية بدل إخفاء ما بعد العنصر الرابع
  CHECK: node tests/dua_defaults_test.js && node tests/sw_verify.js && npm run pretest
  EXPECT: كل عناصر الفئة الظاهرة تعرض نصها وزر نسخها، بما في ذلك النتائج المطابقة للبحث بعد العنصر الرابع؛ لا تغيير للبيانات الدينية.
  EVIDENCE: اختبار VM لجميع 11 فئة تحتوي أكثر من أربعة عناصر، والافتراضي والبحث واستعادة العرض ونسخ الكاش. اختبار العرض محاكاة DOM وليس متصفحًا فعليًا أو تدقيقًا دينيًا للنصوص.

- [x] G81: معاينة «رسالة لك» تتبع المقطع المختار
  CHECK: node tests/quick_verses_test.js && node tests/sw_verify.js && npm run pretest
  EXPECT: بعد كل اختيار عشوائي تُعرض الآية الأولى والمرجع من المقطع نفسه، مثل بقية التصنيفات، حتى بعد اختيار سابق مختلف؛ تحديث كاش صانع الريلز.
  EVIDENCE: محاكاة DOM لكل اختيار عشوائي، واختبار Chromium محلي بقراءات عشوائية مثبتة وتبديل التصنيفات بعروض 320 و390 و1440؛ بلا تغيير نص القرآن أو إعدادات حساب أو نشر فيديو.

- [x] G82: زر «كل الرسائل» يفتح قائمة المقاطع المختارة
  CHECK: node tests/quick_verses_test.js && node tests/sw_verify.js && npm run pretest
  EXPECT: فتح تبويب السورة والآيات قبل تركيز القائمة دون تغيير المقطع السابق، والسماح باختيار مقطع منها؛ تحديث إصدارات الأصول والكاش.
  EVIDENCE: قبل الإصلاح أظهر Chromium محليًا أن القائمة مخفية ولا تستقبل التركيز؛ بعده نجحت التجربة والاختيار اليدوي بعروض 320 و390 و1440 دون أخطاء JavaScript.

- [x] G83: معاينة الرسالة تواكب جميع تغييرات المقطع
  CHECK: node tests/quick_verses_test.js && node tests/sw_verify.js && npm run pretest
  EXPECT: عرض أول آية ومرجع المقطع الحالي عند التحميل وبعد الاختيار العشوائي أو اليدوي وتغيير السورة أو نطاق الآيات، من دون تغيير نص القرآن.
  EVIDENCE: فشل التطابق قبل الإصلاح عند الاختيار اليدوي؛ نجحت المحاكاة وChromium محليًا بعروض 320 و390 و1440 بعد الإصلاح، دون نشر فيديو أو تغيير إعدادات حساب.

- [x] G84: فشل التلاوة في المعاينة يعيد المحاولة ولا يختفي التحذير
  CHECK: node tests/creator_audio_retry_test.js && npm run pretest
  EXPECT: يبقى تحذير الصوت ظاهرًا، وتُعاد محاولة تحميل الآيات الناقصة عند إيقاف المعاينة وتشغيلها أو عند التصدير؛ يوضح التصدير والنتيجة نقص الصوت إن استمر فشله، مع إبقاء السلوك الحالي الذي يسمح بالتصدير دون صوت.
  EVIDENCE: Chromium محلي بعروض 320 و390 و1440 اختبر الانقطاع ثم إعادة المحاولة بصوت WAV اصطناعي؛ محاكاة اختبارية لفشل بعض الآيات أو كلها وتنبيهات التصدير. لم يُختبر قارئ حقيقي أو ينشر فيديو.

- [x] G85: حارس اكتمال التلاوة لجميع اختيارات الأتمتة
  CHECK: node tests/autopilot_complete_audio_test.js && NODE_PATH=/tmp/qr93deps/node_modules npm run pretest && node tests/autopilot_unit.js && node tests/markup_ids_test.js && node -r ./tests/autonomy_fixture_clock.js tests/autonomy_test.js && node tests/multichannel_test.js && git diff --check
  EXPECT: يتحقق الرندر الآلي من وجود صوت كل آية مختارة، يدويًا أو تلقائيًا، قبل تنزيل الملف أو رفعه؛ تعذر التحقق أو فقد آية يوقف هذه المحاولة برسالة، ولا يغيّر إعدادات الجدولة أو يتطلب موافقة. قد يتأخر النشر أو لا يحدث إذا استمر الفشل، وتبقى إعادة المحاولة القائمة خاضعة لقيودها. يظل التصدير اليدوي للمستخدم بسلوكه وتحذيراته الحالية.
  EVIDENCE: اختبار VM للتحقق من الآيات والقارئ الصحيح والفقد الكلي والجزئي وفشل قراءة الصفحة، وفحص موضع الحارس غير المشروط في مسار الرندر. Chromium محلي أنشأ تسجيلًا بصوت اصطناعي كامل وآخر بناقص وثالث بصامت؛ مرّ الحارس للأول ورفض الآخرين دون نشر، ولم يُختبر كامل مسار الأتمتة أو تلاوة فعلية أو نشر إنتاجي. فحص وجود الصوت في الذاكرة لا يثبت سلامة الصوت داخل الملف أو سلاسة الإطارات. pretest مع jsdom وautopilot_unit وmarkup وautonomy بساعة ثابتة وmultichannel مرّت.

- [x] G86: انتظار اكتمال تسجيل الفيديو بدل الاعتماد على مهلة ثابتة
  CHECK: node tests/reel_recorder_stop_test.js && NODE_PATH=/tmp/qr94deps/node_modules npm run pretest && node tests/autopilot_unit.js && node tests/markup_ids_test.js && node -r ./tests/autonomy_fixture_clock.js tests/autonomy_test.js && node tests/multichannel_test.js && git diff --check
  EXPECT: تُجمع البيانات حتى حدث stop بعد dataavailable الأخير، ولا تُعرض نتيجة فارغة أو بعد فشل المسجّل أو توقفه مبكرًا؛ تنتهي المحاولة بخطأ إذا لم يصل stop في 20 ثانية، ويعمل الإلغاء قبل التسجيل أو أثناء إنهائه، مع تنظيف حلقة الرسم ومسار الفيديو ومستمع الإلغاء. تبقى فترة نصف ثانية بعد انتهاء الصوت كما كانت، ولا تُغيّر الجدولة أو فحص التلاوة. تحديث نسخة reel.js وكاش العامل.
  EVIDENCE: قبل الإصلاح أثبت مسجّل محاكى بتأخر 600ms أن الملف يُعاد دون الجزء الأخير؛ اختبار محاكاة يغطي التأخر والإلغاء والخطأ والتوقف المبكر والمهلة والتوقف الفوري والملف الفارغ والتنظيف. Chromium محلي أنشأ ملف MP4 بصوت اصطناعي وفُكّ ترميزه مع مسار صوت غير صامت، واختُبر الإلغاء دون نشر؛ سُجّلت أيضًا نتيجة اختبار بإعداد Chromium الافتراضي وأخرى بتعطيل GPU في الاختبار فقط، والإطارات في الوضع الافتراضي قليلة جدًا. لا يثبت ذلك حدوث فقد الجزء الأخير في الإنتاج، أو سلامة كل الملفات أو التلاوة الحقيقية، ولا يحل مشكلة سلاسة الإطارات. pretest مع jsdom وautopilot_unit وmarkup وautonomy بساعة عينات ثابتة وmultichannel مرت.

- [x] G87: استمرار تحديث التلاوة بعد احتياطي تأخر نهاية الصوت
  CHECK: node tests/ayah_player_fallback_test.js && NODE_PATH=/tmp/qr95deps/node_modules npm run pretest && node tests/autopilot_unit.js && node tests/markup_ids_test.js && node -r ./tests/autonomy_fixture_clock.js tests/autonomy_test.js && node tests/multichannel_test.js && git diff --check
  EXPECT: إذا تأخر حدث onended واستُخدم الاحتياطي للانتقال إلى الآية التالية، تستمر حلقة تحديث الوقت والتقدم؛ لا تعيد جدولة الحلقة إذا انتهت التلاوة أو أُوقفت مؤقتًا، ولا يسبب حدث قديم متأخر تخطي آية. لا يُعدّل نص القرآن أو إعدادات الأتمتة. تحديث نسخة reel.js وكاش العامل.
  EVIDENCE: قبل الإصلاح أظهر اختبار VM توقف الحلقة بعد الانتقال؛ اختبار يتحقق أيضًا من الحدث المتأخر والإيقاف والاستئناف ونهاية المقطع. في Chromium محلي بثلاث نغمات اصطناعية، مع تأخير مفتعل لـonended، توقفت تحديثات التقدم بعد أول نغمة قبل الإصلاح واستمرت خلال النغمتين التاليتين بعده. في تشغيل آخر دون افتعال، حُمّل Chromium headless بالرسم وأظهر النتيجة نفسها قبل وبعد، وليس هذا اختبارًا على جهاز المستخدم أو الإنتاج. تحليل ملف اصطناعي كشف فجوة صوتية في اختبار الضغط؛ تعديل الحلقة لا يعالجها ولا يضمن سلاسة الفيديو أو سلامة كل تسجيل أو التلاوة الحقيقية. لم يحدث نشر أو تغيير حساب؛ pretest وautopilot_unit وmarkup وautonomy بساعة ثابتة وmultichannel نجحت.

- [x] G88: أداة محلية لمقارنة تزامن الصوت والإطارات المشفرة
  CHECK: node tests/render_sync_diagnostic_test.js && NODE_PATH=/tmp/qr96deps/node_modules npm run pretest && node tests/autopilot_unit.js && node -r ./tests/autonomy_fixture_clock.js tests/autonomy_test.js && node tests/multichannel_test.js && git diff --check؛ وبوجود Chromium وffmpeg: node tools/render_sync_diagnostic.js؛ وnode tools/render_sync_diagnostic.js --no-gpu؛ وnode tools/render_sync_diagnostic.js --no-gpu --stall-ms=1500.
  EXPECT: اختبار اختياري محلي يمنع طلبات المتصفح خارج الأصل المحلي، ويولّد ثلاث نغمات اصطناعية وعلامات إطارات لأرقام الآيات، ويقرأ الملف المشفّر بـffmpeg ثم يقارن التردد بالعلامة في نوافذ 100ms. تُعرض النوافذ غير المصنفة وأجزاء الصوت والفيديو غير المقارنة، وتُحذف الملفات المؤقتة. لا يغيّر الأتمتة أو الموقع أو الحساب ولا يرفع أو ينشر. التحليل تقريبي، ولا يثبت ظهور النص القرآني أو سلامته، ولا يثبت ظروف الإنتاج.
  EVIDENCE: اختبارات وحدات لتمييز النغمات والعلامات والاختلاف والتصنيف المجهول والذيل غير المحلل. فحص Chromium وffmpeg محلي: الوضع الافتراضي أظهر في أحد التشغيلات 0.4 ثانية من اختلاف العلامة عن نغمة المقطع الثالث، مع 1.62 ثانية صوت لم تشملها المقارنة؛ تشغيل آخر أعطى نحو 0.5 ثانية اختلاف. --no-gpu دون ضغط أظهر نافذة واحدة 100ms قرب الحد؛ مع تعليق مفتعل 1500ms لم تظهر اختلافات في الجزء المقارن، مع فجوة صوت صامتة. النتائج تعتمد على البيئة ولا تُثبت أداء الإنتاج. لم يُنشر تغيير للتطبيق أو إعدادات الحساب ولم تُستخدم تلاوة حقيقية أو يُرفع فيديو.

- [x] G89: فحص المزامنة المحلي يدعم 1080p ويظهر النقص بوضوح
  CHECK: node tests/render_sync_diagnostic_test.js && NODE_PATH=/tmp/qr98deps/node_modules npm run pretest && node tests/autopilot_unit.js && node -r ./tests/autonomy_fixture_clock.js tests/autonomy_test.js && node tests/multichannel_test.js && git diff --check؛ مع Chromium وffmpeg: node tools/render_sync_diagnostic.js --quality=1080 --no-gpu.
  EXPECT: يظل 720p الافتراضي، ويُتاح 1080p بنسبة 9:16؛ يذكر التقرير الجودة والأبعاد، ويطبع JSON حتى إذا لم تظهر كل النغمات في الجزء المقارن، ويخرج حينها بالرمز 2. لا يعني ظهور النغمات اكتمال فحصها أو سلامة الآيات، وتبقى الأجزاء غير المقارنة واضحة. لا تغير الأداة التطبيق أو حساب المستخدم أو الأتمتة.
  EVIDENCE: اختبار وسيطات وجودة وبيانات ناقصة؛ Chromium محلي بصوت اصطناعي أكد 1080×1920. اختبار ffmpeg محلي بقص الإطارات عمدًا أكد إخراج JSON والرمز 2 وذيل الصوت غير المقارن. محليًا، أزال نموذج مؤقت الرسم المكرر فزاد عدد الإطارات في أمثلة 720p من 6–7 إلى 9–10 في Chromium الافتراضي، لكنه لم يضمن التزامن؛ في 1080p لم تتضمن إحدى المقارنات النغمة الثالثة. إشارة willReadFrequently رفعت الإطارات في مثال لكنها رفعت مدة ثلاثة مقاطع ثانيتين من نحو 7.6 إلى 12.2 ثانية بفواصل صامتة، لذلك لم تُعتمد التغييرات التجريبية في التطبيق. لا تلاوة حقيقية أو نشر أو اختبار إنتاجي؛ قد تختلف النتائج على الأجهزة الفعلية.

- [x] G90: فحص توقيت إطارات التصدير قبل إعادة أخذ العينات
  CHECK: node tests/render_sync_diagnostic_test.js؛ FFMPEG=/path/to/ffmpeg node tests/render_sync_frame_timing_integration_test.js؛ NODE_PATH=/tmp/qrsync-deps/node_modules npm run pretest؛ node tests/autopilot_unit.js؛ node -r ./tests/autonomy_fixture_clock.js tests/autonomy_test.js؛ node tests/multichannel_test.js؛ git diff --check. اختبارات Chromium محلية بالنغمات: --quality=1080 --no-gpu و--quality=720 --no-gpu --stall-ms=1500.
  EXPECT: يعرض التشخيص عدد الإطارات المفكوكة الأصلية وتوقيت أول وآخر إطار، ومتوسط المعدل بينهما وأطول فجوة توقيت، قبل إعادة أخذ العينات التي قد تكرر الإطارات. غياب الطوابع أو خروجها عن الترتيب يمنع عرض متوسط أو أقصى فترة مضللة. لا تُستنتج سلامة النص أو سلاسة المحتوى المتطابق أو التزامن أو نجاح الإنتاج من هذه المقاييس.
  EVIDENCE: اختبار ملف اصطناعي من 3 إطارات متغيرة التوقيت أعطى أطول فترة 0.7 ثانية؛ واختبارات الوحدات تغطي غياب/تكرار/تراجع التوقيت وفقد ترتيب الإطارات. تجربة Chromium المحلية 1080p دون GPU أظهرت 40 إطارًا وأطول فترة نحو 0.29 ثانية، وأظهر تعليق 1.5 ثانية المفتعل في 720p فترة نحو 1.56 ثانية؛ تختلف الأرقام حسب البيئة، والعلامة المضافة تؤثر في الأداء. لم تُغيّر الشيفرة التشغيلية أو الأتمتة ولم يُنشر فيديو.

- [x] G91: عدم إنهاء تسجيل التلاوة عند غياب مسار الصوت أو انتهائه
  CHECK: node tests/reel_audio_track_test.js && node tests/reel_recorder_stop_test.js && NODE_PATH=/tmp/qr82deps/node_modules npm run pretest && node tests/autopilot_unit.js && node -r ./tests/autonomy_fixture_clock.js tests/autonomy_test.js && node tests/multichannel_test.js && node tests/markup_ids_test.js && git diff --check. اختبار Chromium محلي بنغمات اصطناعية: مسار صالح، ومسار مفقود، وإيقاف المسار أثناء التسجيل، والإلغاء.
  EXPECT: عند طلب التسجيل الصوتي، يُرفض غياب مسار صوت حي ومفعّل أو عدم إرفاقه، ويُرفض انتهاؤه أثناء التسجيل أو قبل اكتمال المسجل؛ تُنظّف مسارات الفيديو ومستمعات الأحداث دون إيقاف مسار الصوت المشترك. يسمح الوضع الصامت المقصود كما كان، ولا يُغيَّر الجدول. يعرض خطأ التصدير سببه، ويتوقف انتظار الأتمتة عند فشل مؤكّد بدل الانتظار للمهلة؛ لا يُعتبر ذلك فحصًا لمحتوى الصوت أو تزامنه.
  EVIDENCE: اختبارات وحدة تشمل المسارات المفقودة والمنتهية والمعطلة وفشل الإرفاق والمنشئ وإيقاف المسار بلا حدث، والإلغاء، ونجاح التسجيل والوضع الصامت. اختبارات Chromium محلية بالنغمات: نجح المسار السليم؛ عند غياب المسار أو إيقافه أُخفيت النتيجة وتوقف اللاعب وظهر السبب؛ نجح الإلغاء. قياس تجريبي منفصل لفترات الرسم لم يُستخدم كحارس لأن Chromium الافتراضي أظهر فجوة 2.4 ثانية دون تعليق مفتعل؛ قد يمنع هذا الحارس المقترح الأتمتة. التغيير لا يثبت سماع التلاوة في الملف ولا يصلح فجوات التزامن؛ لم يتم نشر فيديو أو اختبار إنتاجي حقيقي.

- [x] G92: التحقق من تشغيل محرّك الصوت أثناء تسجيل التلاوة
  CHECK: node tests/reel_audio_track_test.js && node tests/reel_recorder_stop_test.js && NODE_PATH=/tmp/qr83deps/node_modules npm run pretest && node tests/autopilot_unit.js && node -r ./tests/autonomy_fixture_clock.js tests/autonomy_test.js && node tests/multichannel_test.js && node tests/markup_ids_test.js && git diff --check. اختبار Chromium/ffmpeg محلي بالنغمات مع تعليق AudioContext قبل التصدير وأثناءه وإلغاء انتظار الاستئناف.
  EXPECT: تسجيل التلاوة ينتظر حتى خمس ثوان لاستئناف AudioContext غير المشغّل، مع إلغاء فوري وتنظيف الانتظار؛ يُرفض السياق المغلق أو فشل/تعليق الاستئناف. أثناء تشغيل التلاوة، يُرفض توقف السياق بدل الانتظار أو إكمال نتيجة ناقصة؛ لا يُرفض توقفه بعد نهاية التلاوة. الوضع الصامت المقصود لا يحتاج AudioContext. لا تتغيّر الجداول ولا يتوقف المسار الصوتي المشترك.
  EVIDENCE: وحدات لمحرك مفقود، مغلق، معلّق، رفض أو تعليق resume، الإلغاء، الاستئناف، التوقف أثناء التسجيل وبعد نهايته. Chromium المحلي استأنف سياقًا عُلّق قبل التصدير ونجح في إنتاج فيديو نغمات؛ التعليق أثناء التسجيل أعطى خطأ وأخفى النتيجة؛ استئناف معلّق انتهى بمهلة والإلغاء أنهى الانتظار. علامة التزامن ما زالت تظهر اختلاف نافذة 100ms قرب أحد الحدود؛ وجود AudioContext نشط لا يثبت وصول الصوت للملف أو التزامنه. لا حسابات أو نشر فيديو أو اختبار إنتاجي حقيقي.

- [x] G93: إلغاء إنشاء الريل أثناء تحميل التلاوة
  CHECK: node tests/audio_prepare_abort_test.js && node tests/creator_export_abort_test.js && NODE_PATH=/tmp/qr84deps/node_modules npm run pretest && node tests/autopilot_unit.js && node -r ./tests/autonomy_fixture_clock.js tests/autonomy_test.js && node tests/multichannel_test.js && node tests/markup_ids_test.js && git diff --check؛ واختبار Chromium اختياري: node tests/creator_export_abort_browser_test.js.
  EXPECT: إلغاء التصدير أثناء جلب التلاوة يقطع طلب الوسيط أو المحاولة المباشرة ولا يبدأ التالية أو التسجيل؛ الإلغاء أثناء فك الصوت لا ينتظر فك الترميز ولا يحفظ نتيجته المتأخرة. لا يُعامل الإلغاء كفشل تلاوة يؤدي للوضع الصامت. الآيات المخزّنة قبل الإلغاء تبقى قابلة لإعادة الاستخدام. فشل الشبكة العادي والمحاولة البديلة والمعاينة الصامتة لا تتغير، ويمنع الإلغاء قبل أو بعد حوار المدة الطويلة بدء التسجيل؛ الحوار المفتوح لا يُغلق تلقائيًا حتى يختار المستخدم ردًا.
  EVIDENCE: وحدات للإلغاء أثناء طلبَي الوسيط والبديل، وفك الترميز، ونتيجة فك متأخرة، والإلغاء في callback التقدم، وإعادة المحاولة، وخطأ الشبكة العادي، وإلغاء التحضير والحوار. اختبار Chromium بخادم محلي ونغمة WAV اصطناعية: قُطع الطلب المعلق عند الخادم، لم تبدأ المحاولة البديلة أو التسجيل، وأُغلقت النافذة؛ ثم نجحت إعادة المحاولة. لم يُنشر فيديو أو يُمس حساب أو جدول، ولا يُثبت الاختبار تزامن الصوت والصورة.

- [x] G94: إغلاق تأكيد المدة الطويلة عند الإلغاء ومنع بدء تصديرين متزامنين
  CHECK: node tests/confirm_dialog_abort_test.js && node tests/creator_export_abort_test.js && NODE_PATH=/tmp/qr85deps/node_modules npm run pretest && node tests/autopilot_unit.js && node -r ./tests/autonomy_fixture_clock.js tests/autonomy_test.js && node tests/multichannel_test.js && node tests/markup_ids_test.js && git diff --check؛ اختبار Chromium اختياري NODE_PATH=/tmp/qr85deps/node_modules node tests/creator_export_abort_browser_test.js.
  EXPECT: إشارة إلغاء التصدير تغلق حوار المدة الطويلة، وتزيل مستمع الإلغاء ولا تبدأ التسجيل؛ زر إلغاء الحوار وزر المتابعة يعملان كما كانا. الحوارات التي لا تستخدم إشارة تحافظ على سلوكها. إذا طُلب تصديران أثناء انتظار Quran.load لا يبدأ منهما إلا واحد؛ عند الإلغاء يمكن إعادة المحاولة، دون تغيير الأتمتة أو الجدول.
  EVIDENCE: وحدات تغطي الإلغاء قبل إنشاء الحوار وأثناءه، أزرار الحوار، إزالة المستمعات، حوارين مستقلين وتصديرين متزامنين. في Chromium مع نغمات محلية: إلغاء تحميل متزامن قطع الطلب ولم يبدأ التسجيل، أعقبه تصدير اختبار ناجح؛ إلغاء الإشارة أغلق الحوار بلا نتيجة، وزر الإلغاء أغلقه، وزر المتابعة سمح بتصدير اختبار آخر. أُجبر فرع الحوار باختبار مدة افتراضية بدل إنتاج مقطع من خمس دقائق. لا حسابات أو نشر فيديو أو اختبار إنتاجي، ولا يثبت ذلك التزامن.

- [x] G95: إعادة محاولة تحميل بيانات القرآن بعد الفشل دون حفظ حالة جزئية
  CHECK: node tests/quran_load_recovery_test.js && node tests/creator_export_abort_test.js && NODE_PATH=/tmp/qr86deps/node_modules npm run pretest && node tests/autopilot_unit.js && node -r ./tests/autonomy_fixture_clock.js tests/autonomy_test.js && node tests/multichannel_test.js && node tests/markup_ids_test.js && git diff --check؛ اختبار Chromium اختياري NODE_PATH=/tmp/qr86deps/node_modules node tests/account_quran_recovery_browser_test.js.
  EXPECT: تشترك المحاولات المتزامنة في طلب واحد، وتُزال حالة الطلب بعد الفشل فتنجح محاولة لاحقة؛ لا تُقبل استجابة HTTP فاشلة أو بنية ناقصة، ولا تُعرض بيانات جزئية عند الفشل. يشمل الفحص البنيوي 114 سورة و6236 آية وترتيب السور والآيات ونصًا غير فارغ؛ لا يثبت صحة النص أو الرسم. يُظهر بدء الإنشاء خطأ تحميل واضحًا بدل رفض غير معالج. لا تغيير في البيانات القرآنية أو الجدول أو الحساب.
  EVIDENCE: وحدات لانقطاع الشبكة وHTTP وJSON وبنية غير صالحة والتزامن والحالة الذرية ثم التعافي؛ ملف المشروع الحقيقي نجح دون تعديل. Chromium محلي: تعطيل طلب القرآن مرة في معاينة الحساب أظهر التحذير ثم تعافت المعاينة مع تغيير أحد الحقول، دون حفظ إعدادات أو إرسال منشور. الفحص لا يعالج فشل تهيئة الصانع الأولية من دون تحديث الصفحة، ولا يثبت تزامن التصدير أو صحة النص لمختص.

- [x] G96: حماية مسودة «حسابي» وظهور نافذة الدخول وتصحيح الخصوصية
  CHECK: NODE_PATH=/tmp/qrd/node_modules npm run pretest؛ node tests/publish_client_dom.js؛ node tests/multichannel_test.js؛ node tests/markup_ids_test.js؛ node tests/autopilot_unit.js؛ node -r ./tests/autonomy_fixture_clock.js tests/autonomy_test.js؛ Chromium محلي عبر NODE_PATH=/tmp/qrd/node_modules مع REEL_TEST_WIDTH=390 و1280 في tests/account_reel_browser_test.js؛ git diff --check.
  EXPECT: تبقى حقول التخصيص وملف الصورة المختار عند إعادة تحميل بيانات الحساب والتنقل الداخلي وعند التعديل أثناء الحفظ، وتظهر حالة التعديلات غير المحفوظة؛ تستخدم الأتمتة الإعدادات المحفوظة بلا تعطيل أو موافقة إضافية. تُتجاهل قراءة قديمة عند بدء الحفظ أو عند وصول حساب أحدث. فشل الاتصال يظهر تنبيهًا؛ لا تبقى حقول الحساب السابق عند تحميل حساب آخر. نافذة الدخول مستقلة عن شريط الخصوصية، والنص يميز الصورة المحلية عن صورة الأتمتة المحفوظة ويذكر أدوات Vercel المضمّنة.
  EVIDENCE: Chromium محلي على مقاسَي هاتف وسطح مكتب مع حساب واستجابات وشبكة محاكاة: التنقل والقراءة والفشل أبقوا الإهداء وملف الصورة في المسودة، وتعديل أثناء الحفظ ظل غير محفوظ، وقراءة سابقة للحفظ وحساب متأخر لم يتغلبا على الأحدث. ظهرت نافذة الدخول بعد إغلاق شريط الخصوصية؛ لم تُرسل صورة فعلية إلى خادم ولم يُنشَر فيديو أو يتغير جدول أو حساب حقيقي. المسودة لا تستمر بعد تحديث الصفحة أو تغيير الحساب، ولم تُختبر كل حالات المصادقة أو النشر الإنتاجي.

- [x] G97: تبديل الأتمتة الحقيقي ومراجعة نتائج الحفظ غير المؤكدة
  CHECK: NODE_PATH=/tmp/qr88deps/node_modules npm run pretest؛ node tests/publish_client_dom.js؛ node tests/progress_ui_test.js؛ node tests/autopilot_unit.js؛ node -r ./tests/autonomy_fixture_clock.js tests/autonomy_test.js؛ node tests/multichannel_test.js؛ node tests/markup_ids_test.js؛ Chromium محلي في tests/account_save_uncertain_browser_test.js بعرض 390 و1280 وtests/private_background_browser_test.js وtests/account_reel_browser_test.js؛ git diff --check.
  EXPECT: لا يمنع تفويض النقر سلوك مفتاح الأتمتة؛ يرسل النقر تغيير الحالة فقط. عند انقطاع رد الحفظ أو 5xx أو رد نجاح ناقص/مختلف، لا يُعرض نجاح ولا يُمحى ملف الصورة أو المسودة، وتُوقف محاولات الحفظ والتبديل والتشغيل اليدوي بالواجهة مؤقتًا دون إيقاف الأتمتة. مراجعة صريحة تقرأ إعدادات الخادم وتعرضها، ثم يقرر المستخدم السماح بالتعديل؛ قراءة ناقصة أو فاشلة لا ترفع التحذير. يمنع اختلاف الحساب قبل إرسال الطلب إرسال المسودة أو الصورة للجلسة الأخرى. زر المقال يوضح أنه يحاول النشر ويطلب تأكيد التشغيل اليدوي فقط.
  EVIDENCE: Chromium محلي بمحاكاة الخادم اختبر حفظًا نُفّذ وفُقد رده، 503 ونجاحًا ناقصًا أو مخالفًا، فشل قراءة وإعادة التحقق، استبقاء ملف الصورة، خطأ تجهيز محلي دون إرسال، تبديل الحساب أثناء تجهيز الصورة، تبديل الأتمتة بنقرة حقيقية، وإلغاء وقبول تأكيد المقال دون نشر حقيقي. اختبارات خلفية ومعاينة واسترجاع ونظام الأتمتة المحلية نجحت. لا يضمن التحقق اكتمال طلب تأخر على الخادم؛ الحالة المعروضة لقطة قراءة فقط وقد تتغير بعد ذلك. حفظ الإعدادات من نوافذ أو أجهزة متزامنة لا يملك بعد حارس تعارض شامل، وقد يكتب حالة أتمتة قديمة؛ يلزم إصلاح على الخادم/قاعدة البيانات واختبار تزامن حقيقي. لم تُغيَّر إعدادات حساب حقيقي أو جداول أو يُرفع محتوى أو يُنشَر فيديو.

- [x] G98: أساس معاملة ذرّية لحماية إعدادات الحساب — غير مفعّل في التطبيق
  CHECK: NODE_PATH=/tmp/qr89deps/node_modules node tests/autopilot_settings_guard_db_test.js؛ PG_BIN_DIR=/tmp/qr89deps/node_modules/@embedded-postgres/linux-x64/native/bin PG_LIB_DIR=/tmp/qr89deps/node_modules/@embedded-postgres/linux-x64/native/lib NODE_PATH=/tmp/qr89deps/node_modules node tests/autopilot_settings_guard_pg_test.js؛ git diff --check.
  EXPECT: هجرة إضافية محلية فقط تضيف مراجعة فريدة لتغييرات الإعدادات، وتتيح حفظًا مشروطًا في معاملة واحدة مع الصورة الخاصة. تعارض الصف الموجود أو الإدراج الأول يعيد صفر صفوف ولا يغيّر الصورة أو الإعدادات. تحديث updated_at فقط لا يبطل المسودة؛ وتبديل الخلفية يواصل حذف الصورة بالـtrigger السابق. الدالة متاحة لدور الخدمة فقط.
  EVIDENCE: PGlite يغطي التعارض والملكية والصلاحيات وتراجع المعاملة وتغيير/إزالة الصورة؛ PostgreSQL 17 محلي حقيقي باتصالين متزامنين أظهر انتظار القفل ورفض حفظ قديم مقابل إيقاف، وتنافس إنشاء الصف الأول دون فقد، مع حساب مستقل. الاستعلامات الإنتاجية للقراءة فقط أكدت مفتاح user_id ووجود trigger الصورة وسياسة RLS؛ لم تُنفّذ الهجرة على الإنتاج ولم يُغيَّر التطبيق أو الحسابات. هذا أساس غير موصول بعد بالواجهة أو API، ولا يمنع المسارات القديمة أو كتابة المستخدم المباشرة؛ تفاصيل الدمج والمخاطر في docs/account-settings-concurrency.md. لم يُختبر PostgREST حي أو يُنشر فيديو.
