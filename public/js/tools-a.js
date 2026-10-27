/* ============================================================
   أدوات العبادات والصلاة
   ============================================================ */

/* ---------------- 1) مواقيت الصلاة ---------------- */
registerTool("prayer", {
  name: "مواقيت الصلاة", icon: "🕌", desc: "مواقيت الصلاة الخمسة حسب موقعك وطريقة الحساب المطلوبة",
  render(root) {
    const body = toolShell({ icon: "🕌", ...this });
    root.appendChild(body);
    const mount = body.querySelector("[data-body]");
    let dayOffset = 0;

    const panel = el("div", { class: "panel" });
    mount.appendChild(PraySettings.ui(() => render()));
    mount.appendChild(panel);

    function render() {
      PraySettings.get().then(s => {
        const date = new Date(); date.setDate(date.getDate() + dayOffset);
        const times = timesFor(s, date);
        const hij = hijriParts(date);
        const key = date.toDateString();
        const now = new Date();
        const nowH = nowHoursIn(s.tz);
        // الصلاة القادمة
        let nextK = null;
        if (dayOffset === 0) {
          for (const p of PRAY_KEYS) {
            if (p.k === "sunrise") continue;
            if (times[p.k] > nowH) { nextK = p.k; break; }
          }
          if (!nextK && dayOffset === 0) nextK = "fajr"; // بعد العشاء: الغد فجرًا
          if (!nextK) nextK = "fajr";
        }
        panel.innerHTML = `
          <div class="row between" style="margin-bottom:14px;gap:10px">
            <button class="btn btn-ghost btn-sm" data-day="-1">→ غدًا</button>
            <div class="center">
              <div style="font-weight:800">${date.toLocaleDateString("ar-EG", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</div>
              <div class="muted" style="font-size:.82rem">${esc(hij.raw)} هـ</div>
            </div>
            <button class="btn btn-ghost btn-sm" data-day="1">أمس ←</button>
          </div>
          <div class="ptimes">
            ${PRAY_KEYS.map(p => `
              <div class="ptime-cell ${p.k === nextK ? "next" : (dayOffset === 0 && p.k !== "sunrise" && (times[p.k] % 24) < nowH ? "active" : "")}">
                <div class="p-ic">${p.ic}</div>
                <div class="p-name">${p.n}</div>
                <div class="p-val">${fmtTime(times[p.k])}</div>
              </div>`).join("")}
          </div>
          ${nextK ? `<div class="card" style="margin-top:14px;text-align:center;background:rgba(45,212,160,.07);border-color:rgba(45,212,160,.35)">
            <div class="muted" style="font-size:.85rem">الوقت القادم — ${PRAY_KEYS.find(p => p.k === nextK).n}</div>
            <div style="font-size:1.5rem;font-weight:800;color:var(--emerald)" data-next></div>
          </div>` : ""}
          <div class="row" style="justify-content:center;margin-top:14px;gap:8px">
            <button class="btn btn-soft btn-sm" data-copy="${esc(
              `مواقيت الصلاة ${date.toLocaleDateString("ar-EG")} (${s.n})\n` +
              PRAY_KEYS.map(p => `${p.n}: ${fmtTime(times[p.k])}`).join("\n")
            )}">📋 نسخ المواقيت</button>
          </div>`;

        panel.querySelectorAll("[data-day]").forEach(b => b.addEventListener("click", () => {
          dayOffset += (b.dataset.day === "-1" ? 1 : -1);
          render();
        }));

        const nextEl = panel.querySelector("[data-next]");
        const updateNext = () => {
          if (!nextEl) return;
          const nd = new Date(); const t = timesFor(s, nd);
            const nowFrac = nowHoursIn(s.tz);
            let target = null;
            for (const p of PRAY_KEYS) {
              if (p.k === "sunrise") continue;
              if (t[p.k] > nowFrac) { target = t[p.k]; break; }
            }
            if (target == null) target = t.fajr + 24;
            const nowSec = nowFrac * 3600;
          const diff = Math.max(0, target * 3600 - nowSec);
          const h = Math.floor(diff / 3600), m = Math.floor(diff / 60) % 60, sec = Math.floor(diff) % 60;
          nextEl.textContent = `${toAr(h)}:${toAr(String(m).padStart(2, "0"))}:${toAr(String(sec).padStart(2, "0"))}`;
        };
        updateNext(); ensureTick(updateNext, 1000);
      });
    }
    render();
  },
});

