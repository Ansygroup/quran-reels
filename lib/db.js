/* اتصال Supabase عبر REST API — بديل عن اتصال PG المباشر
 * يحول استعلامات SQL المستعملة في المشروع إلى REST/PostgREST
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

/* ---- معالجة WHERE clause ---- */
function parseWhere(whereStr, params) {
  if (!whereStr) return "";
  const parts = whereStr.split(/\s+and\s+/i);
  return parts.map(part => {
    part = part.trim();
    let m = part.match(/^(\w+)\s*=\s*\$(\d+)$/);
    if (m) return `${m[1]}=eq.${encodeURIComponent(params[parseInt(m[2], 10) - 1])}`;
    m = part.match(/^(\w+)\s*=\s*'([^']*)'$/);
    if (m) return `${m[1]}=eq.${encodeURIComponent(m[2])}`;
    if (/^(\w+)\s*<=\s*now\(\)$/i.test(part)) {
      return `${part.match(/^(\w+)/)[1]}=lte.${new Date().toISOString()}`;
    }
    return "";
  }).filter(Boolean).join("&");
}

/* ---- معالجة SET clause ---- */
function parseSet(setStr, params) {
  const obj = {};
  const parts = setStr.split(",");
  for (const part of parts) {
    const m = part.trim().match(/^(\w+)\s*=\s*(.+)$/);
    if (!m) continue;
    const [, col, rawVal] = m;
    const val = rawVal.trim();
    if (val.match(/^\$(\d+)$/)) {
      obj[col] = params[parseInt(val.slice(1), 10) - 1];
    } else if (val === "now()") {
      obj[col] = new Date().toISOString();
    } else if (val === "null") {
      obj[col] = null;
    } else if (val.startsWith("'") && val.endsWith("'")) {
      obj[col] = val.slice(1, -1);
    } else {
      obj[col] = val;
    }
  }
  return obj;
}

/* ---- INSERT ---- */
async function doInsert(table, colsStr, valsStr, params) {
  const cols = colsStr.split(",").map(s => s.trim());
  const vals = valsStr.split(",").map(s => s.trim());
  const body = {};
  cols.forEach((c, i) => {
    if (i >= vals.length) return;
    const v = vals[i];
    if (v.match(/^\$(\d+)$/)) {
      body[c] = params[parseInt(v.slice(1), 10) - 1];
    } else if (v === "now()") {
      body[c] = new Date().toISOString();
    } else if (v === "null") {
      body[c] = null;
    } else if (v.startsWith("'") && v.endsWith("'")) {
      body[c] = v.slice(1, -1);
    }
  });
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
  const cols = colsMatch[1].split(",").map(s => s.trim());
  const valsMatch = sql.match(/values\s*\(([^)]+)\)/i);
  const vals = valsMatch[1].split(",").map(s => s.trim());
  const body = {};
  cols.forEach((c, i) => {
    if (i >= vals.length) return;
    const v = vals[i];
    if (v.match(/^\$(\d+)$/)) {
      body[c] = params[parseInt(v.slice(1), 10) - 1];
    } else if (v === "now()") {
      body[c] = new Date().toISOString();
    } else if (v === "null") {
      body[c] = null;
    } else if (v.startsWith("'") && v.endsWith("'")) {
      body[c] = v.slice(1, -1);
    }
  });
  const conflictMatch = sql.match(/on\s+conflict\s*\(([^)]+)\)/i);
  const conflictCols = conflictMatch[1].split(",").map(s => s.trim());
  const updateMatch = sql.match(/do\s+update\s+set\s+(.+?)(?:\s+returning|\s*$)/is);
  const updateSet = updateMatch[1];
  const updateParts = updateSet.split(",").map(s => s.trim());
  const updateBody = {};
  for (const part of updateParts) {
    const m = part.match(/^(\w+)\s*=\s*(.+)$/);
    if (!m) continue;
    const [, col, rawVal] = m;
    const val = rawVal.trim();
    if (val.startsWith("excluded.")) {
      const srcCol = val.replace("excluded.", "");
      updateBody[col] = body[srcCol];
    } else if (val === "now()") {
      updateBody[col] = new Date().toISOString();
    } else {
      updateBody[col] = val;
    }
  }
  const filters = conflictCols.map(c => `${c}=eq.${encodeURIComponent(body[c])}`).join("&");
  const existing = await rest(`/rest/v1/${table}?${filters}&select=*`, { method: "GET" });
  if (existing && existing.length > 0) {
    updateBody.updated_at = new Date().toISOString();
    return await rest(`/rest/v1/${table}?${filters}`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(updateBody),
    });
  } else {
    if (!body.created_at) body.created_at = new Date().toISOString();
    body.updated_at = new Date().toISOString();
    return await rest(`/rest/v1/${table}`, {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(body),
    });
  }
}

/* ---- SELECT ---- */
async function doSelect(sql, params) {
  const tableMatch = sql.match(/from\s+(\w+)/i);
  const table = tableMatch[1];
  const colsMatch = sql.match(/select\s+(.+?)\s+from/is);
  const select = colsMatch[1].trim();
  const whereMatch = sql.match(/where\s+(.+?)(?:\s+order|\s+limit|\s*$)/is);
  const where = whereMatch ? parseWhere(whereMatch[1], params || []) : "";
  const orderMatch = sql.match(/order\s+by\s+(.+?)(?:\s+limit|\s*$)/is);
  let order = "";
  if (orderMatch) {
    const parts = orderMatch[1].split(",").map(s => s.trim());
    const orderParts = [];
    for (const p of parts) {
      const m = p.match(/^(\w+)(?:\s+(asc|desc))?$/i);
      if (m) orderParts.push(`${m[1]}.${(m[2] || "asc").toLowerCase()}`);
    }
    order = orderParts.join(",");
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
  const setBody = parseSet(setMatch[1], params);
  const whereMatch = sql.match(/where\s+(.+)$/is);
  const where = parseWhere(whereMatch[1], params);
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
  const where = parseWhere(whereMatch[1], params);
  return await rest(`/rest/v1/${table}?${where}`, {
    method: "DELETE",
    headers: { Prefer: "return=minimal" },
  });
}

/* ---- main q() function ---- */
async function q(text, params) {
  const sql = text.trim();
  if (/^insert\s+into/i.test(sql) && /on\s+conflict/i.test(sql)) {
    return doUpsert(sql, params || []);
  }
  if (/^insert\s+into/i.test(sql)) {
    const tableMatch = sql.match(/insert\s+into\s+(\w+)/i);
    const colsMatch = sql.match(/\(([^)]+)\)\s*values/i);
    const valsMatch = sql.match(/values\s*\(([^)]+)\)/i);
    return doInsert(tableMatch[1], colsMatch[1], valsMatch[1], params || []);
  }
  if (/^select\s/i.test(sql)) {
    return doSelect(sql, params);
  }
  if (/^update\s/i.test(sql)) {
    return doUpdate(sql, params);
  }
  if (/^delete\s+from/i.test(sql)) {
    return doDelete(sql, params);
  }
  throw new Error("db.q: unsupported SQL: " + sql.slice(0, 120));
}

async function q1(text, params) {
  const rows = await q(text, params);
  return rows && rows.length ? rows[0] : null;
}

module.exports = { q, q1, rest };
