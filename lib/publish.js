/* محرّك النشر: تجديد التوكن + رفع الفيديو لكل منصة */
const { open, seal } = require("./crypt");
const { q1, q } = require("./db");

const SB = () => process.env.SUPABASE_URL;
const videoUrl = p => `${SB()}/storage/v1/object/public/reels/${p}`;

async function refreshIfNeeded(conn) {
  const now = Date.now();
  if (conn.expires_at && Number(conn.expires_at) - now > 120000) return conn;
  const tok = { ...conn };
  let body = null, url = null;
  if (conn.platform === "youtube") {
    url = "https://oauth2.googleapis.com/token";
    body = new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID, client_secret: process.env.GOOGLE_CLIENT_SECRET, refresh_token: open(conn.refresh_token), grant_type: "refresh_token" });
  } else if (conn.platform === "x") {
    url = "https://api.x.com/2/oauth2/token";
    body = new URLSearchParams({ client_id: process.env.X_CLIENT_ID, client_secret: process.env.X_CLIENT_SECRET, refresh_token: open(conn.refresh_token), grant_type: "refresh_token" });
  } else if (conn.platform === "tiktok") {
    url = "https://open.tiktokapis.com/oauth/token/";
    body = new URLSearchParams({ client_key: process.env.TIKTOK_CLIENT_KEY, client_secret: process.env.TIKTOK_CLIENT_SECRET, refresh_token: open(conn.refresh_token), grant_type: "refresh_token", grant_scope: "video.publish" });
  } else {
    return conn; // meta: توكن طويل الأمد — لا تجديد تلقائي v1
  }
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new Error(`تجديد التوكن فشل (${conn.platform}): ${j.error || r.status}`);
  tok.access_token = j.access_token;
  if (j.refresh_token) tok.refresh_token = j.refresh_token;
  tok.expires_at = Date.now() + (j.expires_in || 3600) * 1000;
  await q(`update social_connections set access_token=$1, refresh_token=$2, expires_at=$3, updated_at=now() where id=$4`,
    [seal(tok.access_token), seal(tok.refresh_token || open(conn.refresh_token)), tok.expires_at, conn.id]);
  return tok;
}

