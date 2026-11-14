/* Experimental orchestration only. Not routed, scheduled or enabled.
 * All dependencies are supplied explicitly; callers must authenticate the owner.
 * Database transitions are one-way: a lost claim/send/finish response is never
 * followed by an automatic retry, because the message might already exist.
 */
function createTelegramDelivery({database, decrypt, readVideo, validateVideo, sendVideo}) {
  for (const dep of [database, decrypt, readVideo, validateVideo, sendVideo]) {
    if (typeof dep !== 'function') throw new Error('Missing candidate dependency');
  }
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const enc = encodeURIComponent;
  async function rpc(name, body) {
    return database(`/rest/v1/rpc/${name}`, {method:'POST',body:JSON.stringify(body)});
  }
  async function finish(userId, id, state, messageId = null) {
    try {
      const rows = await rpc('telegram_finish_candidate', {p_user_id:userId,p_id:id,p_state:state,p_message_id:messageId});
      return Array.isArray(rows) && rows.length === 1 && rows[0]?.id === id && rows[0]?.state === state;
    } catch { return false; }
  }
  return async function deliver({userId, connectionId, videoPath, caption = ''}) {
    if (!uuid.test(userId || '') || !uuid.test(connectionId || '') || typeof videoPath !== 'string' ||
        !videoPath.startsWith(userId + '/') || videoPath.length > 500 || videoPath.split('/').includes('..') ||
        typeof caption !== 'string' || caption.length > 1024) return {status:'invalid'};
    let prepared;
    try { prepared = await rpc('telegram_prepare_candidate',{p_user_id:userId,p_connection_id:connectionId,p_video_path:videoPath}); }
    catch { return {status:'prepare_unconfirmed'}; }
    if (!Array.isArray(prepared) || prepared.length !== 1 || !uuid.test(prepared[0]?.id || '')) return {status:'prepare_unconfirmed'};
    const record = prepared[0];
    if (record.state !== 'ready') return {status:'review_required', deliveryId:record.id};
    let claim;
    try { claim = await rpc('telegram_claim_candidate',{p_user_id:userId,p_id:record.id}); }
    catch { return {status:'review_required', deliveryId:record.id}; }
    if (Array.isArray(claim) && claim.length === 0) return {status:'review_required', deliveryId:record.id};
    if (!Array.isArray(claim) || claim.length !== 1) return {status:'review_required', deliveryId:record.id};
    const item = claim[0];
    if (item?.id !== record.id || item.connection_id !== connectionId || item.video_path !== videoPath ||
        !/^-?[1-9][0-9]{0,19}$/.test(String(item.destination_id || ''))) return {status:'review_required', deliveryId:record.id};
    let token, buffer;
    try {
      const rows = await database(`/rest/v1/social_connections?user_id=eq.${enc(userId)}&id=eq.${enc(connectionId)}&platform=eq.telegram&account_id=eq.${enc(item.destination_id)}&select=account_id,access_token&limit=2`);
      if (!Array.isArray(rows) || rows.length !== 1 || String(rows[0].account_id) !== String(item.destination_id)) throw new Error('connection unavailable');
      token = decrypt(rows[0].access_token);
      buffer = await readVideo({userId, videoPath});
      if (!Buffer.isBuffer(buffer)) throw new Error('invalid media');
      // This must fully validate the media before any request to Telegram.
      await validateVideo(buffer);
    } catch {
      const recorded = await finish(userId, record.id, 'rejected');
      return {status:recorded ? 'rejected' : 'review_required', deliveryId:record.id};
    }
    let result;
    try {
      result = await sendVideo({token,chatId:String(item.destination_id),buffer,caption});
      if (!Number.isSafeInteger(result?.messageId) || result.messageId <= 0 || String(result.chatId) !== String(item.destination_id)) throw new Error('unconfirmed response');
    } catch (error) {
      const state = error?.outcome === 'rejected' ? 'rejected' : 'uncertain';
      const recorded = await finish(userId, record.id, state);
      return {status:recorded && state === 'rejected' ? 'rejected' : 'review_required', deliveryId:record.id};
    }
    const recorded = await finish(userId, record.id, 'sent', result.messageId);
    return recorded ? {status:'sent',deliveryId:record.id,messageId:result.messageId} : {status:'review_required',deliveryId:record.id};
  };
}
module.exports = {createTelegramDelivery};
