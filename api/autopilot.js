/* Account dashboard API: safe settings, private run history, and manual generation. */
const { getUserId } = require("../lib/sess");
const { q1, rest } = require("../lib/db");
const { json, configured } = require("../lib/oauth");
const { RECITERS, CONTENT_MODES, BACKGROUND_IDS, parseTemplate, generateAndPublish, renderSelfTest, recordSelfTest, publishReadyToday } = require("../lib/autopilot");

// قائمة المنصات من مصدر واحد (اسم + هل النشر مدعوم فعلًا)
const { NAMES: PLATFORM_NAMES, LIST: PLATFORM_LIST } = require("../lib/platforms");

/* أي مزوّد OAuth يخدم كل منصة (facebook/instagram يتشاركان تطبيق Meta) */
const CONNECT_PROVIDER = { youtube: "youtube", facebook: "meta", instagram: "meta", tiktok: "tiktok", x: "x" };

/* هل مفاتيح المزوّد موجودة فعلًا في هذه البيئة؟
 * يمنع «زر ربط لا يفعل شيئًا»: META_APP_ID/SECRET غير مضبوطين في Vercel،
 * فكان الضغط على «اربط فيسبوك» يعود إلى ?setup=meta بلا أي تفسير. */
function providerReady() {
  const out = {};
  for (const [key, prov] of Object.entries(CONNECT_PROVIDER)) {
    try { out[key] = configured(prov); } catch { out[key] = false; }
  }
  return out;
}
const PLATFORMS = PLATFORM_NAMES;

const DEFAULTS = {
  enabled: false,
  at_utc: "04:15:00", // 06:15 القاهرة (UTC+2)
  platforms: ["youtube"],
  template: { content_mode: "mix", reciter_mode: "rotate", background: "rotate", privacy: "public" }
};

async function readBody(req) {
  let text = "";
  for await (const part of req) {
    text += part;
    if (text.length > 20000) throw new Error("الطلب أكبر من المسموح");
  }
  try { return JSON.parse(text || "{}"); } catch { throw new Error("بيانات غير صالحة"); }
}

/* دعم توليد البوست من المقالات.
 * المصدر الأول: جدول articles في Supabase (إن وُجد).
 * احتياطي: مكتبة المقالات المضمّنة في المستودع (posts/index*.js) — لأن الجدول غير
 * معرّف في sql/schema.sql، فبدونه كان الزر يفشل دائمًا بـ«لا توجد مقالات متاحة».
 */
const ARTICLE_SOURCES = {
  index: () => require("../posts/index"),
  index_b: () => require("../posts/index_b"),
  index_c: () => require("../posts/index_c"),
  index_d: () => require("../posts/index_d"),
  index_e: () => require("../posts/index_e"),
  index_f: () => require("../posts/index_f"),
  index_g: () => require("../posts/index_g"),
  index_h: () => require("../posts/index_h"),
  index_i: () => require("../posts/index_i"),
  index_j: () => require("../posts/index_j"),
};

let repoArticlesCache = null;
function repoArticles() {
  if (repoArticlesCache) return repoArticlesCache;
  const out = [];
  const seen = new Set();
  for (const [key, load] of Object.entries(ARTICLE_SOURCES)) {
    try {
      const list = load();
      if (!Array.isArray(list)) continue;
      for (const a of list) {
        if (!a || !a.slug || !a.title || seen.has(a.slug)) continue;
        seen.add(a.slug);
        out.push({ id: a.slug, title: a.title, slug: a.slug, url: `/articles/${a.slug}/` });
      }
    } catch { /* ملف غير موجود أو تعطّل — نتخطّاه */ }
  }
  repoArticlesCache = out;
  return out;
}

const pickRandom = (list) => list[Math.floor(Math.random() * list.length)];

async function articleRandom() {
  try {
    const articles = await rest(`/rest/v1/articles?select=id,title&limit=10000`);
    if (Array.isArray(articles) && articles.length) return pickRandom(articles);
  } catch { /* الجدول غير موجود أو الخدمة معطّلة — نكمل بمقالات المستودع */ }
  const local = repoArticles();
  return local.length ? pickRandom(local) : null;
}

