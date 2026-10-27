/* اتصال مباشر بقاعدة Supabase (postgres) — للخادم فقط: الأتمتة وقراءة التوكنات */
const { Pool } = require("pg");

let pool;
function get() {
  if (!pool) {
    pool = new Pool({
      host: process.env.PGHOST,
      port: Number(process.env.PGPORT || 5432),
      user: process.env.PGUSER,
      password: process.env.PGPASSWORD,
      database: process.env.PGDATABASE,
      ssl: { rejectUnauthorized: false },
      max: 1,
      idleTimeoutMillis: 8000,
      connectionTimeoutMillis: 8000,
    });
  }
  return pool;
}

async function q(text, params) {
  const r = await get().query(text, params);
  return r.rows;
}
async function q1(text, params) {
  return (await q(text, params))[0] || null;
}

module.exports = { q, q1 };
