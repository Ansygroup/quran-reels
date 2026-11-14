/* Candidate only: not routed by the application. Connecting never enables automation.
 * inspectTarget authenticates the bot and resolves the destination; no message is sent.
 */
const { getUserId } = require('./sess');
const { rest } = require('./db');
const { seal } = require('./crypt');
const { inspectTarget } = require('./telegram_candidate');
const { json } = require('./oauth');

const MAX_BODY = 4096;
async function readBody(req) {
  const declared = Number(req.headers?.['content-length']);
  if (Number.isFinite(declared) && declared > MAX_BODY) throw new Error('body too large');
  let body = req.body;
  if (body === undefined || body === null) {
    const chunks = []; let size = 0;
    for await (const part of req) {
      const chunk = Buffer.isBuffer(part) ? part : Buffer.from(part);
      size += chunk.length;
      if (size > MAX_BODY) throw new Error('body too large');
      chunks.push(chunk);
    }
    body = Buffer.concat(chunks).toString('utf8');
  }
  let text;
  if (Buffer.isBuffer(body)) text = body.toString('utf8');
  else if (typeof body === 'string') text = body;
  else text = JSON.stringify(body);
  if (typeof text !== 'string' || Buffer.byteLength(text, 'utf8') > MAX_BODY) throw new Error('body too large');
  const parsed = JSON.parse(text);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || Object.keys(parsed).some(k => !['token','chat_id'].includes(k))) throw new Error('invalid body');
  if (typeof parsed.token !== 'string' || typeof parsed.chat_id !== 'string') throw new Error('invalid body');
  return parsed;
}

function makeHandler({ authenticate = getUserId, database = rest, encrypt = seal, inspect = inspectTarget } = {}) {
  return async (req, res) => {
    if (req.method !== 'POST') return json(res, 405, {error:'method'});
    // Tokens for this operation must never be carried in a URL or query string.
    if (!/^Bearer\s+\S+$/i.test(String(req.headers?.authorization || ''))) return json(res, 401, {error:'unauthorized'});
    let uid;
    try { uid = await authenticate(req); } catch { uid = null; }
    if (!uid) return json(res, 401, {error:'unauthorized'});
    let body;
    try { body = await readBody(req); } catch { return json(res, 400, {error:'بيانات الربط غير صالحة'}); }
    let target;
    try { target = await inspect({token:body.token, chatId:body.chat_id}); }
    catch { return json(res, 400, {error:'تعذّر التحقق من البوت أو الوجهة وصلاحياتها'}); }
    if (!target || !/^-?[1-9][0-9]{0,19}$/.test(String(target.id)) || !['private','group','supergroup','channel'].includes(target.type)) {
      return json(res, 400, {error:'وجهة تيليجرام غير صالحة'});
    }
    // Updates are always scoped to the authenticated owner and the resolved chat.
    // A unique-index conflict on a concurrent insert is treated as a failure; do not
    // read then blindly upsert, and never alter the selected/default destination.
    const accountId = String(target.id), enc = encodeURIComponent;
    const query = `user_id=eq.${enc(uid)}&platform=eq.telegram&account_id=eq.${enc(accountId)}`;
    let rows;
    try {
      const existing = await database(`/rest/v1/social_connections?${query}&select=id&limit=2`);
      if (!Array.isArray(existing) || existing.length > 1) throw new Error('unexpected rows');
      const values = {account_name:String(target.name || 'تيليجرام').slice(0,100), meta:encrypt(JSON.stringify({type:target.type, bot_id:target.botId})), access_token:encrypt(body.token), updated_at:new Date().toISOString()};
      if (existing.length === 1) {
        if (!existing[0]?.id) throw new Error('missing id');
        rows = await database(`/rest/v1/social_connections?${query}&id=eq.${enc(existing[0].id)}&select=id`, {method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify(values)});
      } else {
        rows = await database('/rest/v1/social_connections?select=id', {method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify({...values,user_id:uid,platform:'telegram',account_id:accountId,refresh_token:'',scopes:'',is_default:false})});
      }
      if (!Array.isArray(rows) || rows.length !== 1 || !rows[0]?.id) throw new Error('write not confirmed');
    } catch { return json(res, 503, {error:'تعذّر تأكيد ربط تيليجرام؛ راجع القنوات المرتبطة قبل إعادة المحاولة'}); }
    return json(res, 200, {ok:true, id:rows[0].id, name:String(target.name || 'تيليجرام').slice(0,100), type:target.type, automation_changed:false});
  };
}

module.exports = { makeHandler, readBody };
