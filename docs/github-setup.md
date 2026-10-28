# ربط GitHub (كمل#14) — خطوات جاهزة

المستودع جاهز محليًا (**16 التزامًا** بعد كمل#14) وكل نشر يتم من Vercel مباشرة — ربط GitHub يجعل:
الدفع إلى GitHub ينشر تلقائيًا (Git Integration)، وحفظًا سحابيًا احتياطيًا.

## الطريقة أ) بدون أدوات — من موقع GitHub (3 دقائق)

1. افتح `https://github.com/new` → اسم المستودع: `quran-reels` → **Private** (موصى به) → Create.
2. انفَذ في مجلد المشروع:

```bash
cd /home/user/quran-reels
git remote add origin https://github.com/<user-name>/quran-reels.git
git push -u origin main
```

3. سيسألك GitHub عن الدخول: استخدم **Personal Access Token** (لا كلمة المرور):
   `https://github.com/settings/tokens` → Generate new token (classic) → صلاحية **`repo`** فقط →
   عند الطلب: اسم المستخدم = الحساب، كلمة المرور = التوكن. (لا تنسخ التوكن إلى أي محادثة.)

## الطريقة ب) عبر CLI إن ثبّتّه

```bash
gh auth login          # حساب + توكن
gh repo create quran-reels --private --source=. --push
```

## دمج Vercel مع GitHub (نشر تلقائي)

1. `https://vercel.com/new` → Import من قائمة المستودعات (يوصى بـ **Disable automatic builds** — الرِّيلز موقع ثابت بلا خطوة بناء، أو اتركه تلقائيًا إن رغبت).
2. أو من المشروع: Settings → Git → Connect Git Repository → اختر `quran-reels`.
3. بعدها كل `git push` إلى `main` ينشر تلقائيًا، ويبقى `vercel deploy --prod` بديلًا يدويًا.

## ملاحظات

- `.gitignore` يستبعد `.env*` و`.vcfg/` و`.vercel/` و`node_modules/` — **لا ترفع أسرارًا أبدًا**.
- التزامات كمل#14: راجع `git log --oneline | head` قبل الدفع لأني ألتزم دفعة-دفعة.
