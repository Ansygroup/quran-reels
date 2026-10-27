/*
 * اختبار صحة المحتوى والحسابات — يفحص المعنى لا مجرد الرندر:
 *   1) التاريخ الهجري: hijriParts اليوم ↔ Aladhan gToH (± يوم) + roundtrip hijriToGreg
 *      (يكشف اعتماد الافتراضي الصامت «١ محرم ١٤٤٨» — عطل كمل#6)
 *   2) اتجاه القبلة: القاهرة/لندن/جاكرتا/نيويورك ± 1° + بعد كعكة ومسافات Haversine
 *   3) مواقيت الصلاة: timesFor أم القرى (القاهرة) ↔ Aladhan method=4 (Umm Al-Qura) ± 10 دقائق
 *   4) الزكاة عبر DOM: 2.5٪ حسابيًا + نصاب 85غ فضة + حكمان (بلغ/لم يبلغ)
 *   5) أدوات نصية: toAr · pad · fmtTime · normAr · hijriLabel
 * Usage:
 *   node correctness_test.js                      # محلي 127.0.0.1:8787
 *   BASE=https://… node correctness_test.js       # إنتاج
 */
const pw = require("playwright");

const BASE = (process.env.BASE || "http://127.0.0.1:8787").replace(/\/+$/, "");

const d2 = n => String(n).padStart(2, "0");
const hm2min = s => { const m = String(s || "").match(/(\d{1,2}):(\d{2})/); return m ? +m[1] * 60 + +m[2] : NaN; };

