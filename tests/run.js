/* Quran Reels — E2E suite (Playwright).
 * Usage:
 *   node run.js                          # local: http://127.0.0.1:8787
 *   BASE=https://quran-reels-tau.vercel.app node run.js   # production
 *   SKIP_EXPORT=1 node run.js            # skip the MP4 export section
 * Requires: npm i playwright && npx playwright install chromium-headless-shell
 *           + system libs: npx playwright install-deps chromium-headless-shell
 */
const { chromium } = require("playwright");

const BASE = (process.env.BASE || "http://127.0.0.1:8787").replace(/\/+$/, "");
const PROD = /vercel\.app$/.test(new URL(BASE).hostname.split(".").slice(-2).join(".")) || BASE.includes("vercel.app");
const SKIP_EXPORT = process.env.SKIP_EXPORT === "1";
const TOOL_IDS = "prayer qibla hijri adhkar tasbeeh asma hisn dua pray-learn sawm qada kaffara ayah-day topics looper khatma group-khatma makharij radio hadith takhreej card zakat mawarith baby-names enums mosques calendar countdown iftar adhan-alarms deeds".split(" ");

const errs = [];
const warnings = [];
let currentHash = "";
const chk = (name, cond, extra = "") => {
  if (cond) console.log("OK   " + name);
  else { errs.push(name + (extra ? " :: " + extra : "")); console.log("FAIL " + name + " :: " + extra); }
};
const warn = (name, extra = "") => { warnings.push(name); console.log("WARN " + name + " :: " + extra); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  console.log("BASE =", BASE, PROD ? "(PROD)" : "(LOCAL)");
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--autoplay-policy=no-user-gesture-required", "--use-gl=swiftshader"],
  });
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const page = await ctx.newPage();

  // ---- console/page errors (expected network-probe noise on the mosques tool only) ----
  const NOISE = /Failed to load resource|net::ERR_|SSL|upstream|status of|ERR_CONNECTION/i;
  let offlinePhase = false;
  page.on("console", m => {
    if (offlinePhase) return;
    if (m.type() !== "error") return;
    const txt = m.text() || "";
    const url = (m.page() && m.page().url()) || currentHash || "";
    if (NOISE.test(txt) && (url.includes("mosques") || /status of 409/.test(txt))) return;
    errs.push("console: " + txt.slice(0, 200));
    console.log("FAIL console: " + txt.slice(0, 200));
  });
  page.on("pageerror", e => {
    const txt = String(e.message || e);
    if ((currentHash || "").includes("mosques") && NOISE.test(txt)) return;
    errs.push("pageerror: " + txt.slice(0, 200));
    console.log("FAIL pageerror: " + txt.slice(0, 200));
  });

  const go = async (hash, wait = 700) => {
    currentHash = hash;
    await page.evaluate(h => { location.hash = h; }, hash);
    await page.waitForTimeout(wait);
  };

  try {
    // ================= S1: boot + SEO =================
    await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(2500);
    await page.click("#cookieOk").catch(() => {});
    const boot = await page.evaluate(() => ({
      title: document.title,
      home: !document.querySelector("#view-home")?.hidden,
      canonical: document.querySelector('link[rel=canonical]')?.href || "",
      ogUrl: document.querySelector('meta[property="og:url"]')?.content || "",
      ogImg: document.querySelector('meta[property="og:image"]')?.content || "",
      tw: document.querySelector('meta[name="twitter:card"]')?.content || "",
      ld: [...document.querySelectorAll('script[type="application/ld+json"]')].map(s => { try { return JSON.parse(s.textContent); } catch { return null; } }),
    }));
    chk("S1 title", /قرآن|Quran/i.test(boot.title), boot.title);
    chk("S1 home visible", boot.home);
    const CANON = PROD ? BASE + "/" : "https://quran-reels-tau.vercel.app/";
    chk("S1 canonical", boot.canonical === CANON, boot.canonical + " vs " + CANON);
    chk("S1 og:url", boot.ogUrl === CANON, boot.ogUrl);
    chk("S1 og:image absolute", /^https:\/\//.test(boot.ogImg), boot.ogImg);
    chk("S1 twitter:card", boot.tw === "summary_large_image", boot.tw);
    chk("S1 3 JSON-LD", boot.ld.length === 3 && boot.ld.every(Boolean), String(boot.ld.length));
    const faq = boot.ld.find(x => x && x["@type"] === "FAQPage");
    chk("S1 FAQ 15 (ld+json)", faq && Array.isArray(faq.mainEntity) && faq.mainEntity.length === 15, String(faq && faq.mainEntity && faq.mainEntity.length));
    chk("S1 WebApplication+HowTo", !!boot.ld.find(x => x && x["@type"] === "WebApplication") && !!boot.ld.find(x => x && x["@type"] === "HowTo"));

    const rb = await page.evaluate(async t => { const r = await fetch(t); return { s: r.status, t: await r.text() }; }, "/robots.txt");
    chk("S1 robots", rb.s === 200 && rb.t.includes("Sitemap:"), String(rb.s));
    const sm = await page.evaluate(async t => { const r = await fetch(t); return { s: r.status, t: await r.text() }; }, "/sitemap.xml");
    chk("S1 sitemap", sm.s === 200 && sm.t.includes("<loc>"), String(sm.s));
    const cfg = await page.evaluate(async () => { const r = await fetch("/api/app-config"); return await r.json(); });
    chk("S1 app-config shape", cfg && cfg.supabase && typeof cfg.supabase.url === "string", JSON.stringify(cfg).slice(0, 80));

    // ================= S2: home content =================
    const home = await page.evaluate(() => ({
      steps: document.querySelectorAll("#view-home .step, #view-home .steps > *").length,
      faqQ: document.querySelectorAll("#view-home .faq-item").length,
      create: !!document.getElementById("create"),
      reciter: !!document.getElementById("selSurah"),
    }));
    chk("S2 creator section", home.create && home.reciter);
    chk("S2 FAQ items", home.faqQ >= 10, String(home.faqQ));

    // ================= S3: creator preview + export =================
    await page.evaluate(() => document.getElementById("create")?.scrollIntoView());
    await sleep(400);
    await page.click("#btnPlay").catch(() => {});
    await sleep(2500);
    const prev = await page.evaluate(() => ({
      t: document.getElementById("tCur")?.textContent || "",
      fill: document.getElementById("timeFill")?.style?.width || "",
      note: document.getElementById("previewNote")?.textContent || "",
    }));
    chk("S3 preview runs", prev.t !== "" || prev.fill !== "", JSON.stringify(prev));
    await page.click("#btnPlay").catch(() => {});
    await sleep(300);

    if (!SKIP_EXPORT) {
      await page.evaluate(() => {
        const s = document.getElementById("selSurah");
        const opt = [...s.options].find(o => o.value === "108" || o.value === "١٠٨" || /الكوثر/.test(o.textContent));
        if (opt) s.value = opt.value;
        s.dispatchEvent(new Event("change", { bubbles: true }));
        const set = (id, v) => { const e = document.getElementById(id); if (e) { e.value = v; e.dispatchEvent(new Event("input", { bubbles: true })); e.dispatchEvent(new Event("change", { bubbles: true })); } };
        set("txtFrom", "1"); set("txtTo", "3");
      });
      await sleep(600);
      console.log("SEL:", JSON.stringify(await page.evaluate(() => {
        const s = document.getElementById("selSurah");
        return { s: s && s.value, from: document.getElementById("txtFrom")?.value, to: document.getElementById("txtTo")?.value, info: document.getElementById("rangeInfo")?.textContent?.slice(0, 60) };
      })));
      const t0 = Date.now();
      await page.click("#btnCreate");
      // possible confirm dialog
      await sleep(900);
      await page.click(".overlay [data-ok]").catch(() => {});
      let done = false;
      try {
        await page.waitForFunction(() => {
          const dl = document.getElementById("btnDownload");
          const res = document.getElementById("expResult");
          const pct = document.getElementById("expPct");
          return (dl && dl.offsetParent !== null) || (res && res.offsetParent !== null && res.textContent.trim().length > 4) || (pct && pct.textContent.includes("100"));
        }, { timeout: 150000 });
        done = true;
      } catch {}
      const ex = await page.evaluate(() => ({
        pct: document.getElementById("expPct")?.textContent || "",
        res: (document.getElementById("expResult")?.textContent || "").replace(/\s+/g, " ").trim().slice(0, 140),
        dl: !!document.getElementById("btnDownload")?.offsetParent,
        running: !!document.getElementById("expRunning")?.offsetParent,
      }));
      console.log("EXPORT:", done, ((Date.now() - t0) / 1000).toFixed(1) + "s", JSON.stringify(ex));
      chk("S3 MP4 export completes", done, JSON.stringify(ex));
      // clean up overlay for later nav
      await page.click("#btnNew, #btnCancelExport").catch(() => {});
      await sleep(500);
      await page.evaluate(() => { const o = document.getElementById("exportOverlay"); if (o) o.style.display = "none"; });
    }

    // ================= S4: tools index =================
    await go("#/tools", 900);
    const tc = await page.evaluate(() => document.querySelectorAll("#toolsGridAll > *").length);
    chk("S4 tools cards = 32", tc === 32, String(tc));

    // ================= S5: open every tool =================
    for (const id of TOOL_IDS) {
      await go("#/tool/" + id, id === "mosques" ? 2500 : 550);
      const mount = await page.evaluate(() => {
        const m = document.getElementById("toolMount");
        return { n: m ? m.children.length : 0, t: (m?.textContent || "").replace(/\s+/g, " ").trim().slice(0, 80) };
      });
      chk("S5 tool:" + id, mount.n > 0 && mount.t.length > 4, JSON.stringify(mount));
    }

    // ================= S6: deep interactions =================
    await go("#/tool/tasbeeh", 700);
    await page.click("#toolMount [data-tap]").catch(() => {});
    await page.click("#toolMount [data-tap]").catch(() => {});
    await page.click("#toolMount [data-tap]").catch(() => {});
    await sleep(300);
    const tas = await page.evaluate(() => document.querySelector("#toolMount [data-count]")?.textContent || "");
    chk("S6 tasbeeh ٣", tas.includes("٣"), tas);

    await go("#/tool/adhkar", 900);
    const adh = await page.evaluate(() => (document.getElementById("toolMount")?.textContent || ""));
    chk("S6 adhkar has الصباح", adh.includes("الصباح"));

    await go("#/tool/zakat", 700);
    await page.evaluate(() => {
      const set = (sel, v) => { const e = document.querySelector(sel); if (e) { e.value = v; e.dispatchEvent(new Event("input", { bubbles: true })); e.dispatchEvent(new Event("change", { bubbles: true })); } };
      set("#toolMount [data-cash]", "200000");
    });
    await sleep(600);
    const zk = await page.evaluate(() => (document.getElementById("toolMount")?.textContent || "").replace(/\s+/g, " "));
    chk("S6 zakat 200,000", zk.includes("200,000"), zk.slice(zk.indexOf("200") - 10, zk.indexOf("200") + 60));

    await go("#/tool/khatma", 700);
    await page.fill("#toolMount [data-days]", "20").catch(() => {});
    await page.click("#toolMount [data-gen]").catch(() => {});
    await sleep(500);
    const kh = await page.evaluate(() => ({
      rows: document.querySelectorAll("#toolMount [data-plan] tbody tr, #toolMount [data-plan] tr").length,
      plan: (document.querySelector("#toolMount [data-plan]")?.textContent || "").slice(0, 60),
    }));
    chk("S6 khatma plan rows", kh.rows > 5, JSON.stringify(kh));

    await go("#/tool/prayer", 2500);
    const pr = await page.evaluate(() => (document.getElementById("toolMount")?.textContent || ""));
    chk("S6 prayer times", /\d{1,2}:\d{2}/.test(pr), pr.replace(/\s+/g, " ").slice(0, 90));

    await go("#/tool/qibla", 1800);
    const qb = await page.evaluate(() => (document.getElementById("toolMount")?.textContent || ""));
    chk("S6 qibla degrees", qb.includes("°") || qb.includes("الشمال"), qb.replace(/\s+/g, " ").slice(0, 80));

    await go("#/tool/hijri", 1200);
    const hj = await page.evaluate(() => (document.getElementById("toolMount")?.textContent || ""));
    chk("S6 hijri هـ", hj.includes("هـ"), hj.replace(/\s+/g, " ").slice(0, 70));

    await go("#/tool/hadith", 1200);
    const hd = await page.evaluate(() => ({ t: (document.getElementById("toolMount")?.textContent || ""), cards: document.querySelectorAll("#toolMount .mini-card").length }));
    chk("S6 hadith bundled", hd.cards >= 10 || hd.t.includes("النووية"), String(hd.cards));

    await go("#/tool/radio", 900);
    await page.click("#toolMount .m-title").catch(() => {});
    await sleep(5500);
    const rd = await page.evaluate(() => ({
      state: document.querySelector("#toolMount [data-state]")?.textContent || "",
      toggle: document.querySelector("#toolMount [data-toggle]")?.textContent || "",
      rs: document.querySelector("#toolMount audio")?.readyState ?? document.querySelector("audio")?.readyState ?? -1,
    }));
    console.log("RADIO:", JSON.stringify(rd));
    if (rd.state.includes("بث مباشر")) chk("S6 radio live", true);
    else warn("radio-live", JSON.stringify(rd)); // streams can be flaky; not a build failure
    await page.click("#toolMount [data-toggle]").catch(() => {});

    await go("#/tool/makharij", 700);
    const mk0 = await page.evaluate(() => document.querySelector("#toolMount [data-quiz]")?.textContent || "");
    await page.click("#toolMount [data-quiz] .chip").catch(() => {});
    await sleep(400);
    const mk1 = await page.evaluate(() => document.querySelector("#toolMount [data-quiz]")?.textContent || "");
    chk("S6 makharij quiz reacts", mk0 !== mk1 && mk1.includes("/"), mk1.replace(/\s+/g, " ").slice(0, 60));

    // ---- group khatma: share + restore + cloud/local status ----
    await go("#/tool/group-khatma", 800);
    await page.fill("#toolMount [data-name]", "ختمة الاختبار").catch(() => {});
    await page.fill("#toolMount [data-days]", "10").catch(() => {});
    await page.fill("#toolMount [data-you]", PROD ? "سحابي" : "اختبار").catch(() => {});
    await page.click("#toolMount [data-share]").catch(() => {});
    await sleep(2200);
    const g1 = await page.evaluate(() => ({
      link: document.querySelector("#toolMount [data-link]")?.value || "",
      cloud: document.querySelector("#toolMount [data-cloud]")?.textContent?.replace(/\s+/g, " ").trim() || "",
      mine: (document.querySelector("#toolMount [data-mine]")?.textContent || "").replace(/\s+/g, " ").trim().slice(0, 80),
    }));
    chk("S6 group share link", g1.link.includes("group-khatma"), g1.link.slice(0, 60));
    chk("S6 group cloud box", /تقدم المجموعة|وضع محلي/.test(g1.cloud), g1.cloud);
    if (PROD) chk("S6 group cloud row (prod)", g1.cloud.includes("سحابي"), g1.cloud);

    await page.evaluate(l => { location.href = l; }, g1.link);
    await page.waitForTimeout(2000);
    const g2 = await page.evaluate(() => ({
      name: store.get("groupPlan")?.name,
      mine: (document.querySelector("#toolMount [data-mine]")?.textContent || "").replace(/\s+/g, " ").trim().slice(0, 90),
      cloud: document.querySelector("#toolMount [data-cloud]")?.textContent?.replace(/\s+/g, " ").trim() || "",
    }));
    chk("S6 group link round-trip", g2.name === "ختمة الاختبار", String(g2.name));

    // ================= S7: burger (mobile viewport) + privacy + done =================
    await go("#/", 500);
    await page.setViewportSize({ width: 390, height: 800 });
    await sleep(400);
    await page.click("#burger", { timeout: 8000 }).catch(e => errs.push("S7 burger click: " + e.message.slice(0, 80)));
    await sleep(400);
    const b1 = await page.evaluate(() => document.querySelector("#mainNav")?.classList.contains("open"));
    await page.locator("#mainNav a[href='#/tools']").first().click({ timeout: 8000 }).catch(() => {});
    await sleep(800);
    const b2 = await page.evaluate(() => document.querySelector("#mainNav")?.classList.contains("open"));
    await page.setViewportSize({ width: 1366, height: 900 });
    chk("S7 burger opens+closes", b1 === true && b2 === false, `${b1}/${b2}`);
    await go("#/privacy", 500);
    const pv = await page.evaluate(() => !document.querySelector("#view-privacy")?.hidden);
    chk("S7 privacy view", pv);

    // ================= S8: PWA offline =================
    try {
      const swReady = await page.evaluate(() => Promise.race([
        navigator.serviceWorker.ready.then(() => true),
        new Promise(r => setTimeout(() => r(false), 8000)),
      ]));
      chk("S8 service worker ready", swReady === true, "not ready");
      await page.waitForFunction(() => !!navigator.serviceWorker.controller, { timeout: 8000 }).catch(() => {});
      await page.reload({ waitUntil: "domcontentloaded" });
      await sleep(1500);
      offlinePhase = true;
      await ctx.setOffline(true);
      await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {});
      await sleep(1800);
      const off = await page.evaluate(() => ({
        home: !document.querySelector("#view-home")?.hidden,
        title: document.title,
        sw: !!navigator.serviceWorker.controller,
      }));
      offlinePhase = false;
      chk("S8 offline home loads (SW)", off.home && off.sw, JSON.stringify(off));
      offlinePhase = true;
      await page.evaluate(() => { location.hash = "#/tool/tasbeeh"; });
      await sleep(1500);
      const offT = await page.evaluate(() => (document.getElementById("toolMount")?.textContent || "").replace(/\s+/g, " ").trim().length);
      offlinePhase = false;
      chk("S8 offline tool works", offT > 30, String(offT));
      await ctx.setOffline(false);
      await sleep(500);
    } catch (e) {
      offlinePhase = false;
      chk("S8 offline", false, String(e && e.message ? e.message : e).slice(0, 140));
      try { await ctx.setOffline(false); } catch {}
    }

    // ================= S9: account + auth + scheduling =================
    try {
      await go("#/account", 900);
      const a1 = await page.evaluate(() => ({
        vis: !document.getElementById("view-account").hidden,
        title: document.title,
        hasQR: typeof QRAuth !== "undefined" && typeof QRPublish !== "undefined",
        login: !!document.getElementById("acctMagic"),
        chans: document.querySelectorAll(".chan-card").length,
        auto: !!document.getElementById("autoOn"),
        plans: document.querySelectorAll(".plan-card").length,
        qlen: (document.getElementById("acctQueue")?.textContent || "").trim().length,
      }));
      chk("S9 account route renders", a1.vis && String(a1.title).includes("حسابي"), JSON.stringify(a1));
      chk("S9 auth+publish modules", a1.hasQR, "modules missing");
      chk("S9 login card (logged out)", !!a1.login && a1.plans === 3, JSON.stringify(a1));
      chk("S9 channel cards x5", a1.chans === 5, String(a1.chans));
      chk("S9 autopilot card", !!a1.auto, "no autoOn");
      chk("S9 queue empty state", a1.qlen > 5, String(a1.qlen));
      await page.click("#authBtn");
      await sleep(400);
      const modal = await page.evaluate(() => !document.getElementById("loginOverlay").hidden &&
        !!document.getElementById("loginEmail") && !!document.getElementById("loginGoogle"));
      chk("S9 login modal opens", !!modal, "modal not visible");
      await page.click("#loginOverlay .close-x");
      await sleep(250);
      // حارس زر جوجل (المزوّد غير مُفعّل → تنبيه بلا تنقّل)
      await page.click("#acctGoogle");
      await sleep(900);
      const gg = await page.evaluate(() => ({
        url: location.href,
        toast: [...document.querySelectorAll(".toast")].map(t => t.textContent).join(" "),
      }));
      chk("S9 google guard (toast, no redirect)", gg.url.includes("#/account") && (/جوجل|الإعدادات/.test(gg.toast)), JSON.stringify(gg).slice(0, 160));
      // محلل رموز الجلسة: كل أشكال الرابط (مزدوج الـ# / استعلام / بلا رموز)
      const ph = await page.evaluate(() => ({
        a: QRAuth.parseAuthHash("#/account#access_token=AAA&refresh_token=BBB&expires_in=3600&type=magiclink", ""),
        b: QRAuth.parseAuthHash("#/", "?type=magiclink&access_token=CCC&refresh_token=DDD&expires_in=7200"),
        c: QRAuth.parseAuthHash("#/account", ""),
      }));
      chk("S9 auth-hash parser (3 shapes)",
        ph.a && ph.a.access_token === "AAA" && ph.a.refresh_token === "BBB" &&
        ph.b && ph.b.access_token === "CCC" && ph.b.expires_in === "7200" && !ph.c,
        JSON.stringify(ph).slice(0, 180));
      const navAcc = await page.evaluate(() => !!document.querySelector("#mainNav a[href='#/account']"));
      chk("S9 nav link -> account", navAcc === true, "missing nav link");
      const hasSchedBtn = await page.evaluate(() => !!document.getElementById("btnSchedule"));
      chk("S9 schedule button in creator result", !!hasSchedBtn, "btnSchedule missing");
      const foot = await page.evaluate(() => !!document.querySelector('a[href="#/account"]'));
      chk("S9 account link in footer", !!foot, "no footer link");
      if (PROD) {
        const rCron = await page.request.get(BASE + "/api/cron/publish");
        chk("S9 cron unauthorized (401)", rCron.status() === 401, String(rCron.status()));
        const rPub = await page.request.post(BASE + "/api/publish", { data: {} });
        chk("S9 publish unauthorized (401)", rPub.status() === 401, String(rPub.status()));
        const rStart = await page.request.get(BASE + "/api/oauth?op=start&p=youtube&t=invalid", { maxRedirects: 0 });
        const st = rStart.status();
        chk("S9 oauth start rejects guest (401)", st === 401, String(st));
        const rList = await page.request.get(BASE + "/api/social?op=list");
        chk("S9 social list unauthorized (401)", rList.status() === 401, String(rList.status()));
      }
    } catch (e) {
      chk("S9 account section", false, String(e && e.message ? e.message : e).slice(0, 140));
    }

    console.log("WARNINGS:", warnings.length, warnings.join(" | ") || "-");
    console.log("==== ERRORS (" + errs.length + ") ====");
    if (errs.length) console.log(errs.map(e => " - " + e).join("\n"));
    await browser.close();
    process.exit(errs.length ? 1 : 0);
  } catch (e) {
    console.error("FATAL:", e && e.message ? e.message.slice(0, 500) : e);
    try { await browser.close(); } catch {}
    process.exit(2);
  }
})();
