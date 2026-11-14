/* محرّك النشر: تجديد التوكن + رفع الفيديو لكل منصة */
const { open, seal } = require("./crypt");
const { readRefreshToken } = require("./refresh_token");
const { q1, q } = require("./db");
const { encodeVideoPath, normalizeUserVideoPath } = require("./video_path");

const SB = () => process.env.SUPABASE_URL;
const videoUrl = p => `${SB()}/storage/v1/object/public/reels/${encodeVideoPath(p)}`;
// Opaque provider identifiers are used as URL components. Reject malformed
// responses rather than presenting an object, whitespace or injected path as success.
const validProviderId = id => typeof id === "string" && /^[A-Za-z0-9_-]{1,256}$/.test(id);
// A 2xx response can still contain both data and an error (including partial
// errors). Treat that as ambiguous, not evidence of a successful operation.
const cleanProviderBody = body => body && typeof body === "object" && !Array.isArray(body) &&
  body.error == null && (body.errors == null || (Array.isArray(body.errors) && body.errors.length === 0));
const invalidProviderReply = stage => new Error(`تعذّر التحقق من رد ${stage} — راجع المنصة قبل أي إعادة نشر`);

// Session URLs can contain bearer-like secrets. Only send video bytes to hosts
// shown in provider examples, never to userinfo, fragments, custom ports or redirects.
function validUploadSessionUrl(raw, host, path) {
  if (typeof raw !== "string" || !raw || raw.includes("#") || /[\u0000-\u0020\u007f]/.test(raw)) return false;
  try {
    const u = new URL(raw);
    return u.protocol === "https:" && u.hostname === host && !u.port && !u.username && !u.password && !u.hash && (!path || u.pathname === path);
  } catch { return false; }
}

// A storage error page or HTTP partial response is not a video upload. Read a
// nonempty 200 response before creating a provider upload session; this alone
// does not validate that the bytes are a playable or complete video.
async function readVideoBytes(url) {
  const message = "تعذّر قراءة ملف الفيديو من التخزين — راجع المهمة قبل إعادة النشر";
  try {
    // Do not silently read bytes from an unexpected redirect destination.
    // Some legitimate storage setups may redirect and must be reviewed first.
    const response = await fetch(url, { redirect: "error" });
    if (!response.ok || response.status !== 200) throw new Error(message);
    const bytes = await response.arrayBuffer();
    if (!(bytes instanceof ArrayBuffer) || bytes.byteLength === 0) throw new Error(message);
    return Buffer.from(bytes);
  } catch { throw new Error(message); }
}

/* أخطاء تعني «الربط نفسه انتهى» ولا يُصلحها أي إعادة محاولة */
const REAUTH_PATTERNS = /invalid_grant|invalid_client|unauthorized_client|expired or revoked|Token has been expired/i;
function isReauthError(error, description = "") {
  return REAUTH_PATTERNS.test(`${error || ""} ${description || ""}`);
}

/* علامة «يحتاج إعادة ربط» في system_checks (kind='reauth_needed').
 * الدرس (2026-11-12): عمود social_connections.meta نصّ **مشفّر** (seal)، فأي
 * محاولة للدمج فيه بـ jsonb تفشل بصمت ولا يرى المستخدم شيئًا. الجدول المخصّص
 * للفحوص هو المكان الصحيح — وهو jsonb فعلًا. */
async function markReauth(conn, reason, description = "") {
  const id = conn && typeof conn === "object" ? conn.id : null;
  const platform = conn && typeof conn === "object" ? conn.platform : "";
  await q(
    `insert into system_checks (kind, ok, detail) values ('reauth_needed', false, $1::jsonb)`,
    [JSON.stringify({
      platform: String(platform || "").slice(0, 20),
      connection_id: String(id || "").slice(0, 40),
      reason: String(reason || "").slice(0, 80),
      detail: String(description || "").slice(0, 200),
      at: new Date().toISOString(),
    })]
  );
  return true;
}

