/*
 * اختبار دفعة كمل#12 (58 صفحة جديدة + أزواج hreflang + عدّاد القرّاء).
 * يعمل ضد الإنتاج افتراضيًا: node pages12_test.js   |  BASE=… node …
 */
const BASE = (process.env.BASE || "https://quran-reels-tau.vercel.app").replace(/\/+$/, "");

let ok = 0, fail = 0;
const fails = [];
const chk = (name, cond, extra = "") => {
  if (cond) { ok++; console.log("OK   " + name); }
  else { fail++; fails.push(name); console.log("FAIL " + name + "  · " + String(extra).slice(0, 140)); }
};

(async () => {
  console.log("BASE =", BASE, "· K12 pages test");

  // 1) خريطة الموقع كلها 200 + canonical متطابق
  const sm = await (await fetch(BASE + "/sitemap.xml")).text();
  const locs = [...sm.matchAll(/<loc>(.*?)<\/loc>/g)].map(m => m[1]);
  chk("sitemap = 79 urls", locs.length === 79, String(locs.length));

  let bad = [];
  for (const loc of locs) {
    try {
      const r = await fetch(loc);
      if (r.status !== 200) { bad.push(loc + " → " + r.status); continue; }
      const html = await r.text();
      const can = (html.match(/<link rel="canonical" href="([^"]+)"/) || [])[1];
      if (can !== loc) bad.push(loc + " canonical=" + can);
    } catch (e) { bad.push(loc + " → " + e.message); }
  }
  chk("all 70 pages 200 + self-canonical", bad.length === 0, bad.slice(0, 4).join(" | "));

  // 2) صفحات /en/: لغة إنجليزية + ثلاث بدائل hreflang
  const enPaths = ["/en/", "/en/quran-video-maker/", "/en/quran-video-with-translation/",
    "/en/quran-video-tiktok/", "/en/prayer-times/", "/en/qibla-direction/"];
  for (const p of enPaths) {
    const html = await (await fetch(BASE + p)).text();
    chk("en " + p + " lang+hreflang",
      html.includes('<html lang="en"') && (html.match(/hreflang=/g) || []).length >= 3,
      "lang=" + html.includes('<html lang="en"') + " hreflang=" + (html.match(/hreflang=/g) || []).length);
  }

  // 3) أزواج الأرِكان: root + 5 صفحات عربية تحمل hreflang=en
  const arPaired = ["/", "/ar/quran-video-maker/", "/ar/quran-video-with-translation/",
    "/ar/quran-video-tiktok/", "/ar/prayer-times/", "/ar/qibla-direction/"];
  for (const p of arPaired) {
    const html = await (await fetch(BASE + p)).text();
    chk("pair " + p + " → hreflang en", /hreflang="en" href="https:\/\/[^"]+\/en/.test(html));
  }

  // 4) فهرس القرّاء: 47 بطاقة
  const hub = await (await fetch(BASE + "/ar/reciters/")).text();
  const cards = (hub.match(/class="rc-card"/g) || []).length;
  chk("hub = 47 reciter cards", cards === 47, String(cards));

  // 5) صفحة قارئ: CTA بالمعرّف المجلّد + JSON-LD breadcrumb
  const rec = await (await fetch(BASE + "/ar/reciter/alafasy/")).text();
  chk("reciter CTA ?r=", rec.includes("/?r=Alafasy_128kbps"));
  chk("reciter breadcrumb LD", rec.includes("BreadcrumbList"));

  // 6) صفحات الثقة: نموذج تواصل عامل + الروابط في الفوتر
  const contact = await (await fetch(BASE + "/contact/")).text();
  chk("contact form present", contact.includes('id="cForm"') && contact.includes("/rest/v1/rpc/submit_contact"));

  // كمل#14: /api/contact يرفض المدخلات الخاطئة (دون أي كتابة في القاعدة)
  const cbad = await fetch(BASE + "/api/contact", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "x", email: "not-an-email", message: "hello" }) });
  chk("contact API 400 bad email", cbad.status === 400, "status " + cbad.status);
  const cempty = await fetch(BASE + "/api/contact", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
  chk("contact API 400 empty", cempty.status === 400, "status " + cempty.status);
  const about = await (await fetch(BASE + "/about/")).text();
  chk("about AboutPage LD", about.includes('"@type":"AboutPage"'));
  const footer = await (await fetch(BASE + "/")).text();
  chk("root footer → trust links", ["/about/", "/terms/", "/privacy/", "/contact/", "/ar/reciters/"]
    .every(h => footer.includes('href="' + h + '"')));
  // كمل#15: وسم GSC بالقيمة الدقيقة على الرئيسية (و79/79 في المراقبة)
  chk("GSC token exact on home", footer.includes('content="IHmoe5QFrC77PbZdh2O0MeZFLIKwg-saA50td32AcQo"'));
  // كمل#15ب: ملف التحقق بأسلوب رفع الملف (يجب أن يبقى في الجذر)
  const gv = await fetch(BASE + "/googleb789508316de731f.html");
  const gvt = gv.ok ? await gv.text() : "";
  chk("GSC html verify file", gv.status === 200 && gvt.trim() === "google-site-verification: googleb789508316de731f.html", "status " + gv.status);

  // 7) الروابط الداخلية من صفحات en لا تؤدي لـ404 (عيّنة)
  const sample = ["/", "/ar/reciters/", "/about/", "/terms/", "/privacy/", "/en/"];
  let d404 = [];
  for (const p of sample) {
    const r = await fetch(BASE + p);
    if (r.status !== 200) d404.push(p + "=" + r.status);
  }
  chk("trust/hub sample 200", d404.length === 0, d404.join(","));

  console.log(`\nK12 PAGES TEST: ${ok} OK · ${fail} FAIL / ${ok + fail}`);
  if (fails.length) fails.forEach(f => console.log("  fail:", f));
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error("FATAL:", e.message); process.exit(2); });
