/* ============================================================
   أدوات القرآن والمعرفة
   ============================================================ */

/* ---------------- آية اليوم ---------------- */
registerTool("ayah-day", {
  name: "آية اليوم", icon: "📖", desc: "آية يومية للتدبر والتأمل — انسخها أو صنِّع منها ريلز",
  render(root) {
    const shell = toolShell({ icon: "📖", ...this, body: `
      <div class="panel center" style="padding:34px 24px">
        <span class="count-badge" data-tag>◆ آية اليوم ◆</span>
        <div class="inline-ayah" style="font-size:clamp(1.4rem,3vw,2rem);margin:18px 0" data-ayah>…</div>
        <div class="muted" data-src></div>
        <div class="row" style="justify-content:center;margin-top:20px;gap:10px">
          <button class="btn btn-ghost" data-prev>→ آية أمس</button>
          <button class="btn btn-gold" data-reel>🎬 صنِّع فيديو</button>
          <button class="btn btn-em" data-copy>📋 نسخ</button>
          <button class="btn btn-ghost" data-next>آية غدًا ←</button>
        </div>
        <div class="hint" style="margin-top:14px" data-date></div>
      </div>
      <div class="panel">
        <div class="panel-title"><span class="ic">🕘</span> آيات الأيام الماضية</div>
        <div data-hist></div>
      </div>` });
    root.appendChild(shell);
    const $s = sel => shell.querySelector(sel);
    let off = 0;

    const paint = () => {
      const v = dailyAyah(off);
      $s("[data-ayah]").textContent = "﴿ " + v.text + " ﴾";
      $s("[data-src]").textContent = `سورة ${v.surah} — آية ${toAr(v.a)}`;
      $s("[data-tag]").textContent = off === 0 ? "◆ آية اليوم ◆" : off < 0 ? `◆ قبل ${toAr(-off)} يومًا ◆` : `◆ بعد ${toAr(off)} يومًا ◆`;
      const d = new Date(); d.setDate(d.getDate() + off);
      $s("[data-date]").textContent = d.toLocaleDateString("ar-EG", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
      $s("[data-reel]").onclick = () => {
        sessionStorage.setItem("qr_pending_reel", JSON.stringify({ s: v.s, a: v.a }));
        Router.go("#/");
      };
      $s("[data-copy]").onclick = async () => {
        try { await navigator.clipboard.writeText(`﴿${v.text}﴾\nسورة ${v.surah} — آية ${v.a}`); toast("تم النسخ ✓"); } catch { toast("تعذّر النسخ", "err"); }
      };
      // السجل
      const hist = $s("[data-hist]");
      hist.innerHTML = "";
      for (let i = -5; i <= -1; i++) {
        const hv = dailyAyah(i);
        const d2 = new Date(); d2.setDate(d2.getDate() + i);
        hist.appendChild(el("div", { class: "list-card", style: "cursor:pointer" },
          `<div class="row between"><span class="quran-text" style="font-size:.98rem;flex:1;margin-left:10px">﴿ ${esc(hv.text.slice(0, 90))}${hv.text.length > 90 ? "…" : ""} ﴾</span>
           <span class="count-badge">${d2.toLocaleDateString("ar-EG", { day: "numeric", month: "short" })}</span></div>`));
      }
    };
    $s("[data-prev]").addEventListener("click", () => { off--; paint(); });
    $s("[data-next]").addEventListener("click", () => { if (off < 0) { off++; paint(); } });
    paint();
    wireCommon(shell);
  },
});

/* ---------------- آيات بالموضوع ---------------- */
registerTool("topics", {
  name: "آيات بالموضوع", icon: "🌿", desc: "ابحث عن آيات لأي موضوع واصنع ريلز منها",
  async render(root) {
    const shell = toolShell({ icon: "🌿", ...this, body: `
      <div class="row" style="margin-bottom:14px">
        <input class="input" data-q placeholder="اكتب كلمة في القرآن… (الرزق، الصبر، الجنة…)" style="max-width:460px">
        <button class="btn btn-gold btn-sm" data-go>ابحث 🔎</button>
      </div>
      <div class="chips" data-topics style="margin-bottom:16px"></div>
      <div data-res></div>` });
    root.appendChild(shell);
    const $s = sel => shell.querySelector(sel);
    await Quran.load();

    const tw = $s("[data-topics]");
    Object.keys(TOPICS).forEach((t, i) => {
      const b = el("button", { class: "chip" + (i === 0 ? " active" : "") }, t);
      b.addEventListener("click", () => {
        $$(".chip", tw).forEach(c => c.classList.remove("active"));
        b.classList.add("active");
        doSearch(t, "");
      });
      tw.appendChild(b);
    });

    const resWrap = $s("[data-res]");
    const doSearch = (topic, q) => {
      resWrap.innerHTML = `<div class="loading-line"><span class="spin"></span> جارٍ البحث في 6236 آية…</div>`;
      setTimeout(() => {
        let refs = QuranIndex.topicSearch(topic || "", q);
        if (q && topic && !normAr(topic).includes(normAr(q))) refs = QuranIndex.topicSearch("", q).concat(refs);
        // dedupe
        const seen = new Set();
        refs = refs.filter(r => { const k = r.s + ":" + r.a; if (seen.has(k)) return false; seen.add(k); return true; });
        if (!refs.length) { resWrap.innerHTML = `<div class="loading-line">لا توجد نتائج — جرّب كلمة أعم</div>`; return; }
        resWrap.innerHTML = `<div class="row between" style="margin-bottom:10px"><span class="count-badge">${toAr(refs.length)} نتيجة</span>
          ${refs.length > 1 ? `<a class="btn btn-soft btn-sm" href="#/" data-reel="${refs[0].s}:${refs[0].a}">🎬 صنِّع ريلز من أول نتيجة</a>` : ""}</div>` +
          `<div class="grid-cards">` +
          refs.slice(0, 40).map(r => `
            <div class="mini-card">
              <div class="quran-text" style="font-size:1.02rem;text-align:right">﴿ ${esc(r.t.slice(0, 160))}${r.t.length > 160 ? "…" : ""} ﴾</div>
              <div class="row between" style="margin-top:8px">
                <span class="m-sub">${esc(ayahRef(r.s, r.a))}</span>
                <span class="row" style="gap:5px">
                  <button class="btn btn-ghost btn-sm" data-copy="${esc(r.t)}">📋</button>
                  <a class="btn btn-soft btn-sm" href="#/" data-reel="${r.s}:${r.a}">🎬</a>
                </span>
              </div>
            </div>`).join("") + `</div>`;
      }, 30);
    };
    const run = () => {
      const active = $(".chip.active", tw)?.textContent || "";
      doSearch(active, $s("[data-q]").value.trim());
    };
    $s("[data-q]").addEventListener("keydown", e => { if (e.key === "Enter") run(); });
    $s("[data-go]").addEventListener("click", run);
    const pendingQ = sessionStorage.getItem("qr_topics_q");
    if (pendingQ) {
      sessionStorage.removeItem("qr_topics_q");
      $s("[data-q]").value = pendingQ;
      $$(".chip", tw).forEach(c => c.classList.remove("active"));
      doSearch("", pendingQ);
    } else {
      doSearch(Object.keys(TOPICS)[0], "");
    }
    wireCommon(shell);
  },
});

/* ---------------- محفّظ القرآن (تكرار) ---------------- */
registerTool("looper", {
  name: "محفّظ القرآن", icon: "🔁", desc: "كرّر المقطع تكرارًا محسّبًا لحفظه — مع تباين في المدد",
  async render(root) {
    const shell = toolShell({ icon: "🔁", ...this, body: `
      <div class="tool-body side">
        <div class="panel">
          <div class="field"><div class="label"><b>السورة</b></div><select class="select" data-s></select></div>
          <div class="row-2">
            <div class="field"><div class="label"><b>من آية</b></div><input class="input" type="number" min="1" value="1" data-f></div>
            <div class="field"><div class="label"><b>إلى آية</b></div><input class="input" type="number" min="1" value="5" data-t></div>
          </div>
          <div class="row-2">
            <div class="field"><div class="label"><b>عدد التكرارات</b></div><input class="input" type="number" min="1" max="50" value="5" data-r></div>
            <div class="field"><div class="label"><b>استراحة (ثانية)</b></div><input class="input" type="number" min="0" max="15" value="2" data-gap></div>
          </div>
          <div class="field"><div class="label"><b>القارئ</b></div><select class="select" data-rec></select></div>
          <div class="row" style="gap:8px">
            <button class="btn btn-gold" style="flex:1" data-play>▶ ابدأ الحفظ</button>
            <button class="btn btn-ghost" data-stop>⏹</button>
          </div>
          <div class="progress" style="margin-top:14px"><i data-bar style="width:0%"></i></div>
          <div class="hint center" data-stat>جاهز</div>
        </div>
        <div class="panel center" style="min-height:300px;display:flex;flex-direction:column;justify-content:center">
          <div class="count-badge" data-rep>التكرار ٠ / ٥</div>
          <div class="inline-ayah" style="margin-top:18px;font-size:clamp(1.3rem,2.6vw,1.8rem)" data-text>اضغط «ابدأ الحفظ»</div>
          <div class="muted" style="margin-top:10px" data-ref></div>
          <div class="row" style="justify-content:center;margin-top:16px;gap:8px">
            <button class="btn btn-ghost btn-sm" data-prev>⏮ السابقة</button>
            <button class="btn btn-soft btn-sm" data-pause>⏸ إيقاف مؤقت</button>
            <button class="btn btn-ghost btn-sm" data-next>التالية ⏭</button>
          </div>
        </div>
      </div>` });
    root.appendChild(shell);
    const $s = sel => shell.querySelector(sel);
    await Quran.load();

    const selS = $s("[data-s]");
    Quran.surahs.forEach(s => selS.appendChild(el("option", { value: s.n }, `${toAr(s.n)}. ${Quran.shortName(s.n)} (${toAr(s.count)})`)));
    selS.value = 112; $s("[data-t]").value = 4;
    const selR = $s("[data-rec]");
    RECITERS.forEach(r => selR.appendChild(el("option", { value: r.folder }, r.n)));
    selR.value = Selection.reciter;

    let rep = 0, target = 5, playing = false, prepared = false;
    const list = () => {
      let f = Math.max(1, +$s("[data-f]").value || 1);
      let t = Math.max(f, +$s("[data-t]").value || f);
      const c = Quran.ayahCount(+selS.value);
      t = Math.min(t, c);
      const arr = [];
      for (let a = f; a <= t; a++) arr.push({ s: +selS.value, a });
      return { arr, f, t };
    };
    const showAyah = i => {
      const { arr, f, t } = list();
      const v = arr[Math.min(i, arr.length - 1)];
      if (!v) return;
      $s("[data-text]").textContent = "﴿ " + Quran.ayah(v.s, v.a) + " ﴾";
      $s("[data-ref]").textContent = ayahRef(v.s, f, t) + " — القارئ: " + (RECITERS.find(r => r.folder === selR.value)?.n || "");
      $s("[data-rep]").textContent = `التكرار ${toAr(rep)} / ${toAr(target)}`;
      $s("[data-bar]").style.width = (rep / target) * 100 + "%";
    };
    const stopAll = () => {
      playing = false;
      AyahPlayer.stop();
      $s("[data-stat]").textContent = "متوقف";
      $s("[data-play]").textContent = "▶ ابدأ الحفظ";
    };
    const start = async () => {
      const { arr } = list();
      if (!arr.length) return;
      target = Math.min(50, Math.max(1, +$s("[data-r]").value || 5));
      rep = 1;
      playing = true;
      $s("[data-play]").textContent = "⏸ قيد التشغيل…";
      $s("[data-stat]").textContent = "جارٍ التحميل…";
      if (!prepared || selR.value !== AyahPlayer.reciter) {
        const res = await AyahPlayer.prepare(selR.value, arr, (d, t) => $s("[data-stat]").textContent = `تحميل ${toAr(d)}/${toAr(t)}`);
        prepared = res.ok > 0;
        if (!prepared) { AyahPlayer.prepareSilent(arr); toast("تعذّر تحميل الصوت", "err"); }
      }
      const gap = Math.max(0, +$s("[data-gap]").value || 0);
      AyahPlayer.onAyah = i => showAyah(i);
      AyahPlayer.onEnd = () => {
        if (!playing) return;
        if (rep >= target) {
          stopAll();
          $s("[data-stat]").textContent = "أتممت التكرارات ✓ تقبّل الله";
          toast("أتممت " + toAr(target) + " تكرارات — بارك الله فيك ✓");
          rep = 0; showAyah(0);
          return;
        }
        rep++;
        showAyah(0);
        $s("[data-stat]").textContent = gap > 0 ? `استراحة ${toAr(gap)} ثوانٍ…` : "التكرار التالي…";
        setTimeout(() => { if (playing) AyahPlayer.play(0, 0); }, gap * 1000);
      };
      AyahPlayer.onTick = (e, tot, idx) => {
        $s("[data-bar]").style.width = Math.min(100, ((rep - 1 + e / Math.max(tot, 0.1)) / target) * 100) + "%";
      };
      AyahPlayer.play(0, 0);
      showAyah(0);
    };
    $s("[data-play]").addEventListener("click", () => {
      if (playing) { AyahPlayer.pause(); playing = false; $s("[data-play]").textContent = "▶ استئناف"; $s("[data-stat]").textContent = "موقوف مؤقتًا"; }
      else start();
    });
    $s("[data-stop]").addEventListener("click", stopAll);
    $s("[data-pause]").addEventListener("click", () => { if (AyahPlayer.playing) { AyahPlayer.pause(); playing = false; $s("[data-play]").textContent = "▶ استئناف"; } });
    $s("[data-next]").addEventListener("click", () => { const i = Math.min(AyahPlayer.index + 1, list().arr.length - 1); AyahPlayer.seekAyah(i); showAyah(i); });
    $s("[data-prev]").addEventListener("click", () => { const i = Math.max(0, AyahPlayer.index - 1); AyahPlayer.seekAyah(i); showAyah(i); });
    [selS, $s("[data-f]"), $s("[data-t]")].forEach(x => x.addEventListener("change", () => { stopAll(); rep = 0; showAyah(0); }));
    showAyah(0);
  },
});

/* ---------------- خطة ختم القرآن ---------------- */
registerTool("khatma", {
  name: "خطة ختم القرآن", icon: "🎯", desc: "جدول ختمة مخصّص حسب هدفك مع متابعة يومية",
  render(root) {
    const shell = toolShell({ icon: "🎯", ...this, body: `
      <div class="tool-body side">
        <div class="panel">
          <div class="field">
            <div class="label"><b>أريد الختمة خلال</b></div>
            <select class="select" data-days>
              <option value="7">أسبوع واحد</option>
              <option value="10">10 أيام</option>
              <option value="15">نصف شهر</option>
              <option value="30" selected>شهرًا كاملًا (30 يومًا)</option>
              <option value="60">شهران</option>
              <option value="90">3 شهور</option>
              <option value="180">6 شهور</option>
              <option value="365">سنة</option>
            </select>
          </div>
          <div class="field">
            <div class="label"><b>عدد الصفحات يوميًا (تُحسب تلقائيًا)</b></div>
            <input class="input" data-pages readonly value="20">
          </div>
          <div class="field">
            <div class="label"><b>نوع الورد</b></div>
            <select class="select" data-kind>
              <option value="pages">صفحات</option>
              <option value="juz">أجزاء</option>
              <option value="halfjuz">أنصاف الأجزاء</option>
            </select>
          </div>
          <button class="btn btn-gold btn-block" data-gen>أنشئ الخطة ←</button>
          <div class="hint" style="margin-top:10px">💡 ابدأ بورد ثابت يوميًا ولو قليلًا — «أحب الأعمال إلى الله أدومها وإن قل»</div>
        </div>
        <div class="panel">
          <div class="row between" style="margin-bottom:12px">
            <div class="panel-title" style="margin:0"><span class="ic">📊</span> تقدّمك</div>
            <span class="progress-badge" data-prog>0%</span>
          </div>
          <div class="progress"><i data-bar style="width:0%"></i></div>
          <div class="row between" style="margin-top:6px;font-size:.84rem">
            <span class="muted" data-daysdone>0 يومًا مكتملًا</span>
            <span class="muted" data-leftpages>بقي 604 صفحة</span>
          </div>
          <div class="row" style="gap:8px;margin-top:12px">
            <button class="btn btn-em btn-sm" data-done>✓ أتممت ورد اليوم</button>
            <button class="btn btn-ghost btn-sm" data-undo>تراجع</button>
          </div>
          <div class="divider" style="margin:16px 0;border-top:1px dashed rgba(255,255,255,.1)"></div>
          <div class="chips" data-daysgrid style="max-height:260px;overflow:auto"></div>
        </div>
      </div>
      <div class="panel">
        <div class="panel-title"><span class="ic">🗓️</span> جدول الخطة</div>
        <div style="overflow:auto"><table class="tbl" data-plan></table></div>
      </div>` });
    root.appendChild(shell);
    const $s = sel => shell.querySelector(sel);
    const TOTAL_PAGES = 604;
    let plan = store.get("khatmaPlan", null);
    let doneDays = store.get("khatmaDone", []);

    const computePlan = days => {
      const perDay = Math.ceil(TOTAL_PAGES / days);
      const rows = [];
      let page = 1;
      for (let d = 1; d <= days && page <= TOTAL_PAGES; d++) {
        const from = page, to = Math.min(TOTAL_PAGES, page + perDay - 1);
        rows.push({ d, from, to, juzFrom: Math.floor((from - 1) / 20) + 1, juzTo: Math.floor((to - 1) / 20) + 1 });
        page = to + 1;
      }
      return rows;
    };
    const paint = () => {
      const days = plan?.days || 30;
      $s("[data-days]").value = String(days);
      $s("[data-pages]").value = Math.ceil(TOTAL_PAGES / days);
      const rows = plan?.rows || computePlan(days);
      const pct = plan ? Math.round((doneDays.length / rows.length) * 100) : 0;
      $s("[data-bar]").style.width = pct + "%";
      $s("[data-prog]").textContent = pct + "%";
      $s("[data-daysdone]").textContent = `${toAr(doneDays.length)} يومًا من ${toAr(rows.length)}`;
      const pagesRead = doneDays.reduce((acc, d) => { const r = rows.find(x => x.d === d); return acc + (r ? r.to - r.from + 1 : 0); }, 0);
      $s("[data-leftpages]").textContent = `بقي ${toAr(Math.max(0, TOTAL_PAGES - pagesRead))} صفحة`;
      // جدول
      $s("[data-plan]").innerHTML = `<tr><th>اليوم</th><th>من صفحة</th><th>إلى صفحة</th><th>الجزء</th><th>الحالة</th></tr>` +
        rows.map(r => `<tr style="${doneDays.includes(r.d) ? "background:rgba(45,212,160,.06)" : ""}">
          <td>${toAr(r.d)}</td><td>${toAr(r.from)}</td><td>${toAr(r.to)}</td>
          <td>${r.juzFrom === r.juzTo ? "الجزء " + toAr(r.juzFrom) : "الجزء " + toAr(r.juzFrom) + "–" + toAr(r.juzTo)}</td>
          <td>${doneDays.includes(r.d) ? '<span class="badge ok">✓ منجز</span>' : '<span class="badge info">أمامك</span>'}</td></tr>`).join("");
      // أزرار الأيام
      const dg = $s("[data-daysgrid]");
      dg.innerHTML = "";
      rows.forEach(r => {
        const on = doneDays.includes(r.d);
        const b = el("button", { class: "chip" + (on ? " active" : "") }, `يوم ${toAr(r.d)}`);
        b.addEventListener("click", () => {
          doneDays = on ? doneDays.filter(x => x !== r.d) : [...doneDays, r.d];
          store.set("khatmaDone", doneDays); paint();
        });
        dg.appendChild(b);
      });
    };
    $s("[data-days]").addEventListener("change", e => {
      const days = +e.target.value;
      plan = { days, rows: computePlan(days) };
      doneDays = [];
      store.set("khatmaPlan", plan); store.set("khatmaDone", doneDays);
      paint();
    });
    $s("[data-gen]").addEventListener("click", () => {
      const days = +$s("[data-days]").value;
      plan = { days, rows: computePlan(days) };
      doneDays = [];
      store.set("khatmaPlan", plan); store.set("khatmaDone", doneDays);
      paint();
      toast("تم إنشاء خطة الختمة ✓");
    });
    $s("[data-done]").addEventListener("click", () => {
      const rows = plan?.rows || computePlan(30);
      const next = rows.find(r => !doneDays.includes(r.d));
      if (!next) { toast("لقد أتممت الخطة كلها! 🎉"); return; }
      doneDays = [...doneDays, next.d];
      store.set("khatmaDone", doneDays); paint();
      toast(`أتممت يوم ${toAr(next.d)} — ورد الصفحات ${toAr(next.from)}–${toAr(next.to)} ✓`);
    });
    $s("[data-undo]").addEventListener("click", () => {
      doneDays = doneDays.slice(0, -1);
      store.set("khatmaDone", doneDays); paint();
    });
    if (!plan) plan = { days: 30, rows: computePlan(30) };
    paint();
  },
});

/* ---------------- سحابة الختمة: مزامنة Supabase (اختيارية، مع تراجع صامت للتخزين المحلي) ---------------- */
const KhatmaCloud = (() => {
  let cfg = null, pending = null;
  const load = () => pending || (async () => {
    try {
      const r = await fetch("/api/app-config", { cache: "no-store" });
      const j = await r.json();
      if (j && j.supabase && j.supabase.url && j.supabase.anon) cfg = j.supabase;
    } catch {}
    return cfg;
  })();
  const headers = () => ({ apikey: cfg.anon, Authorization: "Bearer " + cfg.anon, "Content-Type": "application/json" });
  return {
    ready: async () => !!(await load()),
    async getRows(planId) {
      try {
        const r = await fetch(`${cfg.url}/rest/v1/khatma_progress?plan_id=eq.${encodeURIComponent(planId)}`, { headers: headers() });
        if (!r.ok) return null;
        return await r.json();
      } catch { return null; }
    },
    putRow(planId, member, done) {
      // PATCH ثم INSERT (بدل upsert) — متوافق مع صلاحيات الأعمدة المحدودة
      const path = `${cfg.url}/rest/v1/khatma_progress?plan_id=eq.${encodeURIComponent(planId)}&member=eq.${encodeURIComponent(member)}`;
      const doInsert = () => fetch(`${cfg.url}/rest/v1/khatma_progress`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ plan_id: planId, member, done }),
      }).then(r => {
        if (!r.ok && r.status === 409) {
          fetch(path, { method: "PATCH", headers: headers(), body: JSON.stringify({ done }) }).catch(() => {});
        }
        return r;
      }).catch(() => {});
      fetch(path, {
        method: "PATCH",
        headers: { ...headers(), Prefer: "return=representation" },
        body: JSON.stringify({ done }),
      }).then(r => (r.ok ? r.text() : "")).then(txt => {
        const rows = txt ? (() => { try { return JSON.parse(txt); } catch { return null; } })() : [];
        if (!Array.isArray(rows) || rows.length === 0) doInsert();
      }).catch(() => doInsert());
    },
    putPlan(planId, plan) {
      const path = `${cfg.url}/rest/v1/khatma_plans?plan_id=eq.${encodeURIComponent(planId)}`;
      const doInsert = () => fetch(`${cfg.url}/rest/v1/khatma_plans`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ plan_id: planId, plan }),
      }).then(r => {
        if (!r.ok && r.status === 409) {
          fetch(path, { method: "PATCH", headers: headers(), body: JSON.stringify({ plan }) }).catch(() => {});
        }
        return r;
      }).catch(() => {});
      fetch(path, {
        method: "PATCH",
        headers: { ...headers(), Prefer: "return=representation" },
        body: JSON.stringify({ plan }),
      }).then(r => (r.ok ? r.text() : "")).then(txt => {
        const rows = txt ? (() => { try { return JSON.parse(txt); } catch { return null; } })() : [];
        if (!Array.isArray(rows) || rows.length === 0) doInsert();
      }).catch(() => doInsert());
    },
  };
})();

