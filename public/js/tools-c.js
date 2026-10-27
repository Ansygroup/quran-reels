/* ============================================================
   أدوات مالية وأسماء وأماكن ومتفرقات
   ============================================================ */

/* ---------------- حاسبة الزكاة ---------------- */
registerTool("zakat", {
  name: "حاسبة الزكاة", icon: "💰", desc: "احسب زكاة مالك: نقد، ذهب، فضة، وعروض تجارة",
  render(root) {
    const shell = toolShell({ icon: "💰", ...this, body: `
      <div class="tool-body side">
        <div class="panel">
          <div class="field"><div class="label"><b>العملة</b></div>
            <select class="select" data-cur>
              <option value="ج.م">جنيه مصري (ج.م)</option>
              <option value="ر.س">ريال سعودي (ر.س)</option>
              <option value="د.إ">درهم إماراتي (د.إ)</option>
              <option value="د.ك">دينار كويتي (د.ك)</option>
              <option value="$">دولار ($)</option>
              <option value="€">يورو (€)</option>
            </select>
          </div>
          <div class="field"><div class="label"><b>النقد والأرصدة البنكية</b></div><input class="input" type="number" min="0" value="0" step="100" data-cash></div>
          <div class="field"><div class="label"><b>قيمة الذهب (بالغرام)</b></div>
            <div class="row" style="gap:8px">
              <input class="input" type="number" min="0" value="0" step="1" data-gold style="flex:1" placeholder="غرام">
              <input class="input" type="number" min="0" value="0" step="10" data-goldp placeholder="سعر/غرام" style="flex:1">
            </div>
          </div>
          <div class="field"><div class="label"><b>قيمة الفضة (بالغرام)</b></div>
            <div class="row" style="gap:8px">
              <input class="input" type="number" min="0" value="0" step="10" data-silver style="flex:1" placeholder="غرام">
              <input class="input" type="number" min="0" value="1" step="1" data-silverp placeholder="سعر/غرام" style="flex:1">
            </div>
          </div>
          <div class="field"><div class="label"><b>عروض التجارة والأسهم</b></div><input class="input" type="number" min="0" value="0" step="100" data-trade></div>
          <div class="field"><div class="label"><b>الديون المتوقعة التحصيل لك</b></div><input class="input" type="number" min="0" value="0" step="100" data-debt></div>
          <div class="field"><div class="label"><b>نصاب الفضة (غ) — يُحسب تلقائيًا</b></div><input class="input" data-nisab readonly value="85 غ × السعر"></div>
        </div>
        <div class="panel center" style="align-self:start;position:sticky;top:90px">
          <div class="muted" style="font-size:.9rem">إجمالي الوعاء الزكوي</div>
          <div style="font-size:2rem;font-weight:800;color:var(--gold)" data-total>0</div>
          <div class="divider" style="border-top:1px dashed rgba(255,255,255,.12);margin:14px 0"></div>
          <div class="muted" style="font-size:.9rem">مقدار الزكاة (٢٫٥٪)</div>
          <div style="font-size:2.4rem;font-weight:800;color:var(--emerald)" data-zakat>0</div>
          <div data-verdict style="margin-top:12px"></div>
          <div class="hint" style="margin-top:14px">﴿ خُذْ مِنْ أَمْوَالِهِمْ صَدَقَةً تُطَهِّرُهُمْ وَتُزَكِّيهِم بِهَا ﴾<br>النصاب يعادل 85 جرام فضة (أو 85 جرام ذهب: 20 مثقالًا).</div>
        </div>
      </div>` });
    root.appendChild(shell);
    const $s = sel => shell.querySelector(sel);
    const saved = store.get("zakat", {});
    ["cur","cash","gold","goldp","silver","silverp","trade","debt"].forEach(k => { if (saved[k] !== undefined) $s("[data-" + k + "]").value = saved[k]; });

    const calc = () => {
      const cash = +$s("[data-cash]").value || 0;
      const gold = (+$s("[data-gold]").value || 0) * (+$s("[data-goldp]").value || 0);
      const silver = (+$s("[data-silver]").value || 0) * (+$s("[data-silverp]").value || 0);
      const trade = +$s("[data-trade]").value || 0;
      const debt = +$s("[data-debt]").value || 0;
      const total = cash + gold + silver + trade + debt;
      const cur = $s("[data-cur]").value;
      const silverPrice = (+$s("[data-silverp]").value || 0);
      const nisab = silverPrice * 85;
      $s("[data-nisab]").value = nisab ? `${toAr(85)} غ × ${silverPrice} = ${nisab.toLocaleString("en")} ${cur}` : "حدد سعر جرام الفضة";
      $s("[data-total]").textContent = `${total.toLocaleString("en")} ${cur}`;
      const zakat = total * 0.025;
      $s("[data-zakat]").textContent = `${zakat.toLocaleString("en", { maximumFractionDigits: 2 })} ${cur}`;
      const meets = nisab > 0 && total >= nisab;
      $s("[data-verdict]").innerHTML = nisab === 0
        ? `<span class="badge warn">أدخل سعر جرام الفضة لحساب النصاب</span>`
        : meets
          ? `<span class="badge ok">✓ مالك بلغ النصاب — تجب عليك الزكاة</span>`
          : `<span class="badge info">لم تبلغ النصاب (${nisab.toLocaleString("en")} ${cur}) — لا تجب الزكاة بعد</span>`;
      store.set("zakat", {
        cur, cash: $s("[data-cash]").value, gold: $s("[data-gold]").value, goldp: $s("[data-goldp]").value,
        silver: $s("[data-silver]").value, silverp: $s("[data-silverp]").value,
        trade: $s("[data-trade]").value, debt: $s("[data-debt]").value,
      });
    };
    shell.querySelectorAll("input,select").forEach(i => i.addEventListener("input", calc));
    shell.querySelectorAll("select").forEach(i => i.addEventListener("change", calc));
    calc();
  },
});