async function refreshIfNeeded(conn) {
  const now = Date.now();
  if (conn.expires_at && Number(conn.expires_at) - now > 120000) return conn;
  const tok = { ...conn };
  let body = null, url = null;
  const refreshToken = ["youtube", "x", "tiktok"].includes(conn.platform) ? readRefreshToken(conn.refresh_token) : null;
  if (["youtube", "x", "tiktok"].includes(conn.platform) && !refreshToken) throw new Error("لا يوجد تصريح تجديد صالح — أعد ربط القناة");
  if (conn.platform === "youtube") {
    url = "https://oauth2.googleapis.com/token";
    body = new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID, client_secret: process.env.GOOGLE_CLIENT_SECRET, refresh_token: refreshToken, grant_type: "refresh_token" });
  } else if (conn.platform === "x") {
    url = "https://api.x.com/2/oauth2/token";
    body = new URLSearchParams({ client_id: process.env.X_CLIENT_ID, client_secret: process.env.X_CLIENT_SECRET, refresh_token: refreshToken, grant_type: "refresh_token" });
  } else if (conn.platform === "tiktok") {
    url = "https://open.tiktokapis.com/oauth/token/";
    body = new URLSearchParams({ client_key: process.env.TIKTOK_CLIENT_KEY, client_secret: process.env.TIKTOK_CLIENT_SECRET, refresh_token: refreshToken, grant_type: "refresh_token", grant_scope: "video.publish" });
  } else {
    return conn; // meta: توكن طويل الأمد — لا تجديد تلقائي v1
  }
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) {
    const reason = String(j.error || r.status);
    if (isReauthError(reason, j.error_description)) {
      /* invalid_grant = الربط نفسه انتهى (جوجل تُبطل توكنات وضع Testing بعد ٧ أيام).
       * نضع علامة على القناة ليراها المستخدم في اللوحة، ونقول له ماذا يفعل — بدل
       * «تجديد التوكن فشل» التي لا تعني شيئًا لمن لا يعرف OAuth. */
      await markReauth(conn, reason, j.error_description).catch(() => {});
      throw new Error(`انتهت صلاحية ربط ${conn.platform === "youtube" ? "يوتيوب" : conn.platform} — أعد الربط وراجع حالة الفيديو قبل أي إعادة نشر (${reason})`);
    }
    throw new Error(`تجديد التوكن فشل (${conn.platform}): ${reason}`);
  }
  // المستهلكون يفكون التشفير من كائن الاتصال؛ لا نعيد توكنًا خامًا بعد التجديد.
  tok.access_token = seal(j.access_token);
  tok.refresh_token = j.refresh_token ? seal(j.refresh_token) : conn.refresh_token;
  tok.expires_at = Date.now() + (j.expires_in || 3600) * 1000;
  await q(`update social_connections set access_token=$1, refresh_token=$2, expires_at=$3, updated_at=now() where id=$4`,
    [tok.access_token, tok.refresh_token, tok.expires_at, conn.id]);
  return tok;
}

