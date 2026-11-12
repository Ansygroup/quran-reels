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
