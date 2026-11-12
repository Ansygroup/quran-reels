/* عقد التخصيص للواجهة والخادم: نرفض الاختيارات غير الصالحة بدل تبديلها بصمت. */
const catalog = require('./reel_catalog.json');
const DESIGN = {
  translation: catalog.translations,
  style: ['card', 'minimal', 'banner', 'word'],
  ratio: ['9:16', '1:1', '16:9'],
  quality: [720, 1080],
  accent: ['gold', 'emerald', 'silver', 'rose'],
};
function validateTemplate(t) {
  if (!t || typeof t !== 'object' || Array.isArray(t)) return 'إعدادات الفيديو غير صالحة';
  if (t.content_mode === 'fixed') {
    const {surah, from, to} = t;
    if (![surah, from, to].every(Number.isInteger) || surah < 1 || surah > 114 || from < 1 || to < from || to > catalog.surahCounts[surah - 1] || to - from + 1 > 40)
      return 'اختار سورة وآيات صحيحة (حد أقصى ٤٠ آية)';
  }
  if (t.design !== undefined) {
    const d = t.design;
    if (!d || typeof d !== 'object' || Array.isArray(d)) return 'إعدادات شكل الفيديو غير صالحة';
    for (const [key, allowed] of Object.entries(DESIGN)) if (!allowed.includes(d[key])) return `اختيار ${key} غير صالح`;
    if (!Number.isInteger(d.fontSize) || d.fontSize < 70 || d.fontSize > 140 || d.fontSize % 5 !== 0) return 'حجم الخط غير صالح';
    for (const key of ['showTrans','showWatermark','motion']) if (typeof d[key] !== 'boolean') return 'خيارات العرض غير صالحة';
    if (typeof d.dedText !== 'string' || d.dedText.length > 180) return 'نص الإهداء أطول من المسموح';
  }
  return null;
}
module.exports = { catalog, validateTemplate };