async function uploadYouTube(conn, vUrl, meta, videoName = "") {
  const c = await refreshIfNeeded(conn);
  const mediaType = /\.webm$/i.test(String(videoName || "")) ? "video/webm" : "video/mp4";
  const at = open(c.access_token);
  const buf = await readVideoBytes(vUrl);
  const start = await fetch("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${at}`, "Content-Type": "application/json",
      "X-Upload-Content-Length": String(buf.length), "X-Upload-Content-Type": mediaType,
    },
    body: JSON.stringify({
      snippet: {
        title: (meta.title || "ريلز قرآن").slice(0, 100),
        description: [meta.caption, meta.hashtags].filter(Boolean).join("\n\n").slice(0, 4800),
        tags: (meta.hashtags || "").split(/[\s,]+/).filter(t => t.startsWith("#") ? (t = t.slice(1), t.length) : t.length).map(t => t.replace(/^#/, "")).slice(0, 25),
        defaultLanguage: "ar", defaultAudioLanguage: "ar",
      },
      status: { privacyStatus: "public", selfDeclaredMadeForKids: false },
    }),
  });
  if (!start.ok) throw new Error(`جوجل رفض بدء الرفع: ${await start.text().then(t => t.slice(0, 180))}`);
  const loc = start.headers.get("location");
  if (!validUploadSessionUrl(loc, "www.googleapis.com", "/upload/youtube/v3/videos")) throw invalidProviderReply("يوتيوب عند بدء الرفع");
  let vr;
  try { vr = await fetch(loc, { method: "PUT", redirect: "error", headers: { "Content-Type": mediaType }, body: buf }); }
  catch { throw invalidProviderReply("يوتيوب أثناء رفع الفيديو"); }
  const j = await vr.json().catch(() => ({}));
  if (!vr.ok) throw new Error(`جوجل رفض الرفع: ${JSON.stringify(j).slice(0, 180)}`);
  if (!cleanProviderBody(j) || !validProviderId(j?.id)) throw invalidProviderReply("يوتيوب بعد الرفع");
  return { external_id: j.id, external_url: `https://www.youtube.com/shorts/${j.id}` };
}

async function pickPage(c) {
  const meta = JSON.parse(open(c.meta || "{}") || "{}");
  const pages = meta.pages || [];
  if (!pages.length) throw new Error("لا توجد صفحة فيسبوك مرتبطة — أعد الربط واسمح بالصفحات");
  return pages.find(p => p.access_token) || pages[0];
}

