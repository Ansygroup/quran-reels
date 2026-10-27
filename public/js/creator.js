/* ============================================================
   قرآن ريلز — واجهة صانع الريلز
   ============================================================ */
const Creator = {
  renderer: null,
  ready: false,
  prepared: false,
  exporting: false,
  _abort: null,
  _needDraw: true,
  _dirtyTimer: 0,

  RATIOS: {
    "9:16": { w: 1080, h: 1920, pw: 405, ph: 720, cls: "" },
    "1:1": { w: 1080, h: 1080, pw: 560, ph: 560, cls: "ratio-1-1" },
    "16:9": { w: 1920, h: 1080, pw: 640, ph: 360, cls: "ratio-16-9" },
  },

  async init() {
    this.renderer = new ReelRenderer($("#reelCanvas"));
    Selection.restore();
    await Quran.load();

    this._populateSurahs();
    this._populateReciters();
    this._populateFamous();
    this._populateTranslations();
    this._populateBackgrounds();
    this._populateQuick();
    this._bind();
    this._applySelectionToUI();
    await this._applyBackground();
    this._syncVerses(true);
    this._loop();
    setInterval(() => this._updateClocks(), 500);
    this.ready = true;
  },

  /* ---------------- تعبئة العناصر ---------------- */
  _populateSurahs() {
    const sel = $("#selSurah");
    sel.innerHTML = "";
    for (const s of Quran.surahs) {
      sel.appendChild(el("option", { value: s.n }, `${toAr(s.n)}. ${s.name.replace(/^سُورَةُ?\s*/, "")} — ${toAr(s.count)} آية`));
    }
  },
  _populateReciters() {
    const sel = $("#selReciter");
    sel.innerHTML = "";
    RECITERS.forEach((r, i) => {
      sel.appendChild(el("option", { value: r.folder }, r.n + (r.tag ? ` — ${r.tag}` : "")));
    });
  },
  _populateTranslations() {
    const sel = $("#selTrans");
    sel.innerHTML = "";
    TRANSLATIONS.forEach(t => sel.appendChild(el("option", { value: t.id }, t.n)));
  },
  _populateFamous() {
    const sel = $("#selFamous");
    sel.innerHTML = `<option value="">— اختر من الآيات المشهورة —</option>`;
    for (const grp of FAMOUS) {
      const og = el("optgroup", { label: grp.g });
      grp.i.forEach(([t, s, a, b], ix) => {
        og.appendChild(el("option", { value: `${s}:${a}:${b}` }, t));
      });
      sel.appendChild(og);
    }
  },
  _populateQuick() {
    const wrap = $("#quickMsgs");
    wrap.innerHTML = "";
    QUICK_MSGS.forEach(q => {
      const b = el("button", { class: "chip" + (q.id === "all" ? " active" : ""), dataset: { q: q.id } }, q.n);
      b.addEventListener("click", () => {
        $$("#quickMsgs .chip").forEach(c => c.classList.remove("active"));
        b.classList.add("active");
        this._quickPick(q.id);
      });
      wrap.appendChild(b);
    });
  },
  _populateBackgrounds() {
    const grid = $("#bgGrid");
    grid.innerHTML = "";
    const items = [...BACKGROUNDS];
    items.forEach(bg => {
      const t = el("div", { class: "bg-thumb", dataset: { bg: bg.id }, title: bg.n });
      if (bg.file) t.appendChild(el("img", { src: bg.file, alt: bg.n, loading: "lazy" }));
      else if (bg.grad) {
        t.style.background = `linear-gradient(160deg, ${bg.grad.join(",")})`;
      }
      t.appendChild(el("span", { class: "bgname" }, bg.n));
      t.addEventListener("click", () => {
        store.del("bgCustom");
        this._bgCustom = null;
        Selection.bg = bg.id;
        this._applyBackground();
        this._markSel();
      });
      grid.appendChild(t);
    });
    this._syncBgActive();
  },
  _syncBgActive() {
    $$("#bgGrid .bg-thumb").forEach(t => t.classList.toggle("active", !this._bgCustom && t.dataset.bg === Selection.bg));
    $("#uploadBox")?.classList.toggle("active", !!this._bgCustom);
  },

  /* ---------------- أحداث ---------------- */
  _bind() {
    const save = () => { Selection.save(); };

    $("#selSurah").addEventListener("change", e => {
      const s = +e.target.value;
      Selection.surah = s;
      const count = Quran.ayahCount(s);
      Selection.from = 1;
      Selection.to = count <= 40 ? count : 10;
      $("#txtFrom").value = Selection.from;
      $("#txtTo").value = Selection.to;
      $("#selFamous").value = "";
      this._syncVerses();
      save();
    });
    const rangeChanged = () => {
      const count = Quran.ayahCount(Selection.surah);
      let f = Math.max(1, Math.min(count, parseInt($("#txtFrom").value) || 1));
      let t = Math.max(1, Math.min(count, parseInt($("#txtTo").value) || 1));
      if (t < f) [f, t] = [t, f];
      if (t - f + 1 > 40) t = f + 39;
      Selection.from = f; Selection.to = t;
      $("#txtFrom").value = f; $("#txtTo").value = t;
      this._syncVerses();
      save();
    };
    $("#txtFrom").addEventListener("change", rangeChanged);
    $("#txtTo").addEventListener("change", rangeChanged);
    $("#stepFromM").addEventListener("click", () => { $("#txtFrom").value = Math.max(1, Selection.from - 1); rangeChanged(); });
    $("#stepFromP").addEventListener("click", () => { $("#txtFrom").value = Selection.from + 1; rangeChanged(); });
    $("#stepToM").addEventListener("click", () => { $("#txtTo").value = Math.max(1, Selection.to - 1); rangeChanged(); });
    $("#stepToP").addEventListener("click", () => { $("#txtTo").value = Selection.to + 1; rangeChanged(); });

    $("#selFamous").addEventListener("change", e => {
      if (!e.target.value) return;
      const [s, a, b] = e.target.value.split(":").map(Number);
      this.setSelection(s, a, b, true);
      toast("تم اختيار المقطع ✓");
    });

    $("#selReciter").addEventListener("change", e => {
      Selection.reciter = e.target.value;
      this.prepared = false;
      save();
    });

    $("#selTrans").addEventListener("change", async e => {
      Selection.translation = e.target.value;
      Selection.showTrans = e.target.value !== "none";
      $("#chkTrans").checked = Selection.showTrans;
      const hint = $("#transHint");
      if (e.target.value === "none") { hint.textContent = "الفيديو سيعرض النص القرآني فقط."; hint.className = "hint"; }
      else if (e.target.value === "ar") {
        hint.textContent = "سيُضاف نص الآية بلغة عربية مبسّطة أسفل الآية."; hint.className = "hint ok";
        this._customTrans = "";
      } else {
        hint.textContent = "جارٍ تحميل ملف الترجمة…"; hint.className = "hint";
        try {
          await Quran.loadTranslation(e.target.value);
          hint.textContent = "الترجمة جاهزة ✓ ستظهر أسفل الآية داخل الفيديو.";
          hint.className = "hint ok";
        } catch {
          hint.textContent = "تعذّر تحميل الترجمة — جرّب لغة أخرى."; hint.className = "hint warn";
        }
      }
      this._updateTransForRenderer();
      this._dirty();
      save();
    });

    // الإهداء
    $("#selDedPreset").addEventListener("change", e => {
      const v = e.target.value;
      Selection.dedMode = v === "none" ? "none" : "custom";
      const inp = $("#txtDed");
      inp.parentElement.style.display = v === "none" ? "none" : "";
      if (v !== "none" && v !== "custom") inp.value = v;
      if (v === "custom") inp.focus();
      Selection.dedText = inp.value;
      this._dirty(); save();
    });
    $("#txtDed").addEventListener("input", e => {
      Selection.dedMode = "custom";
      Selection.dedText = e.target.value;
      this._dirty(); save();
    });

    // الأسلوب
    $$("#segStyle button").forEach(b => b.addEventListener("click", () => {
      $$("#segStyle button").forEach(x => x.classList.remove("active"));
      b.classList.add("active");
      Selection.style = b.dataset.style;
      this.renderer.setConfig({ style: b.dataset.style });
      this._dirty(); save();
    }));
    $$("#segRatio button").forEach(b => b.addEventListener("click", () => {
      $$("#segRatio button").forEach(x => x.classList.remove("active"));
      b.classList.add("active");
      Selection.ratio = b.dataset.ratio;
      this._resizeCanvas();
      this._dirty(); save();
    }));
    $("#selQuality").addEventListener("change", e => { Selection.quality = +e.target.value; save(); });
    $("#selAccent").addEventListener("change", e => {
      Selection.accent = e.target.value;
      this.renderer.setConfig({ accent: e.target.value });
      this._dirty(); save();
    });
    $("#rngFont").addEventListener("input", e => {
      Selection.fontSize = +e.target.value;
      $("#fontVal").textContent = Selection.fontSize + "٪";
      this.renderer.setConfig({ fontSize: Selection.fontSize });
      this._dirty(); save();
    });
    $("#chkTrans").addEventListener("change", e => {
      Selection.showTrans = e.target.checked;
      this._updateTransForRenderer(); this._dirty(); save();
    });
    $("#chkWm").addEventListener("change", e => { Selection.showWatermark = e.target.checked; this.renderer.setConfig({ showWatermark: e.target.checked }); this._dirty(); save(); });
    $("#chkMotion").addEventListener("change", e => { Selection.motion = e.target.checked; this.renderer.setConfig({ motion: e.target.checked }); this._dirty(); save(); });

    // الخلفية
    $("#btnBgRandom").addEventListener("click", () => {
      const list = BACKGROUNDS.filter(b => b.id !== Selection.bg);
      const pick = list[Math.floor(Math.random() * list.length)];
      this._bgCustom = null;
      Selection.bg = pick.id;
      this._applyBackground();
      toast("خُيّرت لك خلفية: " + pick.n);
      this._markSel();
    });
    $("#btnBgUpload").addEventListener("click", () => $("#bgUpload").click());
    $("#uploadBox").addEventListener("click", () => $("#bgUpload").click());
    $("#bgUpload").addEventListener("change", e => {
      const f = e.target.files[0];
      if (!f) return;
      if (!f.type.startsWith("image/")) { toast("الرجاء اختيار ملف صورة", "err"); return; }
      const url = URL.createObjectURL(f);
      this._bgCustom = url;
      this._applyBackground(url);
      toast("ستبقى صورتك على جهازك فقط 🔒");
    });
    $("#btnBgRemove").addEventListener("click", () => {
      if (this._bgCustom) URL.revokeObjectURL(this._bgCustom);
      this._bgCustom = null;
      store.del("bgCustom");
      $("#bgUpload").value = "";
      this._applyBackground();
      this._syncBgActive();
    });

    // التبويبات
    $$(".step-tab").forEach(tab => tab.addEventListener("click", () => {
      $$(".step-tab").forEach(t => t.classList.remove("active"));
      $$(".step-pane").forEach(p => p.classList.remove("active"));
      tab.classList.add("active");
      $("#pane-" + tab.dataset.pane).classList.add("active");
      store.set("creatorTab", tab.dataset.pane);
    }));

    // تحكّم المعاينة
    $("#btnPlay").addEventListener("click", () => this._togglePlay());
    $("#btnPrevAyah").addEventListener("click", () => this._seekRel(-1));
    $("#btnNextAyah").addEventListener("click", () => this._seekRel(1));

    // الإنشاء
    $("#btnCreate").addEventListener("click", () => this.startExport());
    document.addEventListener("visibilitychange", () => {
      if (document.hidden && this.exporting) { /* نستمر لضبط التسجيل */ }
    });
  },

  _markSel() { this._syncBgActive(); this._dirty(); Selection.save(); },

  _quickPick(id) {
    if (id === "all") {
      $("#selFamous").focus();
      toast("اختر من قائمة الآيات المشهورة في تبويب النص");
      return;
    }
    let pool = FAMOUS;
    if (id === "me") {
      const all = FAMOUS.flatMap(g => g.i);
      const pick = all[Math.floor(Math.random() * all.length)];
      this.setSelection(pick[1], pick[2], pick[3], true);
      toast("رسالة لك: " + pick[0]);
      return;
    }
    const grp = FAMOUS.find(g => g.tag === id);
    if (!grp || !grp.i.length) { toast("لا توجد رسائل في هذا التصنيف", "err"); return; }
    const pick = grp.i[Math.floor(Math.random() * grp.i.length)];
    this.setSelection(pick[1], pick[2], pick[3], true);
    $("#msgVerse").innerHTML = `<div class="inline-ayah">${esc(Quran.range(pick[1], pick[2], pick[3])[0])}</div>
      <div class="hint center">${esc(ayahRef(pick[1], pick[2], pick[3]))} — ${esc(pick[0])}</div>`;
  },

  /** اختيار مقطع من الخارج (آية اليوم مثلاً) */
  setSelection(s, a, b = a, jump = false) {
    const count = Quran.ayahCount(s);
    Selection.surah = s;
    Selection.from = Math.max(1, Math.min(a, count));
    Selection.to = Math.max(Selection.from, Math.min(b || a, count));
    if (jump) {
      $("#selSurah").value = s;
      $("#txtFrom").value = Selection.from;
      $("#txtTo").value = Selection.to;
      $("#selFamous").value = "";
      this._syncVerses();
      Selection.save();
    }
  },

  _applySelectionToUI() {
    $("#selSurah").value = Selection.surah;
    $("#txtFrom").value = Selection.from;
    $("#txtTo").value = Selection.to;
    $("#selReciter").value = Selection.reciter;
    $("#selTrans").value = Selection.translation;
    $("#selAccent").value = Selection.accent || "gold";
    $("#selQuality").value = String(Selection.quality || 1080);
    $("#rngFont").value = Selection.fontSize || 100;
    $("#fontVal").textContent = (Selection.fontSize || 100) + "٪";
    $("#chkWm").checked = Selection.showWatermark !== false;
    $("#chkMotion").checked = Selection.motion !== false;
    $("#chkTrans").checked = Selection.showTrans !== false && Selection.translation !== "none";
    $$("#segStyle button").forEach(b => b.classList.toggle("active", b.dataset.style === (Selection.style || "card")));
    $$("#segRatio button").forEach(b => b.classList.toggle("active", b.dataset.ratio === Selection.ratio));
    // الإهداء
    const preset = $("#selDedPreset");
    preset.value = Selection.dedMode === "none" ? "none" : (Selection.dedText || "custom");
    if (Selection.dedMode === "none") $("#txtDed").parentElement.style.display = "none";
    else $("#txtDed").parentElement.style.display = "";
    $("#txtDed").value = Selection.dedText || "";
    // تبويب محفوظ
    const tab = store.get("creatorTab");
    if (tab && $("#pane-" + tab)) {
      $$(".step-tab").forEach(t => t.classList.toggle("active", t.dataset.pane === tab));
      $$(".step-pane").forEach(p => p.classList.toggle("active", p.id === "pane-" + tab));
    }
    this._resizeCanvas();
    const st = {
      accent: Selection.accent || "gold",
      showWatermark: Selection.showWatermark !== false,
      motion: Selection.motion !== false,
      fontSize: Selection.fontSize || 100,
      style: Selection.style || "card",
      showTrans: Selection.showTrans !== false,
      translationId: Selection.translation,
      dedMode: Selection.dedMode || "none",
      dedText: Selection.dedText || "",
      reciterName: (RECITERS.find(r => r.folder === Selection.reciter) || {}).n || "",
      surahName: "سورة " + Quran.shortName(Selection.surah),
    };
    this.renderer.setConfig(st);
    if (Selection.translation !== "none" && Selection.translation !== "ar") {
      Quran.loadTranslation(Selection.translation).then(() => {
        this._updateTransForRenderer(); this._dirty();
      }).catch(() => {});
    }
  },

  async _applyBackground(customUrl = null) {
    const url = customUrl !== null ? customUrl : (this._bgCustom || null);
    const bg = BACKGROUNDS.find(b => b.id === Selection.bg) || BACKGROUNDS[0];
    await this.renderer.setBackground(bg, url);
    this._syncBgActive();
    this._dirty();
  },

  _resizeCanvas() {
    const r = this.RATIOS[Selection.ratio] || this.RATIOS["9:16"];
    const cv = $("#reelCanvas");
    cv.width = r.pw; cv.height = r.ph;
    const screen = $("#phoneScreen");
    screen.className = "phone-screen " + r.cls;
    this.renderer._lineCache = {};
    this._dirty();
  },

  _updateTransForRenderer() {
    const id = Selection.translation;
    let txt = "";
    const v = (this.renderer.state.verses || [])[this.renderer.state.index];
    if (v && id && id !== "none") {
      if (id === "ar") txt = Quran.ayah(v.s, v.a);
      else txt = Quran.trText(id, v.s, v.a);
    }
    this.renderer.setConfig({ customTrans: txt, translationId: id, showTrans: Selection.showTrans && id !== "none" });
  },

  /* ---------------- مزامنة الآيات ---------------- */
  _syncVerses(rebuildPlayer = false) {
    const list = Selection.list();
    this.renderer.setConfig({
      verses: list.map(v => ({ ...v, text: Quran.ayah(v.s, v.a) })),
      index: 0, ayahElapsed: 99, elapsed: 0,
      surahName: "سورة " + Quran.shortName(Selection.surah),
      reciterName: (RECITERS.find(r => r.folder === Selection.reciter) || {}).n || "",
      dedMode: Selection.dedMode, dedText: Selection.dedText,
      customTrans: "",
    });
    AyahPlayer.stop();
    AyahPlayer.prepareSilent(list);
    this.prepared = false;
    this._updateTransForRenderer();
    this._updateDots(0);
    // معاينة النص + تقدير المدة
    const first = Quran.range(Selection.surah, Selection.from, Selection.from)[0];
    $("#curAyahPreview").innerHTML = `<div class="verse-preview">${esc(first)}</div>`;
    const est = AyahPlayer.totalDuration();
    $("#rangeInfo").innerHTML = `<span class="range-badge">${toAr(list.length)} آية · ${esc(ayahRef(Selection.surah, Selection.from, Selection.to))}</span>
      <span class="range-badge" style="background:rgba(212,175,55,.1);border-color:var(--line);color:var(--gold-3)">⏱ ~${toAr(Math.round(est))} ثانية</span>
      ${list.length > 40 ? '<span class="range-badge" style="background:rgba(248,113,113,.1);border-color:rgba(248,113,113,.4);color:#fca5a5">الحد 40 آية</span>' : ""}`;
    this._setPlayIcon(false);
    $("#previewNote").textContent = "اضغط ▶ لمعاينة التلاوة — أو أنشئ الفيديو مباشرة.";
    this._dirty();
  },

  _updateDots(i) {
    const wrap = $("#ayahDots");
    const verses = this.renderer.state.verses;
    wrap.innerHTML = "";
    if (verses.length > 1) {
      verses.forEach((v, k) => {
        const d = el("button", { class: "ayah-dot" + (k === i ? " active" : ""), title: "آية " + v.a }, toAr(v.a));
        d.addEventListener("click", () => { AyahPlayer.seekAyah(k); this.renderer.state.index = k; this.renderer.state.ayahElapsed = 99; this._updateTransForRenderer(); this._updateDots(k); this._dirty(); });
        wrap.appendChild(d);
      });
    }
  },

  /* ---------------- التشغيل ---------------- */
  async _togglePlay() {
    if (this.exporting) return;
    if (AyahPlayer.playing && !AyahPlayer.paused) { AyahPlayer.pause(); return; }
    if (AyahPlayer.playing && AyahPlayer.paused) { AyahPlayer.resume(); return; }
    const btn = $("#btnPlay");
    btn.disabled = true;
    const note = $("#previewNote");
    try {
      if (!this.prepared) {
        note.innerHTML = `<span class="spin" style="display:inline-block;width:12px;height:12px;border:2px solid rgba(255,255,255,.2);border-top-color:var(--gold);border-radius:50%;animation:spin .8s linear infinite"></span> جارٍ تحميل التلاوة…`;
        const res = await AyahPlayer.prepare(Selection.reciter, Selection.list(), (d, t) => {
          note.textContent = `تحميل التلاوة… ${toAr(d)}/${toAr(t)}`;
        });
        this.prepared = true;
        if (res.ok === 0) {
          AyahPlayer.prepareSilent(Selection.list());
          toast("تعذّر تحميل الصوت — المعاينة بدون صوت", "err");
        } else if (res.failed > 0) {
          toast(`تعذّر تحميل ${toAr(res.failed)} آية — سيتم تخطّيها`, "err");
        }
      }
      this._wirePlayerEvents();
      AyahPlayer.play(AyahPlayer.index || 0, 0);
      note.textContent = "المعاينة تعمل… استمتع 🎧";
    } catch (e) {
      console.error(e);
      toast("تعذّر تشغيل المعاينة", "err");
      note.textContent = "تعذّر التشغيل — حاول مجددًا.";
    }
    btn.disabled = false;
  },

  _seekRel(dir) {
    const cur = AyahPlayer.index;
    const next = Math.max(0, Math.min(this.renderer.state.verses.length - 1, cur + dir));
    AyahPlayer.seekAyah(next);
    this.renderer.state.index = next;
    this.renderer.state.ayahElapsed = 99;
    this._updateTransForRenderer();
    this._updateDots(next);
    this._dirty();
  },

  _wirePlayerEvents() {
    AyahPlayer.onAyah = i => {
      this.renderer.state.index = i;
      this.renderer.state.ayahElapsed = 0;
      this._updateTransForRenderer();
      this._updateDots(i);
      this._dirty();
    };
    AyahPlayer.onTick = (elapsed, total, idx, ayahElapsed) => {
      this.renderer.state.elapsed = elapsed;
      this.renderer.state.total = total;
      this.renderer.state.ayahElapsed = ayahElapsed;
      $("#tCur").textContent = this._fmt(elapsed);
      $("#tTotal").textContent = this._fmt(total);
      $("#timeFill").style.width = (total ? (elapsed / total) * 100 : 0) + "%";
      this._dirty();
    };
    AyahPlayer.onState = playing => this._setPlayIcon(playing);
    AyahPlayer.onEnd = () => {
      this._setPlayIcon(false);
      $("#previewNote").textContent = "انتهت المعاينة — يمكنك الإنشاء الآن ✨";
      this.renderer.state.elapsed = this.renderer.state.total;
      this._dirty();
    };
  },

  _setPlayIcon(playing) {
    $("#btnPlay").textContent = playing ? "⏸" : "▶";
  },
  _fmt(s) {
    s = Math.max(0, Math.round(s || 0));
    return String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0");
  },
  _updateClocks() {
    if (!AyahPlayer.playing) {
      $("#tTotal").textContent = this._fmt(AyahPlayer.totalDuration());
    }
  },

  _dirty() { this._needDraw = true; },

  _loop() {
    const step = () => {
      if (this._needDraw || AyahPlayer.playing) {
        if (!AyahPlayer.playing && this.renderer.state.ayahElapsed < 99 && this.renderer.state.elapsed === 0) {
          // إطار ساكن كامل
          this.renderer.state.ayahElapsed = 99;
        }
        this.renderer.draw();
        if (this.exporting) this._mirrorExport();
        this._needDraw = AyahPlayer.playing ? true : false;
      }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  },

  /* ---------------- الإنشاء/التسجيل ---------------- */
  async startExport() {
    if (this.exporting) return;
    await Quran.load();

    const count = Selection.count();
    if (count < 1) { toast("اختر الآيات أولًا", "err"); return; }
    if (!this.prepared && !AyahPlayer.playing) {
      // تحضير الصوت قبل التسجيل
      this._setPlayIcon(false);
      const ok = await this._prepareForExport();
      if (ok === "abort") return;
    }
    const total = AyahPlayer.totalDuration();
    if (total > 300) {
      const yes = await confirmDialog("المدة طويلة", `مدة الفيديو ~${Math.round(total / 60)} دقيقة (الحد 5 دقائق). هل تريد المتابعة؟`, "متابعة");
      if (!yes) return;
    }

    this.exporting = true;
    this._abort = new AbortController();
    AyahPlayer.stop();

    // تصعيد الكانفاس لدقة التصدير
    const R = this.RATIOS[Selection.ratio] || this.RATIOS["9:16"];
    const f = Selection.quality === 720 ? 2 / 3 : 1;
    const cvv = $("#reelCanvas");
    this._savedDims = { w: cvv.width, h: cvv.height };
    cvv.width = Math.round(R.w * f);
    cvv.height = Math.round(R.h * f);
    this.renderer._lineCache = {};
    this._dirty();

    const ov = $("#exportOverlay");
    ov.hidden = false;
    $("#expResult").hidden = true;
    $("#expRunning").hidden = false;
    $("#expPct").textContent = "0%";
    $("#expBar").style.width = "0%";
    $("#expStage").textContent = "جارٍ تحضير التلاوة…";
    $("#expSub").textContent = "اترك الصفحة مفتوحة حتى يكتمل الفيديو";
    AyahPlayer.onEnd = null; AyahPlayer.onTick = null; AyahPlayer.onState = null;

    try {
      if (!this.prepared) await this._prepareForExport();
      $("#expStage").textContent = "جارٍ تسجيل الفيديو…";
      const res = await ReelRecorder.record({
        canvas: $("#reelCanvas"),
        renderer: this.renderer,
        player: AyahPlayer,
        signal: this._abort.signal,
        onStage: s => { if (s === "recording") $("#expStage").textContent = "جارٍ تسجيل الفيديو…"; },
        onProgress: (p, el_, tot) => {
          const pct = Math.round(p * 100);
          $("#expPct").textContent = pct + "%";
          $("#expBar").style.width = pct + "%";
          $("#expStage").textContent = `جارٍ إنشاء الفيديو… ${this._fmt(el_)} / ${this._fmt(tot)}`;
        },
      });
      this._onExportDone(res);
    } catch (e) {
      console.error(e);
      if (e && e.message === "aborted") { toast("تم إيقاف الإنشاء"); }
      else {
        toast("حدث خطأ أثناء الإنشاء — جرّب جودة أقل", "err");
        $("#expStage").textContent = "حدث خطأ: " + (e.message || e);
      }
      this.exporting = false;
      if (this._savedDims) { this._savedDims = null; this._resizeCanvas(); }
      if (e && e.message === "aborted") ov.hidden = true;
    }
  },

  _prepareForExport() {
    return new Promise(async resolve => {
      const note = $("#expStage");
      try {
        const res = await AyahPlayer.prepare(Selection.reciter, Selection.list(), (d, t) => {
          $("#expBar").style.width = Math.round((d / t) * 15) + "%";
          note.textContent = `تحضير التلاوة… ${toAr(d)}/${toAr(t)}`;
        });
        this.prepared = true;
        if (res.ok === 0) {
          AyahPlayer.prepareSilent(Selection.list());
          toast("سيُنشأ الفيديو بدون صوت (تعذّر تحميل التلاوة)", "err");
        }
        resolve(true);
      } catch {
        AyahPlayer.prepareSilent(Selection.list());
        resolve(true);
      }
    });
  },

  _mirrorExport() {
    const m = $("#miniCanvas");
    if (!m || !m.width) return;
    const mc = m.getContext("2d");
    const src = $("#reelCanvas");
    mc.drawImage(src, 0, 0, m.width, m.height);
  },

  async _onExportDone(res) {
    this.exporting = false;
    if (this._savedDims) { const d = this._savedDims; this._savedDims = null; setTimeout(() => this._resizeCanvas(), 350); }
    const url = URL.createObjectURL(res.blob);
    const ext = (res.mime || "").includes("mp4") ? "mp4" : "webm";
    const name = `quran-reels-${Selection.surah}-${Selection.from}-${Selection.to}.${ext}`;
    $("#expRunning").hidden = true;
    $("#expResult").hidden = false;
    $("#expPct").textContent = "100%";
    $("#resultVideo").src = url;
    $("#resultMeta").textContent = `${name} · ${(res.blob.size / 1048576).toFixed(1)} م.ب`;
    const dl = $("#btnDownload");
    dl.href = url; dl.download = name;
    $("#btnShare").onclick = async () => {
      try {
        const file = new File([res.blob], name, { type: res.mime });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: "ريلز قرآن" });
        } else {
          dl.click();
          toast("تم بدء التحميل — شاركه من جهازك");
        }
      } catch { dl.click(); }
    };
    if ($("#chkNotify")?.checked && "Notification" in window && Notification.permission === "granted") {
      try { new Notification("اكتمل الفيديو ✨", { body: "ريلزك القرآني جاهز للتحميل" }); } catch {}
    }
    const sb = $("#btnSchedule");
    if (sb) sb.onclick = () => { if (typeof QRPublish !== "undefined") QRPublish.scheduleFromExport(res.blob, name); };
    $("#btnNew").onclick = () => {
      $("#exportOverlay").hidden = true;
      URL.revokeObjectURL(url);
      this._wirePlayerEvents();
      this._dirty();
    };
    toast("تم إنشاء الفيديو بنجاح ✨");
    // تنظيف
    this._wirePlayerEvents();
    this.renderer.state.elapsed = 0;
    this.renderer.state.ayahElapsed = 99;
    this._dirty();
  },

  cancelExport() {
    this._abort?.abort();
  },
};


/* زر إيقاف الإنشاء: كان معالجًا يدويًا في HTML — نُقل هنا للتوافق مع CSP الصارم */
const _btnCancelExp = document.getElementById("btnCancelExport");
if (_btnCancelExp) _btnCancelExp.addEventListener("click", () => {
  try { Creator.cancelExport(); } catch (e) { console.error(e); }
});