/* ---------------- حاسبة المواريث ---------------- */
registerTool("mawarith", {
  name: "حاسبة المواريث", icon: "⚖️", desc: "تقسيم التركة بالفقه الإسلامي — حالات شائعة مع التنبيهات",
  render(root) {
    const shell = toolShell({ icon: "⚖️", ...this, body: `
      <div class="tool-body side">
        <div class="panel">
          <div class="field"><div class="label"><b>حالة الزوج/الزوجة</b></div>
            <select class="select" data-spouse>
              <option value="none">لا يوجد</option>
              <option value="husband">زوج</option>
              <option value="wife">زوجة</option>
            </select>
          </div>
          <div class="row-2">
            <div class="switch-row"><div class="t">الأب</div><label class="switch"><input type="checkbox" data-father><i></i></label></div>
            <div class="switch-row"><div class="t">الأم</div><label class="switch"><input type="checkbox" data-mother><i></i></label></div>
          </div>
          <div class="row-2" style="margin-top:6px">
            <div class="field"><div class="label"><b>الأبناء (ذكور)</b></div><input class="input" type="number" min="0" max="10" value="0" data-sons></div>
            <div class="field"><div class="label"><b>البنات</b></div><input class="input" type="number" min="0" max="10" value="0" data-daus></div>
          </div>
          <div class="row-2">
            <div class="switch-row"><div class="t">حفيد (ابن ابن)</div><label class="switch"><input type="checkbox" data-gson><i></i></label></div>
            <div class="switch-row"><div class="t">أخ/أخت لأبوين</div><label class="switch"><input type="checkbox" data-sib><i></i></label></div>
          </div>
          <div class="field" style="margin-top:10px"><div class="label"><b>قيمة التركة</b></div><input class="input" type="number" min="0" step="1000" value="100000" data-estate></div>
        </div>
        <div class="panel" style="align-self:start">
          <div class="panel-title"><span class="ic">📊</span> النتيجة</div>
          <div data-out></div>
        </div>
      </div>
      <div class="panel" style="margin-top:16px;border-color:rgba(251,191,36,.35);background:rgba(251,191,36,.05)">
        <div class="row" style="gap:10px"><span style="font-size:1.4rem">⚠️</span>
          <div class="muted" style="font-size:.88rem">هذه الحاسبة تغطي <b>الحالات الشائعة</b> فقط (الزوج/الزوجة، الوالدان، الأبناء والبنات). المسائل الخاصة (العمام، الخوالم، الجمع بين فرضين، الرد) تحتاج مراجعة عالم أو مختص — يُرجى التحقق قبل التنفيذ.</div>
        </div>
      </div>` });
    root.appendChild(shell);
    const $s = sel => shell.querySelector(sel);

    const calc = () => {
      const spouse = $s("[data-spouse]").value;
      const father = $s("[data-father]").checked;
      const mother = $s("[data-mother]").checked;
      const sons = Math.min(10, +$s("[data-sons]").value || 0);
      const daus = Math.min(10, +$s("[data-daus]").value || 0);
      const gson = $s("[data-gson]").checked;
      const sib = $s("[data-sib]").checked;
      const estate = Math.max(0, +$s("[data-estate]").value || 0);
      const hasDesc = sons + daus > 0 || gson;
      const rows = []; // {n, frac:[a,b], note}
      let FroodSum = [0, 1];
      const add = (n, a, b, note = "") => { rows.push({ n, a, b, note }); };

      if (spouse === "husband") add("الزوج", hasDesc ? 1 : 1, hasDesc ? 4 : 2, hasDesc ? "لوجود فرع وارث" : "النصف");
      if (spouse === "wife") add("الزوجة", hasDesc ? 1 : 1, hasDesc ? 8 : 4, hasDesc ? "لوجود فرع وارث" : "الربع");
      if (mother) add("الأم", hasDesc || sib ? 1 : 1, 6, hasDesc ? "السدس لوجود فرع وارث" : "السدس");
      if (father && (sons > 0)) add("الأب", 1, 6, "السدس (كحق الابن مع الابن)");
      if (father && sons === 0 && (daus > 0 || spouse !== "none")) add("الأب", 1, 6, "السدس ثم يأخذ الباقي تعصيبًا");

      // مجموع الفروض
      const fracs = rows.map(r => [r.a, r.b]);
      let sum = [0, 1];
      fracs.forEach(f => { sum = [sum[0] * f[1] + f[0] * sum[1], sum[1] * f[1]]; });
      const rem = [Math.max(0, sum[1] * 1 - sum[0]), sum[1]]; // الباقي من 1

      // الباقي
      if (rem[0] > 0) {
        if (sons > 0) {
          add("الأبناء (الباقي تعصيبًا)", null, null, `للذكر ضعف الأنثى — ينقسم الباقي ${toAr(2 * sons + Math.min(daus, 10) * (daus ? 1 : 0))} نصيبًا`);
        } else if (daus > 0 && !gson) {
          if (spouse === "none" && !father && !mother) {
            add("البنات (الفرض والباقي)", null, null, "البنات وحدهن: الفرض ثم الباقي (تعصيبًا)");
          } else if (father) add("الأب (يعصّب الباقي)", null, null, "الباقي للأب تعصيبًا بعد فرض البنات");
          else add("الباقي", null, null, "للعصبة المقدّرين (أخ/عم/خال) — يحتاج تحديدًا");
        } else if (father) add("الأب (يأخذ الباقي تعصيبًا)", null, null, "تعصيبًا");
        else if (spouse !== "none") add("الباقي للزوج/الزوجة", null, null, "بالتعصيب مع من شاركه");
        else add("الباقي لأهل العصبة", null, null, "يحتاج تحديد العصبة (إخوة/أعمام/أخوال)");
      }

      const out = $s("[data-out]");
      out.innerHTML = rows.map(r => {
        const pct = r.a == null ? null : (r.a / r.b) * 100;
        const val = pct != null ? (estate * r.a / r.b) : null;
        return `<div class="list-card" style="margin-bottom:10px">
          <div class="row between">
            <b>${esc(r.n)}</b>
            <span class="count-badge">${r.a == null ? "الباقي" : `${toAr(r.a)}/${toAr(r.b)} — ${toAr(pct.toFixed(pct < 10 ? 2 : 0))}٪`}</span>
          </div>
          ${r.note ? `<div class="hint">${esc(r.note)}</div>` : ""}
          ${val != null ? `<div class="gold" style="font-weight:700;margin-top:4px">≈ ${val.toLocaleString("en", { maximumFractionDigits: 0 })}</div>` : ""}
        </div>`;
      }).join("") || `<div class="hint">اختر الورثة للبدء</div>`;
      out.innerHTML += `<div class="row between" style="border-top:1px dashed rgba(255,255,255,.12);padding-top:10px">
        <span class="muted">قيمة التركة </span><b class="gold">${estate.toLocaleString("en")}</b></div>`;
    };
    shell.querySelectorAll("input,select").forEach(i => i.addEventListener("input", calc));
    shell.querySelectorAll("select").forEach(i => i.addEventListener("change", calc));
    calc();
  },
});