/* ---------------- 2) اتجاه القبلة ---------------- */
registerTool("qibla", {
  name: "اتجاه القبلة", icon: "🧭", desc: "بوصلة القبلة بدقة من موقعك — تعمل ببوصلة الجهاز",
  render(root) {
    const shell = toolShell({ icon: "🧭", ...this, body: `
      <div class="panel">
        <div class="compass-wrap">
          <div class="compass">
            <div class="dir n">ش</div><div class="dir s">ج</div><div class="dir e">ق</div><div class="dir w">غ</div>
            <div class="rose" data-rose>
              <svg viewBox="0 0 100 100" style="width:100%;height:100%">
                <circle cx="50" cy="50" r="47" fill="none" stroke="rgba(230,196,106,.35)" stroke-width=".7" stroke-dasharray="1.5 3.4"/>
                <text x="50" y="9" text-anchor="middle" fill="#e6c46a" font-size="7" font-family="Tajawal">شمال</text>
                <text x="91" y="53" text-anchor="middle" fill="rgba(255,255,255,.55)" font-size="6" font-family="Tajawal">شرق</text>
                <text x="50" y="97" text-anchor="middle" fill="rgba(255,255,255,.55)" font-size="6" font-family="Tajawal">جنوب</text>
                <text x="9" y="53" text-anchor="middle" fill="rgba(255,255,255,.55)" font-size="6" font-family="Tajawal">غرب</text>
              </svg>
            </div>
            <div class="needle" data-needle></div>
            <div class="kaaba">🕋</div>
          </div>
        </div>
        <div class="center" style="margin-top:10px">
          <div style="font-size:1.6rem;font-weight:800;color:var(--gold)" data-qdeg>—</div>
          <div class="muted" data-qinfo>جارٍ تحديد الموقع…</div>
          <div class="hint" data-qhint>📱 ثبّت هاتفك أفقيًا واضغط «تفعيل البوصلة»</div>
          <div class="row" style="justify-content:center;margin-top:12px;gap:8px">
            <button class="btn btn-gold btn-sm" data-compass>📱 تفعيل بوصلة الجهاز</button>
          </div>
        </div>
      </div>` });
    root.appendChild(shell);
    const $s = sel => shell.querySelector(sel);
    let heading = 0, qib = 0;

    const paint = () => {
      $s("[data-needle]").style.transform = `translate(-50%,-100%) rotate(${qib - heading}deg)`;
      $s("[data-rose]").style.transform = `rotate(${-heading}deg)`;
      $s("[data-qdeg]").textContent = `${qib.toFixed(1)}° من الشمال`;
    };

    PraySettings.get().then(s => {
      qib = qiblaBearing(s.lat, s.lng);
      const dist = kaabaDistance(s.lat, s.lng);
      $s("[data-qinfo]").innerHTML = `من ${esc(s.n)} — المسافة إلى الكعبة ≈ ${toAr(dist.toLocaleString("en"))} كم`;
      paint();
    });
    mountUI();
    function mountUI() {
      const ui = PraySettings.ui(async () => {
        const s = await PraySettings.get();
        qib = qiblaBearing(s.lat, s.lng);
        $s("[data-qinfo]").innerHTML = `من ${esc(s.n)} — المسافة ≈ ${toAr(kaabaDistance(s.lat, s.lng).toLocaleString("en"))} كم`;
        paint();
      });
      shell.querySelector("[data-body]").prepend(ui);
    }

    const onOrient = e => {
      let hd = null;
      if (typeof e.webkitCompassHeading === "number") hd = e.webkitCompassHeading;
      else if (e.alpha != null) hd = e.absolute === false || e.absolute == null ? 360 - e.alpha : 360 - e.alpha;
      if (hd == null) return;
      heading = hd;
      paint();
      const acc = e.webkitCompassAccuracy;
      $s("[data-qhint]").textContent = acc && acc > 20 ? "🧲 حرّك الجهاز على شكل ٨ لمعايرة البوصلة" : "ضع الهاتف أفقيًا — الإبرة تشير إلى اتجاه القبلة ✓";
    };
    $s("[data-compass]").addEventListener("click", async () => {
      try {
        if (typeof DeviceOrientationEvent !== "undefined" && DeviceOrientationEvent.requestPermission) {
          const p = await DeviceOrientationEvent.requestPermission();
          if (p !== "granted") { toast("لم يُسمح باستخدام البوصلة", "err"); return; }
        }
        window.addEventListener("deviceorientationabsolute", onOrient, true);
        window.addEventListener("deviceorientation", onOrient, true);
        toast("تم تفعيل البوصلة — حرّك هاتفك ببطء");
        $s("[data-qhint]").textContent = "🕐 بانتظار قراءة البوصلة… (إن لم تتحرك جرّب الخروج والدخول مجددًا)";
      } catch {
        toast("البوصلة غير متاحة على هذا الجهاز", "err");
      }
    });
  },
});

