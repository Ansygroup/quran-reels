/* اتصال Supabase عبر REST API — بديل عن اتصال PG المباشر
 * يحول استعلامات SQL المستعملة في المشروع إلى REST/PostgREST
 *
 * تحذير تاريخي مهم (2026-11-12): النسخة السابقة كانت **تُسقط** أي شرط لا
 * تفهمه بصمت. النتيجة لم تكن خطأ ظاهرًا بل أسوأ: `update publish_queue set
 * status='draft' … where id = any($1::uuid[])` صار PATCH بلا أي شرط (كل
 * الجدول)، و`… video_path like $2` صار «أي صفّ منشور للمستخدم»، و`detail=$1::jsonb`
 * صار عمودًا مفقودًا. لذلك الآن:
 *   1) كل شرط غير مفهوم ⇒ **استثناء صريح** (لا تجاهل).
 *   2) UPDATE/DELETE بلا شرط ⇒ استثناء (لا تعديل لكل الجدول).
 *   3) تُدعَم فعليًا الصيغ المستعملة في المشروع: المقارنات، <>، like/ilike،
 *      `= any($n::type[])`، `is null`، `now()`، `now() - interval 'N unit'`،
 *      `nulls last/first` في الترتيب، والقيم المصبوبة `$n::jsonb`.
 */

const SUPA = () => process.env.SUPABASE_URL || "https://lbblhpscncqsyzvuujpw.supabase.co";
const SKEY = () => process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || "";

async function rest(path, opts = {}) {
  const url = SUPA() + path;
  const headers = {
    apikey: SKEY(),
    Authorization: `Bearer ${SKEY()}`,
    "Content-Type": "application/json",
    ...(opts.headers || {}),
  };
  const res = await fetch(url, { ...opts, headers });
  if (!res.ok && res.status !== 204) {
    const body = await res.text().catch(() => "");
    throw new Error(`Supabase REST ${res.status} on ${path}: ${body.slice(0, 300)}`);
  }
  if (res.status === 204) return [];
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) return res.json();
  return res.text();
}

/* ---- أدوات مساعدة ---- */
const OPERATORS = { "=": "eq", "!=": "neq", "<>": "neq", ">": "gt", ">=": "gte", "<": "lt", "<=": "lte", like: "like", ilike: "ilike" };
const UNIT_MS = { second: 1000, minute: 60000, hour: 3600000, day: 86400000 };

const unsupported = (what) => {
  const err = new Error(`db: صيغة SQL غير مدعومة — ${what}`);
  err.code = "DB_UNSUPPORTED_SQL";
  return err;
};

/* يقصّ الصبغة `$1::jsonb` أو `$1::uuid[]` إلى `$1` */
const stripCast = (v) => String(v).trim().replace(/::[A-Za-z_][\w]*(?:\[\])?(\s*\([^)]*\))?$/, "").trim();

/* تقسيم على مستوى أعلى فقط (يحترم الأقواس والاقتباس). wordSep=true يعني أن
 * الفاصل كلمة (and) فيجب أن يحيط بها فراغ، وfalse يعني فاصل رمز (فاصلة). */
function splitTop(str, sep, wordSep = false) {
  const out = [];
  let depth = 0, quote = false, buf = "";
  const text = String(str);
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "'") { quote = !quote; buf += ch; continue; }
    if (!quote && ch === "(") depth++;
    if (!quote && ch === ")") depth--;
    const atSep = !quote && depth === 0 && text.slice(i, i + sep.length).toLowerCase() === sep.toLowerCase();
    const boundOk = !wordSep || ((i === 0 || /\s/.test(text[i - 1])) && (i + sep.length >= text.length || /\s/.test(text[i + sep.length])));
    if (atSep && boundOk) {
      out.push(buf);
      buf = "";
      i += sep.length - 1;
      continue;
    }
    buf += ch;
  }
  out.push(buf);
  return out.map((s) => s.trim()).filter(Boolean);
}