/* ---------------- أسماء المواليد ---------------- */
registerTool("baby-names", {
  name: "أسماء المواليد", icon: "👶", desc: "أكثر من 1000 اسم مع معانيها العربية والإنجليزية",
  async render(root) {
    const shell = toolShell({ icon: "👶", ...this, body: `
      <div class="row" style="margin-bottom:14px;gap:8px">
        <input class="input" data-q placeholder="ابحث باسم أو معنى… (أحمد، رحمة، مبارك…)" style="max-width:400px">
        <select class="select" data-g style="max-width:150px">
          <option value="">الكل</option><option value="m">أولاد</option><option value="f">بنات</option><option value="u">للجنسين</option>
        </select>
        <select class="select" data-o style="max-width:200px">
          <option value="">كل الأنواع</option><option value="QURANIC">قرآني</option><option value="SAHABIYYAH">صحابي</option>
          <option value="PROPHETS">أنبياء</option><option value="ARABIC">عربي</option>
        </select>
        <span class="count-badge" data-n>…</span>
      </div>
      <div class="grid-cards" data-grid></div>
      <div class="center" style="margin-top:16px"><button class="btn btn-ghost" data-more>عرض المزيد ↓</button></div>` });
    root.appendChild(shell);
    const $s = sel => shell.querySelector(sel);
    const data = await (await fetch("data/names.json")).json();
    let limit = 90;
    const GN = { m: "ولد", f: "بنت", u: "للجنسين" };

    const filter = () => {
      const q = normAr($s("[data-q]").value.trim());
      const g = $s("[data-g]").value;
      const o = $s("[data-o]").value;
      return data.filter(d => {
        if (g && d.g !== g) return false;
        if (o && !(d.c || []).some(c => c.includes(o.replace("QURANIC", "QURANIC")))) {
          if (o === "QURANIC" && (d.q === "Q" || d.q === "W")) { /* ok */ }
          else if (o === "SAHABIYYAH" && (d.c || []).some(c => c.includes("SAHAB"))) { /* ok */ }
          else if (o === "PROPHETS" && (d.c || []).includes("PROPHETS")) { /* ok */ }
          else if (o === "ARABIC" && (d.c || []).includes("ARABIC")) { /* ok */ }
          else return false;
        }
        if (q && !(normAr(d.a).includes(q) || normAr(d.ma).includes(q) || normAr(d.en).includes(q) || normAr(d.me).includes(q))) return false;
        return true;
      });
    };
    const paint = () => {
      const list = filter();
      $s("[data-n]").textContent = `${toAr(list.length)} اسمًا`;
      const grid = $s("[data-grid]");
      grid.innerHTML = list.slice(0, limit).map((d, i) => `
        <div class="mini-card" data-i="${data.indexOf(d)}" style="cursor:pointer">
          <div class="row between"><div class="m-title" style="font-family:var(--font-quran);font-size:1.5rem;color:var(--gold-3)">${esc(d.a)}</div>
          <span class="badge ${d.q === "Q" ? "ok" : d.q === "W" ? "info" : d.q === "H" ? "warn" : ""}">${d.q === "Q" ? "قرآني" : d.q === "W" ? "جذر قرآني" : d.q === "H" ? "تاريخي" : ""}</span></div>
          <div class="m-sub"><b>${GN[d.g] || ""}</b> — ${esc(d.ma)}</div>
        </div>`).join("") || `<div class="loading-line">لا نتائج</div>`;
      $s("[data-more]").style.display = list.length > limit ? "" : "none";
      grid.querySelectorAll("[data-i]").forEach(c => c.addEventListener("click", () => {
        const d = data[+c.dataset.i];
        const ov = el("div", { class: "overlay" });
        ov.innerHTML = `<div class="modal" style="position:relative;text-align:center">
          <div style="font-family:var(--font-quran);font-size:3rem;color:var(--gold-3)">${esc(d.a)}</div>
          <div class="muted">${esc(d.t || "")} — ${GN[d.g] || ""}</div>
          <div style="margin-top:14px;font-size:1.15rem;line-height:2">${esc(d.ma)}</div>
          ${d.me ? `<div class="hint" style="margin-top:10px" dir="ltr">${esc(d.en)}: ${esc(d.me)}</div>` : ""}
          <div class="row" style="justify-content:center;margin-top:16px;gap:8px">
            <button class="btn btn-ghost btn-sm" data-c>📋 نسخ</button>
            <button class="btn btn-gold btn-sm" data-x>إغلاق</button>
          </div></div>`;
        document.body.appendChild(ov);
        ov.querySelector("[data-x]").onclick = () => ov.remove();
        ov.querySelector("[data-c]").onclick = async () => {
          try { await navigator.clipboard.writeText(`${d.a} — ${d.ma}`); toast("تم النسخ ✓"); } catch {}
        };
      }));
    };
    $s("[data-more]").addEventListener("click", () => { limit += 90; paint(); });
    attachSearch($s("[data-q]"), () => { limit = 90; return null; }, () => paint());
    $s("[data-g]").addEventListener("change", () => { limit = 90; paint(); });
    $s("[data-o]").addEventListener("change", () => { limit = 90; paint(); });
    paint();
  },
});

