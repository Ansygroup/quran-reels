/*
 * دخان الأدوات الـ32: يفتح كل أداة على حدة ويتحقق أن:
 *   1) الصفحة رُندرت (toolMount فيه محتوى كافٍ) بعد التحميل الكسول للتنفيذات
 *   2) لا pageerror أثناء الفتح
 *   3) لا تجاوز أفقي (horizontal overflow) لسطح المكتب
 * الاستخدام:
 *   node tools_smoke.js                         # محلي (127.0.0.1:8787)
 *   BASE=https://… node tools_smoke.js          # إنتاج
 */
const pw = require("playwright");

const BASE = (process.env.BASE || "http://127.0.0.1:8787").replace(/\/+$/, "");

(async () => {
  const browser = await pw.chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--use-gl=swiftshader"],
  });
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });

  const consoleErrs = [];
  const pageErrs = [];
  page.on("console", m => { if (m.type() === "error") consoleErrs.push((m.text() || "").slice(0, 160)); });
  page.on("pageerror", e => pageErrs.push(String(e.message || e).slice(0, 160)));

  await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForTimeout(1800);

  const ids = await page.evaluate(() => (typeof TOOLS !== "undefined" ? TOOLS : []).map(t => t.id));
  if (!ids.length) { console.log("FAIL: no TOOLS registry"); process.exit(1); }
  console.log("BASE =", BASE, "· tools:", ids.length);

  let ok = 0, warn = 0, fail = 0;
  const fails = [], warns = [];

  for (const id of ids) {
    consoleErrs.length = 0; pageErrs.length = 0;
    await page.evaluate(h => { location.hash = h; }, `#/tool/${id}`);
    // انتظار الرندر (أو رسالة الخطأ المصمّمة — فهي محتوى أيضًا)
    let text = "", stuck = false;
    const t0 = Date.now();
    while (Date.now() - t0 < 9000 && !stuck) {
      // حارس: إن جُمِّد الخيط الرئيسي، لا تعلّق الاختبار إلى الأبد
      text = await Promise.race([
        page.evaluate(() =>
          (document.getElementById("toolMount")?.textContent || "").replace(/\s+/g, " ").trim()),
        new Promise(r => setTimeout(() => r("__STUCK__"), 8000)),
      ]);
      if (text === "__STUCK__") { stuck = true; break; }
      if (text.length >= 40) break;
      await page.waitForTimeout(300);
    }
    const info = await page.evaluate(() => ({
      title: document.title || "",
      overflow: document.documentElement.scrollWidth - window.innerWidth,
      hasErr: !!document.querySelector("#toolMount .loading-line"),
    }));
    const overflow = info.overflow > 2;
    if (stuck) {
      fail++;
      fails.push(`${id} (main thread blocked)`);
      console.log(`FAIL ${id} :: main thread blocked`);
      break; // الصفحة غير صالحة للاستمرار
    }
    if (text.length >= 40 && pageErrs.length === 0 && !overflow) {
      if (consoleErrs.length) { warn++; warns.push(`${id} (console: ${consoleErrs[0]})`); console.log(`WARN ${id} :: ${consoleErrs[0]}`); }
      else { ok++; console.log(`OK   ${id} (${text.length} chars)`); }
    } else {
      fail++;
      const why = text.length < 40 ? `empty(${text.length})` : overflow ? `overflow +${info.overflow}px` : `pageerror: ${pageErrs[0]}`;
      fails.push(`${id} (${why})`);
      console.log(`FAIL ${id} :: ${why}`);
    }
  }

  await browser.close();
  console.log(`\nTOOLS SMOKE: ${ok} OK · ${warn} WARN · ${fail} FAIL / ${ids.length}`);
  if (warns.length) warns.forEach(w => console.log("  warn:", w));
  if (fails.length) fails.forEach(f => console.log("  fail:", f));
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error("FATAL:", e.message); process.exit(2); });
