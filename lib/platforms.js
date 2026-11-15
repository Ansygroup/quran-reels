/* ============================================================
 * مصدر واحد لقوائم المنصات (يشاركه: lib/autopilot · api/autopilot · واجهة الحساب)
 * ------------------------------------------------------------
 * لماذا؟ كانت القائمة مكرّرة في ثلاثة أماكن بقيم مختلفة: الواجهة والخادم
 * يعرضان 8 منصات بينما lib/publish.js ينشر على 5 فقط، فالمنصات الثلاث الأخرى
 * تُقبل في الإعدادات ثم تفشل عند النشر بـ«منصة غير مدعومة».
 *
 * publish: true  → النشر والربط متاحان في التطبيق
 * publish: false → غير متاحة حاليًا، حتى لو بقي كود قديم غير مستخدم.
 * ============================================================ */
const PLATFORMS = {
  youtube: { name: "يوتيوب", publish: true },
  facebook: { name: "فيسبوك", publish: false },
  instagram: { name: "إنستغرام", publish: false },
  tiktok: { name: "تيك توك", publish: false },
  x: { name: "X", publish: true },
  linkedin: { name: "لينكد إن", publish: false },
  telegram: { name: "تيليجرام", publish: false },
  whatsapp: { name: "واتساب", publish: false },
};

const NAMES = Object.fromEntries(Object.entries(PLATFORMS).map(([k, v]) => [k, v.name]));
const PUBLISHABLE = Object.keys(PLATFORMS).filter((k) => PLATFORMS[k].publish);
const canPublish = (p) => typeof p === "string" && PUBLISHABLE.includes(p);

/* لا نختار منصة بديلة ولا نكرّر هدف النشر حين يكون الإعداد ناقصًا أو تالفًا. */
function validatePlatforms(value, { allowEmpty = false } = {}) {
  if (!Array.isArray(value)) return "قائمة المنصات غير صالحة — راجع إعدادات النشر";
  if (!value.length && !allowEmpty) return "اختار منصة واحدة على الأقل للنشر";
  const unavailable = value.filter(p => ["facebook", "instagram", "tiktok"].includes(p));
  if (unavailable.length) return `${[...new Set(unavailable)].map(p => NAMES[p]).join("، ")} قريبًا — راجع المنصات المختارة قبل التشغيل أو الحفظ`;
  if (value.some(p => !canPublish(p))) return "فيه منصة مختارة مش مدعومة للنشر — راجع إعدادات النشر";
  if (new Set(value).size !== value.length) return "فيه منصة مكررة في إعدادات النشر — راجع الإعدادات";
  return null;
}

/* قائمة جاهزة للواجهة: المفتاح + الاسم + هل يمكن النشر عليه */
const LIST = Object.entries(PLATFORMS).map(([key, v]) => ({ key, name: v.name, publish: v.publish }));

module.exports = { PLATFORMS, NAMES, PUBLISHABLE, LIST, canPublish, validatePlatforms };
