#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""E2E REST للمتبقّيات الحساسة على البناء النهائي (11 فحصًا).

يتحقق: منح JWT · JWKS · بدء OAuth (401/302) · تخزين reels (رفع + عام) ·
RLS ختمة · جدولة نشر · نشر بلا اتصال (502) · أتمتة (201) · قائمة الربط.
ينظّف أثره بالكامل (تخزين ثم صفوف ثم المستخدم).
"""
import json, sys, time, urllib.request, urllib.error, uuid

SITE = "https://quran-reels-tau.vercel.app"
SB = None  # يُؤخذ من app-config
ANON = None
PASS = "E2eRest!2026xT"
EMAIL = f"e2erest{int(time.time())}@checks.quranreels.dev"
OK = FAIL = 0
UID = None
TOKEN = None

def chk(name, cond, detail=""):
    global OK, FAIL
    if cond:
        OK += 1
        print(f"OK   {name}")
    else:
        FAIL += 1
        print(f"FAIL {name} :: {str(detail)[:200]}")

class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None

_NO_RED = urllib.request.build_opener(_NoRedirect)

def req(url, method="GET", data=None, headers=None, raw=False):
    h = dict(headers or {})
    body = None
    if data is not None:
        if isinstance(data, (dict, list)):
            body = json.dumps(data).encode()
            h.setdefault("Content-Type", "application/json")
        elif isinstance(data, bytes):
            body = data
        else:
            body = str(data).encode()
    r = urllib.request.Request(url, data=body, method=method, headers=h)
    try:
        with _NO_RED.open(r, timeout=30) as resp:
            b = resp.read()
            return resp.status, b, dict(resp.headers)
    except urllib.error.HTTPError as e:
        b = e.read()
        return e.code, b, dict(e.headers)
    except Exception as e:
        return 0, str(e).encode(), {}

def j(b):
    try:
        return json.loads(b)
    except Exception:
        return {}

def main():
    global SB, ANON, UID, TOKEN
    # 0) إعدادات
    code, b, _ = req(f"{SITE}/api/app-config")
    cfg = j(b)
    SB = cfg.get("supabase", {}).get("url")
    ANON = cfg.get("supabase", {}).get("anon")
    chk("app-config supabase", bool(SB and ANON), b[:120])
    if not (SB and ANON):
        return finish(None)

    # 1) إنشاء مستخدم اختبار (SQL عبر الموصل يُنفَّذ في الخطوة اللاحقة يدويًا) —
    #    هنا نفترض وجوده عبر متغيري E2E_EMAIL/E2E_PASS إن وُجدا، وإلا ننشئ
    #    через signup? لا: نستخدم user مُحقَّنًا من env.
    import os
    email = os.environ.get("E2E_EMAIL") or EMAIL
    pwd = os.environ.get("E2E_PASS") or PASS

    # 2) منح JWT
    code, b, _ = req(f"{SB}/auth/v1/token?grant_type=password",
                     "POST", {"email": email, "password": pwd},
                     {"apikey": ANON, "Content-Type": "application/json"})
    grant = j(b)
    TOKEN = grant.get("access_token")
    chk("grant password -> JWT", bool(TOKEN), f"{code} {b[:150]}")
    if not TOKEN:
        return finish(None)
    A = {"apikey": ANON, "Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"}
    sub = j(__import__("base64").urlsafe_b64decode(TOKEN.split(".")[1] + "==")).get("sub")
    UID = sub

    # 3) JWKS ES256
    code, b, _ = req(f"{SB}/auth/v1/.well-known/jwks.json")
    keys = j(b).get("keys", [])
    chk("JWKS has ES256 key", any(k.get("kty") == "EC" for k in keys), f"{code} n={len(keys)}")

    # 4) oauth: رمز خاطئ 401
    code, b, _ = req(f"{SITE}/api/oauth?op=start&p=youtube&t=INVALID")
    chk("oauth start bad token -> 401", code == 401, code)

    # 5) oauth: JWT حقيقي بلا إعداد → 302 إلى setup
    code, b, h = req(f"{SITE}/api/oauth?op=start&p=youtube&t={TOKEN}")
    loc = h.get("Location") or h.get("location") or ""
    chk("oauth start unconfigured -> 302 setup", code in (302, 301) and "setup=youtube" in loc, f"{code} {loc[:120]}")

    # 6) رفع فيديو صغير للتخزين
    fake = b"\x00\x00\x00\x18ftypmp42" + b"\x00" * 512
    path = f"reels/{UID}/e2e-final.mp4"
    code, b, _ = req(f"{SB}/storage/v1/object/{path}", "POST", fake, A)
    chk("storage upload 2xx", 200 <= code < 300, f"{code} {b[:120]}")

    # 7) قراءة عامة
    code, b, h = req(f"{SB}/storage/v1/object/public/{path}")
    chk("storage public GET 200", code == 200 and len(b) > 100, f"{code} {len(b)}")

    # 8) RLS: إدراج ختمة + قراءته
    plan_id = f"g{int(time.time())}z"
    code, b, _ = req(f"{SB}/rest/v1/khatma_plans", "POST",
                     {"plan_id": plan_id, "plan": {"days": 2, "target": 1, "members": ["اختبار"]}},
                     A)
    chk("RLS insert khatma 201", code == 201, f"{code} {b[:120]}")
    code, b, _ = req(f"{SB}/rest/v1/khatma_plans?plan_id=eq.{plan_id}", "GET", None,
                     {"apikey": ANON})
    chk("RLS select own row", code == 200 and plan_id in b.decode("utf-8", "ignore"), code)

    # 9) جدولة نشر
    future = time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime(time.time() + 3600))
    code, b, _ = req(f"{SITE}/api/publish", "POST",
                     {"platform": "youtube", "video_path": path, "title": "e2e",
                      "publish_at": future},
                     {"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"})
    d = j(b)
    chk("schedule publish -> queued", code == 200 and d.get("queued") is True, f"{code} {b[:140]}")

    # 10) نشر فوري بلا اتصال → 502 + رسالة ربط
    code, b, _ = req(f"{SITE}/api/publish", "POST",
                     {"platform": "youtube", "video_path": path, "now": True},
                     {"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"})
    d = j(b)
    chk("publish w/o connection -> 502", code == 502 and d.get("ok") is False
        and "ربط" in str(d.get("error", "")), f"{code} {b[:160]}")

    # 11) أتمتة: upsert 201
    code, b, _ = req(f"{SB}/rest/v1/autopilot?on_conflict=user_id", "POST",
                     {"user_id": UID, "enabled": True, "platforms": ["youtube"]},
                     {**A, "Prefer": "resolution=merge-duplicates,return=representation"})
    # 201 عند الإنشاء الأول · 200 عند الدمج (merge-duplicates) في التكرارات
    chk("autopilot upsert 200/201", code in (200, 201) and b'"enabled":true' in b, f"{code} {b[:120]}")

    # 12) قائمة الربط
    code, b, _ = req(f"{SITE}/api/social?op=list", "GET", None,
                     {"Authorization": f"Bearer {TOKEN}"})
    chk("social list -> connections []", code == 200 and j(b).get("connections") == [], f"{code} {b[:120]}")

    # ---- تنظيف ----
    A2 = {k: v for k, v in A.items() if k.lower() != "content-type"}
    c1, _, _ = req(f"{SB}/storage/v1/object/{path}", "DELETE", None, A2)
    print(f"cleanup storage: {c1}")
    finish(plan_id)

def finish(plan_id):
    print(f"\nRESULT: {OK} OK · {FAIL} FAIL")
    if plan_id:
        print(f"TO_CLEAN plan_id={plan_id} uid={UID}  (tُنفِّذ في خطوة التنظيف)")
    else:
        print(f"TO_CLEAN uid={UID}")
    return 0 if FAIL == 0 else 1

if __name__ == "__main__":
    sys.exit(main())