/* ---------------- فاحص أكواد E ---------------- */
registerTool("enums", {
  name: "فاحص أكواد E", icon: "🥗", desc: "هل الكود الغذائي حلال أم غير حلال؟",
  render(root) {
    const shell = toolShell({ icon: "🥗", ...this, body: `
      <div class="row" style="margin-bottom:14px;gap:8px">
        <input class="input" data-q placeholder="ابحث بالكود أو الاسم… (E621، جيلاتين، لون…)" style="max-width:400px">
        <select class="select" data-st style="max-width:190px">
          <option value="">كل الحالات</option>
          <option value="ok">✅ حلال / نباتي غالبًا</option>
          <option value="warn">⚠️ موضع خلاف</option>
          <option value="bad">⛔ غير حلال مشبوه</option>
        </select>
        <span class="count-badge" data-n></span>
      </div>
      <div class="grid-cards" data-grid></div>
      <div class="panel" style="margin-top:16px">
        <div class="panel-title"><span class="ic">💡</span> تنبيه مهم</div>
        <div class="muted" style="font-size:.9rem;line-height:1.9">الحكم النهائي يعتمد على <b>المصدر والتصنيع</b> لا على الكود وحده — فمثلاً الجيلاتين (E441) قد يكون من ذبيحة حلال أو من غيرها، وكذا الكحول المخفف في مستحضرات. عند الشكّ يُستحسن السؤال عن تركيبة المنتج من جهة موثوقة.</div>
      </div>` });
    root.appendChild(shell);
    const $s = sel => shell.querySelector(sel);
    const ST = { ok: ["✅ حلال", "ok"], warn: ["⚠️ خلاف/راجع المصدر", "warn"], bad: ["⛔ غير حلال مشبوه", "bad"] };
    const paint = () => {
      const q = normAr($s("[data-q]").value.trim().replace(/^e/i, ""));
      const st = $s("[data-st]").value;
      const list = E_NUMBERS.filter(e => {
        if (st && e[3] !== st) return false;
        if (q && !normAr(e[0]).includes(q) && !normAr(e[2]).includes(q) && !normAr(e[1]).includes(q)) return false;
        return true;
      });
      $s("[data-n]").textContent = toAr(list.length) + " كودًا";
      $s("[data-grid]").innerHTML = list.slice(0, 90).map(e => `
        <div class="mini-card">
          <div class="row between"><div class="m-title" style="font-family:monospace;direction:ltr">E${esc(e[0])}</div>
          <span class="badge ${ST[e[3]][1]}">${ST[e[3]][0]}</span></div>
          <div class="m-sub"><b>${esc(e[2])}</b> — ${esc(e[1])}</div>
        </div>`).join("") || `<div class="loading-line">لا نتائج</div>`;
    };
    attachSearch($s("[data-q]"), () => null, paint);
    $s("[data-st]").addEventListener("change", paint);
    paint();
  },
});

