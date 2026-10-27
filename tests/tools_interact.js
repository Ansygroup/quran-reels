/*
 * تفاعل الأدوات الـ32: يفتح كل أداة ثم يتمرّس تفاعلاتها الفعلية حتى 4 «حركات»:
 *   أ) نقر أزرار/روابط ظاهرة داخل جسم الأداة (بعد استقرار الرندر)
 *   ب) تغيير قوائم select لخيار آخر
 *   ج) إدخال قيمة آمنة في حقول input العادية (اختبار معالجات الحساب)
 * ويتحقق أن كل تفاعل آمن:
 *   1) لا pageerror (تُفلتر أخطاء الشبكة البيئية كملاحظة)
 *   2) لا تجميد للخيط الرئيسي (حارس 8s)
 *   3) الصفحة تعود لحالة سليمة (إغلاق الأنوارات، استعادة الـhash، إيقاف الصوت)
 * Usage:
 *   node tools_interact.js                  # محلي
 *   BASE=https://… node tools_interact.js   # إنتاج
 */
const pw = require("playwright");

const BASE = (process.env.BASE || "http://127.0.0.1:8787").replace(/\/+$/, "");
const NOISE = /Failed to load resource|net::ERR_|Load failed|Failed to fetch|NetworkError|ERR_CONNECTION|ERR_ABORTED|status of|upstream|blocked by CORS|AbortError|geolocation|Permission denied/i;
const MAX_ACTS = 4;

