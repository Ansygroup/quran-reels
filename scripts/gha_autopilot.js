#!/usr/bin/env node
/* Daily Quran reel autopilot on GitHub Actions (free headless Chrome).
 * Flow per due user: render the reel in Chrome (same code the site used), get a short-lived YouTube token from the worker,
 * upload with the resumable API, report back. Reciter is always Aaqib. Needs CRON_SECRET (+ optional SITE_ORIGIN). */
const SITE = (process.env.SITE_ORIGIN || "https://quranreels.chatora.us.ci").replace(/\/$/, "");
process.env.SITE_ORIGIN = SITE;
const PRIVACY = new Set(["private", "unlisted", "public"]);

async function api(path, { method = "GET", body, secret = process.env.CRON_SECRET, f = fetch } = {}) {
  const r = await f(SITE + path, { method, headers: { authorization: "Bearer " + secret, "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(30000) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${path} ${r.status} ${String(j.error || "").slice(0, 100)}`);
  return j;
}

/* Resumable upload: init (metadata) then a single PUT of the file. Returns the YouTube video id. */
async function uploadYouTube({ token, buffer, mime, title, description, privacy, f = fetch }) {
  if (!PRIVACY.has(privacy)) privacy = "private";
  const meta = { snippet: { title: String(title).slice(0, 100), description: String(description).slice(0, 4900), categoryId: "22" }, status: { privacyStatus: privacy, selfDeclaredMadeForKids: false } };
  const init = await f("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status", {
    method: "POST",
    headers: { authorization: "Bearer " + token, "content-type": "application/json; charset=UTF-8", "x-upload-content-type": mime, "x-upload-content-length": String(buffer.length) },
    body: JSON.stringify(meta),
  });
  if (!init.ok) { const e = await init.json().catch(() => ({})); throw new Error("youtube init " + init.status + " " + (e?.error?.errors?.[0]?.reason || "")); }
  const loc = init.headers.get("location");
  if (!loc || !/^https:\/\/(www\.)?googleapis\.com\//.test(loc)) throw new Error("no upload url");
  const put = await f(loc, { method: "PUT", headers: { "content-type": mime, "content-length": String(buffer.length) }, body: buffer });
  const j = await put.json().catch(() => ({}));
  if (!put.ok || !j.id) throw new Error("youtube upload " + put.status + " " + (j?.error?.message || "").slice(0, 100));
  return j.id;
}

function dayIndex(day) { const d = Date.parse(day + "T00:00:00Z"); return Math.floor(d / 86400000); }

async function processOne(item, day, deps) {
  const { auto, render, upload, call } = deps;
  const template = auto.parseTemplate(item.template);
  const idx = dayIndex(day);
  const recipe = auto.chooseRecipe(template, idx);
  const reciter = auto.PUBLIC_RECITERS[0]; /* Aaqib only */
  const meta = auto.__test.metadata(recipe, reciter, "youtube");
  const privacy = PRIVACY.has(item.template?.privacy) ? item.template.privacy : "private";
  const out = await render(recipe, reciter, template.background, idx, async () => {}, template, null);
  const tk = await call("/api/cron/token", { method: "POST", body: { uid: item.uid } });
  const description = [meta.caption, meta.hashtags, SITE].filter(Boolean).join("\n\n");
  return upload({ token: tk.access_token, buffer: out.buffer, mime: out.mime, title: meta.title, description, privacy });
}

async function main() {
  if (!process.env.CRON_SECRET) { console.log("CRON_SECRET not set; nothing to do"); return; }
  const auto = require("../lib/autopilot");
  const { due, day } = await api("/api/cron/due");
  console.log(`day ${day}: ${due.length} due`);
  let failed = 0;
  for (const item of due) {
    try {
      const id = await processOne(item, day, { auto, render: auto.__test.renderRecipe, upload: uploadYouTube, call: (p, o) => api(p, o) });
      await api("/api/cron/done", { method: "POST", body: { uid: item.uid, ok: true, video_id: id } });
      console.log("uploaded", id);
    } catch (e) {
      failed++;
      console.error("failed:", String(e && e.message || e).slice(0, 300));
      await api("/api/cron/done", { method: "POST", body: { uid: item.uid, ok: false, error: String(e && e.message || e) } }).catch(() => {});
    }
  }
  if (failed) process.exitCode = 1;
}

module.exports = { api, uploadYouTube, processOne, dayIndex };
if (require.main === module) main().catch(e => { console.error(e); process.exit(1); });
