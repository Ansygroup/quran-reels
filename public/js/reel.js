/* ============================================================
   قرآن ريلز — محرّك الريلز: رسم + تلاوة + تسجيل
   ============================================================ */

/* ---------------- أصوات الآيات (everyayah عبر البروكسي) ---------------- */
const AyahPlayer = {
  ctx: null,
  dest: null,          // MediaStreamAudioDestination (للتسجيل)
  gain: null,
  cache: new Map(),    // key → AudioBuffer
  ayat: [],            // [{s,a}]
  reciter: null,
  index: 0,
  startedAt: 0,        // ctx.currentTime عند بدء الآية الحالية
  offset: 0,           // موضع التشغيل داخل الآية
  playing: false,
  paused: false,
  silent: false,       // وضع بدون صوت (تقدير المدد)
  estimates: [],       // مدد تقديرية بالثواني
  _src: null,
  _raf: 0,
  onTick: null,        // (elapsed, total, index, ayahElapsed)
  onAyah: null,        // (index)
  onEnd: null,
  onState: null,

  ensureCtx() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.gain = this.ctx.createGain();
      this.dest = this.ctx.createMediaStreamDestination();
      this.gain.connect(this.ctx.destination);
      this.gain.connect(this.dest);
    }
    if (this.ctx.state === "suspended") this.ctx.resume();
    return this.ctx;
  },

  url(reciter, s, a) {
    const folder = reciter;
    return `/proxy?u=${encodeURIComponent(`https://everyayah.com/data/${folder}/${pad(s)}${pad(a)}.mp3`)}`;
  },

  estimate(s, a) {
    const text = Quran.ayah(s, a) || "";
    const words = text.split(/\s+/).length;
    const len = text.length;
    return Math.min(28, Math.max(2.6, words * 0.75 + len * 0.028 + 1.1));
  },

  /** جلب وفك ترميز كل الآيات — يعيد {ok, total} */
  async prepare(reciter, ayat, onProgress) {
    this.reciter = reciter; this.ayat = ayat;
    this.silent = false;
    this.estimates = ayat.map(v => this.estimate(v.s, v.a));
    this.ensureCtx();
    let done = 0;
    const errs = [];
    for (const v of ayat) {
      const key = reciter + "/" + v.s + ":" + v.a;
      if (!this.cache.has(key)) {
        try {
          const r = await fetch(this.url(reciter, v.s, v.a));
          if (!r.ok) throw new Error("HTTP " + r.status);
          const buf = await r.arrayBuffer();
          const audio = await this.ctx.decodeAudioData(buf);
          this.cache.set(key, audio);
        } catch (e) {
          errs.push(v);
          // بديل: محاولة مباشرة بدون بروكسي (لو كان السماح بالـ CORS)
          try {
            const r2 = await fetch(`https://everyayah.com/data/${reciter}/${pad(v.s)}${pad(v.a)}.mp3`);
            const buf = await r2.arrayBuffer();
            const audio = await this.ctx.decodeAudioData(buf);
            this.cache.set(key, audio);
          } catch {}
        }
      }
      done++;
      onProgress && onProgress(done, ayat.length);
    }
    // المدد الحقيقية
    this.estimates = ayat.map((v, i) => {
      const b = this.cache.get(reciter + "/" + v.s + ":" + v.a);
      return b ? b.duration : this.estimates[i];
    });
    const have = ayat.filter(v => this.cache.has(reciter + "/" + v.s + ":" + v.a)).length;
    return { ok: have, total: ayat.length, failed: ayat.length - have };
  },

  prepareSilent(ayat) {
    this.ayat = ayat; this.silent = true;
    this.estimates = ayat.map(v => this.estimate(v.s, v.a));
  },

  durationAt(i) { return this.estimates[i] || 3; },
  totalDuration() { return this.estimates.reduce((a, b) => a + b, 0); },
  elapsedBefore(i) {
    let t = 0;
    for (let k = 0; k < i; k++) t += this.durationAt(k);
    return t;
  },

  _key(i) {
    const v = this.ayat[i];
    return this.reciter + "/" + v.s + ":" + v.a;
  },

  play(fromIndex = 0, fromOffset = 0) {
    this.ensureCtx();
    this.stopSource();
    this.index = Math.max(0, Math.min(fromIndex, this.ayat.length - 1));
    this.offset = fromOffset;
    this.playing = true; this.paused = false;
    this._startCurrent();
    this._loop();
    this.onState && this.onState(true);
  },

  _startCurrent() {
    if (this.silent) {
      this._silentStart = performance.now() - this.offset * 1000;
      this.onAyah && this.onAyah(this.index);
      return;
    }
    const buf = this.cache.get(this._key(this.index));
    if (!buf) { this._advance(); return; }
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.connect(this.gain);
    const off = Math.min(this.offset, buf.duration - 0.05);
    src.start(0, Math.max(0, off));
    this.startedAt = this.ctx.currentTime - Math.max(0, off);
    this._src = src;
    this.onAyah && this.onAyah(this.index);
    src.onended = () => {
      if (this._src !== src || !this.playing || this.paused) return;
      this.offset = 0;
      this._advance();
    };
  },

  _advance() {
    if (this.index >= this.ayat.length - 1) {
      this.playing = false;
      this.stopSource();
      this.onEnd && this.onEnd();
      this.onState && this.onState(false);
      return;
    }
    this.index++;
    this.offset = 0;
    this._startCurrent();
  },

  _loop() {
    cancelAnimationFrame(this._raf);
    const step = () => {
      if (!this.playing || this.paused) return;
      let ayahElapsed;
      if (this.silent) {
        ayahElapsed = (performance.now() - this._silentStart) / 1000;
        if (ayahElapsed >= this.durationAt(this.index)) { this._advance(); return; }
      } else {
        ayahElapsed = this.ctx.currentTime - this.startedAt;
        const dur = this.durationAt(this.index);
        // حارس أمان لو لم يعمل onended
        if (ayahElapsed > dur + 0.6 && this._src) { this._advance(); return; }
      }
      const elapsed = this.elapsedBefore(this.index) + Math.min(ayahElapsed, this.durationAt(this.index));
      this.onTick && this.onTick(elapsed, this.totalDuration(), this.index, ayahElapsed);
      this._raf = requestAnimationFrame(step);
    };
    this._raf = requestAnimationFrame(step);
  },

  pause() {
    if (!this.playing || this.paused) return;
    this.paused = true;
    if (!this.silent) {
      this.offset = Math.max(0, this.ctx.currentTime - this.startedAt);
      this.stopSource();
    } else {
      this.offset = (performance.now() - this._silentStart) / 1000;
    }
    this.onState && this.onState(false);
  },

  resume() {
    if (!this.playing) { this.play(0); return; }
    if (!this.paused) return;
    this.paused = false;
    this._startCurrent();
    this._loop();
    this.onState && this.onState(true);
  },

  seekAyah(i, offset = 0) {
    const wasPlaying = this.playing && !this.paused;
    this.stopSource();
    if (wasPlaying) this.play(i, offset);
    else {
      this.index = Math.max(0, Math.min(i, this.ayat.length - 1));
      this.offset = offset;
      this.playing = false; this.paused = false;
      this.onAyah && this.onAyah(this.index);
      this.onTick && this.onTick(this.elapsedBefore(this.index), this.totalDuration(), this.index, 0);
    }
  },

  stop() {
    this.playing = false; this.paused = false;
    this.stopSource();
    cancelAnimationFrame(this._raf);
    this.onState && this.onState(false);
  },

  stopSource() {
    if (this._src) {
      try { this._src.onended = null; this._src.stop(); } catch {}
      try { this._src.disconnect(); } catch {}
      this._src = null;
    }
  },

  elapsed() {
    if (this.silent || !this.playing) return this.elapsedBefore(this.index) + (this.paused ? this.offset : 0);
    const e = this.ctx.currentTime - this.startedAt;
    return this.elapsedBefore(this.index) + Math.min(Math.max(e, 0), this.durationAt(this.index));
  },
};