/* ---------------- ختمة جماعية (رابط) ---------------- */
registerTool("group-khatma", {
  name: "ختمة جماعية", icon: "👥", desc: "أنشئ خطة ختمة وشاركها برابط — كل واحد يتتبع نسخته",
  render(root) {
    const shell = toolShell({ icon: "👥", ...this, body: `
      <div class="tool-body two">
        <div class="panel">
          <div class="panel-title"><span class="ic">✏️</span> إنشاء خطة للمجموعة</div>
          <div class="field"><div class="label"><b>اسم الختمة</b></div><input class="input" data-name value="ختمة شهر رمضان" maxlength="40"></div>
          <div class="row-2">
            <div class="field"><div class="label"><b>المدة (يومًا)</b></div><input class="input" type="number" min="1" max="365" value="30" data-days></div>
            <div class="field"><div class="label"><b>اسمك</b></div><input class="input" data-you placeholder="مثال: أحمد" maxlength="20"></div>
          </div>
          <div class="field"><div class="label"><b>هدفي</b></div>
            <select class="select" data-goal>
              <option value="whole">ختمة كاملة (604 صفحات)</option>
              <option value="juz30">جزء عمّ فقط</option>
              <option value="half">نصف مصحف</option>
            </select>
          </div>
          <button class="btn btn-gold btn-block" data-share>🔗 أنشئ الرابط وشاركه</button>
          <div class="field" style="margin-top:12px;display:none" data-linkwrap>
            <div class="label"><b>رابط المجموعة</b></div>
            <div class="row" style="gap:6px"><input class="input" data-link readonly><button class="btn btn-em btn-sm" data-copy2>📋</button></div>
            <div class="hint">يرسل الرابط خطة الختمة — تقدّمك يُحفظ على جهازك ويُزامَن مع المجموعة عبر السحابة عند توفر الاتصال.</div>
          </div>
        </div>
        <div class="panel">
          <div class="panel-title"><span class="ic">📱</span> تقدّمك الشخصي</div>
          <div data-mine></div>
        </div>
      </div>` });
    root.appendChild(shell);
    const $s = sel => shell.querySelector(sel);

    const parseHash = () => {
      const h = location.hash;
      const q = h.split("?")[1];
      if (!q) return null;
      try { return JSON.parse(decodeURIComponent(atob(q))); } catch { return null; }
    };
    const incoming = parseHash();
    if (incoming) {
      toast(`انضممت لخطة «${incoming.name}» ✓`);
      store.set("groupPlan", incoming);
    }
    const cur = store.get("groupPlan", null);

    const pid = p => {
      if (p.id) return p.id;
      const s = JSON.stringify(p);
      let h = 5381;
      for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
      return "g" + h.toString(36);
    };
    const myMember = p => (store.get("memberName", "") || p.by || "").trim() || "أنت";

    const paintMine = () => {
      const p = store.get("groupPlan", cur);
      const wrap = $s("[data-mine]");
      if (!p) { wrap.innerHTML = `<div class="hint">لا توجد خطة بعد — أنشئ خطة أو افتح رابطًا من أصدقائك.</div>`; return; }
      const done = store.get("groupDone_" + p.name, 0);
      const total = p.days;
      const pct = Math.round((done / total) * 100);
      wrap.innerHTML = `
        <div style="font-weight:800;font-size:1.1rem;color:var(--gold-3)">${esc(p.name)}</div>
        <div class="muted" style="font-size:.86rem">المدة: ${toAr(p.days)} يومًا · الهدف: ${esc({ whole: "مصحف كامل", juz30: "جزء عمّ", half: "نصف مصحف" }[p.goal])}</div>
        <div class="row" style="gap:6px;margin-top:10px">
          <input class="input" data-member placeholder="اسمك في المجموعة" maxlength="20" value="${esc(store.get("memberName", "") || p.by || "")}">
          <button class="btn btn-ghost btn-sm" data-savemember>اسمي</button>
        </div>
        <div class="progress" style="margin-top:14px"><i style="width:${pct}%;background:var(--grad-em)"></i></div>
        <div class="row between" style="margin-top:6px;font-size:.86rem"><span>${toAr(done)}/${toAr(total)} يومًا</span><b class="gold">${toAr(pct)}٪</b></div>
        <div class="row" style="gap:8px;margin-top:14px">
          <button class="btn btn-em btn-sm" data-gdone>✓ أنهيت اليوم</button>
          <button class="btn btn-ghost btn-sm" data-gundo>تراجع</button>
        </div>
        <div data-cloud class="hint" style="margin-top:10px">…</div>
        <div class="hint" style="margin-top:12px">🤲 «إذا مات الإنسان انقطع عمله إلا من ثلاث» — وختمة القرآن صدقة جارية.</div>`;
      const syncPush = () => {
        KhatmaCloud.ready().then(ok => {
          if (!ok) return;
          KhatmaCloud.putRow(pid(p), myMember(p), store.get("groupDone_" + p.name, 0));
        }).catch(() => {});
      };
      wrap.querySelector("[data-gdone]").addEventListener("click", () => {
        store.set("groupDone_" + p.name, Math.min(total, done + 1)); paintMine(); syncPush();
        if (done + 1 >= total) toast("أنهيت الخطة — تقبّل الله منك! 🎉");
      });
      wrap.querySelector("[data-gundo]").addEventListener("click", () => {
        store.set("groupDone_" + p.name, Math.max(0, done - 1)); paintMine(); syncPush();
      });
      wrap.querySelector("[data-savemember]").addEventListener("click", () => {
        const v = wrap.querySelector("[data-member]").value.trim();
        store.set("memberName", v);
        toast(v ? "تم حفظ اسمك ✓" : "اكتب اسمك أولًا");
        paintMine();
      });
      paintCloud(wrap, p);
    };

    const paintCloud = async (wrap, p) => {
      const box = wrap.querySelector("[data-cloud]");
      if (!box) return;
      let ok = false;
      try { ok = await KhatmaCloud.ready(); } catch {}
      if (!ok) { box.textContent = "التقدّم محفوظ على هذا الجهاز (وضع محلي)."; return; }
      const id = pid(p);
      const rows = (await KhatmaCloud.getRows(id)) || [];
      const local = store.get("groupDone_" + p.name, 0);
      const name = myMember(p);
      const mine = rows.find(r => r.member === name);
      if (!mine || local > (mine.done || 0)) {
        KhatmaCloud.putRow(id, name, local);
        if (mine) mine.done = local;
        else rows.push({ member: name, done: local });
      }
      rows.sort((a, b) => (b.done || 0) - (a.done || 0));
      const total = p.days;
      box.innerHTML = `<div style="font-weight:700;margin-bottom:4px">☁️ تقدم المجموعة (${toAr(rows.length)})</div>` +
        (rows.length
          ? rows.map(r => `<div class="row between" style="font-size:.84rem;padding:4px 8px;border:1px solid rgba(255,255,255,.08);border-radius:8px;margin-top:4px;${r.member === name ? "border-color:var(--gold-3);" : ""}"><span>${esc(r.member)}${r.member === name ? " (أنت)" : ""}</span><b class="gold">${toAr(r.done || 0)}/${toAr(total)}</b></div>`).join("")
          : `<div class="muted" style="font-size:.84rem">لا أحد بعد — شارك الرابط مع أصدقائك ليظهر تقدّمكم هنا.</div>`);
    };
    paintMine();

    $s("[data-share]").addEventListener("click", () => {
      const p = {
        name: $s("[data-name]").value.trim() || "ختمة جماعية",
        days: Math.max(1, Math.min(365, +$s("[data-days]").value || 30)),
        goal: $s("[data-goal]").value,
        by: $s("[data-you]").value.trim(),
        t: Date.now(),
      };
      const prev = store.get("groupPlan", null);
      if (prev && prev.name === p.name && prev.id) { p.t = prev.t; p.id = prev.id; }
      else {
        // معرّف قوي: قابل للتخمين بدرجة عالية (16 محرفًا عشوائيًا)
        const rnd = (crypto && crypto.randomUUID)
          ? crypto.randomUUID().replace(/-/g, "").slice(0, 16)
          : Array.from({ length: 16 }, () => "abcdefghijklmnopqrstuvwxyz0123456789"[Math.floor(Math.random() * 36)]).join("");
        p.id = "g" + rnd;
      }
      store.set("groupPlan", p); paintMine();
      const link = location.origin + location.pathname + `#/tool/group-khatma?${btoa(encodeURIComponent(JSON.stringify(p)))}`;
      $s("[data-linkwrap]").style.display = "";
      $s("[data-link]").value = link;
      $s("[data-copy2]").onclick = async () => {
        try { await navigator.clipboard.writeText(link); toast("تم نسخ الرابط ✓"); } catch {}
      };
      if (navigator.share) navigator.share({ title: p.name, url: link }).catch(() => {});
      toast("الرابط جاهز للمشاركة ✓");
      KhatmaCloud.ready().then(async ok => {
        if (!ok) return;
        await KhatmaCloud.putPlan(p.id, p);
        KhatmaCloud.putRow(p.id, myMember(p), store.get("groupDone_" + p.name, 0));
        const wrap = $s("[data-mine]");
        if (wrap) paintCloud(wrap, p);
      }).catch(() => {});
    });
  },
});