(async () => {
  const browser = await pw.chromium.launch({ headless: true, args: ["--no-sandbox", "--use-gl=swiftshader", "--autoplay-policy=no-user-gesture-required"] });
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });

  let consoleErrs = [], pageErrs = [];
  page.on("console", m => { if (m.type() === "error") consoleErrs.push((m.text() || "").slice(0, 160)); });
  page.on("pageerror", e => pageErrs.push(String(e.message || e).slice(0, 200)));

  const readText = () => Promise.race([
    page.evaluate(() => (document.getElementById("toolMount")?.textContent || "").replace(/\s+/g, " ").trim()),
    new Promise(r => setTimeout(() => r("__STUCK__"), 8000)),
  ]);

  // تنظيف ما بعد أي تفاعل
  const cleanup = async hashBefore => {
    await page.keyboard.press("Escape").catch(() => {});
    await page.evaluate(() => {
      document.querySelectorAll(".overlay [data-cancel], .overlay [data-close], .modal [data-cancel]")
        .forEach(b => { try { b.click(); } catch {} });
      document.querySelectorAll("audio, video").forEach(m => { try { m.pause(); } catch {} });
    }).catch(() => {});
    const hashNow = await page.evaluate(() => location.hash);
    if (hashNow !== hashBefore) {
      await page.evaluate(h => { location.hash = h; }, hashBefore);
      await page.waitForTimeout(700);
    }
  };

  const hardErrs = () => pageErrs.filter(e => !NOISE.test(e));
  const noteErrs = tag => {
    const n = pageErrs[0] || consoleErrs.find(e => NOISE.test(e));
    if (n) console.log(`  note ${tag}: ${n.slice(0, 80)}`);
    pageErrs = []; consoleErrs = [];
  };

  await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForTimeout(1800);

  const ids = await page.evaluate(() => (typeof TOOLS !== "undefined" ? TOOLS : []).map(t => t.id));
  if (!ids.length) { console.log("FAIL: no TOOLS registry"); process.exit(1); }
  console.log("BASE =", BASE, "· tools:", ids.length, "· max acts:", MAX_ACTS);

  let ok = 0, warn = 0, fail = 0;
  const fails = [], warns = [];

  for (const id of ids) {
    consoleErrs = []; pageErrs = [];
    await page.evaluate(h => { location.hash = h; }, `#/tool/${id}`);

    // انتظار الرندر
    let text = "", stuck = false;
    const t0 = Date.now();
    while (Date.now() - t0 < 9000) {
      text = await readText();
      if (text === "__STUCK__") { stuck = true; break; }
      if (text.length >= 40) break;
      await page.waitForTimeout(300);
    }
    if (stuck) {
      fail++; fails.push(`${id} (blocked on open)`);
      console.log(`FAIL ${id} :: main thread blocked on open`);
      break;
    }

    // استقرار: العناصر التفاعلية قد تُبنى بعد أول نص كافٍ — انتظر أول مرشح حتى 3s
    let cands = [];
    const c0 = Date.now();
    while (Date.now() - c0 < 3000) {
      cands = await page.evaluate(max => {
        const vis = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
        const out = [];
        document.querySelectorAll("#toolMount button:not([disabled])").forEach(el => { if (vis(el)) out.push({ kind: "btn", text: (el.textContent || "").trim().slice(0, 30) }); });
        document.querySelectorAll("#toolMount a.btn").forEach(el => { if (vis(el)) out.push({ kind: "link", text: (el.textContent || "").trim().slice(0, 30) }); });
        return out.slice(0, max);
      }, MAX_ACTS);
      if (cands.length) break;
      await page.waitForTimeout(400);
    }

    let acts = 0, toolFail = "";

    // ---- أ) الأزرار والروابط ----
    for (const c of cands) {
      const sel = c.kind === "btn" ? "#toolMount button:not([disabled])" : "#toolMount a.btn";
      const loc = page.locator(sel).filter({ hasText: c.text || /^$/ }).first();
      const hashBefore = await page.evaluate(() => location.hash);
      try {
        await loc.click({ timeout: 3000 });
        acts++;
      } catch { continue; }
      await page.waitForTimeout(550);
      const after = await readText();
      if (after === "__STUCK__") { stuck = true; toolFail = `blocked after click «${c.text}»`; break; }
      await cleanup(hashBefore);
      if (hardErrs().length) { toolFail = `pageerror after click «${c.text}»: ${hardErrs()[0]}`; break; }
      noteErrs(`${id} click «${c.text}»`);
    }

    // ---- ب) قوائم الاختيار ----
    if (!stuck && !toolFail && acts < MAX_ACTS) {
      const sels = await page.evaluate(() => {
        const vis = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
        return [...document.querySelectorAll("#toolMount select")]
          .filter(vis).slice(0, 2)
          .map((el, i) => ({ i, opts: el.options.length, value: el.value }));
      });
      for (const s of sels) {
        if (acts >= MAX_ACTS) break;
        const hashBefore = await page.evaluate(() => location.hash);
        const done = await page.evaluate(({ i, opts }) => {
          const el = [...document.querySelectorAll("#toolMount select")].filter(x => {
            const r = x.getBoundingClientRect(); return r.width > 0 && r.height > 0;
          })[i];
          if (!el || opts < 2) return false;
          const pick = [...el.options].find((o, j) => j > 0 && !o.disabled);
          if (!pick) return false;
          el.value = pick.value;
          el.dispatchEvent(new Event("change", { bubbles: true }));
          el.dispatchEvent(new Event("input", { bubbles: true }));
          return pick.textContent.trim().slice(0, 20);
        }, s);
        if (!done) continue;
        acts++;
        await page.waitForTimeout(550);
        const after = await readText();
        if (after === "__STUCK__") { stuck = true; toolFail = `blocked after select «${done}»`; break; }
        await cleanup(hashBefore);
        if (hardErrs().length) { toolFail = `pageerror after select «${done}»: ${hardErrs()[0]}`; break; }
        noteErrs(`${id} select «${done}»`);
      }
    }

    // ---- ج) حقول الإدخال الآمنة ----
    if (!stuck && !toolFail && acts < MAX_ACTS) {
      const ins = await page.evaluate(() => {
        const vis = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
        return [...document.querySelectorAll('#toolMount input:not([readonly]):not([type=hidden]):not([type=file]):not([type=checkbox]):not([type=radio])')]
          .filter(vis).slice(0, 3).map((el, i) => ({ i, type: el.type || "text" }));
      });
      for (const inp of ins) {
        if (acts >= MAX_ACTS) break;
        const hashBefore = await page.evaluate(() => location.hash);
        const done = await page.evaluate(i => {
          const el = [...document.querySelectorAll('#toolMount input:not([readonly]):not([type=hidden]):not([type=file]):not([type=checkbox]):not([type=radio])')]
            .filter(x => { const r = x.getBoundingClientRect(); return r.width > 0 && r.height > 0; })[i];
          if (!el) return false;
          el.value = el.type === "number" || el.type === "range" ? "2" : "اختبار";
          el.dispatchEvent(new Event("input", { bubbles: true }));
          el.dispatchEvent(new Event("change", { bubbles: true }));
          return el.type || "text";
        }, inp.i);
        if (!done) continue;
        acts++;
        await page.waitForTimeout(450);
        const after = await readText();
        if (after === "__STUCK__") { stuck = true; toolFail = `blocked after input «${done}»`; break; }
        await cleanup(hashBefore);
        if (hardErrs().length) { toolFail = `pageerror after input «${done}»: ${hardErrs()[0]}`; break; }
        noteErrs(`${id} input «${done}»`);
      }
    }

    // ---- د) مفاتيح checkbox/radio ----
    if (!stuck && !toolFail && acts < MAX_ACTS) {
      const cbs = await page.evaluate(() =>
        // مفاتيح التبديل غالبًا مخفية العناصر (نمط switch) لكنها تتصل بالـDOM و تستجيب للـchange
        [...document.querySelectorAll("#toolMount input[type=checkbox], #toolMount input[type=radio]")]
          .slice(0, 2).map((el, i) => ({ i }))
      );
      for (const cb of cbs) {
        if (acts >= MAX_ACTS) break;
        const hashBefore = await page.evaluate(() => location.hash);
        const done = await page.evaluate(i => {
          const el = [...document.querySelectorAll("#toolMount input[type=checkbox], #toolMount input[type=radio]")][i];
          if (!el) return false;
          if (el.type === "radio") { if (el.checked) return false; el.checked = true; }
          else el.checked = !el.checked;
          el.dispatchEvent(new Event("change", { bubbles: true }));
          el.dispatchEvent(new Event("input", { bubbles: true }));
          return el.type;
        }, cb.i);
        if (!done) continue;
        acts++;
        await page.waitForTimeout(450);
        const after = await readText();
        if (after === "__STUCK__") { stuck = true; toolFail = `blocked after ${done} «${id}»`; break; }
        await cleanup(hashBefore);
        if (hardErrs().length) { toolFail = `pageerror after ${done} «${id}»: ${hardErrs()[0]}`; break; }
        noteErrs(`${id} ${done}`);
      }
    }

    if (stuck) {
      fail++; fails.push(`${id} (${toolFail})`);
      console.log(`FAIL ${id} :: ${toolFail}`);
      break;
    }
    if (toolFail) {
      fail++; fails.push(`${id} (${toolFail})`);
      console.log(`FAIL ${id} :: ${toolFail}`);
      continue;
    }

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    const residual = hardErrs();
    if (residual.length) {
      fail++; fails.push(`${id} (residual: ${residual[0]})`);
      console.log(`FAIL ${id} :: residual ${residual[0]}`);
    } else if (overflow > 2) {
      warn++; warns.push(`${id} (overflow +${overflow}px after acts)`);
      console.log(`WARN ${id} :: overflow +${overflow}px after acts`);
    } else {
      ok++;
      console.log(`OK   ${id} (${acts} acts)`);
    }
  }

  await browser.close();
  console.log(`\nTOOLS INTERACT: ${ok} OK · ${warn} WARN · ${fail} FAIL / ${ids.length}`);
  if (warns.length) warns.forEach(w => console.log("  warn:", w));
  if (fails.length) fails.forEach(f => console.log("  fail:", f));
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error("FATAL:", e.message); process.exit(2); });
