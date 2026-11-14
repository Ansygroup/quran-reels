/* فك ربط منصة: deletion is not atomic with queue targeting or provider revocation. */
const { getUserId } = require("./sess");
const { rest } = require("./db");
const { json } = require("./oauth");

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_BODY = 4096;

async function readBody(req) {
  const fail = status => { const e = new Error("invalid body"); e.status = status; throw e; };
  const declared = Number(req.headers?.["content-length"]);
  if (Number.isFinite(declared) && declared > MAX_BODY) fail(413);
  let body;
  try { body = req.body; } catch { fail(400); }
  let text;
  if (body !== undefined) {
    if (Buffer.isBuffer(body)) text = body.toString("utf8");
    else if (typeof body === "string") text = body;
    else { try { text = JSON.stringify(body); } catch { fail(400); } }
  } else {
    const chunks = []; let size = 0;
    try {
      for await (const part of req) {
        const chunk = Buffer.isBuffer(part) ? part : Buffer.from(part);
        size += chunk.length;
        if (size > MAX_BODY) fail(413);
        chunks.push(chunk);
      }
    } catch (e) { if (e.status === 413) throw e; fail(400); }
    text = Buffer.concat(chunks).toString("utf8");
  }
  if (typeof text !== "string") fail(400);
  if (Buffer.byteLength(text, "utf8") > MAX_BODY) fail(413);
  let parsed;
  try { parsed = JSON.parse(text || "{}"); } catch { fail(400); }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) fail(400);
  return parsed;
}

module.exports = async (req, res) => {
  if (req.method !== "POST") return json(res, 405, { error: "method" });
  const uid = await getUserId(req);
  if (typeof uid !== "string" || !UUID.test(uid)) return json(res, 401, { error: "unauthorized" });
  let body;
  try { body = await readBody(req); }
  catch (e) { return json(res, e.status === 413 ? 413 : 400, { error: "invalid body" }); }
  const id = body.id;
  if (typeof id !== "string" || !UUID.test(id)) return json(res, 400, { error: "id" });

  try {
    // Return only identifiers, never credentials. A lost response remains
    // uncertain: the deletion may have committed even if this request fails.
    const rows = await rest(`/rest/v1/social_connections?id=eq.${encodeURIComponent(id)}&user_id=eq.${encodeURIComponent(uid)}&select=id,user_id`, {
      method: "DELETE", headers: { Prefer: "return=representation" },
    }, { requireRepresentation: true });
    if (!Array.isArray(rows)) throw new Error("unconfirmed deletion");
    if (rows.length === 0) return json(res, 404, { error: "not found" });
    if (rows.length !== 1 || rows[0]?.id?.toLowerCase() !== id.toLowerCase() || rows[0]?.user_id?.toLowerCase() !== uid.toLowerCase()) throw new Error("unconfirmed deletion");
    return json(res, 200, { ok: true, deleted: true });
  } catch {
    return json(res, 503, { error: "unconfirmed" });
  }
};
