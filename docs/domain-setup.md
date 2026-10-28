# الدومين المخصص `quran-reels.ansygroup.com` (كمل#14)

الحالة: غير مفعّل — سجلات **DNS لم تُضبط بعد** عند مزوّد النطاق (ansygroup.com).
كل SEO الحالي مثبَّت على `https://quran-reels-tau.vercel.app` (قرار موثّق) — بعد الإطلاق
نفّذ «تبديل الأساس» في الأسفل دفعةً واحدة.

## 1) الحالة الفعلية (مُتحقَّق بموجب كمل#14 عبر CLI)

- الدومين **مربوط بالمشروع ومُلكيته مُوثَّقة** (`domain_already_assigned` + `domainOwnership: current-scope`) ✓
- لكن إعداد DNS **غير صالح** (`invalid-configuration`) — لم يُضبط السجل بعد.
- المزوّد: **Cloudflare** — يوجد رابط تطبيق تلقائي (Domain Connect):

```text
https://vercel.com/api/v9/projects/prj_A2RKVu4Z1Yn8ZqkXbJcloK79HF1a/domains/quran-reels.ansygroup.com/domain-connect/apply?teamId=team_jsDd0T7iHZ26E6GhomgOxE4T
```

افتحه وسجّل دخول Cloudflare → يطبّق السجل تلقائيًا → ثم أعد التحقق.

## 2) السجل المطلوب يدويًا (إن فضّلت الإدخال بنفسك)

| النوع | الاسم | القيمة |
|---|---|---|
| CNAME | `quran-reels` | `cabd20e3c48f819b.vercel-dns-017.com.` (بديل احتياطي: `cname.vercel-dns.com`) |

بعدها:

```bash
V=/home/user/.vc/node_modules/.bin/vercel
$V -Q .vcfg domains verify quran-reels.ansygroup.com --scope ansygroups-projects --non-interactive
# → ok:true  = يعمل https://quran-reels.ansygroup.com خلال دقائق (TLS تلقائي)
```

## 3) تبديل الأساس بعد الإطلاق (أمر واحد)

سكربت `scripts/rebase_url.js` يبدّل النطاق القديم بكل الملفات (قوالب، اختبارات، sitemap،
llms، README، canonical/hreflang) ثم يعيد بناء الصفحات:

```bash
node scripts/rebase_url.js quran-reels.ansygroup.com
npm test                                  # تأكيد الأخضر محليًا
$V -Q .vcfg deploy --prod --yes --scope ansygroups-projects
BASE=https://quran-reels.ansygroup.com node tests/run.js
# أعد إرسال الخريطة في GSC بالدومين الجديد + IndexNow مرة واحدة
```

قبل التبديل: أضِف نفس الدومين في GSC ( Verification بالـTXT نفسها ) وحدّث `SITE_ORIGIN`
في Vercel Environment Variables → ثم نفّذ الأوامر أعلاه.

## 4) قرارات موثّقة

- Domain alias القديم (`quran-reels.ansygroup.com` في ملفات سابقة) كان **DNS unset** — هذه الخطة تعيد إصلاحه بشكل صحيح.
- إبقاء `vercel.app` كـ redirect اختياري: بعد ثبات الدومين، اضبط Domains → نقل إلى الدومين الجديد.
