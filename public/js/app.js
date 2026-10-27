/* ============================================================
   قرآن ريلز — تشغيل التطبيق والتنقل
   ============================================================ */

/* ---------- أدوات الصفحة الرئيسية ---------- */
function toolCardHTML(t) {
  return `<a class="tool-card" href="#/tool/${t.id}">
    <span class="t-ic">${t.ic}</span>
    <h3>${esc(t.n)}</h3>
    <p>${esc(t.d)}</p>
  </a>`;
}

function renderHomeTools() {
  const wrap = $("#homeTools");
  if (!wrap) return;
  wrap.innerHTML = TOOLS.slice(0, 12).map(toolCardHTML).join("");
}

function renderAllTools(filter = "") {
  const wrap = $("#toolsGridAll");
  if (!wrap) return;
  const q = normAr(filter);
  const list = TOOLS.filter(t => !q || normAr(t.n).includes(q) || normAr(t.d).includes(q) || t.id.includes(q));
  wrap.innerHTML = list.map(toolCardHTML).join("");
  $("#toolsEmpty").hidden = list.length > 0;
}

/* ---------- الأسئلة الشائعة ---------- */
function renderFaq() {
  const wrap = $("#faqList");
  if (!wrap) return;
  wrap.innerHTML = FAQ.map(([q, a]) => `
    <div class="faq-item">
      <button class="faq-q">${esc(q)} <span class="caret">▼</span></button>
      <div class="faq-a"><div>${esc(a)}</div></div>
    </div>`).join("");
  accordionify(wrap);
}

/* ---------- آية اليوم ---------- */
function renderVerseOfDay() {
  const v = dailyAyah(0);
  $("#vodAyah").textContent = "﴿ " + v.text + " ﴾";
  $("#vodSrc").textContent = `سورة ${v.surah} — آية ${toAr(v.a)}`;
  $("#vodBtn").onclick = () => {
    if (!Quran.data) { toast("جارٍ تحميل المصحف…"); return; }
    Creator.setSelection(v.s, v.a, v.a, true);
    $("#create").scrollIntoView({ behavior: "smooth" });
    toast("تم اختيار آية اليوم — عدّلها كما تشاء ✓");
  };
  $("#vodCopy").onclick = async () => {
    try { await navigator.clipboard.writeText(`﴿${v.text}﴾\nسورة ${v.surah} — آية ${v.a}`); toast("تم نسخ الآية ✓"); }
    catch { toast("تعذّر النسخ", "err"); }
  };
}

/* ---------- روابط داخلية تمرّر للقسم ---------- */
function wireAnchor(id, targetId) {
  const b = document.getElementById(id);
  if (!b) return;
  b.addEventListener("click", e => {
    e.preventDefault();
    const scroll = () => document.getElementById(targetId)?.scrollIntoView({ behavior: "smooth", block: "start" });
    if (!$("#view-home").hidden) scroll();
    else {
      location.hash = "#/";
      setTimeout(scroll, 120);
    }
  });
}

/* ---------- صفحة الأداة ---------- */
/* تنفيذات الأدوات (a/b/c) تُجلب عند أول فتح أداة — تسريع الإقلاع، ومقتناة مسبقًا في SHELL للأوفلاين */
let _toolImplsP = null;
function ensureToolImpls() {
  if (!_toolImplsP) {
    _toolImplsP = Promise.all(
      ["js/tools-a.js?v=3", "js/tools-b.js?v=3", "js/tools-c.js?v=3"].map(src =>
        new Promise((res, rej) => {
          const sc = document.createElement("script");
          sc.src = src; sc.onload = res; sc.onerror = () => rej(new Error(src));
          document.head.appendChild(sc);
        })
      )
    ).catch(e => { console.error("tool impls", e); });
  }
  return _toolImplsP;
}

async function mountTool(id) {
  await ensureToolImpls();
  const def = ToolRegistry[id];
  const mount = $("#toolMount");
  mount.innerHTML = "";
  if (!def) {
    mount.innerHTML = `<div class="loading-line">الأداة غير موجودة — <a class="gold" href="#/tools">عودة للأدوات</a></div>`;
    return;
  }
  document.title = `${def.name} — قرآن ريلز`;
  const holder = el("div");
  mount.appendChild(holder);
  try {
    await def.render(holder);
    wireCommon(holder);
  } catch (e) {
    console.error("tool error", id, e);
    holder.innerHTML = `<div class="loading-line">حدث خطأ أثناء فتح الأداة — حاول مجددًا</div>`;
  }
}

