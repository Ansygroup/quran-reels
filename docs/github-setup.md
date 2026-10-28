# ربط GitHub (كمل#14) — خطوات جاهزة

## ✅ الحالة الفعلية (كمل#16): المستودع مرفوع ومتزامن

- **https://github.com/Ansygroup/quran-reels** — عام (Public) · فرع `main` متزامن مع كل الالتزامات.
- التوكن مخزَّن في `.vcfg/gh_token` (متجاهل للـgit، 600) والـslug في `.vcfg/gh_repo`.
- **الدفع المستقبلي بأمر واحد**: `scripts/gh_push.sh`
  (تعيد إضافة `origin` تلقائيًا لأن `.git/config` يُمسح مع كل رسالة بيئة).
- ⚠️ عند إلغاء/تدوير التوكن: أنشئ توكنًا جديدًا (repo scope) واحفظه مكان القديم في `.vcfg/gh_token`.

المستودع جاهز محليًا وكل نشر يتم من Vercel مباشرة — ربط GitHub يجعل:
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