const RUN_COLS = "id,run_type,run_date,status,recipe_key,reciter,title,external_url,error,created_at,completed_at";
const RUN_COLS_ARTICLES = RUN_COLS + ",article_id,article_title";

/* تاريخ التشغيل: نحاول قراءة أعمدة المقالات، وإن لم تكن مضافة في القاعدة
 * (sql/migrations/20261107_autopilot_runs_articles.sql) نقرأ بدونها بدل أن تفشل
 * اللوحة بالكامل برسالة «column does not exist». */
async function loadRuns(uid) {
  const base = `/rest/v1/autopilot_runs?user_id=eq.${encodeURIComponent(uid)}`;
  const order = "&order=created_at.desc&limit=12";
  try {
    const rows = await rest(`${base}&select=${RUN_COLS_ARTICLES}${order}`);
    return { rows: Array.isArray(rows) ? rows : [], articlesColumns: true };
  } catch {
    try {
      const rows = await rest(`${base}&select=${RUN_COLS}${order}`);
      return { rows: Array.isArray(rows) ? rows : [], articlesColumns: false };
    } catch {
      return { rows: [], articlesColumns: false };
    }
  }
}

/* آخر نتيجة فحص محفوظة (system_checks) — اللوحة تعرضها بلا أن يضغط المستخدم شيئًا */
async function lastSelfTest(uid) {
  if (!uid) return null;
  try {
    // system_checks جدول مشترك بمفتاح خدمة: لا نعرض تفاصيل حساب آخر.
    const rows = await rest(`/rest/v1/system_checks?detail->>user_id=eq.${encodeURIComponent(uid)}&kind=in.(render_selftest,render_selftest_deep)&select=kind,ok,detail,created_at&order=created_at.desc&limit=1`);
    const row = Array.isArray(rows) ? rows[0] : null;
    return row?.detail?.user_id === uid && ["render_selftest", "render_selftest_deep"].includes(row.kind) ? row : null;
  } catch { return null; /* لا نُسقط اللوحة عند تعذّر القراءة */ }
}

/* آخر تشغيل آلي (يومي/تعويض) — يُعرض في اللوحة بلا فتح قاعدة البيانات.
 * «فشل صامت» كان يعني أن المستخدم لا يعرف إلا إذا فتح Supabase. */
async function lastDaily(uid) {
  try {
    const rows = await rest(`/rest/v1/autopilot_runs?user_id=eq.${encodeURIComponent(uid)}&run_type=eq.daily&select=run_date,status,error,external_url,completed_at,created_at&order=created_at.desc&limit=1`);
    return Array.isArray(rows) && rows[0] ? rows[0] : null;
  } catch { return null; }
}

/* إحصاءات بطاقة الحالة: «كم فيديو نُشر؟ وآخر واحد إمتى؟» — كانت اللوحة
 * تَعدّ التشغيلات فقط، فلا يعرف المستخدم حصيلة الأتمتة. */
async function accountStats(uid) {
  const out = { published: 0, failed: 0, scheduled: 0, last_url: null, last_published_at: null };
  try {
    const rows = await rest(`/rest/v1/publish_queue?user_id=eq.${encodeURIComponent(uid)}&select=status,external_url,updated_at&order=updated_at.desc&limit=200`);
    for (const r of Array.isArray(rows) ? rows : []) {
      const st = String((r && r.status) || "");
      if (st === "published") {
        out.published++;
        if (!out.last_published_at) { out.last_published_at = r.updated_at || null; out.last_url = r.external_url || null; }
      } else if (st === "failed") out.failed++;
      else if (st === "scheduled" || st === "publishing") out.scheduled++;
    }
  } catch { /* لا نُسقط اللوحة بسبب الإحصاء */ }
  return out;
}