async function uploadFacebook(conn, vUrl, meta) {
  const c = await refreshIfNeeded(conn);
  const page = await pickPage(c);
  const r = await fetch(`https://graph.facebook.com/v21.0/${page.id}/videos?source=${encodeURIComponent(vUrl)}&title=${encodeURIComponent((meta.title || "ريلز قرآن").slice(0, 200))}&description=${encodeURIComponent([meta.caption, meta.hashtags].filter(Boolean).join("\n").slice(0))}`, {
    headers: { Authorization: `Bearer ${page.access_token || open(c.access_token)}` },
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`فيسبوك: ${j?.error?.message || r.status}`);
  if (!cleanProviderBody(j) || !validProviderId(j?.id)) throw invalidProviderReply("فيسبوك بعد محاولة النشر");
  return { external_id: j.id, external_url: `https://www.facebook.com/video.php?v=${j.id}` };
}

async function uploadInstagram(conn, vUrl, meta) {
  const c = await refreshIfNeeded(conn);
  const m = JSON.parse(open(c.meta || "{}") || "{}");
  const ig = m.ig_id || m.instagram_business_account;
  if (!ig) throw "لا يوجد حساب إنستغرام أعمال مرتبط (Business) — اربط حسابًا تجاريًا";
  const at = open(c.access_token);
  const cap = [meta.caption, meta.hashtags].filter(Boolean).join("\n").slice(0, 2100);
  const r1 = await fetch(`https://graph.facebook.com/v21.0/${ig}/media?media_type=REELS&video_url=${encodeURIComponent(vUrl)}&caption=${encodeURIComponent(cap)}&share_to_feed=true`, { headers: { Authorization: `Bearer ${at}` } });
  const j1 = await r1.json().catch(() => ({}));
  if (!r1.ok) throw new Error(`إنستغرام: ${j1?.error?.message || r1.status}`);
  if (!cleanProviderBody(j1) || !validProviderId(j1?.id)) throw invalidProviderReply("إنستغرام بعد تجهيز الفيديو");
  for (let i = 0; i < 8; i++) {
    await new Promise(s => setTimeout(s, 4000));
    let statusResponse, s;
    try {
      statusResponse = await fetch(`https://graph.facebook.com/v21.0/${j1.id}?fields=status_code`, { headers: { Authorization: `Bearer ${at}` } });
      s = await statusResponse.json();
    } catch { throw invalidProviderReply("إنستغرام عند التحقق من معالجة الفيديو"); }
    // Do not publish based on an error response, partial body, or an unknown
    // status: creating a container is not evidence that it is ready to publish.
    if (!statusResponse.ok || !cleanProviderBody(s)) {
      throw invalidProviderReply("إنستغرام عند التحقق من معالجة الفيديو");
    }
    if (s.status_code === "FINISHED") {
      const r2 = await fetch(`https://graph.facebook.com/v21.0/${ig}/media_publish?creation_id=${j1.id}`, { method: "POST", headers: { Authorization: `Bearer ${at}` } });
      const j2 = await r2.json().catch(() => ({}));
      if (!r2.ok) throw new Error(`إنستغرام نشر: ${j2?.error?.message || r2.status}`);
      if (!cleanProviderBody(j2) || !validProviderId(j2?.id)) throw invalidProviderReply("إنستغرام بعد محاولة النشر");
      return { external_id: j2.id, external_url: "https://www.instagram.com/reels/" };
    }
    if (s.status_code === "ERROR") throw new Error("إنستغرام: فشل معالجة الفيديو — راجع المنصة قبل أي إعادة نشر");
    if (s.status_code !== "IN_PROGRESS") throw invalidProviderReply("إنستغرام عند التحقق من معالجة الفيديو");
  }
  throw new Error("إنستغرام: انتهت مهلة معالجة الفيديو — راجع المنصة قبل أي إعادة نشر");
}

async function uploadTikTok(conn, vUrl, meta) {
  const c = await refreshIfNeeded(conn);
  const at = open(c.access_token);
  const buf = await readVideoBytes(vUrl);
  const uncertain = "تعذّر تأكيد بدء رفع تيك توك — راجع المنصة قبل أي إعادة نشر";
  let init;
  try {
    init = await fetch("https://open.tiktokapis.com/v2/post/publish/video/init/", {
      method: "POST",
      headers: { Authorization: `Bearer ${at}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        post_info: {
          title: [meta.title, meta.hashtags].filter(Boolean).join(" ").slice(0, 150),
          privacy_level: "SELF_ONLY_DISABLE",
          disable_duet: false, disable_comment: false, disable_stitch: false,
        },
        source_info: { video_size: buf.length, chunk_size: buf.length, total_chunk_count: 1 },
      }),
    });
  } catch { throw new Error(uncertain); }
  const ij = await init.json().catch(() => null);
  const data = ij?.data;
  // TikTok's success response contains error.code="ok". A 2xx response with
  // a missing or contradictory code is not permission to send video bytes.
  // Never infer a privacy rejection or retry with public privacy.
  if (!init.ok || !ij || typeof ij !== "object" || Array.isArray(ij) ||
      !ij.error || typeof ij.error !== "object" || Array.isArray(ij.error) || ij.error.code !== "ok" ||
      (ij.errors != null && (!Array.isArray(ij.errors) || ij.errors.length > 0)) ||
      !cleanProviderBody(data) || typeof data.publish_id !== "string" || !data.publish_id.trim() ||
      !validUploadSessionUrl(data.upload_url, "open-upload.tiktokapis.com")) throw new Error(uncertain);
  let put;
  try { put = await fetch(data.upload_url, { method: "PUT", redirect: "error", headers: { "Content-Type": "video/mp4", "Content-Range": `bytes 0-${buf.length - 1}/${buf.length}` }, body: buf }); }
  catch { throw new Error("تعذّر تأكيد رفع تيك توك — راجع المنصة قبل أي إعادة نشر"); }
  if (!put.ok && put.status !== 206) throw new Error(`تيك توك رفع: ${put.status}`);
  return { external_id: data.publish_id || "", external_url: "https://www.tiktok.com/" };
}

// X may return asynchronous processing info after media upload. Only attach
// the media once it is ready; keep polling bounded for short-lived functions.
function xMediaEvidence(body, expectedId) {
  if (!cleanProviderBody(body) || (body.data != null && !cleanProviderBody(body.data))) throw invalidProviderReply("X عند معالجة الوسائط");
  const ids = [];
  if (Object.prototype.hasOwnProperty.call(body, "id")) ids.push(body.id);
  if (body.data && Object.prototype.hasOwnProperty.call(body.data, "id")) ids.push(body.data.id);
  if (!ids.length || ids.some(id => !validProviderId(id) || id !== ids[0]) || (expectedId && ids[0] !== expectedId)) throw invalidProviderReply("X عند معالجة الوسائط");
  const top = Object.prototype.hasOwnProperty.call(body, "processing_info");
  const nested = body.data && Object.prototype.hasOwnProperty.call(body.data, "processing_info");
  if (top && nested) throw invalidProviderReply("X عند معالجة الوسائط");
  return { id: ids[0], hasInfo: Boolean(top || nested), info: top ? body.processing_info : nested ? body.data.processing_info : undefined };
}

async function waitForXMedia(body, at) {
  let evidence = xMediaEvidence(body);
  const mediaId = evidence.id;
  // Preserve the existing simple-upload behavior when this field is absent;
  // absence is not proof that an X video is ready or even supported.
  if (!evidence.hasInfo) return mediaId;
  for (let attempts = 0; attempts <= 4; attempts++) {
    const info = evidence.info;
    if (!cleanProviderBody(info)) throw invalidProviderReply("X عند معالجة الوسائط");
    if (info.state === "succeeded") return mediaId;
    if (!["pending", "in_progress"].includes(info.state) || attempts === 4) throw invalidProviderReply("X عند معالجة الوسائط");
    const delay = info.check_after_secs === undefined ? 1 : info.check_after_secs;
    // Do not poll earlier than requested or wait unboundedly in a serverless request.
    if (!Number.isInteger(delay) || delay < 0 || delay > 5) throw invalidProviderReply("X عند معالجة الوسائط");
    await new Promise(resolve => setTimeout(resolve, delay * 1000));
    let response, data;
    try {
      const query = new URLSearchParams({ command: "STATUS", media_id: mediaId });
      response = await fetch(`https://api.x.com/2/media/upload?${query}`, { headers: { Authorization: `Bearer ${at}` }, signal: AbortSignal.timeout(5000) });
      data = await response.json();
    } catch { throw invalidProviderReply("X عند معالجة الوسائط"); }
    if (!response.ok) throw invalidProviderReply("X عند معالجة الوسائط");
    evidence = xMediaEvidence(data, mediaId);
    if (!evidence.hasInfo) throw invalidProviderReply("X عند معالجة الوسائط");
  }
  throw invalidProviderReply("X عند معالجة الوسائط");
}

async function uploadX(conn, vUrl, meta) {
  const c = await refreshIfNeeded(conn);
  const at = open(c.access_token);
  const buf = await readVideoBytes(vUrl);
  const fd = new FormData();
  fd.append("media", new Blob([buf], { type: "video/mp4" }), "reel.mp4");
  fd.append("media_category", "amplify_video");
  const m = await fetch("https://api.x.com/2/media/upload", { method: "POST", headers: { Authorization: `Bearer ${at}` }, body: fd });
  const mj = await m.json().catch(() => ({}));
  if (!m.ok) throw new Error(`X رفع وسائط: ${JSON.stringify(mj).slice(0, 180)} (قد يتطلب خطتك API مدفوعة)`);
  const mediaId = await waitForXMedia(mj, at);
  const text = [meta.title, meta.caption, meta.hashtags].filter(Boolean).join("\n").slice(0, 275);
  const t = await fetch("https://api.x.com/2/tweets", {
    method: "POST", headers: { Authorization: `Bearer ${at}`, "Content-Type": "application/json" },
    body: JSON.stringify({ text, media: { media_ids: [String(mediaId)] } }),
  });
  const tj = await t.json().catch(() => ({}));
  if (!t.ok) throw new Error(`X نشر: ${tj?.detail || tj?.error || t.status}`);
  if (!cleanProviderBody(tj) || !validProviderId(tj?.data?.id)) throw invalidProviderReply("X بعد محاولة النشر");
  return { external_id: tj.data.id, external_url: `https://x.com/i/status/${tj.data.id}` };
}

async function dispatch(conn, row, meta) {
  switch (conn.platform) {
    case "youtube": return uploadYouTube(conn, videoUrl(row.video_path), meta, row.video_name || row.video_path);
    case "facebook": return uploadFacebook(conn, videoUrl(row.video_path), meta);
    case "instagram": return uploadInstagram(conn, videoUrl(row.video_path), meta);
    case "tiktok": return uploadTikTok(conn, videoUrl(row.video_path), meta);
    case "x": return uploadX(conn, videoUrl(row.video_path), meta);
    default: throw new Error("منصة غير مدعومة");
  }
}

/* اختيار القناة المستهدفة من بين قنوات المنصة:
 * 1) القناة المطلوبة صراحةً في المهمة (connection_id) إن وُجدت ومسموحة
 * 2) القناة الافتراضية (is_default)
 * 3) الأحدث تحديثًا (سلوك ما قبل تعدد القنوات)
 * القائمة تُجرَّد من أي صف غريب حتى لا يُنشر على قناة مستخدم آخر. */
function pickConnection(conns, wantedId) {
  const list = (Array.isArray(conns) ? conns : []).filter(Boolean);
  if (!list.length) return null;
  if (wantedId) {
    const hit = list.find((c) => String(c.id) === String(wantedId));
    return hit || null; // لا ننشر على قناة مختلفة إذا حُذفت القناة المطلوبة.
  }
  const def = list.find((c) => c.is_default === true || c.is_default === "t" || c.is_default === 1);
  if (def) return def;
  const ts = (c) => { const t = new Date(c.updated_at || 0).getTime(); return Number.isNaN(t) ? 0 : t; };
  return list.slice().sort((a, b) => ts(b) - ts(a))[0];
}

async function publishRow(row, platform, { expectedConnectionId = null } = {}) {
  // A failed row may already have reached the platform, and legacy error text
  // and connection hints are mutable. Never retry it through this path, even
  // after relinking or when the caller supplies an expected connection.
  if (row?.status === "failed") {
    return { ok: false, skipped: "review-required", error: "قد تكون المحاولة السابقة نُشرت بالفعل — راجع القناة قبل أي إعادة نشر" };
  }
  // قد يقرأ الكرون والزر الصفّ نفسه؛ التحديث المشروط يسمح لواحد فقط بالنشر.
  if (!row?.id || !row.user_id || !["scheduled", "draft"].includes(row.status) ||
      typeof row.platform !== "string" || !row.platform || (platform && platform !== row.platform) ||
      !Object.prototype.hasOwnProperty.call(row, "connection_id") ||
      !(row.connection_id === null || (typeof row.connection_id === "string" && row.connection_id))) {
    return { ok: false, skipped: "not-claimable", error: "المهمة ليست جاهزة للنشر أو وجهتها غير واضحة" };
  }
  // Prevent a stale snapshot from claiming a row whose explicit target changed
  // before the claim. This does not lock a channel/default after the claim.
  const target = row.connection_id;
  const p = row.platform;
  const SQL_NULL_TARGET = `update publish_queue set status='publishing', updated_at=now() where id=$1 and user_id=$2 and status=$3 and platform=$4 and connection_id is null returning *`;
  const SQL_FIXED_TARGET = `update publish_queue set status='publishing', updated_at=now() where id=$1 and user_id=$2 and status=$3 and platform=$4 and connection_id=$5 returning *`;
  const params = [row.id, row.user_id, row.status, p];
  if (target !== null) params.push(target);
  const claimed = await q(target === null ? SQL_NULL_TARGET : SQL_FIXED_TARGET, params);
  if (!Array.isArray(claimed) || claimed.length !== 1) {
    return { ok: false, skipped: "already-claimed", error: "المهمة اتغيّرت أو قيد النشر بالفعل" };
  }
  // Malformed/lost evidence after a claim is not permission to dispatch. The
  // row may remain publishing until recovery, and needs review rather than retry.
  const saved = claimed[0];
  if (!saved || saved.id !== row.id || saved.user_id !== row.user_id || saved.status !== "publishing" ||
      saved.platform !== p || !Object.prototype.hasOwnProperty.call(saved, "connection_id") || saved.connection_id !== target) {
    return { ok: false, skipped: "claim-unconfirmed", error: "تعذّر تأكيد وجهة المهمة بعد الحجز — راجعها قبل إعادة النشر" };
  }
  row = saved;
  let out, problem;
  try {
    // Validate the claimed representation, not the potentially stale input.
    // This can stop legitimate legacy/shared keys; it proves neither ownership
    // nor file existence. Never touch credentials/storage/providers on failure.
    normalizeUserVideoPath(row.video_path, row.user_id);
    const connPlat = p; // صف إنستغرام يحمل ig_id والتوكن اللازمين للنشر.
    /* كل قنوات المنصة ثم الاختيار: المطلوبة ← الافتراضية ← الأحدث.
     * (كان: order by updated_at desc limit 1 ⇒ ربط قناة ثانية يغيّر الهدف بصمت) */
    const conns = await q(`select * from social_connections where user_id=$1 and platform=$2`, [row.user_id, connPlat]);
    // Treat an inconsistent response as unavailable, not as permission to pick
    // another default or send a video using a different owner's credentials.
    if (!Array.isArray(conns) || conns.some(c => !c || typeof c.id !== "string" || !c.id.trim() || c.user_id !== row.user_id || c.platform !== connPlat) ||
        new Set(conns.map(c => c.id)).size !== conns.length) {
      throw new Error("تعذّر التحقق من القنوات قبل النشر");
    }
    const conn = pickConnection(conns, row.connection_id);
    if (!conn) throw new Error("لا يوجد ربط لهذه المنصة — اربط حسابك أولًا");
    if (expectedConnectionId && String(conn.id) !== String(expectedConnectionId)) throw new Error("تغيّرت القناة الافتراضية — لم يُنشر الفيديو");
    out = await dispatch({ ...conn, platform: p }, row, {
      title: row.title, caption: row.caption, hashtags: row.hashtags,
    });
  } catch (e) {
    problem = String(e?.message || e || "تعذّر النشر");
  }
  // Persist only if this owner's row still has the claimed state. In
  // particular, a lost success-update response must never trigger a second
  // update to failed: the update or provider action may have committed.
  const uncertain = { ok: false, skipped: "result-unconfirmed", error: "تعذّر تأكيد حفظ نتيجة المهمة — ربما وصل الفيديو للمنصة؛ راجعها قبل أي إعادة نشر" };
  let finalRows;
  try {
    finalRows = problem
      ? await q(`update publish_queue set status='failed', error=$2, updated_at=now() where id=$1 and user_id=$3 and status='publishing' returning *`, [row.id, problem.slice(0, 500), row.user_id])
      : await q(`update publish_queue set status='published', external_url=$2, error=null, updated_at=now() where id=$1 and user_id=$3 and status='publishing' returning *`, [row.id, out.external_url, row.user_id]);
  } catch { return uncertain; }
  const final = Array.isArray(finalRows) && finalRows.length === 1 ? finalRows[0] : null;
  if (!final || final.id !== row.id || final.user_id !== row.user_id || final.status !== (problem ? "failed" : "published") ||
      (!problem && final.external_url !== out.external_url)) return uncertain;
  if (problem) return { ok: false, error: problem.includes("راجع المنصة قبل أي إعادة نشر") ? problem : `${problem} — راجع المنصة قبل إعادة النشر` };
  // This confirms only storage of the provider response, not remote playback.
  return { ok: true, url: out.external_url };
}

module.exports = { publishRow, videoUrl, pickConnection };
/* للاختبارات فقط */
module.exports.__test = { pickConnection, isReauthError, markReauth, refreshIfNeeded };
