/* إرسال بريد transacional (كمل#14) — Resend HTTP API بلا أي اعتمادية خارجية.
 * التفعيل: vercel env add RESEND_API_KEY  (+ MAIL_FROM اختياريًا)
 * بلا مفتاح ← no-op صامت: المسارات تعمل كما كانت قبل ذلك.
 */
async function sendMail({ to, subject, text, html }) {
  const key = process.env.RESEND_API_KEY || "";
  const from = process.env.MAIL_FROM || "قرآن ريلز <onboarding@resend.dev>";
  if (!key || !to || !subject) return { skipped: true };
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [to], subject: String(subject).slice(0, 200), text: String(text || "").slice(0, 5000), html: html || undefined }),
    });
    if (!r.ok) return { ok: false, status: r.status };
    return { ok: true, status: r.status };
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e).slice(0, 120) };
  }
}

module.exports = { sendMail };
