#!/usr/bin/env bash
# ============================================================
# تطبيق إصلاح حدّ دوال Vercel على فرع main
# ------------------------------------------------------------
# السبب: main وفرع arena هذا لهما تاريخ غير مشترك (root مختلف لكل منهما)،
# فلا يمكن عمل merge عادي بينهما. هذا السكربت يطبّق الإصلاح الأصلي فقط.
#
# الاستخدام (من جذر المستودع، على نسخة من main):
#   bash deliverables/deploy-fix/apply-on-main.sh
#   ثم: git push origin main   (أو افتح PR)
# ============================================================
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
cd "$REPO"

echo "== 1) حذف api/app-config.js (مكرر لوظيفة /api/ip?mode=config ويعيد العدّاد فوق الحد)"
if [ -f api/app-config.js ]; then
  git rm -q api/app-config.js
  echo "   حُذف ✓"
else
  echo "   غير موجود أصلًا ✓"
fi

echo "== 2) تطبيق رقعة الإصلاح الأساسية"
git apply --3way "$HERE/vercel-function-limit-CORE.patch"
echo "   طُبّقت ✓"

echo "== 3) فحص عدد الدوال (يجب أن يكون ≤ 12)"
node tests/functions_limit.js

echo ""
echo "تم. الخطوات التالية:"
echo "  • العميل على main ما زال يستدعي الروابط القديمة (/api/oauth, /api/social, /api/publish, /api/contact)"
echo "    وهي تعمل عبر rewrites — التحديث إلى /api/gw اختياري (انظر APPLY-ON-MAIN.md)."
echo "  • راجع: git status && git diff --cached --stat"
echo "  • ارفع: git commit -m 'fix(deploy): keep Vercel Hobby function count under 12' && git push"
