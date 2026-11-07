/* ============================================================
 * بوابة واحدة (Dispatcher) لمسارات الربط الاجتماعي والنشر والتواصل
 * ------------------------------------------------------------
 * السبب: خطة Vercel Hobby تسمح بـ12 دالة/نشرة كحد أقصى (middleware يُحسب
 * ضمنها). تجاوز الحد يُفشل النشر بعد نجاح البناء، فتظل النسخة القديمة
 * مخدومة على الموقع — فشل صامت. لذلك تجمّع المسارات الرقيقة هنا.
 *
 * التوزيع عبر ?op= :
 *   /api/gw?op=start&p=<platform>&t=<token>   بدء ربط OAuth
 *   /api/gw?op=list                           قائمة المنصات المرتبطة
 *   /api/gw?op=disconnect                     فك ربط منصة
 *   /api/gw?op=publish                        نشر فوري/جدولة
 *   /api/gw?op=contact                        نموذج «تواصل»
 *
 * المسارات القديمة تبقى عاملة عبر rewrites في vercel.json (حتى لا تنكسر
 * نسخ العميل المخزّنة في الـ Service Worker):
 *   /api/oauth → /api/gw · /api/social → /api/gw
 *   /api/publish → /api/gw?op=publish · /api/contact → /api/gw?op=contact
 *
 * ملاحظة: الملفات المبدوءة بـ _ (api/_*.js) وحدات فقط وليست دوالًا عند Vercel.
 * ============================================================ */
const { json } = require("../lib/oauth");

const start = require("./_oauth_start");
const social = require("./_social");
const publish = require("./_publish");
const contact = require("./_contact");

const ROUTES = {
  start,
  list: social,
  disconnect: social,
  publish,
  contact,
};

module.exports = async (req, res) => {
  let url = null;
  try { url = new URL(req.url || "/", "http://local"); } catch {}

  let op = (url && url.searchParams.get("op")) || "";
  // احتياط: إن وصل الطلب كما هو على مسار قديم (بلا rewrite) نستنتج العملية منه
  if (!op && url) {
    const p = url.pathname;
    if (p === "/api/publish") op = "publish";
    else if (p === "/api/contact") op = "contact";
  }

  const handler = ROUTES[op];
  if (!handler) return json(res, 404, { error: "unknown op", ops: Object.keys(ROUTES) });
  return handler(req, res);
};