/* محتوى قوسين متوازنين بدءًا من موضع '(' — اللازمة لأن `values (... now())`
 * فيها قوسان، والتعبير النمطي القديم كان يقطع عند أول ')' فيفقد آخر قيمة. */
function parenAt(sql, openIdx) {
  let depth = 0, quote = false;
  for (let i = openIdx; i < sql.length; i++) {
    const ch = sql[i];
    if (ch === "'") { quote = !quote; continue; }
    if (quote) continue;
    if (ch === "(") depth++;
    else if (ch === ")") { depth--; if (depth === 0) return sql.slice(openIdx + 1, i); }
  }
  return null;
}
const valuesBlock = (sql) => {
  const m = sql.match(/values\s*\(/i);
  return m ? parenAt(sql, m.index + m[0].length - 1) : null;
};

/* قيمة SQL ⇒ قيمة جافاسكربت */
function valueOf(raw, params) {
  const v = stripCast(raw);
  if (v === "now()") return new Date().toISOString();
  const rel = v.match(/^now\(\)\s*-\s*interval\s*'(\d+)\s*(second|minute|hour|day)s?'$/i);
  if (rel) return new Date(Date.now() - Number(rel[1]) * UNIT_MS[rel[2].toLowerCase()]).toISOString();
  const pm = v.match(/^\$(\d+)$/);
  if (pm) {
    const value = params[Number(pm[1]) - 1];
    // PostgreSQL يفسّر النص المصبوب إلى jsonb، لا يخزّنه كنص JSON مزدوج.
    if (/::jsonb\s*$/i.test(String(raw)) && typeof value === "string") {
      try { return JSON.parse(value); } catch { throw unsupported("jsonb غير صالح"); }
    }
    return value;
  }
  if (/^null$/i.test(v)) return null;
  if (/^true$/i.test(v)) return true;
  if (/^false$/i.test(v)) return false;
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
  if (v.startsWith("'") && v.endsWith("'")) return v.slice(1, -1).replace(/''/g, "'");
  throw unsupported(`قيمة غير مفهومة: ${String(raw).slice(0, 60)}`);
}

const enc = (v) => encodeURIComponent(typeof v === "boolean" || typeof v === "number" ? String(v) : String(v ?? ""));
/* PostgREST يستخدم * بدل % في like/ilike */
const likeValue = (v) => enc(String(v).replace(/%/g, "*"));
const inList = (arr) => "(" + (Array.isArray(arr) ? arr : []).map((v) => `"${String(v).replace(/"/g, '\\"')}"`).join(",") + ")";

/* ---- معالجة WHERE clause ---- */
function parseWhere(whereStr, params) {
  if (!whereStr || !String(whereStr).trim()) return "";
  return splitTop(whereStr, "and", true)
    .map((part) => {
      let m = part.match(/^(\w+)\s+is\s+null$/i);
      if (m) return `${m[1]}=is.null`;
      m = part.match(/^(\w+)\s+is\s+not\s+null$/i);
      if (m) return `${m[1]}=not.is.null`;
      m = part.match(/^(\w+)\s*=\s*any\(\s*(\$[\d]+)(?:::[\w\[\]]+)?\s*\)$/i);
      if (m) return `${m[1]}=in.${inList(valueOf(m[2], params))}`;
      m = part.match(/^(\w+)\s+in\s*\(\s*(\$[\d]+)\s*\)$/i);
      if (m) return `${m[1]}=in.${inList(valueOf(m[2], params))}`;
      m = part.match(/^(\w+)\s*(=|!=|<>|>=|<=|>|<|like|ilike)\s*(.+)$/i);
      if (m) {
        const col = m[1], op = OPERATORS[m[2].toLowerCase()], rawVal = m[3];
        const val = valueOf(rawVal, params);
        if (val === null) return op === "neq" ? `${col}=not.is.null` : `${col}=is.null`;
        if (op === "like" || op === "ilike") return `${col}=${op}.${likeValue(val)}`;
        return `${col}=${op}.${enc(val)}`;
      }
      throw unsupported(`شرط WHERE غير مفهوم: «${part.slice(0, 80)}»`);
    })
    .join("&");
}

/* ---- معالجة SET clause ---- */
function parseSet(setStr, params) {
  const obj = {};
  for (const part of splitTop(setStr, ",")) {
    const m = part.match(/^(\w+)\s*=\s*(.+)$/s);
    if (!m) throw unsupported(`تعبير SET غير مفهوم: «${part.slice(0, 60)}»`);
    const [, col] = m;
    const raw = m[2].trim();
    /* now() داخل تعبير أكبر (مثل coalesce) غير مدعوم — نفشل بصوت عالٍ */
    if (/\bcoalesce\s*\(|case\s+when|select\s/i.test(raw)) throw unsupported(`تعبير SET غير مدعوم: «${sliceSafe(raw)}»`);
    const val = valueOf(raw, params);
    obj[col] = val;
  }
  return obj;
}

/* للرسائل فقط */
function sliceSafe(s) { return String(s).slice(0, 60); }

/* ---- INSERT ---- */
async function doInsert(table, colsStr, valsStr, params) {
  const cols = colsStr.split(",").map((s) => s.trim());
  const vals = splitTop(valsStr, ",");
  if (vals.length !== cols.length) {
    throw unsupported(`INSERT: عدد الأعمدة (${cols.length}) لا يساوي عدد القيم (${vals.length})`);
  }
  const body = {};
  cols.forEach((c, i) => { body[c] = valueOf(vals[i], params); });
  return await rest(`/rest/v1/${table}`, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(body),
  });
}

/* ---- INSERT ... ON CONFLICT DO UPDATE (upsert) ---- */
async function doUpsert(sql, params) {
  const tableMatch = sql.match(/insert\s+into\s+(\w+)/i);
  const table = tableMatch[1];
  const colsMatch = sql.match(/insert\s+into\s+\w+\s*\(([^)]+)\)/i);
  const cols = colsMatch[1].split(",").map((s) => s.trim());
  const valsRaw = valuesBlock(sql);
  if (!valsRaw) throw unsupported("upsert بلا VALUES");
  const vals = splitTop(valsRaw, ",");
  if (vals.length !== cols.length) {
    throw unsupported(`upsert: عدد الأعمدة (${cols.length}) لا يساوي عدد القيم (${vals.length})`);
  }
  const body = {};
  cols.forEach((c, i) => { body[c] = valueOf(vals[i], params); });
  const conflictMatch = sql.match(/on\s+conflict\s*\(([^)]+)\)/i);
  const conflictCols = conflictMatch[1].split(",").map((s) => s.trim());
  const updateMatch = sql.match(/do\s+update\s+set\s+(.+?)(?:\s+returning|\s*$)/is);
  const updateBody = {};
  if (updateMatch) {
    for (const part of splitTop(updateMatch[1], ",")) {
      const m = part.match(/^(\w+)\s*=\s*(.+)$/s);
      if (!m) throw unsupported(`تعبير upsert غير مفهوم: «${part.slice(0, 60)}»`);
      const [, col] = m;
      const raw = m[2].trim();
      if (/^excluded\./i.test(raw)) updateBody[col] = body[raw.replace(/^excluded\./i, "")];
      else updateBody[col] = valueOf(raw, params);
    }
  }
  const filters = conflictCols.map((c) => `${c}=eq.${enc(body[c])}`).join("&");
  const existing = await rest(`/rest/v1/${table}?${filters}&select=*`, { method: "GET" });
  if (existing && existing.length > 0) {
    updateBody.updated_at = new Date().toISOString();
    return await rest(`/rest/v1/${table}?${filters}`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(updateBody),
    });
  }
  if (!body.created_at) body.created_at = new Date().toISOString();
  body.updated_at = new Date().toISOString();
  return await rest(`/rest/v1/${table}`, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(body),
  });
}