/* ---------------- أقرب المساجد ---------------- */
registerTool("mosques", {
  name: "أقرب المساجد", icon: "📍", desc: "اعثر على المساجد القريبة منك مع المسافة والاتجاه",
  render(root) {
    const shell = toolShell({ icon: "📍", ...this, body: `
      <div class="panel center">
        <button class="btn btn-gold btn-lg" data-find>📍 ابحث عن المساجد حولي</button>
        <div class="hint" style="margin-top:10px">سنستخدم موقعك للبحث في قاعدة OpenStreetMap — لن يُخزَّن موقعك.</div>
        <div data-status style="margin-top:12px"></div>
      </div>
      <div data-list style="margin-top:16px"></div>` });
    root.appendChild(shell);
    const $s = sel => shell.querySelector(sel);

    $s("[data-find]").addEventListener("click", async () => {
      const status = $s("[data-status]");
      status.innerHTML = `<div class="loading-line"><span class="spin"></span> جارٍ تحديد موقعك…</div>`;
      const loc = await detectLocation();
      status.innerHTML = `<div class="loading-line"><span class="spin"></span> جارٍ البحث قرب ${esc(loc.n)}…</div>`;
      const q = `[out:json][timeout:25];(
        node["amenity"="place_of_worship"]["religion"="muslim"](around:3000,${loc.lat},${loc.lng});
        way["amenity"="place_of_worship"]["religion"="muslim"](around:3000,${loc.lat},${loc.lng});
      );out body center 40;`;
      const qEnc = encodeURIComponent(q);
      const endpoints = [
        "https://overpass-api.de/api/interpreter?data=" + qEnc,
        "https://overpass.osm.ch/api/interpreter?data=" + qEnc,
      ];
      let j = null;
      for (const url of endpoints) {
        try {
          const r = await fetch(url, { headers: { Accept: "application/json" } });
          if (r.ok) { j = await r.json(); break; }
        } catch {}
        try {
          const r = await fetch(`/proxy?u=${encodeURIComponent(url)}`);
          if (r.ok) { j = await r.json(); break; }
        } catch {}
      }
      try {
        if (!j) throw new Error("all overpass mirrors failed");
        const items = (j.elements || []).map(e => {
          const la = e.lat || e.center?.lat, lo = e.lon || e.center?.lon;
          if (la == null) return null;
          return { n: (e.tags && (e.tags["name:ar"] || e.tags.name)) || "مسجد", d: distKm(loc.lat, loc.lng, la, lo), la, lo };
        }).filter(Boolean).sort((a, b) => a.d - b.d).slice(0, 12);
        if (!items.length) { status.innerHTML = `<div class="hint">لم نعثر على مساجد خلال 3 كم — جرّب منطقة أخرى.</div>`; return; }
        status.innerHTML = `<div class="progress-badge">🔎 ${toAr(items.length)} مسجدًا</div>`;
        $s("[data-list]").innerHTML = items.map(m => `
          <div class="list-card">
            <div class="lc-head">
              <div><div class="lc-title">🕌 ${esc(m.n)}</div>
              <div class="muted" style="font-size:.84rem">المسافة: ${m.d < 1 ? toAr(Math.round(m.d * 1000)) + " م" : toAr(m.d.toFixed(1)) + " كم"}</div></div>
              <span class="count-badge">قبلة ${toAr(qiblaBearing(m.la, m.lo).toFixed(0))}°</span>
            </div>
            <div class="row" style="gap:6px">
              <a class="btn btn-soft btn-sm" target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=${m.la},${m.lo}">🗺️ فتح على الخريطة</a>
              <a class="btn btn-ghost btn-sm" href="#/tool/qibla">🧭 بوصلة القبلة</a>
            </div>
          </div>`).join("");
      } catch (e) {
        console.error(e);
        status.innerHTML = `<div class="hint warn">تعذّر الاتصال بخدمة الخرائط — تحقق من الإنترنت وحاول مجددًا.</div>`;
      }
    });
  },
});