/* ---------------- مخارج الحروف ---------------- */
registerTool("makharij", {
  name: "مخارج الحروف", icon: "🗣️", desc: "تعلّم مخارج الحروف ونقاطها للتجويد",
  render(root) {
    const shell = toolShell({ icon: "🗣️", ...this, body: `
      <div class="grid-cards" data-grid></div>
      <div class="panel" style="margin-top:16px">
        <div class="panel-title"><span class="ic">🎯</span> اختبر نفسك</div>
        <div data-quiz></div>
      </div>` });
    root.appendChild(shell);
    const grid = shell.querySelector("[data-grid]");
    MAKHARIJ.forEach((m, i) => {
      const c = el("div", { class: "mini-card" },
        `<div class="m-title">${toAr(i + 1)}. ${esc(m.n)}</div>
         <div class="m-sub" style="margin-bottom:8px">${esc(m.d)}</div>
         <div class="chips">${m.letters.split(" ").map(l => `<span class="chip" style="pointer-events:none;font-family:var(--font-quran);font-size:1.2rem">${esc(l)}</span>`).join("")}</div>
         <div class="hint" style="margin-top:8px">💡 ${esc(m.tip)}</div>`);
      grid.appendChild(c);
    });
    // اختبار بسيط
    const quiz = shell.querySelector("[data-quiz]");
    const LETTERS = [
      { l: "ق", m: 2 }, { l: "ب", m: 3 }, { l: "خ", m: 0 }, { l: "م", m: 4 },
      { l: "ت", m: 2 }, { l: "غ", m: 0 }, { l: "و", m: 3 }, { l: "ن", m: 4 },
      { l: "ع", m: 0 }, { l: "ك", m: 2 }, { l: "ف", m: 3 }, { l: "ه", m: 1 },
    ];
    let qi = 0, score = 0;
    const pick = () => LETTERS[Math.floor(Math.random() * LETTERS.length)];
    let cur = pick();
    const paintQ = () => {
      quiz.innerHTML = `
        <div class="row between" style="margin-bottom:12px">
          <span class="count-badge">النتيجة: ${toAr(score)}/${toAr(qi)}</span>
          <span class="muted" style="font-size:.86rem">أين يخرج حرف <b class="gold" style="font-family:var(--font-quran);font-size:1.5rem">${cur.l}</b>؟</span>
        </div>
        <div class="chips">${MAKHARIJ.map((m, i) => `<button class="chip" data-m="${i}">${m.n}</button>`).join("")}</div>
        <div class="hint" data-fb style="margin-top:10px">اختر المخرج الصحيح</div>`;
      quiz.querySelectorAll("[data-m]").forEach(b => b.addEventListener("click", () => {
        qi++;
        const ok = +b.dataset.m === cur.m;
        if (ok) { score++; toast("إجابة صحيحة ✓"); }
        else toast(`الصواب: مخرج ${MAKHARIJ[cur.m].n}`, "err");
        cur = pick();
        paintQ();
      }));
    };
    paintQ();
  },
});