/* ---- SELECT ---- */
async function doSelect(sql, params) {
  const tableMatch = sql.match(/from\s+(\w+)/i);
  const table = tableMatch[1];
  const colsMatch = sql.match(/select\s+(.+?)\s+from/is);
  const select = colsMatch[1].trim();
  const whereMatch = sql.match(/where\s+(.+?)(?:\s+order\s+by|\s+limit|\s*$)/is);
  const where = whereMatch ? parseWhere(whereMatch[1], params || []) : "";
  const orderMatch = sql.match(/order\s+by\s+(.+?)(?:\s+limit|\s*$)/is);
  let order = "";
  if (orderMatch) {
    const parts = [];
    for (const p of splitTop(orderMatch[1], ",")) {
      const m = p.match(/^(\w+)(?:\s+(asc|desc))?(?:\s+nulls\s+(last|first))?$/i);
      if (!m) throw unsupported(`ترتيب غير مفهوم: «${p.slice(0, 40)}»`);
      let piece = `${m[1]}.${(m[2] || "asc").toLowerCase()}`;
      if (m[3]) piece += `.nulls${m[3].toLowerCase()}`;
      parts.push(piece);
    }
    order = parts.join(",");
  }
  const limitMatch = sql.match(/limit\s+(\d+)/i);
  const limit = limitMatch ? limitMatch[1] : "";
  let path = `/rest/v1/${table}?select=${select}`;
  if (where) path += `&${where}`;
  if (order) path += `&order=${order}`;
  if (limit) path += `&limit=${limit}`;
  return await rest(path, { method: "GET" });
}

