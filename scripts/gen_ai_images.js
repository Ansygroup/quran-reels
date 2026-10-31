#!/usr/bin/env node
/* ============================================================
 * gen_ai_images.js — كمل#24: صور AI لهيرو المقالات (هجين: SVG مضمّن افتراضيًّا + AI اختياري)
 * يقرأ: posts/out/*.json (المقالات العميقة أولًا) + posts/gen_data_*.js (prompt المجموعة img)
 * يكتب: public/img/articles/<slug>.jpg (JPEG سليم >15KB) ثم يُوقف عند MAX (افتراضي 1000).
 * التشغيل: node scripts/gen_ai_images.js   |   MAX=500 node …  (خلفية مع logfile)
 */
"use strict";
const fs = require("fs");
const path = require("path");
const https = require("https");

const CARD_MD5 = new Set(["efbc6874e026bee071f8e2485f857d5c", "448709368799b97ab53620370d65da42"]); // بطاقات «Free limit reached»
const CLUSTERS = ["video", "reciters", "prayer", "hifz", "azkar", "seasons", "family", "publishing"];
const MAX = parseInt(process.env.MAX || "500", 10);
const CONC = parseInt(process.env.CONC || "1", 10);
const GATE_MS = parseInt(process.env.GATE_MS || "47000", 10); // حدّ pollinations: صورة/45 ثانية per IP
const OUT_DIR = path.join(__dirname, "..", "public", "img", "articles");
const LOG = process.env.AI_LOG || (require("os").homedir() + "/ai_images.log"); // يبقى عبر الرسائل (tmp يُمسح)
fs.mkdirSync(OUT_DIR, { recursive: true });

const log = (m) => { const line = new Date().toISOString().slice(11, 19) + " " + m; fs.appendFileSync(LOG, line + "\n"); console.log(line); };

function hash(s) { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0; return h; }

const VARIATION = ["golden hour light", "soft rim light", "close-up detail", "wide angle view", "top-down composition", "shallow depth of field", "gentle bokeh background", "dramatic side lighting", "minimalist composition", "cinematic framing", "warm ambient glow", "clean studio lighting"];

/* بناء قائمة: العميقين أولًا ثم الباقي */
const queue = [];
const groups = {};
for (const c of CLUSTERS) {
  const g = require(path.join(__dirname, "..", "posts", "gen_data_" + c + ".js"));
  g.groups.forEach((x) => (groups[x.slug] = x));
  const arr = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "posts", "out", c + ".json"), "utf8"));
  arr.forEach((s) => queue.push(s));
}
queue.sort((a, b) => (a.tier === "deep" ? 0 : 1) - (b.tier === "deep" ? 0 : 1));

const todo = [];
for (const s of queue) {
  if (todo.length >= MAX) break;
  const f = path.join(OUT_DIR, s.slug + ".jpg");
  if (fs.existsSync(f)) {
    try { const b = fs.readFileSync(f); if (b[0] === 0xff && b[1] === 0xd8 && b.length > 15360) continue; } catch (e) {}
  }
  todo.push(s);
}
log(`queue=${queue.length} todo=${todo.length} max=${MAX} conc=${CONC}`);

function fetchImage(url, dest) {
  let req = null, timer = null;
  const inner = fetchImageInner(url, dest, (r) => { req = r; });
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => { try { req && req.destroy(); } catch (e) {} reject(new Error("absolute-deadline-15m")); }, 900000);
  });
  return Promise.race([inner, deadline]).finally(() => clearTimeout(timer));
}
function fetchImageInner(url, dest, setReq) {
  return new Promise((resolve, reject) => {
    const tmp = dest + ".part";
    const req = https.get(url, { timeout: 120000, headers: { "User-Agent": "Mozilla/5.0 (compatible; QuranReelsHeroBot/1.0; +https://quran-reels-tau.vercel.app/)", "Accept": "image/*" } }, (res) => {
      const chunks = []; let n = 0;
      res.on("data", (c) => { chunks.push(c); n += c.length; if (n > 12 * 1024 * 1024) req.destroy(new Error("too big")); });
      res.on("end", () => {
        const buf = Buffer.concat(chunks);
        const retryAfter = parseInt(res.headers["retry-after"] || "0", 10) || 0;
        const md5 = require("crypto").createHash("md5").update(buf).digest("hex");
        const jpeg = buf[0] === 0xff && buf[1] === 0xd8 && buf.length > 15360;
        if (CARD_MD5.has(md5)) return reject({ rate: true, msg: "card-limit md5=" + md5.slice(0, 8), retryAfter });
        if (!jpeg) {
          if (res.statusCode === 402 || res.statusCode === 429) return reject({ rate: true, msg: "HTTP " + res.statusCode, retryAfter });
          return reject(new Error("HTTP " + res.statusCode + " " + buf.toString("utf8").slice(0, 140)));
        }
        if (res.statusCode !== 200) return reject({ rate: true, msg: "jpeg but HTTP" + res.statusCode, retryAfter });
        fs.writeFileSync(tmp, buf);
        fs.renameSync(tmp, dest);
        resolve({ bytes: buf.length, md5 });
      });
      res.on("error", reject);
    });
    setReq(req);
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", (e) => reject(e));
  });
}