/* ---------------- إذاعة القرآن ---------------- */
registerTool("radio", {
  name: "إذاعة القرآن", icon: "📻", desc: "بث حي لتلاوات مختارة — يعمل مباشرة",
  render(root) {
    const shell = toolShell({ icon: "📻", ...this, body: `
      <div class="panel center" style="padding:26px">
        <div style="font-size:2.6rem" data-ic>📻</div>
        <div style="font-weight:800;font-size:1.2rem;margin-top:6px" data-now>اختر إذاعة</div>
        <div class="muted" data-state>متوقف</div>
        <audio data-audio preload="none"></audio>
        <div class="row" style="justify-content:center;margin-top:16px;gap:10px">
          <button class="icon-btn big" data-toggle>▶</button>
          <button class="icon-btn" data-stop>⏹</button>
        </div>
        <div class="hint" style="margin-top:14px">📵 يحتاج اتصالًا بالإنترنت — لا يُسجَّل ولا يُحفظ شيء</div>
      </div>
      <div class="grid-cards" data-list style="margin-top:16px"></div>` });
    root.appendChild(shell);
    const $s = sel => shell.querySelector(sel);
    const audio = $s("[data-audio]");
    const list = $s("[data-list]");

    RADIOS.forEach(r => {
      const c = el("div", { class: "mini-card", style: "cursor:pointer" },
        `<div class="m-title">🎙 ${esc(r.n)}</div><div class="m-sub">بث مباشر — اضغط للتشغيل</div>`);
      c.addEventListener("click", () => {
        $s("[data-now]").textContent = r.n;
        $s("[data-state]").textContent = "جارٍ التشغيل…";
        audio.src = r.url;
        audio.play().then(() => {
          $s("[data-toggle]").textContent = "⏸";
          $s("[data-state]").textContent = "بث مباشر ✓";
          $s("[data-ic]").textContent = "🎧";
        }).catch(() => {
          $s("[data-state]").textContent = "تعذّر الاتصال بالبث — تحقق من الشبكة";
          toast("تعذّر تشغيل البث", "err");
        });
        list.querySelectorAll(".mini-card").forEach(x => x.style.borderColor = "");
        c.style.borderColor = "var(--gold)";
      });
      list.appendChild(c);
    });
    $s("[data-toggle]").addEventListener("click", () => {
      if (!audio.src) { toast("اختر محطة من القائمة أولًا", "err"); return; }
      if (audio.paused && audio.src) {
        audio.play().then(() => { $s("[data-toggle]").textContent = "⏸"; $s("[data-state]").textContent = "بث مباشر ✓"; })
          .catch(() => toast("تعذّر التشغيل", "err"));
      } else audio.pause();
    });
    audio.addEventListener("pause", () => $s("[data-toggle]").textContent = "▶");
    audio.addEventListener("play", () => { $s("[data-toggle]").textContent = "⏸"; $s("[data-state]").textContent = "بث مباشر ✓"; });
    $s("[data-stop]").addEventListener("click", () => { audio.pause(); audio.removeAttribute("src"); $s("[data-now]").textContent = "اختر إذاعة"; $s("[data-state]").textContent = "متوقف"; $s("[data-ic]").textContent = "📻"; });
  },
});