/* ---------------- 3) التاريخ الهجري ---------------- */
registerTool("hijri", {
  name: "التاريخ الهجري", icon: "📅", desc: "محوّل هجري ↔ ميلادي مع تاريخ اليوم",
  render(root) {
    const shell = toolShell({ icon: "📅", ...this, body: `
      <div class="tool-body two">
        <div class="panel">
          <div class="panel-title"><span class="ic">📅</span> تاريخ اليوم</div>
          <div class="center">
            <div style="font-size:1.7rem;font-weight:800;color:var(--gold)" data-today>…</div>
            <div class="muted" data-todayg style="margin-top:6px"></div>
          </div>
          <div class="divider" style="margin:16px 0;border-top:1px dashed rgba(255,255,255,.1)"></div>
          <div class="field">
            <div class="label"><b>ميلادي ← هجري</b></div>
            <input class="input" type="date" data-gdate>
            <div class="hint" data-gout>—</div>
          </div>
        </div>
        <div class="panel">
          <div class="panel-title"><span class="ic">🌙</span> هجري ← ميلادي</div>
          <div class="row-3">
            <div class="field"><div class="label"><b>اليوم</b></div><input class="input" type="number" min="1" max="30" value="1" data-hd></div>
            <div class="field"><div class="label"><b>الشهر</b></div><select class="select" data-hm>${HIJRI_MONTHS.map((m, i) => `<option value="${i + 1}">${m}</option>`).join("")}</select></div>
            <div class="field"><div class="label"><b>السنة</b></div><input class="input" type="number" min="1400" max="1600" value="1447" data-hy></div>
          </div>
          <button class="btn btn-gold btn-block" data-hgo>حوّل ←</button>
          <div class="hint" data-hout style="margin-top:10px">—</div>
        </div>
      </div>
      <div class="panel">
        <div class="panel-title"><span class="ic">🗓️</span> مناسبات قريبة</div>
        <div class="grid-cards" data-events></div>
      </div>` });
    root.appendChild(shell);
    const $s = sel => shell.querySelector(sel);

    const t = hijriParts();
    $s("[data-today]").textContent = hijriLabel(t);
    $s("[data-todayg]").textContent = new Date().toLocaleDateString("ar-EG", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
    $s("[data-gdate]").valueAsDate = new Date();
    const updG = () => {
      const v = $s("[data-gdate]").value;
      if (!v) return;
      const d = new Date(v + "T12:00:00");
      const h = hijriParts(d);
      $s("[data-gout]").innerHTML = `<b class="gold">🌙 ${esc(hijriLabel(h))}</b> — ${esc(d.toLocaleDateString("ar-EG", { weekday: "long", day: "numeric", month: "long", year: "numeric" }))}`;
    };
    updG();
    $s("[data-gdate]").addEventListener("change", updG);
    $s("[data-hgo]").addEventListener("click", () => {
      const d = +$s("[data-hd]").value, m = +$s("[data-hm]").value, y = +$s("[data-hy]").value;
      if (!d || !m || !y) return;
      const g = hijriToGreg(y, m, d);
      $s("[data-hout]").innerHTML = g
        ? `<b class="gold">${g.toLocaleDateString("ar-EG", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</b> م`
        : "لم يتم العثور على هذا التاريخ ضمن العامين القادمين — تحقق من الأرقام";
    });
    // مناسبات قادمة
    const evWrap = $s("[data-events]");
    const now = new Date();
    const items = [];
    for (let yi = 0; yi < 2; yi++) {
      for (const ev of ISLAMIC_EVENTS) {
        const g = hijriToGreg(1447 + yi + (1448 - 1447), ev.m, ev.d);
        if (g && g >= new Date(now.getFullYear(), now.getMonth(), now.getDate())) items.push({ ...ev, g });
      }
    }
    items.sort((a, b) => a.g - b.g);
    items.slice(0, 6).forEach(ev => {
      const days = Math.ceil((ev.g - now) / 86400000);
      evWrap.appendChild(el("div", { class: "mini-card" },
        `<div class="m-title">${esc(ev.n)}</div>
         <div class="m-sub">${ev.g.toLocaleDateString("ar-EG", { day: "numeric", month: "long", year: "numeric" })} م</div>
         <span class="badge ${days <= 30 ? "ok" : "info"}" style="margin-top:6px">${days === 0 ? "اليوم!" : "بعد " + toAr(days) + " يومًا"}</span>`));
    });
  },
});

/* ---------------- أذكار (بيانات مشتركة) ---------------- */
const AdhkarData = {
  _p: null,
  load() {
    if (this._p) return this._p;
    this._p = fetch("data/adhkar.json").then(r => r.json());
    return this._p;
  },
  progressKey() {
    const d = new Date();
    return `adhkar_${d.getFullYear()}_${d.getMonth()}_${d.getDate()}`;
  },
};

function adhkarCounterUI(items, wrap) {
  // items: [{id,text,count,cat}]
  const prog = store.get(AdhkarData.progressKey(), {});
  items.forEach((it, ix) => {
    const key = it.cat + "#" + (it.ox ?? ix);
    let left = (prog[key] ?? it.count);
    const card = el("div", { class: "list-card" });
    card.innerHTML = `
      <div class="lc-head">
        <div class="quran-text" style="font-size:1.15rem;line-height:2.05;flex:1">${esc(it.text)}</div>
      </div>
      <div class="row between" style="margin-top:8px">
        <span class="count-badge" data-left>${toAr(left)} من ${toAr(it.count)}</span>
        <div class="row" style="gap:6px">
          <button class="btn btn-ghost btn-sm" data-copy="${esc(it.text)}">📋 نسخ</button>
          <button class="btn btn-soft btn-sm" data-tap>${left === 0 ? "✓ تم" : "تسبيح 👆"}</button>
        </div>
      </div>
      <div class="progress" style="height:5px;margin:10px 0 0"><i style="width:${((it.count - left) / it.count) * 100}%;background:var(--grad-em)"></i></div>`;
    const leftEl = card.querySelector("[data-left]");
    const bar = card.querySelector(".progress i");
    const tapBtn = card.querySelector("[data-tap]");
    tapBtn.addEventListener("click", () => {
      if (left <= 0) { toast("تم هذا الذكر ✓"); return; }
      left--;
      prog[key] = left;
      store.set(AdhkarData.progressKey(), prog);
      leftEl.textContent = `${toAr(left)} من ${toAr(it.count)}`;
      bar.style.width = `${((it.count - left) / it.count) * 100}%`;
      tapBtn.textContent = left === 0 ? "✓ تم" : "تسبيح 👆";
      card.classList.remove("flash"); void card.offsetWidth; card.classList.add("flash");
      if (left === 0) toast("أتممت الذكر — تقبّل الله ✓");
      updateHeader();
    });
    wrap.appendChild(card);
  });
}

function adhkarHeader(wrap, total, done) {
  const h = el("div", { class: "row between", style: "margin-bottom:14px" });
  h.innerHTML = `<span class="progress-badge" data-hp>${toAr(done)}/${toAr(total)} مكتمل اليوم</span>
    <button class="btn btn-ghost btn-sm" data-reset>إعادة تعيين اليوم</button>`;
  wrap.prepend(h);
  h.querySelector("[data-reset]").addEventListener("click", () => {
    store.del(AdhkarData.progressKey());
    location.reload();
  });
  return h;
}
function updateHeader() { /* يُحدَّث تلقائيًا عبر العناصر */ }

/* ---------------- 4) أذكار الصباح والمساء ---------------- */
registerTool("adhkar", {
  name: "أذكار الصباح والمساء", icon: "🌅", desc: "حصن المسلم اليومية بعدّاد تفاعلي يحفظ تقدّمك",
  async render(root) {
    const shell = toolShell({ icon: "🌅", ...this, body: `
      <div class="chips" data-cats style="margin-bottom:14px"></div>
      <div class="row between" style="margin-bottom:12px">
        <input class="input" data-q placeholder="ابحث في الأذكار…" style="max-width:340px">
        <span class="progress-badge" data-hp></span>
      </div>
      <div data-list></div>` });
    root.appendChild(shell);
    const $s = sel => shell.querySelector(sel);
    const all = await AdhkarData.load();

    const QUICK_CATS = [
      "أذكار الصباح والمساء", "أذكار النوم", "أذكار الاستيقاظ من النوم",
      "الذكر قبل الوضوء", "الذكر بعد الفراغ من الوضوء", "دعاء دخول المسجد",
      "الدعاء بعد السلام من الصلاة", "دعاء الهم والحزن", "دعاء الكرب",
      "دعاء السفر", "الدعاء عند إفطار الصائم", "الاستغفار و التوبة",
    ];
    const cats = QUICK_CATS.filter(c => all.some(x => x.category === c));
    let activeCat = cats[0];
    let q = "";

    const catsWrap = $s("[data-cats]");
    const listWrap = $s("[data-list]");

    const flat = () => {
      if (q) {
        const nq = normAr(q);
        return all.flatMap(c => c.array.map((a, ix) => ({ ...a, cat: c.category, ox: ix })))
          .filter(x => normAr(x.text).includes(nq) || normAr(x.cat).includes(nq))
          .slice(0, 60);
      }
      const c = all.find(c => c.category === activeCat);
      return c ? c.array.map((a, ix) => ({ ...a, cat: c.category, ox: ix })) : [];
    };

    const paintCats = () => {
      catsWrap.innerHTML = "";
      cats.forEach(c => {
        const b = el("button", { class: "chip" + (c === activeCat ? " active" : "") }, c);
        b.addEventListener("click", () => { activeCat = c; q = ""; $s("[data-q]").value = ""; paintCats(); paintList(); });
        catsWrap.appendChild(b);
      });
    };
    const paintList = () => {
      const items = flat();
      listWrap.innerHTML = "";
      if (!items.length) { listWrap.innerHTML = `<div class="loading-line">لا نتائج</div>`; return; }
      const prog = store.get(AdhkarData.progressKey(), {});
      const doneN = items.filter(it => (prog[it.cat + "#" + it.ox] ?? it.count) === 0).length;
      $s("[data-hp]").textContent = `${toAr(doneN)}/${toAr(items.length)} مكتمل اليوم`;
      adhkarCounterUI(items, listWrap);
    };
    $s("[data-q]").addEventListener("input", e => {
      q = e.target.value.trim();
      if (q) { activeCat = cats[0]; paintCats(); }
      paintList();
    });
    paintCats(); paintList();
    wireCommon(shell);
  },
});

/* ---------------- 5) المسبحة الإلكترونية ---------------- */
registerTool("tasbeeh", {
  name: "المسبحة الإلكترونية", icon: "📿", desc: "عدّاد التسبيح بأهداف وأصوات اهتزازية",
  render(root) {
    const PRESETS = [
      { n: "سُبْحَانَ اللَّه", t: 33 }, { n: "الْحَمْدُ لِلَّه", t: 33 },
      { n: "اللَّهُ أَكْبَر", t: 34 }, { n: "لَا إِلَهَ إِلَّا اللَّه", t: 100 },
      { n: "أَسْتَغْفِرُ اللَّه", t: 100 }, { n: "اللَّهُمَّ صَلِّ عَلَى مُحَمَّد", t: 100 },
      { n: "سُبْحَانَ اللَّهِ وَبِحَمْدِه", t: 100 }, { n: "لَا حَوْلَ وَلَا قُوَّةَ إِلَّا بِاللَّه", t: 100 },
    ];
    const shell = toolShell({ icon: "📿", ...this, body: `
      <div class="tool-body two">
        <div class="panel center">
          <div class="chips" data-preset style="justify-content:center;margin-bottom:16px"></div>
          <div class="tap-area" data-tap>
            <div class="muted" data-dhikr style="font-family:var(--font-quran);font-size:1.5rem;color:var(--gold-3);margin-bottom:6px">سُبْحَانَ اللَّه</div>
            <div class="tap-count" data-count>0</div>
            <div class="tap-goal">الهدف: <span data-goal>33</span> — اضغط للتسبيح</div>
          </div>
          <div class="row" style="justify-content:center;margin-top:14px;gap:8px">
            <button class="btn btn-ghost btn-sm" data-reset>تصفير</button>
            <button class="btn btn-soft btn-sm" data-custom>🎯 هدف مخصص</button>
          </div>
          <div class="progress" style="margin-top:14px"><i data-bar style="width:0%"></i></div>
        </div>
        <div class="panel">
          <div class="panel-title"><span class="ic">📊</span> إحصاءاتك</div>
          <table class="tbl">
            <tr><td>الدورة الحالية</td><td class="gold" data-cyc>0</td></tr>
            <tr><td>إجمالي التسبيحات اليوم</td><td class="gold" data-today>0</td></tr>
            <tr><td>الإجمالي الكلي (محفوظ على جهازك)</td><td class="gold" data-ever>0</td></tr>
            <tr><td>الأشواط المكتملة اليوم</td><td class="gold" data-laps>0</td></tr>
          </table>
          <div class="hint" style="margin-top:12px">🤲 «كلمتان خفيفتان على اللسان، ثقيلتان في الميزان: سبحان الله وبحمده، سبحان الله العظيم»</div>
          <div class="switch-row" style="margin-top:8px">
            <div class="t">اهتزاز عند كل تسبيح<small>على الأجهزة الداعمة</small></div>
            <label class="switch"><input type="checkbox" data-haptic checked><i></i></label>
          </div>
        </div>
      </div>` });
    root.appendChild(shell);
    const $s = sel => shell.querySelector(sel);

    let count = 0, goal = 33, dhikr = PRESETS[0].n;
    const dayKey = "tasbeeh_" + new Date().toDateString();
    const stats = store.get(dayKey, { today: 0, laps: 0 });

    const paint = () => {
      $s("[data-count]").textContent = toAr(count);
      $s("[data-goal]").textContent = toAr(goal);
      $s("[data-dhikr]").textContent = dhikr;
      $s("[data-bar]").style.width = Math.min(100, (count / goal) * 100) + "%";
      $s("[data-cyc]").textContent = toAr(count);
      $s("[data-today]").textContent = toAr(stats.today);
      $s("[data-laps]").textContent = toAr(stats.laps);
      $s("[data-ever]").textContent = toAr(store.get("tasbeehEver", 0));
    };
    const pw = $s("[data-preset]");
    PRESETS.forEach((p, i) => {
      const b = el("button", { class: "chip" + (i === 0 ? " active" : "") }, p.n.length > 22 ? p.n.slice(0, 20) + "…" : p.n);
      b.title = p.n;
      b.addEventListener("click", () => {
        $$(".chip", pw).forEach(c => c.classList.remove("active"));
        b.classList.add("active");
        dhikr = p.n; goal = p.t; count = 0; paint();
      });
      pw.appendChild(b);
    });
    $s("[data-tap]").addEventListener("click", () => {
      count++; stats.today++;
      store.set("tasbeehEver", store.get("tasbeehEver", 0) + 1);
      if (count >= goal) {
        stats.laps++;
        count = 0;
        toast("أكملت دورة " + toAr(goal) + " — تقبّل الله ✓");
        if (navigator.vibrate) navigator.vibrate([60, 40, 60]);
      } else if ($("[data-haptic]").checked && navigator.vibrate) navigator.vibrate(12);
      store.set(dayKey, stats);
      paint();
      const a = $s("[data-count]"); a.classList.remove("flash"); void a.offsetWidth; a.classList.add("flash");
    });
    $s("[data-reset]").addEventListener("click", () => { count = 0; paint(); });
    $s("[data-custom]").addEventListener("click", () => {
      const v = prompt("الهدف الجديد:", String(goal));
      const n = parseInt(v);
      if (n > 0 && n <= 10000) { goal = n; count = 0; paint(); }
    });
    paint();
  },
});

/* ---------------- 6) أسماء الله الحسنى ---------------- */
registerTool("asma", {
  name: "أسماء الله الحسنى", icon: "✨", desc: "الـ99 اسمًا مع معانيها — اضغط على الاسم لعرض المعنى",
  render(root) {
    const shell = toolShell({ icon: "✨", ...this, body: `
      <div class="row" style="margin-bottom:14px">
        <input class="input" data-q placeholder="ابحث عن اسم أو معنى…" style="max-width:380px">
        <span class="count-badge">${toAr(ASMA.length)} اسمًا</span>
      </div>
      <div class="asma-grid" data-grid></div>
      <div class="center muted" style="margin-top:14px;font-size:.86rem">﴿ وَلِلَّهِ الْأَسْمَاءُ الْحُسْنَىٰ فَادْعُوهُ بِهَا ﴾</div>` });
    root.appendChild(shell);
    const grid = shell.querySelector("[data-grid]");
    const paint = (q = "") => {
      const nq = normAr(q);
      grid.innerHTML = "";
      ASMA.forEach((a, i) => {
        if (nq && !normAr(a[0]).includes(nq) && !normAr(a[1]).includes(nq)) return;
        const c = el("div", { class: "asma-card", title: a[1] },
          `<span class="a-num">${toAr(i + 1)}</span><div class="a-name">${esc(a[0])}</div><div class="a-mean">${esc(a[1])}</div>`);
        c.addEventListener("click", async () => {
          try { await navigator.clipboard.writeText(`${a[0]} — ${a[1]}`); toast("تم نسخ الاسم والمعنى ✓"); } catch {}
        });
        grid.appendChild(c);
      });
      if (!grid.children.length) grid.innerHTML = `<div class="loading-line">لا نتائج</div>`;
    };
    paint();
    attachSearch(shell.querySelector("[data-q]"), v => v, paint);
  },
});

/* ---------------- 7) حصن المسلم (البحث في كل الأذكار) ---------------- */
registerTool("hisn", {
  name: "حصن المسلم", icon: "🛡️", desc: "كل أدعية حصن المسلم مصنّفة وقابلة للبحث والنسخ",
  async render(root) {
    const shell = toolShell({ icon: "🛡️", ...this, body: `
      <div class="row" style="margin-bottom:14px">
        <input class="input" data-q placeholder="ابحث في 130+ فصلًا من حصن المسلم…" style="max-width:420px">
        <span class="count-badge" data-n></span>
      </div>
      <div data-list></div>` });
    root.appendChild(shell);
    const all = await AdhkarData.load();
    shell.querySelector("[data-n]").textContent = toAr(all.length) + " فصلًا";
    const list = shell.querySelector("[data-list]");
    const paint = (q = "") => {
      const nq = normAr(q);
      let items = all;
      if (nq) items = all.filter(c => normAr(c.category).includes(nq) || c.array.some(a => normAr(a.text).includes(nq)));
      list.innerHTML = "";
      if (!items.length) { list.innerHTML = `<div class="loading-line">لا نتائج مطابقة</div>`; return; }
      items.slice(0, 60).forEach(c => {
        const card = el("div", { class: "list-card" });
        card.innerHTML = `
          <div class="lc-head">
            <span class="lc-title">${esc(c.category)}</span>
            <span class="count-badge">${toAr(c.array.length)} أذكار</span>
          </div>
          ${c.array.map(a => `
            <div style="padding:10px 0;border-top:1px dashed rgba(255,255,255,.07)">
              <div class="quran-text" style="font-size:1.1rem">${esc(a.text)}</div>
              <div class="row" style="margin-top:6px;gap:6px">
                ${a.count && a.count > 1 ? `<span class="count-badge">×${toAr(a.count)}</span>` : ""}
                <button class="btn btn-ghost btn-sm" data-copy="${esc(a.text)}">📋 نسخ</button>
                <a class="btn btn-soft btn-sm" href="#/" data-reel-search="${esc(a.text.slice(0, 60))}">🎬 ريلز</a>
              </div>
            </div>`).join("")}`;
        list.appendChild(card);
      });
      if (items.length > 60) list.appendChild(el("div", { class: "center muted", style: "margin-top:14px" }, `عرض ${toAr(60)} من ${toAr(items.length)} — يرجى تضييق البحث`));
    };
    paint();
    attachSearch(shell.querySelector("[data-q]"), v => v, paint);
    shell.addEventListener("click", e => {
      const r = e.target.closest("[data-reel-search]");
      if (r) { sessionStorage.setItem("qr_pending_search", r.dataset.reelSearch); Router.go("#/"); }
    });
    wireCommon(shell);
  },
});

/* ---------------- 8) أدعية مأثورة ---------------- */
registerTool("dua", {
  name: "أدعية مأثورة", icon: "💬", desc: "أدعية قصيرة مختارة من الكتاب والسنة",
  async render(root) {
    const FAV = [
      "دعاء الاستغفار (سيد الاستغفار)", "دعاء الهم والحزن", "دعاء الكرب",
      "دعاء ذي النون", "رب اشرح لي صدرية", "دعاء السفر",
      "دعاء دخول المسجد", "الأذكار بعد السلام من الصلاة", "دعاء صلاة الاستخارة",
      "دعاء قضاء الدين", "دعاء من استصعب عليه أمر", "دعاء المريض",
      "الدعاء لمن قال غفر الله لك", "الدعاء لمن قال إني أحبك في الله",
      "دعاء لقاء العدو و ذي السلطان", "ما يقول من أذنب ذنبا",
      "الدعاء حينما يقع ما لا يرضاه", "دعاء من أصيب بمصيبة",
      "الدعاء للمريض في عيادته", "دعاء الوسوسة في الصلاة و القراءة",
      "الدعاء عند إفطار الصائم", "دعاء قبل الطعام", "دعاء رؤية الهلال",
      "الدعاء لمن بارك لك", "الدعاء لمن صنع إليك معروفا",
    ];
    const shell = toolShell({ icon: "💬", ...this, body: `
      <div class="row" style="margin-bottom:14px">
        <input class="input" data-q placeholder="ابحث عن دعاء…" style="max-width:380px">
      </div>
      <div class="grid-cards" data-grid></div>` });
    root.appendChild(shell);
    const all = await AdhkarData.load();
    const grid = shell.querySelector("[data-grid]");
    const idx = new Map(all.map(c => [c.category.trim(), c]));

    const paint = (q = "") => {
      const nq = normAr(q);
      grid.innerHTML = "";
      let picked = FAV.map(f => idx.get(f)).filter(Boolean);
      if (!picked.length) picked = all.filter(c => c.category.includes("دعاء")).slice(0, 20);
      if (nq) picked = all.filter(c => normAr(c.category).includes(nq) || c.array.some(a => normAr(a.text).includes(nq))).slice(0, 40);
      picked.forEach(c => {
        const card = el("div", { class: "mini-card" });
        card.innerHTML = `<div class="m-title">${esc(c.category)}</div>` +
          c.array.slice(0, 4).map(a => `<div class="quran-text" style="font-size:1.02rem;margin-top:8px">${esc(a.text)}
            <div class="row" style="margin-top:4px">${a.count > 1 ? `<span class="count-badge">×${toAr(a.count)}</span>` : ""}
            <button class="btn btn-ghost btn-sm" data-copy="${esc(a.text)}">📋</button></div></div>`).join("");
        grid.appendChild(card);
      });
      if (!picked.length) grid.innerHTML = `<div class="loading-line">لا نتائج</div>`;
    };
    paint();
    attachSearch(shell.querySelector("[data-q]"), v => v, paint);
    wireCommon(shell);
  },
});

/* ---------------- 9) تعلّم الصلاة ---------------- */
registerTool("pray-learn", {
  name: "تعلّم الصلاة", icon: "🤲", desc: "كيفية الصلاة خطوة بخطوة بالأدعية والأحكام",
  render(root) {
    const shell = toolShell({ icon: "🤲", ...this, body: `<div data-list></div>
      <div class="panel center" style="margin-top:16px">
        <div class="inline-ayah">﴿ إِنَّ الصَّلَاةَ كَانَتْ عَلَى الْمُؤْمِنِينَ كِتَابًا مَوْقُوتًا ﴾</div>
        <div class="hint">الصلاة أول ما يُحاسب عليه العبد يوم القيامة — حافظ عليها بخشوع ✓</div>
      </div>` });
    root.appendChild(shell);
    const list = shell.querySelector("[data-list]");
    PRAY_STEPS.forEach((s, i) => {
      const c = el("div", { class: "list-card" });
      c.innerHTML = `
        <div class="lc-head">
          <div class="row" style="gap:12px">
            <span class="count-badge" style="width:34px;height:34px;display:grid;place-items:center;padding:0">${toAr(i + 1)}</span>
            <div><div class="lc-title">${esc(s.n)}</div><div class="muted" style="font-size:.86rem">${esc(s.d)}</div></div>
          </div>
          <span class="badge ok">المطلوب</span>
        </div>
        <div class="quran-text" style="background:rgba(0,0,0,.25);padding:12px 14px;border-radius:12px;margin-top:10px;font-size:1.2rem">${esc(s.d2)}</div>
        <div class="row" style="margin-top:8px"><button class="btn btn-ghost btn-sm" data-copy="${esc(s.d2)}">📋 نسخ الذكر</button></div>`;
      list.appendChild(c);
    });
    wireCommon(shell);
  },
});

/* ---------------- 10) متتبع الصيام ---------------- */
registerTool("sawm", {
  name: "متتبع الصيام", icon: "🌙", desc: "تابع صيامك اليومي: فرض، نافلة، وقضاء",
  render(root) {
    const shell = toolShell({ icon: "🌙", ...this, body: `
      <div class="tool-body two">
        <div class="panel">
          <div class="panel-title"><span class="ic">📅</span> شهر <span data-month></span></div>
          <div class="chips" data-types style="margin-bottom:12px"></div>
          <div class="cal-grid" data-grid></div>
          <div class="hint">اضغط على اليوم لتبديل حالته: <b>صائم</b> ← <b>أبيض</b> ← <b>قضاء</b> ← <b>فطر/لم أدُم</b></div>
        </div>
        <div class="panel">
          <div class="panel-title"><span class="ic">📊</span> إحصاءات الشهر</div>
          <table class="tbl">
            <tr><td>أيام الصيام الكاملة</td><td class="gold" data-s1>0</td></tr>
            <tr><td>أيام البيض (الاثنين/الخميس/السبت)</td><td class="gold" data-s2>0</td></tr>
            <tr><td>أيام القضاء المنجزة</td><td class="gold" data-s3>0</td></tr>
            <tr><td>إجمالي الأيام المعلّمة</td><td class="gold" data-s4>0</td></tr>
          </table>
          <div class="hint" style="margin-top:14px">🤲 من صام رمضان إيمانًا واحتسابًا غفر له ما تقدم من ذنبه — ومَن صام يومًا في سبيل الله باع الله له به الجنة.</div>
          <button class="btn btn-ghost btn-sm" style="margin-top:14px" data-clear>مسح بيانات الشهر</button>
        </div>
      </div>` });
    root.appendChild(shell);
    const $s = sel => shell.querySelector(sel);
    const now = new Date();
    const key = `sawm_${now.getFullYear()}_${now.getMonth()}`;
    let data = store.get(key, {});
    let mode = "full";
    const MODES = [
      { id: "full", n: "صائم ✓", color: "ok" },
      { id: "white", n: "أبيض", color: "info" },
      { id: "qada", n: "قضاء", color: "warn" },
      { id: "none", n: "—", color: "bad" },
    ];
    $s("[data-month]").textContent = gregMonths[now.getMonth()] + " " + now.getFullYear();
    const typesWrap = $s("[data-types]");
    MODES.forEach((m, i) => {
      const b = el("button", { class: "chip" + (i === 0 ? " active" : "") }, m.n);
      b.addEventListener("click", () => { $$(".chip", typesWrap).forEach(x => x.classList.remove("active")); b.classList.add("active"); mode = m.id; });
      typesWrap.appendChild(b);
    });
    const days = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const paint = () => {
      const grid = $s("[data-grid]");
      grid.innerHTML = "";
      let c1 = 0, c2 = 0, c3 = 0, c4 = 0;
      for (let d = 1; d <= days; d++) {
        const v = data[d];
        const wd = new Date(now.getFullYear(), now.getMonth(), d).getDay();
        const cell = el("div", { class: "cal-cell " + (v === "full" ? "done" : "") + (d === now.getDate() ? " today" : "") },
          `<div class="d">${toAr(d)}</div><div>${v ? (MODES.find(m => m.id === v)?.n || "") : ""}</div>`);
        cell.addEventListener("click", () => {
          data[d] = data[d] === mode ? undefined : mode;
          if (!data[d]) delete data[d];
          store.set(key, data); paint();
        });
        grid.appendChild(cell);
        if (v === "full") c1++;
        if (v === "white") c2++;
        if (v === "qada") c3++;
        if (v) c4++;
      }
      $s("[data-s1]").textContent = toAr(c1);
      $s("[data-s2]").textContent = toAr(c2);
      $s("[data-s3]").textContent = toAr(c3);
      $s("[data-s4]").textContent = toAr(c4);
    };
    paint();
    $s("[data-clear]").addEventListener("click", async () => {
      if (await confirmDialog("مسح البيانات", "سيتم حذف بيانات هذا الشهر بالكامل", "امسح")) { data = {}; store.set(key, data); paint(); }
    });
  },
});

/* ---------------- 11) حاسبة قضاء الصلاة ---------------- */
registerTool("qada", {
  name: "حاسبة قضاء الصلاة", icon: "🕋", desc: "احسب وتابع صلواتك الفائتة وسجل قضائها",
  render(root) {
    const PR = [
      { k: "fajr", n: "الفجر" }, { k: "dhuhr", n: "الظهر" }, { k: "asr", n: "العصر" },
      { k: "maghrib", n: "المغرب" }, { k: "ishaa", n: "العشاء" },
    ];
    const shell = toolShell({ icon: "🕋", ...this, body: `
      <div class="tool-body two">
        <div class="panel">
          <div class="panel-title"><span class="ic">🧮</span> الرصيد الحالي</div>
          <div data-rows></div>
          <div class="row between" style="margin-top:14px;padding-top:12px;border-top:1px dashed rgba(255,255,255,.1)">
            <b>الإجمالي المتبقي</b><b class="gold" style="font-size:1.4rem" data-total>0</b>
          </div>
        </div>
        <div class="panel">
          <div class="panel-title"><span class="ic">✅</span> سجّل قضاءك</div>
          <div class="row-2">
            <div class="field"><div class="label"><b>الصلاة</b></div><select class="select" data-p>${PR.map(p => `<option value="${p.k}">${p.n}</option>`).join("")}</select></div>
            <div class="field"><div class="label"><b>عدد الركعات/الصلوات</b></div><input class="input" type="number" min="1" value="1" data-c></div>
          </div>
          <div class="field"><div class="label"><b>ملاحظة (اختياري)</b></div><input class="input" data-note placeholder="مثال: صيام يوم…" data-x></div>
          <button class="btn btn-em btn-block" data-add>✓ سجّل قضاءًا (يُخصم من الرصيد)</button>
          <div class="panel-title" style="margin-top:18px"><span class="ic">🕘</span> آخر العمليات</div>
          <div data-log></div>
        </div>
      </div>` });
    root.appendChild(shell);
    const $s = sel => shell.querySelector(sel);
    let owed = store.get("qadaOwed", { fajr: 0, dhuhr: 0, asr: 0, maghrib: 0, ishaa: 0 });
    let log = store.get("qadaLog", []);

    const paint = () => {
      const rows = $s("[data-rows]");
      rows.innerHTML = PR.map(p => `
        <div class="switch-row">
          <div class="t">${p.n}<small>متبقي من رصيدك</small></div>
          <div class="row" style="gap:8px">
            <button class="icon-btn" style="width:34px;height:34px" data-m="${p.k}">−</button>
            <b class="gold" style="min-width:34px;text-align:center;font-size:1.15rem">${toAr(owed[p.k] || 0)}</b>
            <button class="icon-btn" style="width:34px;height:34px" data-p2="${p.k}">+</button>
          </div>
        </div>`).join("");
      rows.querySelectorAll("[data-m]").forEach(b => b.addEventListener("click", () => {
        owed[b.dataset.m] = Math.max(0, (owed[b.dataset.m] || 0) - 1); save();
      }));
      rows.querySelectorAll("[data-p2]").forEach(b => b.addEventListener("click", () => {
        owed[b.dataset.p2] = (owed[b.dataset.p2] || 0) + 1; save();
      }));
      $s("[data-total]").textContent = toAr(Object.values(owed).reduce((a, b) => a + b, 0));
      $s("[data-log]").innerHTML = log.length
        ? log.slice(0, 8).map(l => `<div class="row between" style="font-size:.86rem;padding:7px 0;border-bottom:1px dashed rgba(255,255,255,.07)">
            <span>✅ ${esc(l.n)} ×${toAr(l.c)}${l.note ? ` <span class="muted">(${esc(l.note)})</span>` : ""}</span>
            <span class="muted" style="font-size:.76rem">${esc(l.d)}</span></div>`).join("")
        : `<div class="hint">لا عمليات بعد</div>`;
    };
    const save = () => { store.set("qadaOwed", owed); store.set("qadaLog", log); paint(); };
    $s("[data-add]").addEventListener("click", () => {
      const k = $s("[data-p]").value, c = Math.max(1, +$s("[data-c]").value || 1);
      const note = $s("[data-note]").value.trim();
      owed[k] = Math.max(0, (owed[k] || 0) - c);
      log.unshift({ n: PR.find(p => p.k === k).n, c, note, d: new Date().toLocaleDateString("ar-EG") });
      save();
      toast("سُجّل قضاءك ✓ — بارك الله فيك");
      $s("[data-note]").value = "";
    });
    paint();
  },
});

/* ---------------- 12) حاسبة الكفارة ---------------- */
registerTool("kaffara", {
  name: "حاسبة الكفارة", icon: "🙏", desc: "كفارة اليمين والصيام والذنوب مع خطط التنفيذ",
  render(root) {
    const shell = toolShell({ icon: "🙏", ...this, body: `
      <div class="tool-body two">
        <div class="panel">
          <div class="panel-title"><span class="ic">⚖️</span> كفارة اليمين (الحلف)</div>
          <div class="field">
            <div class="label"><b>عدد الأيمان المكسورة</b></div>
            <input class="input" type="number" min="1" value="1" data-oaths>
          </div>
          <div class="field">
            <div class="label"><b>تكلفة إطعام مسكين واحد (ج.م)</b></div>
            <input class="input" type="number" min="1" value="30" data-cost>
          </div>
          <table class="tbl" data-oathtbl></table>
          <div class="hint">الأصل في كفارة اليمين: إطعام عشرة مساكين أو كسوتهم أو تحرير رقبة، فإن لم تجد → صيام ثلاثة أيام. (المائدة:89)</div>
        </div>
        <div class="panel">
          <div class="panel-title"><span class="ic">🌙</span> عدّاد كفارة الصيام</div>
          <div class="field">
            <div class="label"><b>نوع الكفارة</b></div>
            <select class="select" data-kind>
              <option value="fidyah">فدية مريض/مسافر (يوم عن يوم)</option>
              <option value="kaffara">كفارة يمين أو القتل خطأً (60 يومًا)</option>
              <option value="qada">قضاء صيام واجب</option>
            </select>
          </div>
          <div class="center" style="padding:14px 0">
            <div class="tap-count" data-kc>0</div>
            <div class="tap-goal">من <span data-kt>30</span> يومًا</div>
            <div class="progress"><i data-kb style="width:0%"></i></div>
          </div>
          <div class="row" style="justify-content:center;gap:8px">
            <button class="btn btn-em btn-sm" data-kadd>+ يوم مكتمل</button>
            <button class="btn btn-ghost btn-sm" data-kreset>تصفير</button>
          </div>
        </div>
      </div>
      <div class="panel">
        <div class="panel-title"><span class="ic">📖</span> معلومات سريعة</div>
        <div class="grid-cards">
          <div class="mini-card"><div class="m-title">كفارة الظهار</div><div class="m-sub">تحرير رقبة، فإن لم يستطع → صيام شهرين متتاليين.</div></div>
          <div class="mini-card"><div class="m-title">الإفطار عمدًا في رمضان</div><div class="m-sub">قضاء يوم مكان يوم + التوبة الإخلاص لله (إن لم يكن جماعًا).</div></div>
          <div class="mini-card"><div class="m-title">ترك الصلاة</div><div class="m-sub">لا كفارة مالية بلوبة، بل التوبة النصوح وإدراك الفوائت فورًا.</div></div>
          <div class="mini-card"><div class="m-title">القتل الخطأ</div><div class="m-sub">تحرير رقبة مؤمنة + كفارة تعزير + دية على عاقلة القاتل.</div></div>
          <div class="mini-card"><div class="m-title">الزنا</div><div class="m-sub">الجرد والجلد (مئة جلدة) في حد الزنا مع رجم المحصن.</div></div>
          <div class="mini-card"><div class="m-title">كفارة المجلس</div><div class="m-sub">من أخطأ في مجلسه → استغفر الله قبل قيامه منه.</div></div>
        </div>
      </div>` });
    root.appendChild(shell);
    const $s = sel => shell.querySelector(sel);

    const paintOath = () => {
      const n = Math.max(1, +$s("[data-oaths]").value || 1);
      const cost = Math.max(0, +$s("[data-cost]").value || 0);
      $s("[data-oathtbl]").innerHTML = `
        <tr><th>الخيار</th><th>العدد</th><th>التكلفة التقديرية</th></tr>
        <tr><td>إطعام 10 مساكين/يمين</td><td>${toAr(n * 10)}</td><td class="gold">${toAr((n * 10 * cost).toLocaleString("en"))} ج.م</td></tr>
        <tr><td>كسوة 10 مساكين/يمين</td><td>${toAr(n * 10)}</td><td class="muted">حسب السعر</td></tr>
        <tr><td>صيام 3 أيام/يمين</td><td>${toAr(n * 3)} يومًا</td><td class="gold">0 ج.م ✓</td></tr>`;
    };
    $s("[data-oaths]").addEventListener("input", paintOath);
    $s("[data-cost]").addEventListener("input", paintOath);
    paintOath();

    const KINDS = { fidyah: 30, kaffara: 60, qada: 1 };
    let kc = 0;
    const paintK = () => {
      const kind = $s("[data-kind]").value;
      const target = KINDS[kind];
      const done = store.get("kaff_" + kind, 0);
      kc = done;
      $s("[data-kc]").textContent = toAr(kc);
      $s("[data-kt]").textContent = toAr(target);
      $s("[data-kb]").style.width = Math.min(100, (kc / target) * 100) + "%";
    };
    $s("[data-kind]").addEventListener("change", paintK);
    $s("[data-kadd]").addEventListener("click", () => {
      const kind = $s("[data-kind]").value;
      const v = (store.get("kaff_" + kind, 0)) + 1;
      store.set("kaff_" + kind, v); paintK();
      if (v >= KINDS[kind]) toast("أتممت العدد المطلوب — تقبّل الله ✓");
    });
    $s("[data-kreset]").addEventListener("click", () => { store.set("kaff_" + $s("[data-kind]").value, 0); paintK(); });
    paintK();
  },
});