/* ---------------- محرّك الرسم ---------------- */
class ReelRenderer {
  constructor(canvas) {
    this.cv = canvas;
    this.ctx = canvas.getContext("2d");
    this.bgImg = null;
    this.bgGrad = null;
    this.bgUrl = null;
    this.state = {
      verses: [], index: 0, ayahElapsed: 0, elapsed: 0, total: 1,
      playing: false, startedAt: 0, style: "card", showTrans: true,
      translationId: "none", accent: "gold", showWatermark: true, motion: true,
      fontSize: 100, reciterName: "", surahName: "", dedText: "", dedMode: "none",
      customTrans: "",
    };
    this._particles = null;
    this._lineCache = {};
  }

  setConfig(patch) { Object.assign(this.state, patch); }

  async setBackground(bg, customUrl = null) {
    if (customUrl) {
      this.bgImg = await this._load(customUrl);
      this.bgGrad = null;
      this.bgUrl = customUrl;
      return;
    }
    if (!bg) return;
    if (bg.grad) {
      this.bgImg = null;
      this.bgGrad = bg.grad;
      this.bgUrl = "grad:" + bg.id;
      return;
    }
    const url = bg.file || bg.url;
    if (this.bgUrl === url && this.bgImg) return;
    this.bgImg = await this._load(url);
    this.bgGrad = null;
    this.bgUrl = url;
  }

