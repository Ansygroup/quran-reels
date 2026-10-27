/* ============================================================
   قرآن ريلز — إطار الأدوات: التسجيل والتنقل والمكوّنات المشتركة
   ============================================================ */
const ToolRegistry = {};

function registerTool(id, def) { ToolRegistry[id] = def; return def; }

/* ---------- مكوّن مشترك: هيكل الأداة ---------- */
function toolShell({ icon, name, desc, body = "" }) {
  const root = el("div");
  root.innerHTML = `
    <div class="tool-head">
      <div class="t-big-ic">${icon}</div>
      <div><h2>${esc(name)}</h2><p>${esc(desc)}</p></div>
    </div>
    <div class="tool-body" data-body>${body}</div>`;
  return root;
}

/* ---------- بحث عام في قائمة ---------- */
function attachSearch(input, itemsFn, renderFn) {
  let tmr = 0;
  input.addEventListener("input", () => {
    clearTimeout(tmr);
    tmr = setTimeout(() => renderFn(itemsFn(input.value.trim())), 160);
  });
}

/* ---------- نص آية جاهز ---------- */
function ayahBlock(s, a, opts = {}) {
  if (!Quran.data) return `<div class="loading-line"><span class="spin"></span> جارٍ تحميل النص…</div>`;
  const text = Quran.ayah(s, a);
  return `<div class="quran-text">${esc(text)}<span class="ayah-num">${toAr(a)}</span></div>
    <div class="row between" style="margin-top:8px">
      <span class="muted" style="font-size:.8rem">${esc(ayahRef(s, a))}</span>
      <span class="row" style="gap:6px">
        ${opts.noCopy ? "" : `<button class="btn btn-ghost btn-sm" data-copy="${esc(text)}">📋 نسخ</button>`}
        <a class="btn btn-soft btn-sm" href="#/" data-reel="${s}:${a}">🎬 صنِّع ريلز</a>
      </span>
    </div>`;
}

/* تفعيل أزرار النسخ والريلز داخل أي حاوية */
function wireCommon(root) {
  root.addEventListener("click", async e => {
    const cp = e.target.closest("[data-copy]");
    if (cp) {
      try { await navigator.clipboard.writeText(cp.dataset.copy); toast("تم النسخ ✓"); }
      catch { toast("تعذّر النسخ", "err"); }
      return;
    }
    const rl = e.target.closest("[data-reel]");
    if (rl) {
      const raw = rl.dataset.reel || "";
      if (!raw.includes(":")) return; // زر بمعالج خاص (مثل آية اليوم)
      const [s, a] = raw.split(":").map(Number);
      if (!s || !a) return;
      sessionStorage.setItem("qr_pending_reel", JSON.stringify({ s, a }));
      Router.go("#/");
    }
  });
}