async function accountData(uid) {
  const config = await q1(`select * from autopilot where user_id=$1 limit 1`, [uid]);
  const { rows: runs } = await loadRuns(uid);
  // دعم تعدد القنوات
  const connections = await rest(`/rest/v1/social_connections?user_id=eq.${encodeURIComponent(uid)}&select=id,platform,account_name,updated_at`);
  const connectedPlatforms = Array.isArray(connections) ? connections.map(c => c.platform) : [];
  const channelNames = Array.isArray(connections) ? connections.map(c => `${PLATFORMS[c.platform] || c.platform} · ${c.account_name}`).join(" | ") : "";

  const ready = providerReady();

  return {
    config: config ? { ...config, template: parseTemplate(config.template), all_channels: config.all_channels === true } : DEFAULTS,
    runs: Array.isArray(runs) ? runs : [],
    connected: connectedPlatforms.length > 0,
    platforms: connectedPlatforms,
    channel: channelNames || "لا توجد قنوات مرتبطة",
    reciters: RECITERS,
    /* كل منصة مع: هل النشر مدعوم (publish) · أي مزوّد ربط (connect) ·
     * وهل مفاتيحه مضبوطة الآن (ready) — الواجهة لا تَعِد بما لا يعمل */
    available: PLATFORM_LIST.map(p => ({
      ...p,
      connect: CONNECT_PROVIDER[p.key] || null,
      ready: CONNECT_PROVIDER[p.key] ? Boolean(ready[p.key]) : false,
    })),
    // العدد الحقيقي المتاح لمقال عشوائي (الواجهة كانت تَعِد بـ10,000)
    articles: { count: repoArticles().length },
    // نتيجة آخر فحص توليد محفوظة (null إن لم يُجرَ فحص بعد)
    last_check: await lastSelfTest(uid),
    // آخر تشغيل آلي: يومه وحالته وسببه ورابطه (null إن لم يجرِ بعد)
    last_daily: await lastDaily(uid),
    // منصات ربطها انتهى (invalid_grant) — اللوحة تعرض تنبيهًا صريحًا
    reauth: await reauthPlatforms(uid, connections),
    // حصيلة الأتمتة (منشور/فاشل/مجدول + آخر رابط) لبطاقة الحالة
    stats: await accountStats(uid),
    // تفضيلات قابلة للتحرير: الأنماط والخلفيات والقُرّاء المتاحون
    options: {
      content_modes: [...CONTENT_MODES],
      backgrounds: [...BACKGROUND_IDS],
      reciters: RECITERS.map((r) => ({ id: r.id, name: r.name })),
    },
  };
}

/* منصات تحتاج إعادة ربط. المصدران: صفوف system_checks(kind='reauth_needed')
 * التي يكتبها lib/publish عند فشل تجديد دائم، وآخر أخطاء النشر (invalid_grant)
 * — الثاني يغطي ما وقع قبل وجود العلامة. (social_connections.meta مشفّر،
 * فلا يصلح لعلامة تُقرأ — درس 2026-11-12.) */
const REAUTH_RE = /invalid_grant|invalid_client|unauthorized_client|expired or revoked/i;
async function reauthPlatforms(uid, connections = []) {
  const out = new Set();
  // لا نقرأ علامة حساب آخر: الربط الوحيد بين الفحص وصاحبه هو connection_id.
  // تحديث القناة بعد فشل قديم يعني أن المستخدم أعاد الربط أو نجح التجديد.
  for (const conn of Array.isArray(connections) ? connections : []) {
    if (!conn?.id || !conn.platform) continue;
    try {
      const checks = await rest(`/rest/v1/system_checks?kind=eq.reauth_needed&detail->>connection_id=eq.${encodeURIComponent(conn.id)}&select=detail,created_at&order=created_at.desc&limit=1`);
      const c = Array.isArray(checks) ? checks[0] : null;
      if (c && c.detail?.connection_id === conn.id && c.detail?.platform === conn.platform &&
          (!conn.updated_at || Date.parse(c.created_at) >= Date.parse(conn.updated_at))) out.add(conn.platform);
    } catch { /* تظهر أخطاء النشر الخاصة بالمستخدم أدناه */ }
  }
  try {
    const rows = await rest(`/rest/v1/publish_queue?user_id=eq.${encodeURIComponent(uid)}&status=eq.failed&select=platform,connection_id,error,updated_at&order=updated_at.desc&limit=20`);
    for (const r of Array.isArray(rows) ? rows : []) {
      if (!r?.platform || !REAUTH_RE.test(String(r.error || ""))) continue;
      const linked = (Array.isArray(connections) ? connections : []).filter(c => c.platform === r.platform && (!r.connection_id || c.id === r.connection_id));
      // أخطاء الصفوف القديمة لا تتغلب على إعادة الربط الناجحة.
      if (linked.some(c => !c.updated_at || !r.updated_at || Date.parse(r.updated_at) >= Date.parse(c.updated_at))) out.add(r.platform);
    }
  } catch { /* لا نُسقط اللوحة */ }
  return [...out];
}

