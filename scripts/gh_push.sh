#!/usr/bin/env bash
# دفع المستودع إلى GitHub بأمان (كمل#16) — لا يطبع التوكن أبدًا.
#   التوكن: .vcfg/gh_token   (متجاهل للـgit، لا يظهر في الالتزامات أبدًا)
#   الـslug: .vcfg/gh_repo    (مثل Ansygroup/quran-reels)
# الاستخدام: scripts/gh_push.sh        (يدفع ما تمّ التزامه)
# ملاحظة: .git/config يُمسح مع كل رسالة بيئة — الأداة تعيد إضافة الـremote تلقائيًا.
set -euo pipefail
cd "$(dirname "$0")/.."

TOK=$(cat .vcfg/gh_token 2>/dev/null || true)
[ -n "$TOK" ] || { echo "✗ لا يوجد توكن — ضع GitHub PAT في .vcfg/gh_token"; exit 1; }
SLUG=$(cat .vcfg/gh_repo 2>/dev/null || true)
[ -n "$SLUG" ] || SLUG="Ansygroup/quran-reels"

B=$(git branch --show-current || true)
if [ "$B" = "master" ]; then git branch -m main; fi
[ "$(git branch --show-current)" = "main" ] || { echo "✗ الفرع الحالي غير main: $(git branch --show-current)"; exit 1; }

if ! git remote get-url origin >/dev/null 2>&1; then
  git remote add origin "https://github.com/${SLUG}.git"
fi

AUTH=$(printf 'x-access-token:%s' "$TOK" | base64 | tr -d '\n')
git -c http.extraheader="AUTHORIZATION: basic $AUTH" push origin HEAD:main
echo "✓ دُفع إلى https://github.com/${SLUG}"