/* ---------------- الأحاديث النبوية ---------------- */
const HadithLib = {
  books: {
    nawawi: { n: "الأربعون النووية", bundled: "data/hadith-nawawi.json" },
    qudsi: { n: "الأحاديث القدسية", bundled: "data/hadith-qudsi.json" },
    bukhari: { n: "صحيح البخاري" },
    muslim: { n: "صحيح مسلم" },
    abudawud: { n: "سنن أبي داود" },
    tirmidhi: { n: "سنن الترمذي" },
    nasai: { n: "سنن النسائي" },
    ibnmajah: { n: "سنن ابن ماجه" },
    malik: { n: "موطأ مالك" },
  },
  data: {},
  async load(key) {
    if (this.data[key]) return this.data[key];
    const b = this.books[key];
    if (!b) throw new Error("unknown book");
    let j;
    if (b.bundled) j = await (await fetch(b.bundled)).json();
    else {
      const url = `https://cdn.jsdelivr.net/gh/fawazahmed0/hadith-api@1/editions/ara-${key}.min.json`;
      try { j = await (await fetch(url)).json(); }
      catch { j = await (await fetch(`/proxy?u=${encodeURIComponent(url)}`)).json(); }
    }
    this.data[key] = j.hadiths || [];
    return this.data[key];
  },
  search(list, q) {
    const nq = normAr(q);
    if (!nq) return list.slice(0, 30);
    const terms = nq.split(" ").filter(Boolean);
    return list.filter(h => terms.every(t => normAr(h.text).includes(t))).slice(0, 40);
  },
};