/* ---------------- رزنامة المناسبات ---------------- */
registerTool("calendar", {
  name: "رزنامة المناسبات الإسلامية", icon: "🗓️", desc: "المناسبات الهجرية القادمة بمواعيدها الميلادية",
  render(root) {
    const shell = toolShell({ icon: "🗓️", ...this, body: `
      <div class="panel center">
        <div class="muted">اليوم</div>
        <div style="font-size:1.6rem;font-weight:800;color:var(--gold)" data-today></div>
        <div class="muted" data-todayg></div>
      </div>
      <div class="panel" style="margin-top:16px">
        <div class="panel-title"><span class="ic">🌙</span> كل المناسبات</div>
        <div data-list></div>
      </div>` });
    root.appendChild(shell);
    const $s = sel => shell.querySelector(sel);
    const t = hijriParts();
    $s("[data-today]").textContent = hijriLabel(t);
    $s("[data-todayg]").textContent = new Date().toLocaleDateString("ar-EG", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

    const rows = [];
    for (let y = t.year; y <= t.year + 2; y++) {
      for (const ev of ISLAMIC_EVENTS) {
        const g = hijriToGreg(y, ev.m, ev.d);
        if (g) rows.push({ ...ev, g, hy: y });
      }
    }
    const today = new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());
    const upcoming = rows.filter(r => r.g >= today).sort((a, b) => a.g - b.g);
    const past = rows.filter(r => r.g < today).sort((a, b) => b.g - a.g).slice(0, 4);
    const cell = r => {
      const days = Math.ceil((r.g - today) / 86400000);
      return `<div class="list-card" style="margin-bottom:10px">
        <div class="lc-head">
          <div><div class="lc-title">${esc(r.n)}</div>
          <div class="muted" style="font-size:.84rem">${toAr(r.d)} ${HIJRI_MONTHS[r.m - 1]} ${toAr(r.hy)} هـ — ${r.g.toLocaleDateString("ar-EG", { day: "numeric", month: "long", year: "numeric" })} م</div></div>
          <span class="badge ${days <= 7 ? "ok" : days <= 30 ? "info" : ""}">${days === 0 ? "اليوم 🎉" : "بعد " + toAr(days) + " يومًا"}</span>
        </div>
        <div class="hint">${esc(r.s)}</div></div>`;
    };
    $s("[data-list]").innerHTML =
      `<div class="label"><b>القادمة</b></div>` + upcoming.slice(0, 10).map(cell).join("") +
      `<div class="label" style="margin-top:14px"><b>الأقرب الماضية</b></div>` + past.map(r => cell({ ...r })).join("");
  },
});

/* ---------------- عدّاد المناسبات ---------------- */
registerTool("countdown", {
  name: "عدّاد المناسبات", icon: "⏳", desc: "كم بقي حتى رمضان والعيد والحج؟",
  render(root) {
    const shell = toolShell({ icon: "⏳", ...this, body: `<div class="grid-cards" data-grid></div>` });
    root.appendChild(shell);
    const grid = shell.querySelector("[data-grid]");
    const now = new Date();
    const curH = hijriParts(now).year;

    const targets = [];
    for (const y of [curH, curH + 1]) {
      for (const ev of ISLAMIC_EVENTS.filter(e => ["رمضان", "شوال", "ذو الحجة", "ربيع الأول", "محرم"].includes(HIJRI_MONTHS[e.m - 1]))) {
        const g = hijriToGreg(y, ev.m, ev.d);
        if (g && g >= now) targets.push({ ...ev, g, y });
      }
    }
    targets.sort((a, b) => a.g - b.g);
    const cards = targets.slice(0, 6);
    grid.innerHTML = cards.map((c, i) => `
      <div class="mini-card center" style="padding:22px 14px">
        <div style="font-size:1.7rem">${i === 0 ? "🌟" : "🌙"}</div>
        <div class="m-title" style="margin-top:6px">${esc(c.n)}</div>
        <div class="m-sub">${c.g.toLocaleDateString("ar-EG", { day: "numeric", month: "long", year: "numeric" })}</div>
        <div style="font-size:1.5rem;font-weight:800;color:var(--gold);margin-top:10px" data-cd="${i}">…</div>
        <div class="m-sub">${toAr(c.d)} ${HIJRI_MONTHS[c.m - 1]} ${toAr(c.y)}</div>
      </div>`).join("");
    const tick = () => {
      cards.forEach((c, i) => {
        const elx = grid.querySelector(`[data-cd="${i}"]`);
        if (elx) elx.textContent = countdownHTML(c.g);
      });
    };
    tick(); ensureTick(tick, 1000);
  },
});

