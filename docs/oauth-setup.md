# إعداد بيانات OAuth للمنصات (كمل#14)

الكود جاهز بالكامل (بدء ⇠ استقبال ⇠ حفظ توكن مُشفَّر ⇠ نشر) — ينقصه **بيانات التطبيقات
من حساباتك**. أضِفها في Vercel → Settings → Environment Variables ثم أعد النشر.

> الـredirect_uri المسجَّل عند كل مزوّد = **`https://quran-reels-tau.vercel.app/api/oauth/callback`**
> (مسار واحد يستقبل المنصات الأربع ويفرّقها عبر `state` — أُصلح في كمل#14).

## YouTube / Google (أولوية)

1. `https://console.cloud.google.com` → مشروع جديد → **OAuth consent screen** (External) → أضف نطاقك كـTest user.
2. **Credentials → Create → OAuth client ID → Web application**:
   - Authorized redirect URI: `https://quran-reels-tau.vercel.app/api/oauth/callback`
3. ضع في Vercel:
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`

## Meta (فيسبوك/إنستغرام)

1. `https://developers.facebook.com` → My Apps → إضافة تطبيق (أي نوع يدعم Pages) → إنتاجية/اختبار.
2. Facebook Login → Settings → Valid OAuth Redirect URIs: `https://quran-reels-tau.vercel.app/api/oauth/callback`
3. `META_APP_ID` + `META_APP_SECRET` في Vercel.

## TikTok

1. `https://developers.tiktok.com` → Manage apps → Create app → هدف **Direct Post**.
2. Redirect URI: نفس المسار أعلاه.
3. `TIKTOK_CLIENT_KEY` + `TIKTOK_CLIENT_SECRET`.

## X (تويتر)

1. `https://developer.x.com` → Free plan → App → User authentication settings → Type of App: **Web App**.
2. Callback URI: نفس المسار أعلاه.
3. `X_CLIENT_ID` + `X_CLIENT_SECRET`.

## التحقّق بعد الإضافة

```bash
# من صفحة الحساب: زر «ربط» يعيد من Google بسلامة ⇠ حفظ توكن ⇠ يظهر «موصول ✓»
BASE=https://quran-reels-tau.vercel.app node tests/run.js   # أخضر كما كان
```

- الربط يتطلب **تسجيل دخول المستخدم أولًا** (حماية: يرفض الضيف بـ401 — مُختبَر في run.js S9).
- كل المنصات اختيارية: الموقع يعمل كاملًا دونها (النشر الآلي فقط هو الذي ينتظرها).