/* ---------- إعدادات الصلاة/الموقع المشتركة ---------- */
const PraySettings = {
  async get() {
    let s = store.get("praySet");
    if (s && typeof s.lat === "number") return s;
    const loc = await detectLocation();
    s = {
      lat: loc.lat, lng: loc.lng, tz: loc.tz, n: loc.n || "موقعك",
      method: store.get("prayMethod", "UmmAlQura"),
      asr: store.get("asrMethod", "standard"),
    };
    store.set("praySet", s);
    return s;
  },
  async set(patch) {
    const s = await this.get();
    Object.assign(s, patch);
    store.set("praySet", s);
    if (patch.method) store.set("prayMethod", patch.method);
    if (patch.asr) store.set("asrMethod", patch.asr);
    return s;
  },
  async reset() {
    store.del("praySet");
    return this.get();
  },

  /** لوحة إعدادات location/method/asr — تعيد عنصر DOM */
  ui(onChange) {
    const wrap = el("div", { class: "panel", style: "padding:14px 16px;margin-bottom:16px" });
    wrap.innerHTML = `
      <div class="row-2" style="margin-bottom:10px">
        <div class="field" style="margin:0">
          <div class="label"><b>الطريقة (زاوية الفجر)</b></div>
          <select class="select" data-method>${Object.entries(PRAY_METHODS).map(([k, v]) => `<option value="${k}">${esc(v.n)}</option>`).join("")}</select>
        </div>
        <div class="field" style="margin:0">
          <div class="label"><b>مذهب العصر</b></div>
          <select class="select" data-asr>
            <option value="standard">الجمهور (شافعي/مالكي/حنبلي)</option>
            <option value="hanafi">الحنفي</option>
          </select>
        </div>
      </div>
      <div class="row" style="gap:8px">
        <button class="btn btn-em btn-sm" data-geo>📍 استخدم موقعي</button>
        <select class="select" data-city style="max-width:230px;padding:7px 12px">
          <option value="">— أو اختر مدينة —</option>
          ${CITIES.map((c, i) => `<option value="${i}">${esc(c.n)}</option>`).join("")}
        </select>
        <span class="muted" style="font-size:.8rem" data-loclabel></span>
      </div>`;

    (async () => {
      const s = await this.get();
      wrap.querySelector("[data-method]").value = s.method;
      wrap.querySelector("[data-asr]").value = s.asr;
      wrap.querySelector("[data-loclabel]").textContent = `🌐 ${s.n} (${s.lat.toFixed(2)}, ${s.lng.toFixed(2)})`;

      wrap.querySelector("[data-method]").addEventListener("change", async e => {
        await this.set({ method: e.target.value }); onChange && onChange(await this.get());
      });
      wrap.querySelector("[data-asr]").addEventListener("change", async e => {
        await this.set({ asr: e.target.value }); onChange && onChange(await this.get());
      });
      wrap.querySelector("[data-geo]").addEventListener("click", async () => {
        store.del("loc"); store.del("praySet");
        const loc = await detectLocation();
        await this.reset();
        toast("تم تحديد الموقع ✓");
        onChange && onChange(await this.get());
        wrap.querySelector("[data-loclabel]").textContent = `🌐 ${(await this.get()).n}`;
      });
      wrap.querySelector("[data-city]").addEventListener("change", async e => {
        const c = CITIES[+e.target.value];
        if (!c) return;
        await this.set({ lat: c.lat, lng: c.lng, tz: c.tz, n: c.n });
        store.set("loc", { lat: c.lat, lng: c.lng, tz: c.tz, n: c.n });
        wrap.querySelector("[data-loclabel]").textContent = `🌐 ${c.n}`;
        onChange && onChange(await this.get());
      });
    })();
    return wrap;
  },
};

/* ---------- دوال مساعدة للأدوات ---------- */
function countdownHTML(target) {
  const diff = target - Date.now();
  if (diff <= 0) return "حان الآن";
  const d = Math.floor(diff / 86400000);
  const h = Math.floor(diff / 3600000) % 24;
  const m = Math.floor(diff / 60000) % 60;
  const s = Math.floor(diff / 1000) % 60;
  if (d > 0) return `${toAr(d)} يومًا و${toAr(h)} ساعة`;
  if (h > 0) return `${toAr(h)} ساعة و${toAr(m)} دقيقة`;
  if (m > 0) return `${toAr(m)} دقيقة و${toAr(s)} ثانية`;
  return `${toAr(s)} ثانية`;
}

function ensureTick(fn, ms = 1000) {
  const id = setInterval(fn, ms);
  const mo = new MutationObserver(() => {
    if (!document.body.contains(document.getElementById("toolMount"))) { clearInterval(id); mo.disconnect(); }
  });
  mo.observe($("#toolMount"), { childList: true });
  return id;
}

function segmentControl(items, active, onPick) {
  const seg = el("div", { class: "seg" });
  items.forEach(it => {
    const b = el("button", { class: it.id === active ? "active" : "" }, it.n);
    b.addEventListener("click", () => {
      $$("button", seg).forEach(x => x.classList.remove("active"));
      b.classList.add("active");
      onPick(it.id);
    });
    seg.appendChild(b);
  });
  return seg;
}