/* ---------------- عدّاد الإفطار والسحور ---------------- */
registerTool("iftar", {
  name: "عدّاد الإفطار والسحور", icon: "🍽️", desc: "الوقت المتبقي للافطار والسحور حسب موقعك",
  render(root) {
    const shell = toolShell({ icon: "🍽️", ...this, body: `
      <div class="panel center" style="padding:30px">
        <div class="muted" data-mode>…</div>
        <div style="font-size:clamp(2.4rem,7vw,4rem);font-weight:800;color:var(--gold);direction:ltr" data-cd>--:--:--</div>
        <div class="progress" style="margin-top:16px"><i data-bar style="width:0%"></i></div>
        <div class="muted" style="font-size:.86rem;margin-top:8px" data-sub></div>
      </div>
      <div class="ptimes" style="margin-top:16px" data-times></div>
      <div class="panel center" style="margin-top:16px">
        <div class="inline-ayah">﴿ وَبِالْأَسْحَارِ هُمْ يَسْتَغْفِرُونَ ﴾</div>
        <div class="hint">🤲 عند الإفطار: «ذهب الظمأ وابتلت العروق وثبت الأجر إن كان الله غفورًا»</div>
      </div>` });
    root.appendChild(shell);
    const $s = sel => shell.querySelector(sel);

    const render = () => {
      PraySettings.get().then(s => {
        const t = timesFor(s);
        $s("[data-times]").innerHTML = PRAY_KEYS.map(p => `
          <div class="ptime-cell"><div class="p-ic">${p.ic}</div><div class="p-name">${p.n}</div><div class="p-val">${fmtTime(t[p.k])}</div></div>`).join("");

        const magSec = Math.round(t.maghrib * 3600);
        const fajSec = Math.round(t.fajr * 3600);
        const nowSec = Math.round(nowHoursIn(s.tz) * 3600);
        const tick = () => {
          const ns = Math.round(nowHoursIn(s.tz) * 3600);
          if (ns < fajSec) {
            $s("[data-mode]").textContent = "⏳ متبقٍ على صلاة الفجر (بداية السحور)";
            const d = fajSec - ns;
            $s("[data-cd]").textContent = fmtHMS(d);
            $s("[data-bar]").style.width = Math.min(100, (ns / Math.max(fajSec, 1)) * 100) + "%";
            $s("[data-sub]").textContent = "اذكر الله واحفظ وردك من القرآن";
          } else if (ns < magSec) {
            $s("[data-mode]").textContent = "🍽️ متبقٍ على الأذان والإفطار";
            const d = magSec - ns;
            $s("[data-cd]").textContent = fmtHMS(d);
            const start = fajSec, span = magSec - start;
            $s("[data-bar]").style.width = Math.min(100, ((ns - start) / Math.max(span, 1)) * 100) + "%";
            $s("[data-sub]").textContent = `الأذان عند ${fmtTime(t.maghrib)} — لا تنسَ الدعاء عند الإفطار`;
          } else {
            $s("[data-mode]").textContent = "🌙 متبقٍ على سحور الغد (الفجر)";
            const d = 86400 - ns + fajSec;
            $s("[data-cd]").textContent = fmtHMS(d);
            $s("[data-bar]").style.width = "0%";
            $s("[data-sub]").textContent = "حان وقت العشاء والسحور — فطور الغد عند " + fmtTime(t.fajr);
          }
        };
        tick();
        const id = ensureTick(tick, 1000);
      });
    };
    const fmtHMS = d => {
      const h = Math.floor(d / 3600), m = Math.floor(d / 60) % 60, s = d % 60;
      return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    };
    render();
  },
});

/* ---------------- منبه الصلاة ---------------- */
registerTool("adhan-alarms", {
  name: "منبه الصلاة", icon: "⏰", desc: "تنبيه لطيف عند دخول كل وقت صلاة (بينما تفتح الصفحة)",
  render(root) {
    const shell = toolShell({ icon: "⏰", ...this, body: `
      <div class="panel">
        <div class="row between" style="margin-bottom:8px">
          <div class="panel-title" style="margin:0"><span class="ic">🔔</span> فعّل التنبيهات</div>
          <button class="btn btn-gold btn-sm" data-perm>تفعيل الإذن</button>
        </div>
        <div data-rows></div>
        <div class="hint" style="margin-top:12px">⚠️ يعمل المنبه ما دامت هذه الصفحة مفتوحة في تبويب — ابقَ متصفّحك مفتوحًا أو فعّل الإشعارات.</div>
        <div class="row between" style="margin-top:12px">
          <span class="muted" style="font-size:.86rem" data-permstat>الإذن: غير مفعّل</span>
          <button class="btn btn-ghost btn-sm" data-test>🔔 تجربة التنبيه</button>
        </div>
      </div>` });
    root.appendChild(shell);
    const $s = sel => shell.querySelector(sel);
    const enabled = store.get("adhanOn", { fajr: false, dhuhr: false, asr: false, maghrib: false, ishaa: false });
    const fired = store.get("adhanFired", { d: "", set: {} });

    const rows = $s("[data-rows]");
    const KEYS = PRAY_KEYS.filter(p => p.k !== "sunrise");
    KEYS.forEach(p => {
      const row = el("div", { class: "switch-row" },
        `<div class="t">${p.ic} ${p.n}<small>عند دخول الوقت</small></div>
         <label class="switch"><input type="checkbox" data-k="${p.k === "isha" ? "ishaa" : p.k}" ${enabled[p.k === "isha" ? "ishaa" : p.k] ? "checked" : ""}><i></i></label>`);
      rows.appendChild(row);
    });
    rows.querySelectorAll("input[data-k]").forEach(cb => cb.addEventListener("change", () => {
      enabled[cb.dataset.k] = cb.checked;
      store.set("adhanOn", enabled);
    }));

    const updatePerm = () => {
      const p = "Notification" in window ? Notification.permission : "unsupported";
      $s("[data-permstat]").textContent = "الإذن: " + ({ granted: "مفعّل ✓", denied: "مرفوض ✗", default: "غير مطلب", unsupported: "غير مدعوم" }[p] || p);
    };
    updatePerm();
    $s("[data-perm]").addEventListener("click", async () => {
      if (!("Notification" in window)) { toast("المتصفح لا يدعم الإشعارات", "err"); return; }
      const p = await Notification.requestPermission();
      updatePerm();
      toast(p === "granted" ? "تم تفعيل الإشعارات ✓" : "لم يُسمح بالإشعارات", p === "granted" ? "ok" : "err");
    });
    const beep = () => {
      try {
        const ctx = AyahPlayer.ensureCtx();
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = "sine"; o.frequency.value = 880;
        g.gain.setValueAtTime(0.12, ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.4);
        o.connect(g); g.connect(ctx.destination);
        o.start(); o.stop(ctx.currentTime + 1.4);
      } catch {}
    };
    $s("[data-test]").addEventListener("click", () => {
      beep();
      if ("Notification" in window && Notification.permission === "granted") new Notification("تنبيه تجريبي 🕌", { body: "هكذا سيصلك تنبيه وقت الصلاة" });
      else toast("فعّل الإذن أولًا لاستقبال الإشعارات", "err");
    });

    PraySettings.get().then(s => {
      const check = () => {
        const t = timesFor(s);
        const now = new Date();
        const today = new Date(Date.now() + s.tz * 3600000).toISOString().slice(0, 10);
        if (fired.d !== today) { fired.d = today; fired.set = {}; store.set("adhanFired", fired); }
        const ns = Math.round(nowHoursIn(s.tz) * 3600);
        for (const p of PRAY_KEYS) {
          if (p.k === "sunrise") continue;
          const key = p.k === "isha" ? "ishaa" : p.k;
          if (!enabled[key] || fired.set[key]) continue;
          const target = Math.round(t[p.k] * 3600);
          if (ns >= target && ns < target + 90) {
            fired.set[key] = true;
            store.set("adhanFired", fired);
            beep();
            if ("Notification" in window && Notification.permission === "granted") {
              new Notification(`حان الآن وقت صلاة ${p.n} 🕌`, { body: "الله أكبر — لا تنسَ ذكر الله", silent: true });
            }
            toast(`حان وقت صلاة ${p.n} 🕌`);
          }
        }
      };
      check(); ensureTick(check, 30000);
    });
  },
});