/* ---------- الإقلاع ---------- */
document.addEventListener("DOMContentLoaded", async () => {
  // السنة
  $("#year").textContent = new Date().getFullYear();
  $("#statReciters").textContent = toAr(RECITERS.length);

  // القائمة الجوّالة
  $("#burger").addEventListener("click", () => $("#mainNav").classList.toggle("open"));
  $("#mainNav")?.addEventListener("click", e => { if (e.target.closest("a")) $("#mainNav").classList.remove("open"); });
  document.addEventListener("click", e => {
    if (!e.target.closest("#mainNav") && !e.target.closest("#burger")) $("#mainNav")?.classList.remove("open");
  });

  // الكوكيز
  if (!store.get("cookieOk")) {
    $("#cookieBar").hidden = false;
    $("#cookieOk").addEventListener("click", () => { store.set("cookieOk", 1); $("#cookieBar").hidden = true; });
  }

  // روابط التمرير
  wireAnchor("navCreate", "create");
  wireAnchor("navCta", "create");
  wireAnchor("heroCreate", "create");
  wireAnchor("navSteps", "steps");
  wireAnchor("navFaq", "faq");
  wireAnchor("footCreate", "create");

  // شبكات الأدوات
  renderHomeTools();
  renderAllTools();
  renderFaq();
  attachSearch($("#toolsSearch"), v => v, renderAllTools);

  // المسارات
  Router.on("tools", () => {
    document.title = "الأدوات الإسلامية — قرآن ريلز";
    renderAllTools($("#toolsSearch").value);
  });
  Router.on("tool", id => mountTool(id.split("?")[0]));
  Router.on("home", () => {
    document.title = "قرآن ريلز — صانع فيديو قرآن مجاني فوري | بدون انتظار وبدون حدود";
    handlePending();
  });
  Router.on("account", () => {
    document.title = "حسابي والنشر التلقائي — قرآن ريلز";
    if (typeof QRPublish !== "undefined") QRPublish.refreshAccount();
  });
  Router.start();

  // المصادقة + واجهة الحساب
  if (typeof QRAuth !== "undefined") {
    QRAuth.on(u => {
      const b = $("#authBtn");
      if (b) b.textContent = u ? "🟢 حسابي" : "🔑 دخول";
      if (u && typeof QRPublish !== "undefined" && !window._authBooted) QRPublish.afterLogin();
    });
    QRAuth.boot();
    window._authBooted = true;
    if (typeof QRPublish !== "undefined") QRPublish.wireGlobals();
  }

  // تهيئة الصانع
  try {
    await Creator.init();
    renderVerseOfDay();
    applyDeepLink();
    handlePending();
  } catch (e) {
    console.error("creator init", e);
    toast("تعذّر تحميل النص القرآني — حدّث الصفحة", "err");
  }
});

/* ---------- طلبات قادمة من الأدوات ---------- */
/* روابط مسبقة التعبئة (MCP/عميق): /?s=18&from=1&to=5 — تفتح الصانع على النطاق */
function applyDeepLink() {
  try {
    const q = new URLSearchParams(location.search);
    if (!q.has("s") && !q.has("surah")) return;
    const s = parseInt(q.get("s") || q.get("surah"), 10);
    if (!(s >= 1 && s <= 114)) return;
    const from = parseInt(q.get("from") || q.get("a"), 10) || 1;
    const to = parseInt(q.get("to"), 10) || from;
    sessionStorage.setItem("qr_pending_reel", JSON.stringify({ s, a: from, from, to }));
  } catch {}
}

function handlePending() {
  const ready = typeof Creator !== "undefined" && Creator.ready && typeof Quran !== "undefined" && !!Quran.data;
  const onHome = () => !$("#view-home").hidden;
  const reel = sessionStorage.getItem("qr_pending_reel");
  if (reel) {
    if (!ready) return; // يُستهلك بعد اكتمال تهيئة الصانع
    sessionStorage.removeItem("qr_pending_reel");
    try {
      const { s, a, from, to } = JSON.parse(reel);
      Creator.setSelection(s, from || a, to || a, true);
      if (onHome()) setTimeout(() => {
        document.getElementById("create")?.scrollIntoView({ behavior: "smooth" });
        toast("تم تجهيز الآية في الصانع 🎬");
      }, 250);
    } catch {}
  }
  const q = sessionStorage.getItem("qr_pending_search");
  if (q && onHome()) {
    sessionStorage.removeItem("qr_pending_search");
    sessionStorage.setItem("qr_topics_q", q);
    setTimeout(() => Router.go("#/tool/topics"), 250);
  }
}

/* ---------- زر تثبيت التطبيق (PWA) ---------- */
let deferredInstall = null;
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredInstall = e;
  const b = document.getElementById("installBtn");
  if (b) b.classList.remove("hidden");
});
window.addEventListener("appinstalled", () => {
  deferredInstall = null;
  const b = document.getElementById("installBtn");
  if (b) b.classList.add("hidden");
});
const _ibtn = document.getElementById("installBtn");
if (_ibtn) _ibtn.addEventListener("click", async () => {
  const ev = deferredInstall;
  if (!ev || typeof ev.prompt !== "function") return;
  deferredInstall = null;
  try { await ev.prompt(); } catch {}
});

/* ---------- PWA: تسجيل عامل الخدمة للعمل دون إنترنت ---------- */
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}