async function uploadYouTube(conn, vUrl, meta, videoName = "") {
  const c = await refreshIfNeeded(conn);
  const mediaType = /\.webm$/i.test(String(videoName || "")) ? "video/webm" : "video/mp4";
  const at = open(c.access_token);
  let size = 0;
  try { const h = await fetch(vUrl, { method: "HEAD" }); size = Number(h.headers.get("content-length") || 0); } catch {}
  const start = await fetch("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${at}`, "Content-Type": "application/json",
      "X-Upload-Content-Length": String(size || 0), "X-Upload-Content-Type": mediaType,
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
  if (!loc) throw new Error("جوجل: رابط الرفع مفقود");
  const vr = await fetch(loc, { method: "PUT", headers: { "Content-Type": mediaType }, body: await (await fetch(vUrl)).arrayBuffer() });
  const j = await vr.json().catch(() => ({}));
  if (!vr.ok || !j.id) throw new Error(`جوجل رفض الرفع: ${JSON.stringify(j).slice(0, 180)}`);
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
  if (!r.ok || !j.id) throw new Error(`فيسبوك: ${j.error?.message || r.status}`);
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
  if (!r1.ok || !j1.id) throw new Error(`إنستغرام: ${j1.error?.message || r1.status}`);
  for (let i = 0; i < 8; i++) {
    await new Promise(s => setTimeout(s, 4000));
    const s = await (await fetch(`https://graph.facebook.com/v21.0/${j1.id}?fields=status_code`, { headers: { Authorization: `Bearer ${at}` } })).json().catch(() => ({}));
    if (s.status_code === "FINISHED") {
      const r2 = await fetch(`https://graph.facebook.com/v21.0/${ig}/media_publish?creation_id=${j1.id}`, { method: "POST", headers: { Authorization: `Bearer ${at}` } });
      const j2 = await r2.json().catch(() => ({}));
      if (!r2.ok || !j2.id) throw new Error(`إنستغرام نشر: ${j2.error?.message || r2.status}`);
      return { external_id: j2.id, external_url: "https://www.instagram.com/reels/" };
    }
    if (s.status_code === "ERROR") throw new Error("إنستغرام: فشل معالجة الفيديو");
  }
  throw new Error("إنستغرام: انتهت مهلة معالجة الفيديو");
}

async function uploadTikTok(conn, vUrl, meta) {
  const c = await refreshIfNeeded(conn);
  const at = open(c.access_token);
  const buf = Buffer.from(await (await fetch(vUrl)).arrayBuffer());
  const init = await fetch("https://open.tiktokapis.com/v2/post/publish/video/init/", {
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
  const ij = await init.json().catch(() => ({}));
  let data = ij.data || ij;
  if (!data.upload_url) {
    // خصوصية غير مسموحة لتطبيق غير مُدقّق → جرّب PUBLIC
    const init2 = await fetch("https://open.tiktokapis.com/v2/post/publish/video/init/", {
      method: "POST",
      headers: { Authorization: `Bearer ${at}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        post_info: { title: [meta.title, meta.hashtags].filter(Boolean).join(" ").slice(0, 150), privacy_level: "PUBLICLY_VISIBLE" },
        source_info: { video_size: buf.length, chunk_size: buf.length, total_chunk_count: 1 },
      }),
    });
    const ij2 = await init2.json().catch(() => ({}));
    data = ij2.data || ij2;
  }
  if (!data.upload_url) throw new Error(`تيك توك: ${JSON.stringify(ij).slice(0, 200)}`);
  const put = await fetch(data.upload_url, { method: "PUT", headers: { "Content-Type": "video/mp4", "Content-Range": `bytes 0-${buf.length - 1}/${buf.length}` }, body: buf });
  if (!put.ok && put.status !== 206) throw new Error(`تيك توك رفع: ${put.status}`);
  return { external_id: data.publish_id || "", external_url: "https://www.tiktok.com/" };
}

async function uploadX(conn, vUrl, meta) {
  const c = await refreshIfNeeded(conn);
  const at = open(c.access_token);
  const buf = Buffer.from(await (await fetch(vUrl)).arrayBuffer());
  const fd = new FormData();
  fd.append("media", new Blob([buf], { type: "video/mp4" }), "reel.mp4");
  fd.append("media_category", "amplify_video");
  const m = await fetch("https://api.x.com/2/media/upload", { method: "POST", headers: { Authorization: `Bearer ${at}` }, body: fd });
  const mj = await m.json().catch(() => ({}));
  const mediaId = mj.id || mj.data?.id;
  if (!m.ok || !mediaId) throw new Error(`X رفع وسائط: ${JSON.stringify(mj).slice(0, 180)} (قد يتطلب خطتك API مدفوعة)`);
  const text = [meta.title, meta.caption, meta.hashtags].filter(Boolean).join("\n").slice(0, 275);
  const t = await fetch("https://api.x.com/2/tweets", {
    method: "POST", headers: { Authorization: `Bearer ${at}`, "Content-Type": "application/json" },
    body: JSON.stringify({ text, media: { media_ids: [String(mediaId)] } }),
  });
  const tj = await t.json().catch(() => ({}));
  if (!t.ok || !tj.data?.id) throw new Error(`X نشر: ${tj.detail || tj.error || t.status}`);
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

async function publishRow(row, platform) {
  const p = platform || row.platform;
  await q(`update publish_queue set status='publishing', updated_at=now() where id=$1`, [row.id]);
  try {
    const connPlat = p === "instagram" ? "facebook" : p; // إنستغرام تنشر بتوكن الصفحة (فيسبوك)
    const conn = await q1(`select * from social_connections where user_id=$1 and platform=$2 order by updated_at desc limit 1`, [row.user_id, connPlat]);
    if (!conn) throw new Error("لا يوجد ربط لهذه المنصة — اربط حسابك أولًا");
    const out = await dispatch({ ...conn, platform: p }, row, {
      title: row.title, caption: row.caption, hashtags: row.hashtags,
    });
    await q(`update publish_queue set status='published', external_url=$2, error=null, updated_at=now() where id=$1`, [row.id, out.external_url]);
    return { ok: true, url: out.external_url };
  } catch (e) {
    await q(`update publish_queue set status='failed', error=$2, updated_at=now() where id=$1`, [row.id, String(e.message || e).slice(0, 500)]);
    return { ok: false, error: String(e.message || e) };
  }
}

module.exports = { publishRow, videoUrl };