/* ---------------- سجل الأعمال اليومية ---------------- */
registerTool("deeds", {
  name: "سجل الأعمال اليومية", icon: "✅", desc: "تابع أعمالك اليومية وحافظ على سلسلتك",
  render(root) {
    const shell = toolShell({ icon: "✅", ...this, body: `
      <div class="tool-body two">
        <div class="panel">
          <div class="panel-title"><span class="ic">📅</span> <span data-date></span></div>
          <div data-list></div>
        </div>
        <div class="panel" style="align-self:start">
          <div class="panel-title"><span class="ic">🔥</span> إحصاءاتك</div>
          <table class="tbl">
            <tr><td>إنجاز اليوم</td><td class="gold" data-today>0%</td></tr>
            <tr><td>السلسلة الحالية</td><td class="gold" data-streak>0 يومًا</td></tr>
            <tr><td>أيام كاملة (الشهر)</td><td class="gold" data-full>0</td></tr>
          </table>
          <div class="progress" style="margin-top:12px"><i data-bar style="width:0%"></i></div>
          <div class="hint" style="margin-top:14px">🤲 «أحب الأعمال إلى الله أدومها وإن قل» — المواظبة أهم من الكثرة.</div>
        </div>
      </div>` });
    root.appendChild(shell);
    const $s = sel => shell.querySelector(sel);
    const dateKey = d => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
    let log = store.get("deedsLog", {}); // {dateKey: [ids]}
    const today = new Date();

    const paint = () => {
      $s("[data-date]").textContent = today.toLocaleDateString("ar-EG", { weekday: "long", day: "numeric", month: "long" });
      const tk = dateKey(today);
      const done = new Set(log[tk] || []);
      $s("[data-list]").innerHTML = DAILY_DEEDS.map(d => `
        <div class="switch-row">
          <div class="t">${esc(d.n)}</div>
          <label class="switch"><input type="checkbox" data-id="${d.id}" ${done.has(d.id) ? "checked" : ""}><i></i></label>
        </div>`).join("");
      $s("[data-list]").querySelectorAll("input[data-id]").forEach(cb => cb.addEventListener("change", () => {
        const set = new Set(log[tk] || []);
        cb.checked ? set.add(cb.dataset.id) : set.delete(cb.dataset.id);
        log[tk] = [...set];
        store.set("deedsLog", log);
        paint();
      }));
      const pct = Math.round((done.size / DAILY_DEEDS.length) * 100);
      $s("[data-today]").textContent = toAr(pct) + "٪";
      $s("[data-bar]").style.width = pct + "%";
      // السلسلة
      let streak = 0;
      for (let i = 0; i < 365; i++) {
        const d = new Date(); d.setDate(d.getDate() - i);
        const ids = log[dateKey(d)] || [];
        const ok = ids.length >= Math.ceil(DAILY_DEEDS.length * 0.7);
        if (ok) streak++;
        else if (i > 0) break;
        else if (i === 0 && !ok) { /* اليوم لا يكسر السلسلة بعد */ }
      }
      $s("[data-streak]").textContent = toAr(streak) + " يومًا";
      let full = 0;
      Object.entries(log).forEach(([k, ids]) => {
        const [y, m, d] = k.split("-").map(Number);
        if (y === today.getFullYear() && m === today.getMonth() + 1 && ids.length >= DAILY_DEEDS.length) full++;
      });
      $s("[data-full]").textContent = toAr(full);
    };
    paint();
  },
});
