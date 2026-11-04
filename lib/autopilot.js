/* الأتمتة اليومية — توليد ونشر فيديو تلقائي */
const { q, q1 } = require("./db");
const { publishRow } = require("./publish");
const fs = require("fs");
const path = require("path");
const os = require("os");

const SB = () => process.env.SUPABASE_URL;

const SURAH_NAMES = ["الفاتحة","البقرة","آل عمران","النساء","المائدة","الأنعام","الأعراف","الأنفال","التوبة","يونس","هود","يوسف","الرعد","إبراهيم","الحجر","النحل","الإسراء","الكهف","مريم","طه","الأنبياء","الحج","المؤمنون","النور","الفرقان","الشعراء","النمل","القصص","العنكبوت","الروم","لقمان","السجدة","الأحزاب","سبأ","فاطر","يس","الصافات","ص","الزمر","غافر","فصلت","الشورى","الزخرف","الدخان","الجاثية","الأحقاف","محمد","الفتح","الحجرات","ق","الذاريات","الطور","النجم","القمر","الرحمن","الواقعة","الحديد","المجادلة","الحشر","الممتحنة","الصف","الجمعة","المنافقون","التغابن","الطلاق","التحريم","الملك","القلم","الحاقة","المعارج","نوح","الجن","المزمل","المدثر","القيامة","الإنسان","المرسلات","النبأ","النازعات","عبس","التكوير","الانفطار","المطففين","الانشقاق","البروج","الطارق","الأعلى","الغاشية","الفجر","البلد","الشمس","الليل","الضحى","الشرح","التين","العلق","القدر","البينة","الزلزلة","العاديات","القارعة","التكاثر","العصر","الهمزة","الفيل","قريش","الماعون","الكوثر","الكافرون","النصر","المسد","الإخلاص","الفلق","الناس"];

function pickVerse(settings) {
  const surah = Math.floor(Math.random() * 114) + 1;
  const ayah = Math.floor(Math.random() * 10) + 1;
  return { surah, ayah, surahName: SURAH_NAMES[surah - 1] };
}

async function getChromium() {
  const mod = await import("@sparticuz/chromium");
  return mod.default || mod;
}

async function generateVideo(verse) {
  const chromium = await getChromium();
  const puppeteer = require("puppeteer-core");
  const browser = await puppeteer.launch({
    args: chromium.args,
    executablePath: await chromium.executablePath(),
    headless: chromium.headless,
  });
  
  const page = await browser.newPage();
  await page.setViewport({ width: 1080, height: 1920 });
  
  const html = `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="UTF-8">
<style>
  body { margin:0; background:linear-gradient(135deg,#0a1628,#1a3a5c); color:#fff; font-family:serif; display:flex; flex-direction:column; align-items:center; justify-content:center; height:100vh; padding:40px; box-sizing:border-box; text-align:center; }
  .surah { font-size:42px; color:#d4af37; margin-bottom:30px; }
  .verse { font-size:56px; line-height:1.8; margin:20px 0; }
  .ayah-num { font-size:32px; color:#888; margin-top:20px; }
  .brand { position:absolute; bottom:40px; font-size:24px; color:#666; }
</style>
</head>
<body>
  <div class="surah">سورة ${verse.surahName}</div>
  <div class="verse">﴿ آية ${verse.ayah} ﴾</div>
  <div class="ayah-num">سورة ${verse.surah} — آية ${verse.ayah}</div>
  <div class="brand">قرآن ريلز</div>
</body>
</html>`;
  
  await page.setContent(html);
  await new Promise(r => setTimeout(r, 2000));
  
  // Take a screenshot as PNG
  const screenshot = await page.screenshot({ type: "png", fullPage: true });
  await browser.close();
  
  // Convert PNG to a simple "video" by creating a 5-second video from the image
  // Since we can't use ffmpeg on Vercel, we'll save the screenshot as the video placeholder
  // and upload it as PNG (the frontend will handle display)
  return screenshot;
}

async function uploadToStorage(userId, buffer, ext) {
  const c = { url: SB() };
  // Get service role key from env
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_KEY;
  const fname = `${userId}/${Date.now()}-autopilot.${ext}`;
  const contentType = ext === "png" ? "image/png" : "video/webm";
  const r = await fetch(`${c.url}/storage/v1/object/reels/${fname}`, {
    method: "POST",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": contentType, "x-upsert": "true" },
    body: buffer,
  });
  if (!r.ok) throw new Error(`رفع الفيديو فشل: ${r.status} ${await r.text().then(t=>t.slice(0,100))}`);
  return fname;
}

async function runAutopilot(userId) {
  const settings = await q1("select * from autopilot where user_id=$1", [userId]);
  if (!settings || !settings.enabled) return { ok: false, error: "disabled" };

  const runKey = `run-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
  const runId = (await q1(
    `insert into autopilot_runs (user_id, run_key, run_type, run_date, status, channel_name, daily_index, daily_total, step)
     values ($1,$2,'manual',current_date,'rendering','autopilot',1,1,'preparing') returning id`,
    [userId, runKey]
  )).id;

  try {
    const verse = pickVerse(settings);
    await q("update autopilot_runs set step='rendering' where id=$1", [runId]);
    
    const screenshot = await generateVideo(verse);
    await q("update autopilot_runs set step='storing' where id=$1", [runId]);
    
    const videoPath = await uploadToStorage(userId, screenshot, "png");
    
    const platforms = settings.platforms || ["youtube"];
    const meta = {
      title: `سورة ${verse.surahName} — آية ${verse.ayah} | تلاوة مرتّلة`,
      caption: `﴿ سورة ${verse.surahName} — آية ${verse.ayah} ﴾\n\nقرآن ريلز 🤍`,
      hashtags: "#قرآن #آيات_القرآن #ترتيل #شورتس #اسلاميات",
    };
    
    let published = 0, failed = 0;
    await q("update autopilot_runs set step='publishing' where id=$1", [runId]);
    for (const platform of platforms) {
      try {
        const row = await q1(
          `insert into publish_queue (user_id, platform, video_path, video_name, title, caption, hashtags, status, publish_at)
           values ($1,$2,$3,$4,$5,$6,$7,'scheduled',now()) returning *`,
          [userId, platform, videoPath, "autopilot.png", meta.title, meta.caption, meta.hashtags]
        );
        const out = await publishRow(row, platform);
        if (out.ok) published++; else failed++;
      } catch (e) {
        failed++;
      }
    }
    
    await q("update autopilot_runs set status='published', step='published', completed_at=now(), video_path=$2 where id=$1", [runId, videoPath]);
    return { ok: true, runId, verse, published, failed, videoPath };
  } catch (e) {
    await q("update autopilot_runs set status='failed', error=$1, step='failed', completed_at=now() where id=$2", [String(e.message || e).slice(0, 500), runId]);
    return { ok: false, error: String(e.message || e), runId };
  }
}

module.exports = { runAutopilot, pickVerse, generateVideo };
