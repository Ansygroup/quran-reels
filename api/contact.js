/* «تواصل» عبر الخادم: يستخدم RPC submit_contact الذي يتحقق من المدخلات
 * ويحدّ المعدل، ثم يرسل تأكيدًا بالبريد إن كان RESEND_API_KEY مضبوطًا.
 */
const { json } = require("../lib/oauth");
const { sendMail } = require("../lib/mailer");

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

module.exports = async (req, res) => {
  if (req.method !== "POST") return json(res, 405, { error: "method" });

  let b = req.body;
  if (typeof b === "string") { try { b = JSON.parse(b); } catch { b = null; } }
  b = b && typeof b === "object" ? b : {};

  // honeypot صامت: إن امتلأ الحقل المخفي نتظاهر بالنجاح دون كتابة
  if (b.website) return json(res, 200, { ok: true, msg: "وصلتنا رسالتك ✉️" });

  const name = String(b.name || "").trim().slice(0, 120);
  const email = String(b.email || "").trim().slice(0, 200);
  const message = String(b.message || "").trim().slice(0, 4000);
  const ua = String(b.userAgent || "").slice(0, 300);
  if (!name || !email || !message) return json(res, 400, { error: "missing" });
  if (!EMAIL_RE.test(email)) return json(res, 400, { error: "email" });

  const base = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
  const anon = process.env.SUPABASE_ANON_KEY || "";
  if (!base || !anon) return json(res, 503, { error: "config" });

  try {
    const r = await fetch(base + "/rest/v1/rpc/submit_contact", {
      method: "POST",
      headers: { apikey: anon, Authorization: "Bearer " + anon, "Content-Type": "application/json" },
      body: JSON.stringify({ p_name: name, p_email: email, p_message: message, p_user_agent: ua }),
    });
    const j = await r.json().catch(() => null);
    if (!r.ok || !j || !j.ok) return json(res, 502, { error: "supabase", status: r.status });
  } catch (e) {
    return json(res, 502, { error: "supabase", detail: String(e.message || e).slice(0, 100) });
  }

  // تأكيد للمراسل + نسخة للمسؤول — بلا حجب للرد إن فشل البريد
  const origin = process.env.SITE_ORIGIN || "https://quran-reels-tau.vercel.app";
  await sendMail({
    to: email,
    subject: "استلمنا رسالتك — قرآن ريلز 🤍",
    text: `سلام ${name}،\n\nوصلتنا رسالتك وسنرد عليك قريبًا بإذن الله.\n\n— فريق قرآن ريلز\n${origin}/`,
  });
  const admin = (process.env.ADMIN_EMAIL || "").trim();
  if (admin && EMAIL_RE.test(admin)) {
    await sendMail({
      to: admin,
      subject: `رسالة تواصل جديدة من ${name}`,
      text: `${message}\n\n— من: ${email}\nالوقت: ${new Date().toISOString()}`,
    });
  }

  return json(res, 200, { ok: true, msg: "وصلتنا رسالتك ✉️" });
};