registerTool("hadith", {
  name: "الأحاديث النبوية", icon: "📜", desc: "تصفح وابحث في كتب السنة النبوية مع التخريج",
  render(root) {
    const shell = toolShell({ icon: "📜", ...this, body: `
      <div class="row" style="margin-bottom:14px;gap:8px">
        <select class="select" data-book style="max-width:250px">
          ${Object.entries(HadithLib.books).map(([k, v]) => `<option value="${k}">${v.n}</option>`).join("")}
        </select>
        <input class="input" data-q placeholder="ابحث داخل الكتاب… (النية، الصبر، الرحمة…)" style="max-width:420px">
        <span class="count-badge" data-n>—</span>
      </div>
      <div data-list></div>` });
    root.appendChild(shell);
    const $s = sel => shell.querySelector(sel);
    const listWrap = $s("[data-list]");
    let key = "nawawi";

    const paint = (q = "") => {
      const list = HadithLib.data[key] || [];
      const res = HadithLib.search(list, q);
      $s("[data-n]").textContent = `${toAr(list.length)} حديثًا`;
      listWrap.innerHTML = "";
      if (!res.length) { listWrap.innerHTML = `<div class="loading-line">لا نتائج مطابقة</div>`; return; }
      res.forEach(h => {
        const c = el("div", { class: "list-card" });
        c.innerHTML = `
          <div class="lc-head">
            <span class="lc-title">${HadithLib.books[key].n} — حديث ${toAr(h.arabicnumber || h.hadithnumber)}</span>
            <span class="count-badge">رقم ${toAr(h.hadithnumber)}</span>
          </div>
          <div style="font-size:1.05rem;line-height:2.1">${esc(h.text)}</div>
          <div class="row" style="margin-top:8px">
            <button class="btn btn-ghost btn-sm" data-copy="${esc(h.text)}">📋 نسخ</button>
            <a class="btn btn-soft btn-sm" href="#/" data-reel-text="${esc(normAr(h.text).split(" ").slice(0, 6).join(" "))}">🎬 ابحث عن الآية المناسبة</a>
          </div>`;
        listWrap.appendChild(c);
      });
      if (res.length === 40) listWrap.appendChild(el("div", { class: "center muted", style: "margin-top:12px" }, "عرض أول 40 نتيجة — أضف كلمات للبحث"));
    };

    const loadAndPaint = async (q = "") => {
      listWrap.innerHTML = `<div class="loading-line"><span class="spin"></span> جارٍ تحميل ${HadithLib.books[key].n}…</div>`;
      try {
        await HadithLib.load(key);
        paint(q);
      } catch {
        listWrap.innerHTML = `<div class="loading-line">تعذّر تحميل الكتاب — تحقق من الاتصال</div>`;
      }
    };
    $s("[data-book]").addEventListener("change", e => { key = e.target.value; loadAndPaint($s("[data-q]").value.trim()); });
    attachSearch($s("[data-q]"), v => v, q => paint(q));
    loadAndPaint();
    wireCommon(shell);
    shell.addEventListener("click", e => {
      const b = e.target.closest("[data-reel-text]");
      if (b) { sessionStorage.setItem("qr_pending_search", b.dataset.reelText); Router.go("#/"); }
    });
  },
});

