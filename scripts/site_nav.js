"use strict";
/* كمل#25 — شريط تنقّل مشترك لكل القوالب (الصانع · الأدوات · المقالات · المدونة) */
const LINKS = {
  ar: [["/", "الصانع"], ["/#/tools", "الأدوات"], ["/articles/", "المقالات"], ["/blog/", "المدونة"]],
  en: [["/en/quran-video-maker/", "Video maker"], ["/en/tools/", "Tools"]],
};
function hdrNav(lang) {
  const L = LINKS[lang === "en" ? "en" : "ar"];
  return `<nav class="hdr-nav" aria-label="${lang === "en" ? "Site" : "القائمة"}">${L.map(([h, t]) => `<a href="${h}">${t}</a>`).join("")}</nav>`;
}
module.exports = { hdrNav };