  _load(url) {
    return new Promise(res => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => res(img);
      img.onerror = () => res(null);
      img.src = url;
    });
  }

  /* ------ مساعدة: تغطية صورة ------ */
  _cover(img, W, H, scale = 1, drift = 0) {
    const ir = img.width / img.height, cr = W / H;
    let dw, dh;
    if (ir > cr) { dh = H * scale; dw = dh * ir; }
    else { dw = W * scale; dh = dw / ir; }
    const dx = (W - dw) / 2;
    const dy = (H - dh) / 2 + drift;
    this.ctx.drawImage(img, dx, dy, dw, dh);
  }

  /* ------ لف النص ------ */
  _wrap(text, font, maxW) {
    const c = this.ctx;
    const key = font + "|" + Math.round(maxW) + "|" + text;
    if (this._lineCache.key === key) return this._lineCache.val;
    c.font = font;
    const words = text.split(/\s+/);
    const lines = [];
    let line = "";
    for (const w of words) {
      const test = line ? line + " " + w : w;
      if (c.measureText(test).width > maxW && line) { lines.push(line); line = w; }
      else line = test;
    }
    if (line) lines.push(line);
    const val = { lines, key };
    this._lineCache = { key, val };
    return val;
  }

  _fitAyah(text, maxW, maxH, basePx) {
    let size = basePx;
    const min = basePx * 0.55;
    while (size > min) {
      const font = `${size}px AmiriQuran, Amiri, serif`;
      const { lines } = this._wrap(text, font, maxW);
      const lh = size * 1.9;
      if (lines.length * lh <= maxH) return { lines, size, lh };
      size *= 0.92;
    }
    const font = `${min}px AmiriQuran, Amiri, serif`;
    const { lines } = this._wrap(text, font, maxW);
    return { lines, size: min, lh: min * 1.85 };
  }

  /* ------ الرسم الرئيسي ------ */
  draw(now = performance.now()) {
    const c = this.ctx, cv = this.cv;
    const W = cv.width, H = cv.height;
    const st = this.state;
    const S = W / 1080;              // معامل مقياس
    const vertical = H / W > 1.1;
    c.save();
    c.clearRect(0, 0, W, H);

    /* الخلفية */
    const prog = st.total ? Math.min(1, st.elapsed / st.total) : 0;
    if (st.motion) st.startedAt = st.startedAt || now;
    const t = (now - (st._t0 || (st._t0 = now))) / 1000;
    if (this.bgImg) {
      const scale = st.motion ? 1.05 + 0.07 * prog : 1.05;
      const drift = st.motion ? Math.sin(prog * Math.PI) * H * 0.015 : 0;
      this._cover(this.bgImg, W, H, scale, drift);
    } else if (this.bgGrad) {
      const g = c.createLinearGradient(0, 0, W, H);
      const n = this.bgGrad.length;
      this.bgGrad.forEach((col, i) => g.addColorStop(i / (n - 1), col));
      c.fillStyle = g; c.fillRect(0, 0, W, H);
      const rg = c.createRadialGradient(W / 2, H * 0.3, 0, W / 2, H * 0.3, W * 0.8);
      rg.addColorStop(0, "rgba(230,196,106,0.10)");
      rg.addColorStop(1, "rgba(0,0,0,0)");
      c.fillStyle = rg; c.fillRect(0, 0, W, H);
    } else {
      const g = c.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, "#0b2a20"); g.addColorStop(1, "#04120d");
      c.fillStyle = g; c.fillRect(0, 0, W, H);
    }

    /* تعتيم علوي/سفلي */
    const ov = c.createLinearGradient(0, 0, 0, H);
    ov.addColorStop(0, "rgba(0,0,0,0.62)");
    ov.addColorStop(0.28, "rgba(0,0,0,0.18)");
    ov.addColorStop(0.62, "rgba(0,0,0,0.22)");
    ov.addColorStop(1, "rgba(0,0,0,0.78)");
    c.fillStyle = ov; c.fillRect(0, 0, W, H);

    /* جزيئات نورية */
    this._drawParticles(c, W, H, t);

    const ACC = ACCENT_THEMES.find(a => a.id === st.accent) || ACCENT_THEMES[0];
    const verse = st.verses[st.index];
    if (!verse) { this._drawEmpty(c, W, H, S); c.restore(); return; }

    /* ظهور تدريجي للآية */
    const sinceAyah = st.ayahElapsed ?? 0;
    const appear = Math.min(1, sinceAyah / 0.45);
    const ease = 1 - Math.pow(1 - appear, 3);
    const rise = (1 - ease) * 26 * S;

    c.globalAlpha = 1;

    /* شارة السورة أعلى */
    const pillH = 64 * S, pillY = H * 0.058 + rise * 0.4;
    const label = st.surahName ? st.surahName : "قرآن كريم";
    c.font = `700 ${34 * S}px Tajawal, sans-serif`;
    const pw = c.measureText(label).width + 130 * S;
    const px = (W - pw) / 2;
    c.globalAlpha = ease;
    this._roundRect(c, px, pillY, pw, pillH, pillH / 2);
    c.fillStyle = "rgba(4,14,10,0.72)"; c.fill();
    c.strokeStyle = ACC.a + "cc"; c.lineWidth = 2.4 * S; c.stroke();
    c.fillStyle = "#f7e6b0";
    c.textAlign = "center"; c.textBaseline = "middle";
    c.font = `700 ${34 * S}px Tajawal, sans-serif`;
    c.fillText(label, W / 2, pillY + pillH / 2 + 1 * S);

    /* النص + البطاقة */
    const text = verse.text;
    const cardX = W * 0.065, cardW = W * 0.87;
    const basePx = Math.min(W * 0.066, H * 0.042) * (st.fontSize / 100);
    const maxTextH = vertical ? H * 0.34 : H * 0.42;
    const maxTextW = cardW - 120 * S;
    const fit = this._fitAyah(text, maxTextW, maxTextH, basePx);

    /* الترجمة */
    let transLines = [];
    const wantTrans = st.showTrans && st.translationId && st.translationId !== "none";
    const transText = wantTrans ? (st.customTrans || "") : "";
    if (wantTrans && transText) {
      const tf = `${Math.max(20 * S, fit.size * 0.42)}px Tajawal, sans-serif`;
      const tw = this._wrap(transText, tf, maxTextW);
      transLines = tw.lines.slice(0, 5);
    }

    const lineTotH = fit.lines.length * fit.lh;
    const transH = transLines.length ? transLines.length * (fit.size * 0.42 * 1.55) + 26 * S : 0;
    const contentH = lineTotH + transH;
    const cardH = contentH + 150 * S;
    const cardY = (vertical ? H * 0.44 : H * 0.42) - cardH / 2 + rise;

    if (st.style === "banner") {
      const bandY = cardY - 24 * S, bandH = cardH + 48 * S;
      const bg2 = c.createLinearGradient(0, bandY, 0, bandY + bandH);
      bg2.addColorStop(0, "rgba(2,10,7,0.0)");
      bg2.addColorStop(0.18, "rgba(2,10,7,0.72)");
      bg2.addColorStop(0.82, "rgba(2,10,7,0.72)");
      bg2.addColorStop(1, "rgba(2,10,7,0.0)");
      c.fillStyle = bg2;
      c.fillRect(0, bandY, W, bandH);
    }
    if (st.style === "card") {
      this._roundRect(c, cardX, cardY, cardW, cardH, 34 * S);
      const cg = c.createLinearGradient(0, cardY, 0, cardY + cardH);
      cg.addColorStop(0, "rgba(3,12,9,0.78)");
      cg.addColorStop(1, "rgba(3,12,9,0.62)");
      c.fillStyle = cg; c.fill();
      c.strokeStyle = ACC.a + "66"; c.lineWidth = 2.6 * S; c.stroke();
      // زخارف الزوايا
      c.fillStyle = ACC.a + "55";
      const orn = 12 * S;
      [[cardX + 22 * S, cardY + 22 * S], [cardX + cardW - 22 * S, cardY + 22 * S],
       [cardX + 22 * S, cardY + cardH - 22 * S], [cardX + cardW - 22 * S, cardY + cardH - 22 * S]].forEach(([ox, oy]) => {
        c.save(); c.translate(ox, oy);
        c.beginPath();
        for (let i = 0; i < 8; i++) {
          const ang = (i / 8) * Math.PI * 2;
          const r = i % 2 === 0 ? orn : orn * 0.45;
          const x = Math.cos(ang) * r, y = Math.sin(ang) * r;
          i === 0 ? c.moveTo(x, y) : c.lineTo(x, y);
        }
        c.closePath(); c.fill(); c.restore();
      });
    }

    /* نص الآية */
    c.globalAlpha = ease;
    c.textAlign = "center"; c.textBaseline = "middle";
    if (st.style !== "card") {
      c.shadowColor = "rgba(0,0,0,0.85)"; c.shadowBlur = 22 * S; c.shadowOffsetY = 3 * S;
    } else {
      c.shadowColor = "rgba(0,0,0,0.5)"; c.shadowBlur = 10 * S;
    }
    const startY = cardY + 75 * S + fit.lh / 2;
    c.font = `${fit.size}px AmiriQuran, Amiri, serif`;
    const gradText = st.style === "glow";
    fit.lines.forEach((ln, i) => {
      const y = startY + i * fit.lh;
      if (i === fit.lines.length - 1) {
        // تدرّج خفيف على آخر سطر؟ — نبقي اللون موحّدًا لوضوح الرسم
      }
      c.fillStyle = st.style === "glow" ? "#fffdf4" : "#fdf8ec";
      c.fillText(ln, W / 2, y);
    });
    c.shadowColor = "transparent"; c.shadowBlur = 0; c.shadowOffsetY = 0;

    /* رقم الآية المедالية */
    const numY = startY + (fit.lines.length - 1) * fit.lh + fit.lh * 0.62 + 6 * S;
    const numR = 26 * S;
    c.beginPath(); c.arc(W / 2, numY + (transH ? 0 : 4 * S), numR, 0, Math.PI * 2);
    c.fillStyle = "rgba(4,14,10,0.85)"; c.fill();
    c.strokeStyle = ACC.a; c.lineWidth = 2.2 * S; c.stroke();
    c.fillStyle = ACC.a;
    c.font = `700 ${24 * S}px Tajawal, sans-serif`;
    c.fillText(toAr(verse.a), W / 2, numY + (transH ? 0 : 4 * S) + 1 * S);

    /* الترجمة */
    if (transLines.length) {
      c.fillStyle = "rgba(235,245,240,0.92)";
      const tf = Math.max(20 * S, fit.size * 0.42);
      c.font = `${tf}px Tajawal, sans-serif`;
      const tStart = numY + 44 * S;
      transLines.forEach((ln, i) => c.fillText(ln, W / 2, tStart + i * tf * 1.55));
    }
    c.globalAlpha = 1;

    /* نقاط تقدّم الآيات */
    const total = st.verses.length;
    if (total > 1) {
      const dotR = 7 * S, gap = 26 * S;
      const rowW = (total - 1) * gap;
      let dx = W / 2 - rowW / 2;
      const dy = (cardY + cardH) + 54 * S;
      for (let i = 0; i < total; i++) {
        c.beginPath(); c.arc(dx + i * gap, dy, i === st.index ? dotR * 1.35 : dotR, 0, Math.PI * 2);
        if (i <= st.index) { c.fillStyle = ACC.a; c.fill(); }
        else { c.fillStyle = "rgba(255,255,255,0.35)"; c.fill(); }
      }
    }

    /* الإهداء */
    if (st.dedMode !== "none" && st.dedText) {
      const dtxt = "🤲  " + st.dedText;
      c.font = `500 ${30 * S}px Tajawal, sans-serif`;
      const dw = Math.min(W * 0.86, c.measureText(dtxt).width + 70 * S);
      const dh = 66 * S, dyy = H * 0.845;
      this._roundRect(c, (W - dw) / 2, dyy, dw, dh, dh / 2);
      c.fillStyle = "rgba(4,14,10,0.78)"; c.fill();
      c.strokeStyle = ACC.a + "99"; c.lineWidth = 2 * S; c.stroke();
      c.fillStyle = "#f7e6b0";
      c.fillText(dtxt, W / 2, dyy + dh / 2 + 1 * S);
    }

    /* التذييل: اسم القارئ + العلامة المائية */
    c.textBaseline = "middle";
    c.font = `500 ${28 * S}px Tajawal, sans-serif`;
    c.fillStyle = "rgba(240,250,246,0.85)";
    c.textAlign = "right";
    c.fillText("🎙 " + (st.reciterName || ""), W - W * 0.07, H * 0.918);
    if (st.showWatermark) {
      c.textAlign = "left";
      c.fillStyle = "rgba(230,196,106,0.75)";
      c.font = `700 ${26 * S}px Tajawal, sans-serif`;
      c.fillText("﴿ قرآن ريلز ﴾", W * 0.07, H * 0.918);
    }

    /* شريط التقدم السفلي */
    const barH = Math.max(6, H * 0.005);
    c.fillStyle = "rgba(255,255,255,0.16)";
    c.fillRect(0, H - barH, W, barH);
    const bg = c.createLinearGradient(0, 0, W, 0);
    bg.addColorStop(0, ACC.b); bg.addColorStop(1, ACC.a);
    c.fillStyle = bg;
    c.fillRect(0, H - barH, W * prog, barH);

    c.restore();
  }

  _drawEmpty(c, W, H, S) {
    c.fillStyle = "rgba(255,255,255,0.75)";
    c.textAlign = "center"; c.textBaseline = "middle";
    c.font = `${40 * S}px Tajawal, sans-serif`;
    c.fillText("اختر السورة والآيات…", W / 2, H / 2);
  }

  _drawParticles(c, W, H, t) {
    if (!this._particles) {
      this._particles = Array.from({ length: 26 }, (_, i) => ({
        x: Math.random(), y: Math.random(), r: 1.5 + Math.random() * 3.5,
        sp: 0.008 + Math.random() * 0.02, ph: Math.random() * Math.PI * 2,
      }));
    }
    c.save();
    for (const p of this._particles) {
      const y = ((p.y - t * p.sp) % 1 + 1) % 1;
      const a = 0.10 + 0.14 * (0.5 + 0.5 * Math.sin(t * 1.6 + p.ph));
      c.beginPath();
      c.arc(p.x * W, y * H, p.r * (W / 1080) * 1.6, 0, Math.PI * 2);
      c.fillStyle = `rgba(247,230,176,${a.toFixed(3)})`;
      c.fill();
    }
    c.restore();
  }

  _roundRect(c, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }
}