/* ---- UPDATE ---- */
async function doUpdate(sql, params) {
  const tableMatch = sql.match(/update\s+(\w+)/i);
  const table = tableMatch[1];
  const setMatch = sql.match(/set\s+(.+?)\s+where/is);
  if (!setMatch) throw unsupported("UPDATE بلا WHERE");
  const setBody = parseSet(setMatch[1], params);
  const whereMatch = sql.match(/where\s+(.+)$/is);
  const whereSql = whereMatch ? whereMatch[1].replace(/\s+returning\s+[\s\S]*$/i, "") : "";
  const where = parseWhere(whereSql, params);
  /* لا تعديل بلا شرط: كان هذا يجعل `where id = any($1)` تُعدّل كل الجدول */
  if (!where) throw unsupported("UPDATE بلا شرط قابل للترجمة — رفضًا لتعديل كل الصفوف");
  return await rest(`/rest/v1/${table}?${where}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(setBody),
  });
}

/* ---- DELETE ---- */
async function doDelete(sql, params) {
  const tableMatch = sql.match(/from\s+(\w+)/i);
  const table = tableMatch[1];
  const whereMatch = sql.match(/where\s+(.+)$/is);
  const where = parseWhere(whereMatch ? whereMatch[1] : "", params);
  if (!where) throw unsupported("DELETE بلا شرط قابل للترجمة");
  return await rest(`/rest/v1/${table}?${where}`, {
    method: "DELETE",
    headers: { Prefer: "return=minimal" },
  });
}

/* ---- main q() function ---- */
async function q(text, params) {
  const sql = String(text).trim();
  if (/^insert\s+into/i.test(sql) && /on\s+conflict/i.test(sql)) {
    return doUpsert(sql, params || []);
  }
  if (/^insert\s+into/i.test(sql)) {
    const tableMatch = sql.match(/insert\s+into\s+(\w+)/i);
    const colsMatch = sql.match(/\(([^)]+)\)\s*values/i);
    const valsRaw = valuesBlock(sql);
    if (!colsMatch || !valsRaw) throw unsupported("INSERT بلا أعمدة/قيم واضحة");
    return doInsert(tableMatch[1], colsMatch[1], valsRaw, params || []);
  }
  if (/^select\s/i.test(sql)) return doSelect(sql, params);
  if (/^update\s/i.test(sql)) return doUpdate(sql, params);
  if (/^delete\s+from/i.test(sql)) return doDelete(sql, params);
  throw new Error("db.q: unsupported SQL: " + sql.slice(0, 120));
}

async function q1(text, params) {
  const rows = await q(text, params);
  return rows && rows.length ? rows[0] : null;
}

module.exports = { q, q1, rest, __test: { parseWhere, parseSet, valueOf, splitTop, parenAt, unsupported } };