(async () => {
  const now = new Date();
  const DMY = `${d2(now.getUTCDate())}-${d2(now.getUTCMonth() + 1)}-${now.getUTCFullYear()}`;
  console.log("BASE =", BASE, "· date =", DMY, "(UTC)");

  // ---- مراجع خارجية (Aladhan) عبر Node، خارج CSP الصفحة ----
  let alT = null, alH = null, netErr = "";
  try {
    const [t, h] = await Promise.all([
      fetch(`https://api.aladhan.com/v1/timings/${DMY}?latitude=30.0444&longitude=31.2357&method=4`).then(r => r.json()),
      fetch(`https://api.aladhan.com/v1/gToH/${DMY}`).then(r => r.json()),
    ]);
    if (t.code === 200) alT = t.data.timings;
    if (h.code === 200) {
      alH = h.data.hijri;
      // في gToH يكون month كائنًا {number, en, ar} — نوحّده
      if (alH && typeof alH.month === "object") alH = { ...alH, month: alH.month.number };
    }
    if (!alT || !alH) netErr = `aladhan shape t=${t.code} h=${h.code}`;
  } catch (e) { netErr = String(e.message || e); }
  console.log("aladhan:", alT ? `timings ok (${alT.Fajr})` : "FAIL", "·", alH ? `hijri ${alH.day}/${alH.month}/${alH.year}` : "FAIL", netErr ? `· ${netErr}` : "");

  const browser = await pw.chromium.launch({ headless: true, args: ["--no-sandbox", "--use-gl=swiftshader"] });
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  const pageErrs = [];
  page.on("pageerror", e => pageErrs.push(String(e.message || e).slice(0, 160)));

  await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForTimeout(1800);

  const results = await page.evaluate(({ alH, alT }) => {
    const R = [];
    const add = (name, pass, detail) => R.push({ name, pass: !!pass, detail: String(detail).slice(0, 120) });

    // ---------- 1) التاريخ الهجري ----------
    try {
      const p = hijriParts(new Date());
      add("hijri not-fallback", !(p.day === 1 && p.month === 1 && p.year === 1448), `got ${p.day}/${p.month}/${p.year}`);
      add("hijri raw sane", /هـ/.test(p.raw || "") && (p.raw || "").length > 5, p.raw);
      if (alH) {
        const aY = +alH.year, aM = +alH.month, aD = +alH.day;
        const sameY = p.year === aY;
        const sameM = p.month === aM;
        const dayDiff = Math.abs(p.day - aD);
        const boundary = sameY && Math.abs(p.month - aM) === 1 && (p.day >= 29 || aD <= 2);
        add("hijri ≈ Aladhan", sameY && ((sameM && dayDiff <= 1) || boundary),
          `mine ${p.year}-${p.month}-${p.day} vs aladhan ${aY}-${aM}-${aD}`);
      } else add("hijri ≈ Aladhan", false, "network: no reference");
      const g = hijriToGreg(p.year, p.month, p.day);
      const ddiff = g ? Math.abs(g - new Date()) / 86400000 : Infinity;
      add("hijri→greg roundtrip ≤1d", g && ddiff <= 1, g ? `Δ=${ddiff.toFixed(2)}d` : "null");
      add("hijriLabel no double هـ", (hijriLabel({ raw: "١ محرم ١٤٤٨ هـ" }) === "١ محرم ١٤٤٨ هـ"), hijriLabel({ raw: "١ محرم ١٤٤٨ هـ" }));
    } catch (e) { add("hijri block", false, "throw: " + e.message); }

    // ---------- 2) القبلة والمسافات ----------
    const QB = [
      ["القاهرة", 30.0444, 31.2357, 136.16],
      ["لندن", 51.5074, -0.1278, 118.99],
      ["جاكرتا", -6.2088, 106.8456, 295.11],
      ["نيويورك", 40.7128, -74.0060, 58.48],
    ];
    for (const [n, la, lo, want] of QB) {
      const got = qiblaBearing(la, lo);
      const d = Math.abs(((got - want + 540) % 360) - 180);
      add(`qibla ${n} ±1°`, d <= 1, `got ${got.toFixed(2)} want ${want} Δ${d.toFixed(2)}`);
    }
    const kc = kaabaDistance(30.0444, 31.2357);
    add("kaaba dist Cairo 1230–1310", kc >= 1230 && kc <= 1310, kc + "km");
    const ax = distKm(30.0444, 31.2357, 31.2001, 29.9187);
    add("Cairo–Alex 165–195", ax >= 165 && ax <= 195, ax + "km");

    // ---------- 3) مواقيت الصلاة (أم القرى ↔ Aladhan method=4 = Umm Al-Qura) ----------
    try {
      // tz من اشتقاق IANA لليوم (يُعالج DST) — نفس مسار detectLocation المُصحَّح
      const tzCairo = tzFromName("Africa/Cairo", 2);
      const t = timesFor({ lat: 30.0444, lng: 31.2357, tz: tzCairo, method: "UmmAlQura", asr: "standard" }, new Date());
      if (alT) {
        const min = s => { const m = String(s || "").match(/(\d{1,2}):(\d{2})/); return m ? +m[1] * 60 + +m[2] : NaN; };
        for (const k of ["Fajr", "Dhuhr", "Asr", "Maghrib", "Isha"]) {
          const mine = Math.round((t[k.toLowerCase()] % 24) * 60);
          const ref = min(alT[k]);
          let d = Math.abs(mine - ref); if (d > 720) d = 1440 - d;
          add(`pray ${k} ±10m`, d <= 10, `mine ${Math.floor(mine / 60)}:${String(mine % 60).padStart(2, "0")} vs ${alT[k]} Δ${d}m`);
        }
      } else { add("pray vs Aladhan", false, "network: no reference"); }
      const f = t.fajr, i = t.isha;
      add("isha > maghrib", i > t.maghrib, `isha=${i.toFixed(2)} maghrib=${t.maghrib.toFixed(2)}`);
      add("fajr < dhuhr < isha", f < t.dhuhr && t.dhuhr < i, `${f.toFixed(2)} < ${t.dhuhr.toFixed(2)} < ${i.toFixed(2)}`);
    } catch (e) { add("pray block", false, "throw: " + e.message); }

    // ---------- 5) أدوات نصية ----------
    add("toAr(2026)", toAr(2026) === "٢٠٢٦", toAr(2026));
    add("pad(7,3)", pad(7, 3) === "007", pad(7, 3));
    add("fmtTime(5.5)", fmtTime(5.5) === "05:30", fmtTime(5.5));
    add("fmtTime rollover", fmtTime(23.9999) === "00:00", fmtTime(23.9999));
    add("normAr", normAr("إحياء ليالي رمضان") === "احياء ليالي رمضان", normAr("إحياء ليالي رمضان"));

    return R;
  }, { alH, alT });

  // ---------- 4) الزكاة عبر DOM ----------
  try {
    await page.evaluate(() => { location.hash = "#/tool/zakat"; });
    await page.waitForTimeout(1200);
    const z1 = await page.evaluate(() => {
      const set = (sel, v) => { const e = document.querySelector(`#toolMount ${sel}`); if (!e) return false; e.value = v; e.dispatchEvent(new Event("input", { bubbles: true })); return true; };
      if (!set("[data-silverp]", "100")) return { err: "no inputs" };
      set("[data-cash]", "10000");
      const txt = s => (document.querySelector(`#toolMount ${s}`)?.textContent || "").trim();
      const val = s => (document.querySelector(`#toolMount ${s}`)?.value || "").trim();
      return {
        total: txt("[data-total]"), zakat: txt("[data-zakat]"),
        verdict: txt("[data-verdict]"), nisab: val("[data-nisab]"),
      };
    });
    const znum = s => { const m = String(s).replace(/[^\d.]/g, ""); return m ? parseFloat(m) : NaN; };
    results.push({ name: "zakat nisab = 85×100", pass: z1.nisab.includes("8,500") || z1.nisab.includes("8500"), detail: z1.nisab });
    results.push({ name: "zakat total = 10,000", pass: znum(z1.total) === 10000, detail: z1.total });
    results.push({ name: "zakat 2.5% = 250", pass: znum(z1.zakat) === 250, detail: z1.zakat });
    results.push({ name: "zakat verdict ≥nisab", pass: /بلغ النصاب/.test(z1.verdict) && !/لم تبلغ/.test(z1.verdict), detail: z1.verdict.slice(0, 60) });

    const z2 = await page.evaluate(() => {
      const set = (sel, v) => { const e = document.querySelector(`#toolMount ${sel}`); e.value = v; e.dispatchEvent(new Event("input", { bubbles: true })); };
      set("[data-cash]", "5000"); set("[data-gold]", "10"); set("[data-goldp]", "500");
      const txt = s => (document.querySelector(`#toolMount ${s}`)?.textContent || "").trim();
      return { total: txt("[data-total]"), zakat: txt("[data-zakat]"), verdict: txt("[data-verdict]") };
    });
    results.push({ name: "zakat total = 5000+5000", pass: znum(z2.total) === 10000, detail: z2.total });
    results.push({ name: "zakat 2.5% = 250 (gold+cash)", pass: znum(z2.zakat) === 250, detail: z2.zakat });

    const z3 = await page.evaluate(() => {
      const set = (sel, v) => { const e = document.querySelector(`#toolMount ${sel}`); e.value = v; e.dispatchEvent(new Event("input", { bubbles: true })); };
      set("[data-gold]", "0");
      const txt = s => (document.querySelector(`#toolMount ${s}`)?.textContent || "").trim();
      return { total: txt("[data-total]"), verdict: txt("[data-verdict]") };
    });
    results.push({ name: "zakat < nisab verdict", pass: /لم تبلغ النصاب/.test(z3.verdict), detail: `${z3.total} · ${z3.verdict.slice(0, 60)}` });
  } catch (e) {
    results.push({ name: "zakat DOM block", pass: false, detail: String(e.message || e).slice(0, 120) });
  }

  if (pageErrs.length) results.push({ name: "no pageerror", pass: false, detail: pageErrs[0] });

  await browser.close();

  let ok = 0, fail = 0;
  for (const r of results) {
    if (r.pass) { ok++; console.log("OK   " + r.name + "  · " + r.detail); }
    else { fail++; console.log("FAIL " + r.name + "  · " + r.detail); }
  }
  console.log(`\nCORRECTNESS: ${ok} OK · ${fail} FAIL / ${results.length}`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error("FATAL:", e.message); process.exit(2); });
