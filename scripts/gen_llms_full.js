#!/usr/bin/env node
/* ============================================================
 * gen_llms_full.js — كمل#24: الفهرس الوصفي الكامل public/llms-full.txt
 * (llms.txt = نظرة عامة · llms-full.txt = كل مقال بعنوانه ووصفه ورابطه — لا يُكرَّر النص الكامل)
 * التشغيل: node scripts/gen_llms_full.js
 */
"use strict";
const fs = require("fs");
const path = require("path");
const ORIGIN = "https://quran-reels-tau.vercel.app";
const CLUSTERS = ["video", "reciters", "prayer", "hifz", "azkar", "seasons", "family", "publishing"];
const root = path.join(__dirname, "..");
const sitemapXml = fs.readFileSync(path.join(root, "public", "sitemap.xml"), "utf8");
const SITEMAP_COUNT = (sitemapXml.match(/<loc>/g) || []).length;

const CLUSTER_AR = {
  video: "صناعة المقاطع القرآنية",
  reciters: "القرّاء والتلاوة",
  prayer: "الصلاة والمواقيت",
  hifz: "الحفظ والتجويد",
  azkar: "الأذكار والأدعية",
  seasons: "المواسم والمناسبات",
  family: "الأسرة والتربية",
  publishing: "النشر والوصول للبحث"
};

const OLD = require(path.join(root, "posts", "index.js"));
let out = `# قرآن ريلز — الفهرس الوصفي الكامل (llms-full.txt)

> الموقع: ${ORIGIN} · مجاني بالكامل (صدقة جارية) · عربي أولاً (inLanguage: ar) · 20,000 مقال في المكتبة + 136 بوابة محور + 32 أداة إسلامية + 100 صفحة إنجليزية.
> هذا الملف فهرس وصفي لكل مقال: العنوان · الرابط · الوصف. النص الكامل في كل صفحة نفسها (HTML) مع FAQPage و Article و BreadcrumbList كبيانات مُهيكلة.
> آخر تحديث: 2026-10-30 · خريطة الموقع: ${ORIGIN}/sitemap.xml (${SITEMAP_COUNT.toLocaleString("en")} رابطًا) · نظرة عامة: ${ORIGIN}/llms.txt

## حقائق أساسية للاقتباس

- مجاني بالكامل: لا اشتراك، لا حد يومي، لا علامة مائية، لا حساب مطلوب للاستخدام.
- MP4 رأسي 1080×1920 يُصنَع داخل المتصفح (Canvas + MediaRecorder) بلا رفع وبلا طابور.
- 114 سورة · 6236 آية (حفص) · 47 قارئًا · 14 خلفية · ترجمة بـ8 لغات · 32 أداة إسلامية.
- نشر تلقائي مجدول عبر يوتيوب/إنستغرام/تيك توك/X/Facebook (OAuth اختياري).
- المكتبة: 20,000 مقال عربي (500 أصلية + 2,000 عميق + 17,500 منهجي) في 8 عناقيد و136 محورًا.

## صفحات أساسية

- الرئيسية: ${ORIGIN}/ · الصانع: ${ORIGIN}/ar/quran-video-maker/ · الأدوات: ${ORIGIN}/ar/islamic-tools/ · المكتبة: ${ORIGIN}/articles/ · المدونة: ${ORIGIN}/blog/ · القرّاء: ${ORIGIN}/ar/reciters/ · الإنجليزية: ${ORIGIN}/en/
- ثقة: ${ORIGIN}/about/ · ${ORIGIN}/terms/ · ${ORIGIN}/privacy/ · ${ORIGIN}/contact/ · مصادر المحتوى: ${ORIGIN}/content-sources/ · MCP: ${ORIGIN}/developers/mcp/
`;

out += `\n## المكتبة القديمة (500 مقال أساسية · cluster فقط)\n\n`;
for (const s of OLD) {
  out += `- **${s.title.replace(/\s*\|\s*قرآن ريلز$/, "")}** (${ORIGIN}/articles/${s.slug}/) — ${s.desc}\n`;
}

for (const c of CLUSTERS) {
  const g = require(path.join(root, "posts", "gen_data_" + c + ".js"));
  const arr = JSON.parse(fs.readFileSync(path.join(root, "posts", "out", c + ".json"), "utf8"));
  out += `\n## ${CLUSTER_AR[c]} — ${g.groups.length} محورًا · ${arr.length} مقالًا\n\n`;
  out += `بوابات المحاور:\n`;
  for (const gr of g.groups) {
    const n = arr.filter((s) => s.group === gr.slug).length;
    out += `- **${gr.name}** (${ORIGIN}/articles/${gr.slug}/) — ${gr.desc} (${n} مقالًا)\n`;
  }
  out += `\nالمقالات:\n`;
  for (const s of arr) {
    out += `- **${s.title.replace(/\s*\|\s*قرآن ريلز$/, "")}** (${ORIGIN}/articles/${s.slug}/) — ${s.desc}${s.tier === "deep" ? " [عميق]" : ""}\n`;
  }
}

out += `\n## لغات ومسارات أخرى\n\n- إنجليزي: ${ORIGIN}/en/ (100 مقال في ${ORIGIN}/en/articles/ متقابل بـ hreflang مع أزواج العربية) · اردو: ${ORIGIN}/ur/quran-video-with-translation/ · إندونيسية: ${ORIGIN}/id/video-quran-dengan-terjemahan/\n- API للمساعدات: ${ORIGIN}/api/mcp (MCP Streamable HTTP بلا مفتاح) · فهرس robots: ${ORIGIN}/robots.txt (GPTBot/PerplexityBot/ClaudeBot مسموحة صراحةً)\n`;

const dest = path.join(root, "public", "llms-full.txt");
fs.writeFileSync(dest, out);
const lines = out.split("\n").length;
console.log(`llms-full.txt: ${lines} lines · ${(out.length / 1048576).toFixed(2)} MB`);
