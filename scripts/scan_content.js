#!/usr/bin/env node
/* scan_content.js — يفحص النصوص العربية داخل ملفات التأليف:
 * محارف CJK/سيريلية/يونانية + كلمات لاتينية غريبة داخل string literals عربية.
 * الاستخدام: node scripts/scan_content.js <files...>
 */
const fs = require("fs");

const ALLOW = new Set(("quran reels video youtube tiktok instagram whatsapp facebook faq qa seo geo mp4 hd ai url " +
  "guide mistakes tips checklist compare examples template steps diagnose tools startpath oauth ltr rtl mp jpg png " +
  "svg en ar desktop mobile pwa k min max t hook watch time sync grade master mb transcode meta how to insights " +
  "north star analytics audio cross post khatma juz surah ayah adhkar tajweed wudu qibla zakat sadaqa hadith " +
  "sunnah iman allah rasul salam haram halal fiqh khutba imam bitrate rate loudness denoise clipping wav mp3 db voiceover "+
  "gsc indexnow ssl https http robots sitemap lcp pagination inspection urllist authority eeat anchor title description hashtag schema txt ctr cta snippet").split(" "));

let bad = 0;
for (const file of process.argv.slice(2)) {
  const src = fs.readFileSync(file, "utf8");
  const lines = src.split("\n");
  // 1) non-Arabic script classes anywhere
  lines.forEach((L, i) => {
    const at = `${file}:${i + 1}`;
    if (/[Ѐ-ӿ]/.test(L)) { console.log(`CYR ${at}  ${L.trim().slice(0, 100)}`); bad++; }
    if (/[⺀-鿿가-힯　-〿＀-￯]/.test(L)) { console.log(`CJK ${at}  ${L.trim().slice(0, 100)}`); bad++; }
    if (/[Ā-ɏ]/.test(L)) { console.log(`LATSUP ${at}  ${L.trim().slice(0, 90)}`); bad++; }
    if (/[Ͱ-Ͽ]/.test(L)) { console.log(`GRK ${at}  ${L.trim().slice(0, 100)}`); bad++; }
  });
  // 2) string literals containing Arabic + stray Latin words
  const lit = /"((?:[^"\\]|\\.)*)"/g;
  let m;
  while ((m = lit.exec(src))) {
    const s = m[1];
    if (!/[\u0600-\u06FF]/.test(s)) continue;
    const stray = (s.match(/[A-Za-z]{2,}/g) || []).filter((w) => !ALLOW.has(w.toLowerCase()));
    if (stray.length) {
      const lineNo = src.slice(0, m.index).split("\n").length;
      console.log(`LAT ${file}:${lineNo}  [${[...new Set(stray)].join(",")}]  ${s.slice(0, 70)}`);
      bad++;
    }
  }
}
console.log(bad ? `SCAN: ${bad} issue(s) above` : "SCAN: clean");
process.exit(bad ? 1 : 0);