function promptFor(s) {
  const g = groups[s.group] || {};
  const base = (g.img || "open book with soft warm light, dark green and gold tones, no text").replace(/[,.]?\s*no text\.?$/i, "");
  const v = VARIATION[hash(s.slug) % VARIATION.length];
  return `${base}, ${v}, elegant editorial photography style, dark emerald and gold palette, high detail, no text, no watermark, no letters`;
}

let done = 0, failed = 0, idx = 0, cardStreak = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const seenMd5 = new Set();

async function worker() {
  let gateUsed = false;
  while (idx < todo.length) {
    const s = todo[idx++];
    const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(promptFor(s))}?width=1024&height=576&nologo=true&model=turbo&seed=${hash(s.slug) & 2147483647}`;
    const dest = path.join(OUT_DIR, s.slug + ".jpg");
    let ok = false, rate = 0, tech = 0;
    while (!ok && rate < 60 && tech < 3) {
      if (gateUsed) await sleep(GATE_MS);
      gateUsed = true;
      try {
        const r = await fetchImage(url, dest);
        if (seenMd5.has(r.md5)) { // صورة مكرّرة = ليست توليدًا فريدًا
          fs.rmSync(dest);
          rate++;
          log(`dup-md5 ${r.md5.slice(0, 8)} على ${s.slug} — انتظار`);
          continue;
        }
        seenMd5.add(r.md5);
        ok = true; done++; cardStreak = 0;
        log(`✓ ${s.slug} (${r.bytes}B) [${done}/${todo.length} done, ${failed} failed]`);
      } catch (e) {
        if (e && e.rate && String(e.msg || "").includes("card-limit")) {
          // حدّ يومي مُستنفد: توقّف عالمي طويل مع إبقاء الموضع (لا حرق الفشل)
          cardStreak++;
          if (cardStreak > 12) { log(`✗ SKIP-CARD ${s.slug} (حدّ يومي طويل)`); break; }
          const w = Math.min(60000 * Math.pow(2, cardStreak - 1), 3600000); // 1د,2د,4د… حتى ساعة
          log(`card[${cardStreak}] حدّ مجاني مستنفد — نوم ${Math.round(w / 60000)}د (${s.slug})`);
          await sleep(w);
          gateUsed = false;
        } else if (e && e.rate) {
          rate++;
          const base = (e.retryAfter ? e.retryAfter + 3 : 46) * rate; // تصاعد
          const wait = Math.min(base, 300) * 1000;
          log(`rate[${rate}] ${e.msg} ${s.slug} — نوم ${Math.round(wait / 1000)}ث`);
          await sleep(wait);
          gateUsed = false; // نِمنا كفاية — لا بوابة إضافية
        } else {
          tech++;
          log(`tech[${tech}] ${e && e.message} ${s.slug}`);
          await sleep(5000);
        }
      }
    }
    if (!ok) { failed++; log(`✗ SKIP ${s.slug} (rate=${rate} tech=${tech})`); }
  }
}

(async () => {
  await worker();
  log(`FINISHED done=${done} failed=${failed} of ${todo.length}`);
  log("NEXT: node scripts/build_posts.js && git add -A && commit + gh_push");
})();
