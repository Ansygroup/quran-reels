# SMTP / البريد (كمل#14)

**الكود منجَز**: `lib/mailer.js` (Resend HTTP — بلا اعتماديات) + استدعاءه من `api/contact.js`:

- عند وصول رسالة تواصل → **تأكيد للمراسل** + **نسخة للمسؤول** (إن ضبط `ADMIN_EMAIL`).
- بلا مفتاح: no-op صامت — كل شيء يعمل كما قبل (لا اختبار ينكسر).

## التفعيل (3 دقائق)

1. حساب على `https://resend.com` → **API Keys** → Create (أو أي مزوّد SMTP آخر — أخبرني لأعدّ `lib/mailer.js` عليه مثل Brevo/Mailgun).
2. في Vercel → Environment Variables أضِف:

| المتغير | مطلوب | مثال |
|---|---|---|
| `RESEND_API_KEY` | نعم | `re_…` |
| `MAIL_FROM` | اختياري | `قرآن ريلز <no-reply@yourdomain.com>` |
| `ADMIN_EMAIL` | اختياري | بريدك لنسخ كل رسالة تواصل |

3. Redeploy — فوري.

## ملاحظات

- وضع الاختبار في Resend (`onboarding@resend.dev`) يرسل لبريد **حساب Resend** فقط —
  لاستقباله على بريدك الحقيقي فعّل نطاقك (DNS: SPF/DKIM يعطيه Resend).
- **رسائل التسجيل/الدخول** ليست هنا: Supabase Auth يرسلها بإعداد SMTP الخاص به
  (Supabase Dashboard → Authentication → SMTP Settings — إعداد جانبي بحسابك).
- لا يُخزَّن أي مفتاح في المستودع (`.env*` في `.gitignore`).
