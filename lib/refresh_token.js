/* التوكن المشفّر الفارغ نص غير فارغ: لا يصلح دليلًا على وجود تجديد. */
const { open } = require("./crypt");
function readRefreshToken(value) {
  if (!value) return null;
  try { return open(value) || null; } catch { return null; }
}
module.exports = { readRefreshToken };