const handler = async (req, res) => {
  let uid = null;
  try {
    uid = await getUserId(req);
  } catch { /* أي خطأ في التحقق من الجلسة = غير مسجّل، لا 500 خام من Vercel */ }
  if (!uid) return json(res, 401, { error: "سجّل الدخول أولًا" });
  try {
    if (req.method === "GET") return json(res, 200, await accountData(uid));
    if (req.method !== "POST") return json(res, 405, { error: "method" });
    const body = await readBody(req);

    if (body.action === "save") {
      const templateInput = body.template && typeof body.template === "object" ? body.template : {};
      const content_mode = CONTENT_MODES.has(templateInput.content_mode) ? templateInput.content_mode : "mix";
      const background = BACKGROUND_IDS.has(templateInput.background) ? templateInput.background : "rotate";
      const enabled = body.enabled === true;
      
      // دعم تعدد القنوات
      const platforms = Array.isArray(body.platforms) && body.platforms.length > 0 ? body.platforms : ["youtube"];
      
      if (enabled) {
        /* نفس عطل الاقتباس المفرد في in.(…) — كان يرفض التفعيل بـ409 رغم
         * أن القناة مربوطة. نقارن في JavaScript. */
        const connectedRows = await rest(`/rest/v1/social_connections?user_id=eq.${encodeURIComponent(uid)}&select=platform`);
        const connectedKeys = Array.isArray(connectedRows) ? connectedRows.map(r => r.platform) : [];
        if (!platforms.some(p => connectedKeys.includes(p))) return json(res, 409, { error: "اربط قناة واحدة على الأقل قبل تفعيل النشر الآلي" });
      }
      
      /* اختيار القارئ: كان مثبتًا على rotate فلا يمكن تخصيص الصوت إطلاقًا */
      const reciterId = String(templateInput.reciter || "");
      const wantFixed = templateInput.reciter_mode === "fixed" && RECITERS.some((r) => r.id === reciterId);
      const template = {
        content_mode,
        reciter_mode: wantFixed ? "fixed" : "rotate",
        reciter: wantFixed ? reciterId : "",
        background,
        privacy: "public",
      };
      /* all_channels: انشر على كل القنوات المرتبطة (افتراضي: القناة الافتراضية فقط) */
      const all_channels = body.all_channels === true;
      const saved = await rest("/rest/v1/autopilot?on_conflict=user_id", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=representation" },
        body: JSON.stringify({ user_id: uid, enabled, at_utc: "04:15:00", platforms, template, all_channels, updated_at: new Date().toISOString() }),
      });
      const config = Array.isArray(saved) ? saved[0] : saved;
      return json(res, 200, { ok: true, config: { ...config, template: parseTemplate(config?.template) } });
    }

    if (body.action === "run") {
      const active = await rest(`/rest/v1/autopilot_runs?user_id=eq.${encodeURIComponent(uid)}&status=eq.rendering&select=id&limit=1`);
      if (Array.isArray(active) && active.length) return json(res, 409, { error: "هناك فيديو قيد الإنشاء بالفعل" });
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const recent = await rest(`/rest/v1/autopilot_runs?user_id=eq.${encodeURIComponent(uid)}&run_type=eq.manual&created_at=gte.${encodeURIComponent(since)}&select=id&limit=3`);
      if (Array.isArray(recent) && recent.length >= 3) return json(res, 429, { error: "وصلت إلى الحد اليومي للإنشاء اليدوي؛ اترك للنشر الآلي موعده اليومي" });
      
      const config = await q1(`select * from autopilot where user_id=$1 limit 1`, [uid]);
      const result = await generateAndPublish(uid, { runType: "manual", config: config || DEFAULTS });
      return json(res, result.ok ? 200 : 502, result);
    }

    // دعم التوازي (run_all)
    if (body.action === "run_all") {
      const active = await rest(`/rest/v1/autopilot_runs?user_id=eq.${encodeURIComponent(uid)}&status=eq.rendering&select=id&limit=1`);
      if (Array.isArray(active) && active.length) return json(res, 409, { error: "هناك فيديو قيد الإنشاء بالفعل" });
      
      const config = await q1(`select * from autopilot where user_id=$1 limit 1`, [uid]);
      /* لا نُشغّل إلا ما يمكن نشره فعلًا: قناة مرتبطة + منصة يدعمها lib/publish.
       * كان التشغيل يمرّر كل منصات الإعداد، فتُنشأ مهام لِما لا ربط له وتفشل
       * بـ«لا يوجد ربط لهذه المنصة» (16 صفًا فاشلًا في publish_queue). */
      const connected = await rest(`/rest/v1/social_connections?user_id=eq.${encodeURIComponent(uid)}&select=platform`);
      const connectedPlatforms = Array.isArray(connected) ? [...new Set(connected.map(c => c.platform))] : [];
      const requested = (config?.platforms || DEFAULTS.platforms).filter(p => PLATFORMS[p]);
      const platforms = requested.filter(p => connectedPlatforms.includes(p));
      if (connectedPlatforms.length === 0) return json(res, 409, { error: "اربط قناة واحدة على الأقل قبل تشغيل التوازي" });
      if (platforms.length === 0) {
        return json(res, 409, { error: `المنصات المختارة غير مرتبطة (${requested.join(", ")}) — اربطها أولًا أو اختر منصة مرتبطة` });
      }
      
      // تشغيل التوازي (Promise.all)
      const results = await Promise.all(platforms.map(platform => 
        generateAndPublish(uid, { runType: "manual", config: { ...config, platforms: [platform] } })
      ));
      
      const ok = results.every(r => r.ok);
      return json(res, ok ? 200 : 502, { ok, results });
    }

    // دعم توليد البوست من المقالات
    if (body.action === "article_random") {
      const article = await articleRandom(uid);
      if (!article) return json(res, 404, { error: "لا توجد مقالات متاحة" });
      
      const config = await q1(`select * from autopilot where user_id=$1 limit 1`, [uid]);
      const result = await generateAndPublish(uid, { runType: "manual", config: config || DEFAULTS, article });
      return json(res, result.ok ? 200 : 502, { ...result, article_id: article.id, article_title: article.title });
    }

    /* فحص محرّك التوليد: هل يستطيع الخادم إطلاق المتصفح وفتح الصانع؟
     * (لا يُنشئ فيديو ولا ينشر) — يجيب عن «هل النشر الآلي يعمل الآن؟» */
    if (body.action === "selftest_render") {
      /* deep=true يُنتج فيديو قصيرًا فعليًا (بلا رفع أو نشر) — إثبات أن التسجيل يعمل */
      const report = await renderSelfTest({ deep: body.deep === true });
      /* نحفظ النتيجة حتى تُقرأ لاحقًا من قاعدة البيانات بدل لقطة شاشة */
      const recorded = await recordSelfTest(report, uid);
      return json(res, report.ok ? 200 : 502, { ...report, recorded });
    }

    if (body.action === "retry_publish") {
      /* نشر الفيديو الجاهز فورًا بعد إعادة ربط القناة — بلا توليد جديد */
      const out = await publishReadyToday(uid);
      return json(res, out.ok ? 200 : 502, out);
    }

    return json(res, 400, { error: "إجراء غير معروف" });
  } catch (error) {
    return json(res, 500, { error: String(error?.message || error).slice(0, 300) });
  }
};

module.exports = handler;
/* للاختبارات فقط — Vercel لا يستخدم هذه الخصائص */
module.exports.__test = { accountData, loadRuns, articleRandom, repoArticles, PLATFORM_LIST, renderSelfTest, providerReady, CONNECT_PROVIDER, lastSelfTest, lastDaily };
