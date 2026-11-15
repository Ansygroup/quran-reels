/* Candidate Telegram Bot API adapter. Not wired into connection or publishing paths.
 * No retries: a lost send response may mean Telegram already posted the video.
 */
const MAX_VIDEO_BYTES = 50_000_000;

function targetId(value) {
  if (typeof value !== 'string') throw new Error('Invalid Telegram destination');
  const id = value.trim();
  if (/^@[A-Za-z][A-Za-z0-9_]{4,31}$/.test(id) || /^-?[1-9][0-9]{0,19}$/.test(id)) return id;
  throw new Error('Invalid Telegram destination');
}

function validToken(value) {
  if (typeof value !== 'string' || !/^[1-9][0-9]{4,15}:[A-Za-z0-9_-]{20,100}$/.test(value)) {
    throw new Error('Invalid Telegram bot token');
  }
  return value;
}

async function request(token, method, body, fetchImpl) {
  validToken(token);
  let res;
  try {
    res = await fetchImpl(`https://api.telegram.org/bot${token}/${method}`, { method: 'POST', body, signal: AbortSignal.timeout(method === 'sendVideo' ? 120000 : 15000) });
  } catch {
    // Never log the thrown error: many HTTP clients include URLs containing tokens.
    const error = new Error(method === 'sendVideo' ? 'Telegram response unknown; do not retry without checking the destination' : 'Telegram connection failed');
    if (method === 'sendVideo') error.outcome = 'unknown';
    throw error;
  }
  let data;
  try { data = await res.json(); } catch {
    const error = new Error(method === 'sendVideo' ? 'Telegram response unknown; do not retry without checking the destination' : 'Telegram returned an invalid response');
    if (method === 'sendVideo') error.outcome = 'unknown';
    throw error;
  }
  if (!res.ok || data?.ok !== true || !data.result) {
    // Do not expose raw descriptions, which may contain sensitive details.
    const error = new Error('Telegram rejected the request');
    if (method === 'sendVideo' && (res.status >= 500 || data?.ok !== false)) error.outcome = 'unknown';
    else if (method === 'sendVideo') error.outcome = 'rejected';
    throw error;
  }
  return data.result;
}

async function inspectTarget({ token, chatId, fetchImpl = fetch }) {
  const chat = targetId(chatId);
  const form = values => { const f = new FormData(); for (const [k, v] of Object.entries(values)) f.set(k, String(v)); return f; };
  const bot = await request(token, 'getMe', form({}), fetchImpl);
  if (!Number.isSafeInteger(bot.id) || bot.is_bot !== true) throw new Error('Telegram bot identity invalid');
  const info = await request(token, 'getChat', form({ chat_id: chat }), fetchImpl);
  if (!['private', 'group', 'supergroup', 'channel'].includes(info.type) || !Number.isSafeInteger(info.id)) throw new Error('Telegram destination invalid');
  if (info.type !== 'private') {
    const member = await request(token, 'getChatMember', form({ chat_id: chat, user_id: bot.id }), fetchImpl);
    if (info.type === 'channel' && !(member.status === 'creator' || (member.status === 'administrator' && member.can_post_messages === true))) throw new Error('Bot needs permission to post in the channel');
    if (info.type !== 'channel') {
      // Text and video permissions are independent in Telegram. Missing group
      // permissions are not proof that video posting is allowed.
      const canPost = ['creator', 'administrator'].includes(member.status) ||
        (member.status === 'member' && info.permissions?.can_send_videos === true) ||
        (member.status === 'restricted' && member.is_member === true && member.can_send_videos === true);
      if (!canPost) throw new Error('Bot cannot send video to this group');
    }
  }
  return { id: String(info.id), type: info.type, name: String(info.title || info.first_name || info.username || '').slice(0, 100), botId: String(bot.id) };
}

async function sendVideo({ token, chatId, buffer, caption = '', fetchImpl = fetch }) {
  const chat = targetId(chatId);
  if (!Buffer.isBuffer(buffer) || buffer.length < 12 || buffer.length > MAX_VIDEO_BYTES || buffer.toString('ascii', 4, 8) !== 'ftyp') {
    throw new Error('Telegram requires an MP4 file up to 50 MB');
  }
  if (typeof caption !== 'string' || caption.length > 1024) throw new Error('Telegram caption exceeds 1024 characters');
  const form = new FormData();
  form.set('chat_id', chat);
  form.set('video', new Blob([buffer], { type: 'video/mp4' }), 'reel.mp4');
  if (caption) form.set('caption', caption);
  const result = await request(token, 'sendVideo', form, fetchImpl);
  if (!Number.isSafeInteger(result.message_id) || !Number.isSafeInteger(result.chat?.id) || (/^-?\d+$/.test(chat) && chat !== String(result.chat.id))) {
    const error = new Error('Telegram response unknown; do not retry without checking the destination');
    error.outcome = 'unknown';
    throw error;
  }
  return { messageId: result.message_id, chatId: String(result.chat.id) };
}

module.exports = { inspectTarget, sendVideo, MAX_VIDEO_BYTES };