/* ---------------- تخريج الحديث ---------------- */
registerTool("takhreej", {
  name: "تخريج الحديث", icon: "✅", desc: "الصق نص الحديث ليظهر موضعه في كتب السنة",
  render(root) {
    const shell = toolShell({ icon: "✅", ...this, body: `
      <div class="panel">
        <div class="field">
          <div class="label"><b>الصق نص الحديث (أو جزءًا منه)</b></div>
          <textarea class="textarea" data-t placeholder="مثال: إنما الأعمال بالنيات وإنما لكل امرئ ما نوى…"></textarea>
        </div>
        <div class="row" style="gap:8px;flex-wrap:wrap">
          <span class="muted" style="font-size:.84rem">الكتب المحمّلة:</span>
          <div class="chips" data-picks></div>
        </div>
        <div class="row" style="margin-top:12px;gap:8px">
          <button class="btn btn-gold" data-go>🔎 تحرّج الآن</button>
          <button class="btn btn-ghost" data-sample>جرّب نصًا جاهزًا</button>
        </div>
        <div class="hint" style="margin-top:8px">💡 كلما كانت أول كلمات الحديث دقيقة، كانت النتيجة أدق.</div>
      </div>
      <div data-res style="margin-top:16px"></div>` });
    root.appendChild(shell);
    const $s = sel => shell.querySelector(sel);
    const loaded = new Set(["nawawi", "qudsi"]);
    let active = new Set(["nawawi"]);

    const picks = $s("[data-picks]");
    picks.innerHTML = "";
    Object.entries(HadithLib.books).forEach(([k, v]) => {
      const b = el("button", { class: "chip" + (active.has(k) ? " active" : "") }, v.n + (loaded.has(k) ? " ✓" : ""));
      b.addEventListener("click", async () => {
        if (active.has(k)) { if (active.size > 1) active.delete(k); }
        else {
          active.add(k);
          if (!loaded.has(k)) {
            b.textContent = "جارٍ التحميل…";
            try { await HadithLib.load(k); loaded.add(k); b.textContent = v.n + " ✓"; }
            catch { b.textContent = v.n + " ✗"; toast("تعذّر تحميل " + v.n, "err"); return; }
          }
        }
        b.classList.toggle("active", active.has(k));
      });
      picks.appendChild(b);
    });

    const run = async () => {
      const q = $s("[data-t]").value.trim();
      if (normAr(q).length < 8) { toast("الصق نصًا أطول للحصول على نتيجة دقيقة", "err"); return; }
      const res = $s("[data-res]");
      res.innerHTML = `<div class="loading-line"><span class="spin"></span> جارٍ التحرّج في ${toAr(active.size)} كتاب…</div>`;
      const hits = [];
      for (const k of active) {
        try {
          const list = await HadithLib.load(k);
          loaded.add(k);
          HadithLib.search(list, q).forEach(h => hits.push({ k, h }));
        } catch {}
      }
      if (!hits.length) {
        res.innerHTML = `<div class="panel center"><div style="font-size:1.8rem">🔍</div>
          <p style="margin-top:8px">لم يُعثر على هذا النص في الكتب المحددة.</p>
          <div class="hint">جرّب: تحميل كتب أخرى من الأعلى، أو تأكد من صحة النص — فقد يكون محفوظًا برواية مختلفة.</div></div>`;
        return;
      }
      res.innerHTML = `<div class="row between" style="margin-bottom:10px"><span class="progress-badge">${toAr(hits.length)} موضعًا مقترحًا</span></div>` +
        hits.slice(0, 20).map(({ k, h }) => `
          <div class="list-card">
            <div class="lc-head"><span class="lc-title">${HadithLib.books[k].n} — حديث ${toAr(h.hadithnumber)}</span><span class="badge ok">موجود</span></div>
            <div style="font-size:1.02rem;line-height:2">${esc(h.text.slice(0, 500))}${h.text.length > 500 ? "…" : ""}</div>
            <div class="row" style="margin-top:8px"><button class="btn btn-ghost btn-sm" data-copy="${esc(h.text)}">📋 نسخ النص الكامل</button></div>
          </div>`).join("");
    };
    $s("[data-go]").addEventListener("click", run);
    $s("[data-sample]").addEventListener("click", () => {
      $s("[data-t]").value = "إنما الأعمال بالنيات وإنما لكل امرئ ما نوى";
      run();
    });
    wireCommon(shell);
  },
});