/* ---------------- تسجيل الفيديو ---------------- */
const ReelRecorder = {
  _rec: null, _chunks: [], _abort: false,

  pickMime() {
    const cands = [
      "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
      "video/mp4",
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=vp8,opus",
      "video/webm;codecs=h264,opus",
      "video/webm",
    ];
    for (const m of cands) {
      if (window.MediaRecorder && MediaRecorder.isTypeSupported(m)) return m;
    }
    return "";
  },

  /**
   * تسجيل لحظي: يشغّل التلاوة ويسجّل الكانفاس مع الصوت حتى النهاية.
   */
  async record({ canvas, renderer, player, onProgress, onStage, signal }) {
    this._abort = false;
    const mime = this.pickMime();
    const stream = canvas.captureStream(30);
    if (!player.silent && player.dest) {
      player.dest.stream.getAudioTracks().forEach(t => stream.addTrack(t));
    }
    const rec = new MediaRecorder(stream, {
      mimeType: mime || undefined,
      videoBitsPerSecond: canvas.height >= 1900 ? 9_000_000 : 5_000_000,
    });
    this._chunks = [];
    rec.ondataavailable = e => { if (e.data && e.data.size) this._chunks.push(e.data); };
    const stopped = new Promise(res => { rec.onstop = res; });

    onStage && onStage("recording");
    const total = player.totalDuration();
    renderer.state.elapsed = 0;
    renderer.state.total = total;

    let raf = 0;
    const drawLoop = () => {
      renderer.draw();
      raf = requestAnimationFrame(drawLoop);
    };

    return new Promise(async (resolve, reject) => {
      const cleanup = () => {
        cancelAnimationFrame(raf);
        player.stop();
        try { rec.state !== "inactive" && rec.stop(); } catch {}
        stream.getVideoTracks().forEach(t => t.stop());
      };
      const onAbort = () => { this._abort = true; cleanup(); reject(new Error("aborted")); };
      signal && signal.addEventListener("abort", onAbort, { once: true });

      player.onTick = (elapsed, tot) => {
        renderer.state.elapsed = elapsed;
        renderer.state.total = tot;
        renderer.state.ayahElapsed = elapsed - player.elapsedBefore(player.index);
        onProgress && onProgress(Math.min(0.999, elapsed / Math.max(tot, 0.1)), elapsed, tot);
      };
      player.onAyah = i => { renderer.state.index = i; };
      player.onEnd = () => {
        renderer.state.elapsed = total;
        setTimeout(() => {
          cleanup();
          onProgress && onProgress(1, total, total);
          setTimeout(() => {
            const blob = new Blob(this._chunks, { type: mime || "video/webm" });
            resolve({ blob, mime: mime || "video/webm" });
          }, 260);
        }, 500);
      };

      drawLoop();
      rec.start(400);
      player.play(0, 0);
    });
  },
};
