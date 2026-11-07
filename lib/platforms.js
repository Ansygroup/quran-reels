/* ============================================================
 * مصدر واحد لقوائم المنصات (يشاركه: lib/autopilot · api/autopilot · واجهة الحساب)
 * ------------------------------------------------------------
 * لماذا؟ كانت القائمة مكرّرة في ثلاثة أماكن بقيم مختلفة: الواجهة والخادم
 * يعرضان 8 منصات بينما lib/publish.js ينشر على 5 فقط، فالمنصات الثلاث الأخرى
 * تُقبل في الإعدادات ثم تفشل عند النشر بـ«منصة غير مدعومة».
 *
 * publish: true  → يوجد ربط OAuth + دالة نشر فعلية في lib/publish.js
 * publish: false → مذكورة للعرض فقط (تحتاج تنفيذ نشر + OAuth قبل التفعيل)
 * ============================================================ */
const PLATFORMS = {
  youtube: { name: "يوتيوب", publish: true },
  facebook: { name: "فيسبوك", publish: true },
  instagram: { name: "إنستغرام", publish: true },
  tiktok: { name: "تيك توك", publish: true },
  x: { name: "X", publish: true },
  linkedin: { name: "لينكد إن", publish: false },
  telegram: { name: "تيليجرام", publish: false },
  whatsapp: { name: "واتساب", publish: false },
};

const NAMES = Object.fromEntries(Object.entries(PLATFORMS).map(([k, v]) => [k, v.name]));
const PUBLISHABLE = Object.keys(PLATFORMS).filter((k) => PLATFORMS[k].publish);
const canPublish = (p) => Boolean(PLATFORMS[p] && PLATFORMS[p].publish);

/* قائمة جاهزة للواجهة: المفتاح + الاسم + هل يمكن النشر عليه */
const LIST = Object.entries(PLATFORMS).map(([key, v]) => ({ key, name: v.name, publish: v.publish }));

module.exports = { PLATFORMS, NAMES, PUBLISHABLE, LIST, canPublish };