/* ---------------- مصمم بطاقات الآيات (PNG) ---------------- */
registerTool("card", {
  name: "مصمم بطاقات الآيات", icon: "🎨", desc: "صمّم بطاقة آية واحفظها PNG لإنستغرام وحالات الواتساب",
  async render(root) {
    const shell = toolShell({ icon: "🎨", ...this, body: `
      <div class="tool-body side">
        <div class="panel">
          <div class="field"><div class="label"><b>السورة</b></div><select class="select" data-s></select></div>
          <div class="row-2">
            <div class="field"><div class="label"><b>من</b></div><input class="input" type="number" min="1" value="1" data-f></div>
            <div class="field"><div class="label"><b>إلى</b></div><input class="input" type="number" min="1" value="1" data-t></div>
          </div>
          <div class="field"><div class="label"><b>القالب</b></div>
            <div class="seg" data-tpl>
              <button class="active" data-v="classic">كلاسيكي</button>
              <button data-v="night">ليلي</button>
              <button data-v="minimal">بسيط</button>
            </div>
          </div>
          <div class="field"><div class="label"><b>الخلفية</b></div><select class="select" data-bg>${BACKGROUNDS.map(b => `<option value="${b.id}">${b.n}</option>`).join("")}</select></div>
          <div class="field"><div class="label"><b>المقاس</b></div>
            <div class="seg" data-size><button class="active" data-v="1">مربّع 1:1</button><button data-v="story">ستوري 9:16</button></div>
          </div>
          <button class="btn btn-gold btn-block" data-dl>⬇ تحميل البطاقة PNG</button>
        </div>
        <div class="panel center">
          <canvas data-cv width="720" height="720" style="width:100%;max-width:460px;border-radius:18px;box-shadow:var(--shadow)"></canvas>
          <div class="hint" style="margin-top:10px">معاينة — الحجم النهائي 1080 بكسل</div>
        </div>
      </div>` });
    root.appendChild(shell);
    const $s = sel => shell.querySelector(sel);
    await Quran.load();

    const selS = $s("[data-s]");
    Quran.surahs.forEach(s => selS.appendChild(el("option", { value: s.n }, `${toAr(s.n)}. ${Quran.shortName(s.n)}`)));
    selS.value = 94;
    $s("[data-t]").value = 8;

    let tpl = "classic", size = "1";
    const segPick = (wrap, cb) => $$("button", wrap).forEach(b => b.addEventListener("click", () => {
      $$("button", wrap).forEach(x => x.classList.remove("active"));
      b.classList.add("active"); cb(b.dataset.v); draw();
    }));
    segPick($s("[data-tpl]"), v => tpl = v);
    segPick($s("[data-size]"), v => size = v);

    const wrapText = (c, text, maxW, font) => {
      c.font = font;
      const words = text.split(/\s+/);
      const lines = []; let line = "";
      for (const w of words) {
        const t2 = line ? line + " " + w : w;
        if (c.measureText(t2).width > maxW && line) { lines.push(line); line = w; }
        else line = t2;
      }
      if (line) lines.push(line);
      return lines;
    };

    const draw = async () => {
      const cv = $s("[data-cv]");
      const story = size === "story";
      cv.width = story ? 540 : 720;
      cv.height = story ? 960 : 720;
      const c = cv.getContext("2d");
      const W = cv.width, H = cv.height;
      const s = +selS.value;
      let f = Math.max(1, +$s("[data-f]").value || 1);
      let t2 = Math.max(f, +$s("[data-t]").value || f);
      const count = Quran.ayahCount(s);
      f = Math.min(f, count); t2 = Math.min(t2, count);
      const text = Quran.range(s, f, t2).join(" ");

      // الخلفية
      const bg = BACKGROUNDS.find(b => b.id === $s("[data-bg]").value) || BACKGROUNDS[0];
      let img = null;
      if (bg.file) img = await new Promise(res => { const i = new Image(); i.crossOrigin = "anonymous"; i.onload = () => res(i); i.onerror = () => res(null); i.src = bg.file; });
      if (img) {
        const ir = img.width / img.height, cr = W / H;
        let dw, dh;
        if (ir > cr) { dh = H; dw = dh * ir; } else { dw = W; dh = dw / ir; }
        c.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);
      } else if (bg.grad) {
        const g = c.createLinearGradient(0, 0, W, H);
        bg.grad.forEach((col, i) => g.addColorStop(i / (bg.grad.length - 1), col));
        c.fillStyle = g; c.fillRect(0, 0, W, H);
      }
      // طبقات
      if (tpl === "classic") {
        c.fillStyle = "rgba(0,0,0,0.45)"; c.fillRect(0, 0, W, H);
        c.fillStyle = "rgba(4,20,14,0.55)";
        c.fillRect(W * 0.06, H * 0.14, W * 0.88, H * 0.72);
        c.strokeStyle = "rgba(230,196,106,0.75)"; c.lineWidth = 3;
        c.strokeRect(W * 0.06, H * 0.14, W * 0.88, H * 0.72);
      } else if (tpl === "night") {
        const g = c.createLinearGradient(0, 0, 0, H);
        g.addColorStop(0, "rgba(0,0,0,.72)"); g.addColorStop(.5, "rgba(0,0,0,.28)"); g.addColorStop(1, "rgba(0,0,0,.82)");
        c.fillStyle = g; c.fillRect(0, 0, W, H);
      } else {
        c.fillStyle = "rgba(255,255,255,0.86)"; c.fillRect(0, 0, W, H);
      }
      const light = tpl !== "minimal";
      const mainCol = light ? "#fffdf4" : "#123024";
      const accCol = tpl === "minimal" ? "#0e7c5a" : "#e6c46a";

      // العنوان
      c.textAlign = "center"; c.textBaseline = "middle";
      c.fillStyle = accCol;
      c.font = `700 ${W * 0.05}px Tajawal, sans-serif`;
      c.fillText(`سورة ${Quran.shortName(s)}`, W / 2, H * (story ? 0.1 : 0.1));

      // النص
      let fs = W * 0.075;
      let lines = [];
      while (fs > W * 0.035) {
        lines = wrapText(c, "﴿ " + text + " ﴾", W * 0.8, `${fs}px AmiriQuran, Amiri, serif`);
        if (lines.length * fs * 1.95 <= H * (story ? 0.5 : 0.5)) break;
        fs *= 0.93;
      }
      c.font = `${fs}px AmiriQuran, Amiri, serif`;
      c.fillStyle = mainCol;
      c.shadowColor = light ? "rgba(0,0,0,.7)" : "transparent";
      c.shadowBlur = light ? 10 : 0;
      const startY = H / 2 - ((lines.length - 1) * fs * 1.95) / 2;
      lines.forEach((ln, i) => c.fillText(ln, W / 2, startY + i * fs * 1.95));
      c.shadowBlur = 0;

      // المرجع
      c.fillStyle = accCol;
      c.font = `700 ${W * 0.038}px Tajawal, sans-serif`;
      c.fillText(ayahRef(s, f, t2), W / 2, H * (story ? 0.78 : 0.8));

      // العلامة
      c.fillStyle = light ? "rgba(255,255,255,.7)" : "rgba(18,48,36,.75)";
      c.font = `500 ${W * 0.028}px Tajawal, sans-serif`;
      c.fillText("﴿ قرآن ريلز ﴾", W / 2, H * (story ? 0.87 : 0.9));
    };

    [selS, $s("[data-f]"), $s("[data-t]"), $s("[data-bg]")].forEach(x => x.addEventListener("change", draw));
    $s("[data-dl]").addEventListener("click", async () => {
      await draw();
      const cv = $s("[data-cv]");
      const full = document.createElement("canvas");
      full.width = size === "story" ? 1080 : 1080;
      full.height = size === "story" ? 1920 : 1080;
      const fc = full.getContext("2d");
      fc.imageSmoothingQuality = "high";
      fc.drawImage(cv, 0, 0, full.width, full.height);
      full.toBlob(blob => {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `ayah-card-${selS.value}-${$s("[data-f]").value}.png`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 4000);
        toast("تم تحميل البطاقة ✓");
      }, "image/png");
    });
    draw();
  },
});
